import type { EnvTarget } from './dotenvxSpawn';
import type { EnvKeyType } from './envTypes';

/**
 * 生成するbotが依存する`disbord`のバージョン範囲。
 * disbordを新しいバージョンで公開したら、このバージョン範囲も手動で追従させる。
 */
const DISBORD_VERSION_RANGE = '^0.0.2';

/**
 * `create-disbord-app`が生成する初期スケルトンのうち、`--db`/`--core-class`に依存しない
 * base package.json(依存・scriptsの追加は`disbord enable db`が担う。「オプションの生成処理は
 * 全てdisbord enableから行う」構成のため、この関数自体はdbを一切知らない)。
 */
export function generatePackageJson(name: string): string {
  return (
    JSON.stringify(
      {
        name,
        version: '0.0.1',
        private: true,
        type: 'module',
        scripts: {
          dev: 'disbord dev',
          build: 'disbord build',
          fmt: 'oxfmt --write src test',
          lint: 'oxlint -c oxlint.config.ts --fix',
          commands: 'disbord commands push',
          'commands:delete': 'disbord commands delete',
          'gen:event': 'disbord generate event',
          enable: 'disbord enable',
          disable: 'disbord disable',
          env: 'disbord env',
          encrypt: 'disbord env encrypt',
          decrypt: 'disbord env decrypt',
          help: 'disbord help',
        },
        dependencies: {
          disbord: DISBORD_VERSION_RANGE,
          'discord.js': '^14.27.0',
        },
        devDependencies: {
          '@types/bun': 'latest',
          // typescript@7系のtscは既にネイティブ実装への薄いシムになっているため、
          // @typescript/native-preview(tsgoコマンド)は不要(実機確認済み)。
          typescript: '^7.0.2',
          oxlint: 'latest',
          oxfmt: '^0.61.0',
        },
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * db有効時に`disbord enable --db`が追加するpackage.jsonの内容。
 * @libsql/client・dayjs・drizzle-kit・drizzle-ormをbot自身の依存にも明示する理由は
 * generatePackageJsonの実装当初と同じ:
 * - `@libsql/client`はプラットフォーム別ネイティブバインディングを持ち、bun buildで
 *   バンドルしきれず`--external`扱いになる(disbord/src/cli/build.ts参照)。dist/main.jsの
 *   実行時、この`require('@libsql/client')`はbot自身のディレクトリツリー基準で解決されるため、
 *   disbord側にしか入っていないとデプロイ先で解決できない(実機で確認済み)
 * - `disbord migrate`が`src/db/models/*.ts`を動的importしてschema.ts・migrationファイルを
 *   生成する。この際に内部で使う`drizzle-orm/sqlite-core`・`drizzle-kit/api`をbot自身の
 *   モジュール解決・型チェックのために必要とする
 * - `mode: 'timestamp_ms'`のカラムはgetter越しに`dayjs`でラップされるため、モデル側で
 *   `accessor xxx: Dayjs;`と型注釈する際にbot自身の型チェックのために`dayjs`の型解決が必要
 */
export const DB_DEPENDENCIES: Record<string, string> = {
  '@libsql/client': '^0.17.2',
  dayjs: '^1.11.19',
  'drizzle-kit': '^0.31.10',
  'drizzle-orm': '^0.45.1',
};

export const DB_GEN_MODEL_SCRIPT = { name: 'gen:model', command: 'disbord generate model' } as const;
export const DB_MIGRATE_SCRIPT = { name: 'migrate', command: 'disbord migrate' } as const;
export const DB_STUDIO_SCRIPT = { name: 'studio', command: 'disbord studio' } as const;

/**
 * db有効時に`disbord enable db`/`disable db`が`env/.env.production`へ追加・削除する
 * キー一覧(「DB層」節参照。本番接続先はTursoのみを想定し、ローカル開発は`.disbord/db/dev.db`固定のため
 * `env/.env.development`側には追加しない)。
 */
export const DB_ENV_KEYS = ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'];

/**
 * `--db`/`--core-class`に依存しない最小構成のdisbord.config.ts。
 * db/coreClassの有効化はcreate-disbord-app完了後に`disbord enable`が
 * disbord.config.tsをテキストパッチして追加する(ユーザーが手で編集したbotErrorMessage等の
 * 内容を壊さないよう、丸ごと再生成はしない)。
 */
export function generateDisbordConfig(): string {
  return `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;
}

export function generateOxfmtrc(): string {
  return (
    JSON.stringify(
      {
        $schema: './node_modules/oxfmt/configuration_schema.json',
        printWidth: 120,
        tabWidth: 2,
        useTabs: false,
        semi: true,
        singleQuote: true,
        trailingComma: 'all',
        bracketSpacing: true,
        arrowParens: 'always',
        sortImports: {
          groups: [['builtin'], ['external'], ['internal'], ['parent', 'sibling', 'index']],
          sortSideEffects: false,
          ignoreCase: true,
          newlinesBetween: false,
        },
        ignorePatterns: ['node_modules/*', 'dist/*', '.disbord/*'],
      },
      null,
      2,
    ) + '\n'
  );
}

/**
 * 相対import禁止(no-restricted-imports)・.disbord/*の除外は disbord/lint 側の共有configに
 * 含まれているため、生成物はextendsするだけでよい。
 */
export function generateOxlintConfig(): string {
  return `import { config } from 'disbord/lint';

export default {
  extends: [config],
};
`;
}

export function generateTsconfig(): string {
  return (
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: 'Preserve',
          lib: ['ESNext'],
          moduleDetection: 'force',
          moduleResolution: 'bundler',
          allowImportingTsExtensions: true,
          verbatimModuleSyntax: true,
          isolatedModules: true,
          noEmit: true,
          skipLibCheck: true,
          types: ['bun'],
          // TypeScript v7は`baseUrl`を廃止しているため指定しない(tsgoで実機確認済み: TS5102)。
          // pathsはtsconfig.json自身の場所を基準に解決される。
          paths: { '@/*': ['./src/*'] },
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: false,
          noFallthroughCasesInSwitch: true,
          noUncheckedIndexedAccess: true,
          noImplicitOverride: true,
        },
        include: ['src', 'test', '.disbord/disbord.d.ts'],
      },
      null,
      2,
    ) + '\n'
  );
}

export function generateMiseToml(): string {
  // dotenvxはdisbordのnpm依存(@dotenvx/dotenvx)から解決するため、bot側でmise経由の
  // dotenvx導入は不要。
  return `[tools]
bun = "latest"
`;
}

export function generateGitignore(): string {
  return `node_modules/
dist/
.disbord/
env/.env.keys.*
`;
}

export function generateReadyEvent(): string {
  return `import type { Client } from 'discord.js';

export default async function (client: Client<true>) {
  console.log(\`\${client.user.tag} が起動しました\`);
}
`;
}

export function generateButtonsStub(): string {
  return `import type { ButtonRegistration } from 'disbord';

export default {} satisfies ButtonRegistration;
`;
}

export function generateSelectMenusStub(): string {
  return `import type { SelectMenuRegistration } from 'disbord';

export default {} satisfies SelectMenuRegistration;
`;
}

export function generateSlashCommandsStub(): string {
  return `import type { SlashCommandRegistration } from 'disbord';

export default {} satisfies SlashCommandRegistration;
`;
}

export const DEFAULT_CORE_CLASS_NAME = 'Core';

/**
 * ButtonRegistration/SelectMenuRegistrationのexecute第2引数(core)は、生成後この型を
 * ユーザーが自由に拡張していく想定のため中身は空クラスのみ。クラス名・ファイル名は
 * `--core-class=Name`・対話フローで指定した名前になる(未指定時のデフォルトは`Core`。
 * ファイルはクラス名と同じ`src/${className}.ts`に生成される)。
 */
export function generateCoreStub(className: string = DEFAULT_CORE_CLASS_NAME): string {
  return `export class ${className} {}
`;
}

/**
 * module augmentationの受け口。db/coreClassの有効・無効状態から都度組み立て直す
 * (`disbord.d.ts`自体はユーザー編集を想定しないため、disbord.config.tsと違い
 * テキストパッチではなく毎回丸ごと再生成する。create-disbord-app初期生成時・
 * `disbord enable`・`disbord disable`・`disbord env`のいずれもこの関数を使う)。
 */
export function generateDisbordDts(options: {
  db: boolean;
  coreClass: boolean;
  coreClassName?: string;
  envKeys?: EnvKeyType[];
}): string {
  const coreClassName = options.coreClassName ?? DEFAULT_CORE_CLASS_NAME;
  const coreImportLine = options.coreClass ? `\nimport type { ${coreClassName} } from '@/${coreClassName}';` : '';
  const coreField = options.coreClass ? `\n    core: InstanceType<typeof ${coreClassName}>;` : '';
  const schemaImportLine = options.db ? `\nimport type { schema } from './db/schema';` : '';
  const schemaField = options.db ? '\n    schema: typeof schema;' : '';
  const envKeys = options.envKeys ?? [];
  const envBlock =
    envKeys.length === 0
      ? ''
      : `\ndeclare global {
  namespace NodeJS {
    interface ProcessEnv {
${envKeys.map(({ key, required }) => `      ${key}${required ? '' : '?'}: string;`).join('\n')}
    }
  }
}
`;

  return `import type buttons from '@/components/buttons';
import type selectMenus from '@/components/selectMenus';
import type slashCommands from '@/components/slashCommands';${coreImportLine}${schemaImportLine}

declare module 'disbord' {
  interface Registry {
    buttons: typeof buttons;
    selectMenus: typeof selectMenus;
    slashCommands: typeof slashCommands;${coreField}${schemaField}
  }
}
${envBlock}`;
}

/**
 * `GUILD_ID`はguild単位のslashCommand登録(`disbord commands push`。反映が即時で開発向き)を
 * 有効にするためのキーで、開発時のみ既定で置く。本番はglobal登録(反映まで最大1時間)のままでよいため
 * `env/.env.production`側には含めない。
 */
export function generateEnvPlaceholder(envTarget: EnvTarget): string {
  return envTarget === 'development'
    ? `TOKEN=
CLIENT_ID=
GUILD_ID=
`
    : `TOKEN=
CLIENT_ID=
`;
}
