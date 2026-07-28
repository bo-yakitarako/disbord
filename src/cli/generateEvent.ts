import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  collectDiscordJsTypeIdentifiers,
  isDiscordJsExport,
  parseClientEventsInterface,
  resolveEventParams,
  type EventParam,
} from './clientEvents';

const RESERVED_EVENT_NAME = 'interactionCreate';

function resolveDiscordJsTypingsPath(cwd: string): string {
  const pkgJsonPath = Bun.resolveSync('discord.js/package.json', cwd);
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { types?: string; typings?: string };
  const typesRelativePath = pkg.types ?? pkg.typings;
  if (!typesRelativePath) {
    throw new Error('disbord: discord.jsのpackage.jsonにtypes/typingsフィールドが見つかりませんでした');
  }
  return join(dirname(pkgJsonPath), typesRelativePath);
}

/**
 * src/events/<name>.ts のTSソース全文を組み立てる。
 * messageCreateだけは特別扱いする:
 * - 実際の型(`OmitPartialGroupDMChannel<Message>`)をdiscord.jsから直接importする代わりに、
 *   disbordが再定義した`Message`型(`src/message.ts`)をimportして使う
 * - 自botの発言に反応してループしないよう、`if (message.author.bot) return;`を先頭に入れる
 */
export function generateEventFileContent(name: string, params: EventParam[], typeIdentifiers: string[]): string {
  if (name === 'messageCreate') {
    return `import type { Message } from 'disbord';

export default async function (message: Message) {
  if (message.author.bot) return;
  //
}
`;
  }

  const paramList = params.map((p) => `${p.name}: ${p.type}`).join(', ');
  const importLine =
    typeIdentifiers.length > 0 ? `import type { ${typeIdentifiers.join(', ')} } from 'discord.js';\n\n` : '';

  return `${importLine}export default async function (${paramList}) {
  //
}
`;
}

export async function runGenerateEvent(name: string, cwd: string): Promise<void> {
  if (name === RESERVED_EVENT_NAME) {
    throw new Error(
      `disbord: ${RESERVED_EVENT_NAME}は予約済みです。interactionCreateはdisbordのcomponents層が内部で処理するため、events配下に生成できません。`,
    );
  }

  const targetPath = join(cwd, `src/events/${name}.ts`);
  if (existsSync(targetPath)) {
    throw new Error(`disbord: src/events/${name}.ts は既に存在します（上書きしません）`);
  }

  const dtsPath = resolveDiscordJsTypingsPath(cwd);
  const source = readFileSync(dtsPath, 'utf-8');

  const members = parseClientEventsInterface(source);
  const params = resolveEventParams(name, members);

  const typeIdentifiers = collectDiscordJsTypeIdentifiers(params.map((p) => p.type)).filter((id) =>
    isDiscordJsExport(source, id),
  );

  const content = generateEventFileContent(name, params, typeIdentifiers);

  mkdirSync(join(cwd, 'src/events'), { recursive: true });
  writeFileSync(targetPath, content);
  console.log(`disbord: src/events/${name}.ts を生成しました`);
}
