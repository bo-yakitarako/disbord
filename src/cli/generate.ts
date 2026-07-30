import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Events } from 'discord.js';

const RESERVED_EVENT_NAME = 'interactionCreate';

/**
 * `Events`の値→キー逆引き。ほとんどのイベントはキー名の先頭を大文字にするだけでは
 * 値と一致しない（例: `GuildRoleCreate` = 'roleCreate'、`MessageBulkDelete` = 'messageDeleteBulk'）
 * ため、単純な文字列変換ではなく実際のenumから引く。
 */
const EVENT_KEY_BY_VALUE = new Map((Object.entries(Events) as [string, string][]).map(([key, value]) => [value, key]));

/**
 * `ready`は歴史的経緯のファイル名で、discord.jsの`Events`値としては存在しない
 * （実際の値は`clientReady`で非推奨の`ready`文字列とは異なる）ため個別対応する。
 */
const EVENT_KEY_OVERRIDES: Record<string, string> = { ready: 'ClientReady' };

export function scanEventFiles(eventsDir: string): string[] {
  const names = readdirSync(eventsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name.slice(0, -'.ts'.length))
    .sort();

  if (names.includes(RESERVED_EVENT_NAME)) {
    throw new Error(
      `disbord: src/events/${RESERVED_EVENT_NAME}.ts は予約済みです。interactionCreateはdisbordのcomponents層が内部で処理するため、events配下に置かないでください。`,
    );
  }

  return names;
}

export type ComponentFilesPresence = { hasButtons: boolean; hasSelectMenus: boolean };

/**
 * buttons.ts/selectMenus.tsはslashCommands.tsと違い任意（`disbord generate component`で追加生成する）
 * ため、実在チェックだけで済む固定2ファイルの存在確認にする（events/onceのような可変長スキャンとは違う）。
 */
export function scanComponentFiles(componentsDir: string): ComponentFilesPresence {
  return {
    hasButtons: existsSync(join(componentsDir, 'buttons.ts')),
    hasSelectMenus: existsSync(join(componentsDir, 'selectMenus.ts')),
  };
}

function handlerIdentifier(eventName: string): string {
  return `${eventName}Handler`;
}

function eventBindingTarget(eventName: string): string {
  const key = EVENT_KEY_OVERRIDES[eventName] ?? EVENT_KEY_BY_VALUE.get(eventName);
  return key ? `Events.${key}` : `'${eventName}'`;
}

export type GenerateMainSourceOptions = {
  origin?: 'dev' | 'build';
  dbEnabled?: boolean;
  coreClassName?: string;
  hasButtons?: boolean;
  hasSelectMenus?: boolean;
};

function buildInteractionRouting(hasButtons: boolean, hasSelectMenus: boolean): string {
  let body = `      if (interaction.isChatInputCommand()) {
        await routeSlashCommandInteraction(interaction, slashCommands);
      }`;
  if (hasButtons) {
    body += ` else if (interaction.isButton()) {
        await routeButtonInteraction(interaction, buttons, coreOption as never, { argsSplitter: config.argsSplitter });
      }`;
  }
  if (hasSelectMenus) {
    body += ` else if (interaction.isStringSelectMenu()) {
        await routeSelectMenuInteraction(interaction, selectMenus, coreOption as never, {
          argsSplitter: config.argsSplitter,
        });
      }`;
  }
  return body;
}

function optionalLine(enabled: boolean, line: string): string {
  return enabled ? line : '';
}

function buildDisbordImports(dbEnabled: boolean, hasButtons: boolean, hasSelectMenus: boolean): string[] {
  return [
    'type Config',
    'createCoreStore',
    'handleBotError',
    'routeSlashCommandInteraction',
    'setComponentsState',
    ...(hasButtons ? ['routeButtonInteraction'] : []),
    ...(hasSelectMenus ? ['routeSelectMenuInteraction'] : []),
    ...(dbEnabled ? ['createDbClient'] : []),
  ];
}

function buildComponentsStateFields(hasButtons: boolean, hasSelectMenus: boolean): string {
  return [
    ...(hasButtons ? ['buttons'] : []),
    ...(hasSelectMenus ? ['selectMenus'] : []),
    'argsSplitter: config.argsSplitter',
  ].join(', ');
}

/**
 * buttons/selectMenusが両方無い場合、coreOptionは誰にも参照されず未使用変数になる
 * (noUnusedLocals対策)。coreClassのグローバル状態自体はcreateCoreStoreの呼び出しだけで
 * 初期化される(coreStore.create()等は`disbord`からimportする別の仕組みのため、
 * ローカル変数を経由しない)ので、副作用の呼び出しだけ残す形にする。
 */
function buildCoreOptionBlock(needsCoreOption: boolean, coreCreateArgs: string): string {
  if (!needsCoreOption) {
    return `  if (config.coreClass?.enable) {
    createCoreStore(config.coreClass.instanceLevel ?? 'guild'${coreCreateArgs});
  }

`;
  }
  return `  const coreStore = config.coreClass?.enable
    ? createCoreStore(config.coreClass.instanceLevel ?? 'guild'${coreCreateArgs})
    : undefined;
  const coreOption = coreStore ? { store: coreStore, nullMessage: config.coreClass!.nullMessage } : undefined;

`;
}

export function generateMainSource(eventNames: string[], options: GenerateMainSourceOptions = {}): string {
  const origin = options.origin ?? 'dev';
  const dbEnabled = options.dbEnabled ?? false;
  const coreClassName = options.coreClassName;
  const hasButtons = options.hasButtons ?? false;
  const hasSelectMenus = options.hasSelectMenus ?? false;

  const eventImports = eventNames
    .map((name) => `import ${handlerIdentifier(name)} from '../src/events/${name}';`)
    .join('\n');
  const eventBindings = eventNames
    .map((name) => `  client.on(${eventBindingTarget(name)}, ${handlerIdentifier(name)});`)
    .join('\n');

  const disbordImports = buildDisbordImports(dbEnabled, hasButtons, hasSelectMenus);
  const buttonsImport = optionalLine(hasButtons, `\nimport buttons from '../src/components/buttons';`);
  const selectMenusImport = optionalLine(hasSelectMenus, `\nimport selectMenus from '../src/components/selectMenus';`);
  const schemaImport = optionalLine(dbEnabled, `\nimport { schema } from './db/schema';`);
  const dbInit = optionalLine(
    dbEnabled,
    `  createDbClient(schema, { url: config.db?.tursoDatabaseUrl, authToken: config.db?.tursoAuthToken });\n\n`,
  );
  const coreClassImport = optionalLine(
    Boolean(coreClassName),
    `\nimport { ${coreClassName} } from '../src/${coreClassName}';`,
  );
  const coreCreateArgs = optionalLine(
    Boolean(coreClassName),
    `, () => new ${coreClassName}(), config.coreClass.instanceInvalidMessage`,
  );

  const componentsStateFields = buildComponentsStateFields(hasButtons, hasSelectMenus);
  const coreOptionBlock = buildCoreOptionBlock(hasButtons || hasSelectMenus, coreCreateArgs);

  return `// AUTO-GENERATED by \`disbord ${origin}\`. Do not edit — regenerated on every restart.
import { Client, Events } from 'discord.js';
import {
  ${disbordImports.join(',\n  ')},
} from 'disbord';
import rawConfig from '../disbord.config';
import slashCommands from '../src/components/slashCommands';${buttonsImport}${selectMenusImport}${schemaImport}${coreClassImport}
${eventImports}

async function main() {
  // satisfiesの推論型(disbord.config.ts側のexcess property check維持のため)をConfigへ広げる
  const config = rawConfig as Config;

${dbInit}  setComponentsState({ ${componentsStateFields} });

  const client = new Client({ intents: config.intents });

${coreOptionBlock}  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isRepliable()) return;
    try {
${buildInteractionRouting(hasButtons, hasSelectMenus)}
    } catch (error) {
      await handleBotError(error, interaction, config.botErrorMessage);
    }
  });

${eventBindings}

  const TOKEN = config.token ?? process.env.TOKEN;

  await client.login(TOKEN);
}

void main();
`;
}
