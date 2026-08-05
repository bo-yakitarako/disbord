import type { EnvTarget } from './dotenvxSpawn';
import type { EnvKeyType } from './envTypes';

/**
 * 生成するbotが依存する`disbord`のバージョン範囲。
 * disbordを新しいバージョンで公開したら、このバージョン範囲も手動で追従させる。
 */
const DISBORD_VERSION_RANGE = '^2.3.5';

/**
 * 生成するbotが使うbunのバージョン(mise.toml/`@types/bun`両方で使う)。
 * disbordリポジトリ自身のmise.toml（ルート直下、disbord/create-disbord-appのworkspace共通）が
 * 固定しているbunバージョンと同じ値に手動で追従させる。
 */
const BUN_VERSION = '1.3.13';

/**
 * 生成するbotが使うoxlintのバージョン(oxfmtと同様、`latest`ではなく固定バージョンで指定する)。
 * oxlintの新しいバージョンをdisbord/create-disbord-app側で追従させたら、この値も手動で追従させる。
 */
const OXLINT_VERSION_RANGE = '^1.76.0';

/**
 * 生成するbotが使うlefthookのバージョン(oxlint/oxfmtと同様、`latest`ではなく固定バージョンで指定する)。
 */
const LEFTHOOK_VERSION_RANGE = '^2.1.6';

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
          once: 'disbord once',
          fmt: 'oxfmt --write src test',
          lint: 'oxlint -c oxlint.config.ts --fix',
          commands: 'disbord commands push',
          'commands:delete': 'disbord commands delete',
          'gen:event': 'disbord generate event',
          'gen:once': 'disbord generate once',
          'gen:component': 'disbord generate component',
          'gen:workflow': 'disbord generate workflow',
          enable: 'disbord enable',
          disable: 'disbord disable',
          env: 'disbord env',
          encrypt: 'disbord env encrypt',
          decrypt: 'disbord env decrypt',
          help: 'disbord help',
          // lefthookのgit hooks配線はbun installのたびに冪等に効かせたいためpostinstallで行う
          // (npm lifecycle scriptのため、他のdisbordサブコマンド群とは別枠でscriptsの末尾に置く)。
          postinstall: 'lefthook install --reset-hooks-path',
        },
        dependencies: {
          disbord: DISBORD_VERSION_RANGE,
          'discord.js': '^14.27.0',
        },
        devDependencies: {
          '@types/bun': BUN_VERSION,
          // typescript@7系のtscは既にネイティブ実装への薄いシムになっているため、
          // @typescript/native-preview(tsgoコマンド)は不要(実機確認済み)。
          typescript: '^7.0.2',
          oxlint: OXLINT_VERSION_RANGE,
          oxfmt: '^0.61.0',
          lefthook: LEFTHOOK_VERSION_RANGE,
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
export const DB_MODEL_TYPE_SCRIPT = { name: 'model:type', command: 'disbord model type' } as const;
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
  // dotenvx導入は不要。bunは`latest`ではなくBUN_VERSION固定(package.jsonの`@types/bun`と
  // 同じバージョンに揃えるため)。
  return `[tools]
bun = "${BUN_VERSION}"
`;
}

export function generateGitignore(): string {
  return `node_modules/
dist/
.disbord/
env/.env.keys.*
`;
}

/**
 * pre-commitでfmt/lint/encryptを強制する。encryptは`--all`でdevelopment/productionの
 * 両方を対象にする(片方だけ手動decryptしたまま暗黙にcommitされてしまう事故を防ぐため)。
 * `bun run fmt`によるステージ後の書き換え分は`stage_fixed: true`で自動的に再ステージする。
 * `mise exec --`で各コマンドをラップするのは、git hookがインタラクティブシェルの外で
 * 実行されmiseのシェル統合(cd時の自動バージョン切り替え)が効かないため。ラップしないと
 * PATH上の任意バージョンのbunが使われてしまい、mise.tomlで固定したバージョンと
 * ずれる可能性がある。
 */
export function generateLefthookConfig(): string {
  return `pre-commit:
  piped: true
  commands:
    lint:
      run: mise exec -- bun run lint
    fmt:
      run: mise exec -- bun run fmt
      stage_fixed: true
    encrypt:
      run: mise exec -- bun run encrypt -- --all
      stage_fixed: true
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
function optionalLine(enabled: boolean, line: string): string {
  return enabled ? line : '';
}

function buildEnvBlock(envKeys: EnvKeyType[]): string {
  if (envKeys.length === 0) return '';
  return `\ndeclare global {
  namespace NodeJS {
    interface ProcessEnv {
${envKeys.map(({ key, required }) => `      ${key}${required ? '' : '?'}: string;`).join('\n')}
    }
  }
}
`;
}

export function generateDisbordDts(options: {
  db: boolean;
  coreClass: boolean;
  coreClassName?: string;
  envKeys?: EnvKeyType[];
  buttons?: boolean;
  selectMenus?: boolean;
}): string {
  const buttonsEnabled = options.buttons ?? true;
  const selectMenusEnabled = options.selectMenus ?? true;
  const coreClassName = options.coreClassName ?? DEFAULT_CORE_CLASS_NAME;
  const coreImportLine = optionalLine(
    options.coreClass,
    `\nimport type { ${coreClassName} } from '@/${coreClassName}';`,
  );
  const coreField = optionalLine(options.coreClass, `\n    core: InstanceType<typeof ${coreClassName}>;`);
  const schemaImportLine = optionalLine(options.db, `\nimport type { schema } from '../src/db/schema';`);
  const schemaField = optionalLine(options.db, '\n    schema: typeof schema;');
  const buttonsImportLine = optionalLine(buttonsEnabled, `\nimport type buttons from '@/components/buttons';`);
  const buttonsField = optionalLine(buttonsEnabled, '\n    buttons: typeof buttons;');
  const selectMenusImportLine = optionalLine(
    selectMenusEnabled,
    `\nimport type selectMenus from '@/components/selectMenus';`,
  );
  const selectMenusField = optionalLine(selectMenusEnabled, '\n    selectMenus: typeof selectMenus;');
  const envBlock = buildEnvBlock(options.envKeys ?? []);

  return `import type slashCommands from '@/components/slashCommands';${buttonsImportLine}${selectMenusImportLine}${coreImportLine}${schemaImportLine}

declare module 'disbord' {
  interface Registry {
    slashCommands: typeof slashCommands;${buttonsField}${selectMenusField}${coreField}${schemaField}
  }
}
${envBlock}`;
}

/**
 * disbord自身の`README.md`から「インストール」「クイックスタート」の2節（disbordパッケージの
 * 導入手順であり、生成済みのbotには不要）を抜いたものをベースに、タイトル・冒頭文だけ
 * bot自身の説明に差し替えたもの。config/CLIコマンド/components/events/Core機構/DB層/
 * エラーハンドリング/lint・testの各節は内容をそのまま流用する（disbordの使い方自体は
 * バージョン間で変わらないため、都度disbord本体のREADMEと突き合わせて追従させる）。
 */
export function generateReadme(name: string): string {
  return `# ${name}

[\`disbord\`](https://github.com/bo-yakitarako/disbord)で構築されたDiscord bot。詳しい使い方は\`disbord\`のREADMEを参照してください。

## \`disbord.config.ts\`

プロジェクトルートに1つだけ置く設定ファイルです。

\`\`\`ts
import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラっちゃったサンプル',
} satisfies Config;
\`\`\`

- \`token\` / \`clientId\` / \`guildId\` / \`db.tursoDatabaseUrl\` / \`db.tursoAuthToken\`: 値そのもの（\`process.env.ALT_TOKEN\`のような任意の環境変数を参照する式でもよい）を書く。未指定時はキー名をUPPER_SNAKE_CASEにしたデフォルトの環境変数名（\`clientId\` → \`CLIENT_ID\`）へ自動フォールバックする
- \`guildId\`: 指定すると\`disbord commands push\`がguild単位登録（反映が即時）になる。未指定ならglobal登録（反映まで最大1時間）
- \`coreClass\` / \`db\`: それぞれ\`disbord enable core-class\` / \`disbord enable db\`で有効化する（後述）
- \`botErrorMessage\`: \`BotError\`（\`message\`未指定のもの）がthrowされた際に返信する文言。固定文字列または\`(error: Error) => string\`
- \`argsSplitter\`: customIdへ引数を埋め込む際の区切り文字のグローバル既定値（未指定時\`-\`）

## CLIコマンド

| コマンド | 説明 |
| --- | --- |
| \`disbord dev\` | 開発サーバーを起動する（\`bun --watch\`のラッパー。起動時にcommands push・（DB有効時）migrateを自動実行） |
| \`disbord build\` | 本番デプロイ用に\`dist/main.js\`・\`dist/.env\`を生成する |
| \`disbord commands push [--production]\` | slashCommandをDiscordへREST登録する |
| \`disbord commands delete [--production]\` | 登録済みslashCommandを削除する |
| \`disbord env [--production\\|--all]\` | \`env/\`配下の環境変数を暗号化⇔復号にtoggleする |
| \`disbord env encrypt [--production\\|--all]\` | \`env/\`配下を暗号化する（固定） |
| \`disbord env decrypt [--production\\|--all]\` | \`env/\`配下を復号する（固定） |
| \`disbord generate event <name>\` | \`src/events/<name>.ts\`のひな形を追加生成する |
| \`disbord generate once <name>\` | \`src/once/<name>.ts\`のひな形を追加生成する |
| \`disbord generate component <button\\|selectMenu>\` | \`src/components/buttons.ts\`・\`selectMenus.ts\`を追加生成する（未生成なら） |
| \`disbord generate workflow ssh\` | \`.github/workflows/deploy.yaml\`を（再）生成する（SSH+systemd userサービスへのデプロイ用） |
| \`disbord once <name> [--production]\` | \`src/once/<name>.ts\`をbotとして1回だけ起動して実行する |
| \`disbord generate model <Name>\` | \`src/db/models/<Name>.ts\`にdecorator付きモデルクラスを追加生成する（DB有効時のみ） |
| \`disbord migrate [--production]\` | モデル定義から\`schema.ts\`・migrationファイルを生成し、DBに適用する（DB有効時のみ） |
| \`disbord model type\` | 各モデルファイル末尾の\`namespace Data\`型ブロックだけを再生成する（schema.ts再生成・migration・DB接続はしない。DB有効時のみ） |
| \`disbord studio\` | \`.disbord/db/dev.db\`を対象にdrizzle studioサーバーを起動する（DB有効時のみ） |
| \`disbord enable db\` / \`disbord enable core-class [ClassName]\` | 後からdb/coreClassを個別に有効化する |
| \`disbord disable db\` / \`disbord disable core-class\` | 有効化したdb/coreClassを個別に無効化する（確認プロンプトあり） |
| \`disbord --version\`, \`-v\` | バージョンを表示する |
| \`disbord --help\`, \`-h\` / \`disbord help\` | コマンド一覧を表示する（DB有効時のみDB系コマンドも表示） |

本番実行は\`disbord build\`が生成した\`dist/main.js\`を\`bun\`で直接叩くだけで、\`disbord start\`のようなコマンドは存在しません。

## components（\`src/components/\`）

\`buttons.ts\` / \`selectMenus.ts\` / \`slashCommands.ts\`にそれぞれ\`export default { ... } satisfies XxxRegistration\`の形でルーティングを宣言します。discord.jsのBuilderは直書きせず、素朴なオブジェクト（例: \`{ label, style?, disabled?, args? }\`）または\`(...args) => component\`の関数で書きます。

\`slashCommands.ts\`だけは必須で、\`buttons.ts\`/\`selectMenus.ts\`は任意です。使う時だけ\`disbord generate component button\` / \`disbord generate component selectMenu\`で追加生成してください。

\`\`\`ts
// src/components/buttons.ts
import type { ButtonRegistration } from 'disbord';

export default {
  ping: {
    component: { label: 'Ping' },
    execute: async (interaction) => {
      await interaction.reply('pong');
    },
  },
} satisfies ButtonRegistration;
\`\`\`

- \`execute\`の第1引数はdisbordが軽くラップしたInteraction（\`reply\`と同じシグネチャの\`ephemeral\`メンバーを追加で持つ）
- \`execute\`の第2引数はCoreクラスのインスタンス（\`coreClass.enable\`時）、それ以外は\`...args: string[]\`（customIdに埋め込んだ引数の復元値）
- \`argsSplitter?: string\`をentryごとに指定でき、customIdの区切り文字を上書きできる
- \`slashCommands.ts\`は\`{ description?, options?, execute }\`のオブジェクト形に加え、\`execute\`関数を直接指定する形（例: \`ping: async (interaction) => {...}\`）も書ける

\`makeButtonRow\` / \`makeSelectMenuRow\`は\`disbord\`から直接importして使い、ジェネリクスは書きません。

## events（\`src/events/\`）

1ファイル1イベント、ファイル名はdiscord.jsのイベント名（例: \`messageCreate.ts\`）。\`disbord generate event <name>\`で追加生成します。\`interactionCreate\`用のイベントファイルは存在しません（componentsのルーティングに統合済み）。

\`\`\`ts
// src/events/messageCreate.ts
import type { Message } from 'disbord';

export default async function (message: Message) {
  if (message.author.bot) return;
};
\`\`\`

## once（\`src/once/\`）

常駐せず1回だけ処理を実行して終了するbot用の入り口です。\`disbord generate once <name>\`で\`src/once/<name>.ts\`を生成し、\`disbord once <name> [--production]\`で実行します（\`disbord build\`は\`dist/<name>.js\`としても出力します。\`main\`はbot本体のエントリ\`dist/main.js\`と衝突するため予約済みで使えません）。DB有効時は\`db\`/\`Model\`、coreClass有効時は\`coreStore\`もそのままimportして使えます。

\`\`\`ts
// src/once/notice.ts
import type { Client } from 'discord.js';

export default async function (client: Client<true>) {
  //
}
\`\`\`

## Core機構

複数のcomponentsで使い回す制御クラス（Core）を、guild/category/channel/user/globalいずれかの単位でインスタンス管理する仕組みです。\`disbord enable core-class\`で有効化すると\`src/{ClassName}.ts\`が生成されます。

\`\`\`ts
import { coreStore } from 'disbord';

// 任意のタイミング（例: 開始用slashCommandのexecute内）でインスタンスを登録する
const core = coreStore.create(interaction);
\`\`\`

\`instanceLevel\`に対応するキーがinteractionから解決できない場合（例: guild単位のCoreをDM上で使おうとした）は\`BotError(instanceInvalidMessage)\`がthrowされます。

## DB層（\`src/db/models/\`）

Drizzle + libSQL。モデルクラスを1つ書くだけで\`disbord migrate\`が\`schema.ts\`・migrationファイルを自動生成します。\`disbord enable db\`で有効化します。

\`\`\`ts
// src/db/models/Job.ts
import { Model, Table, Column, Relate } from 'disbord';
import { User } from './User';

@Table('jobs')
export class Job extends Model<Job.Data> {
  @Relate(() => User, { onDelete: 'cascade' })
  accessor userId!: string;

  @Column('text')
  accessor displayName!: string;
}

// AUTO-GENERATED by disbord. Do not edit below this line — regenerated by \`disbord generate model\` / \`disbord migrate\` / \`disbord model type\`.
export namespace Job {
  export type Data = { userId: string; displayName: string };
}
\`\`\`

\`id\` / \`createdAt\` / \`updatedAt\`は全モデル共通で自動付与されます。\`Model<Job.Data>\`が要求する\`namespace Job { export type Data = ... }\`ブロックは手書き不要で、\`disbord generate model\` / \`disbord migrate\` / \`disbord model type\`実行のたびに\`@Column\`/\`@Relate\`のメタデータから機械的に導出してファイル末尾へ自動生成されます（\`Job.create()\`/\`find()\`/\`update()\`等の入力型はこの\`Job.Data\`を経由するため、キー名のtypoやカラム追加漏れがコンパイルエラーで検知できます）。接続先はTurso用の環境変数の有無で自動判定され（未設定ならローカルsqlite\`.disbord/db/dev.db\`）、中身は\`disbord studio\`で確認できます。

\`@Column\`の\`default\`オプションは値の種類でDB側/JS側どちらのdefaultになるか変わります。固定値（例: \`default: 'pending'\`）はDBスキーマの\`DEFAULT\`句として、関数（例: \`default: () => crypto.randomUUID()\`）はdrizzle-orm（JS側）がINSERT時に評価する値として扱われます（生SQLでのINSERTには効きません）。\`type\`/\`mode\`ごとに\`default\`の型も絞られており（例: \`mode: 'boolean'\`なら\`boolean\`のみ）、\`mode: 'timestamp_ms'\`のカラムは\`Date\`ではなく\`Dayjs\`（固定値・\`() => Dayjs\`関数どちらも）で指定します（DBへ渡す際は内部でDateへ変換されます）。さらに\`mode: 'timestamp_ms'\`のカラムに限り特別な値\`default: 'now'\`も使え、DB側の\`DEFAULT (unixepoch('subsec') * 1000)\`（挿入時刻のミリ秒unix時間）になります。\`default\`が指定されたカラムは自動生成される\`Job.Data\`側でも\`?\`付きのoptionalになるため、\`Job.create()\`呼び出し時にその値の指定を省略できます（省略した場合はDB/drizzle側のdefaultがそのまま使われます）。

## デプロイ（\`.github/workflows/\`）

\`disbord generate workflow ssh\`で\`.github/workflows/deploy.yaml\`を生成します。pushをトリガーにビルド後、SSH経由でリモートホストへ配置し、systemd（\`--user\`）のサービスとして起動・再起動します。onceスクリプトがある場合はそれぞれtimerユニットも合わせてデプロイし、\`disbord.config.ts\`の\`timer\`で指定したスケジュールで定期実行します（\`timer\`未設定のonceスクリプトには、このコマンド実行時にデフォルト値が自動で補完されます）。\`lefthook.yml\`があればpre-commitにも再生成コマンドが追加され、config変更などがdeploy.yamlへ自動で反映されます。

## エラーハンドリング

\`BotError\`がthrowされると大元のtry/catchでcatchされ、\`message\`があればそれを、無ければ\`disbord.config.ts\`の\`botErrorMessage\`を返信します。\`BotError\`以外のdiscord.js由来のエラーは素通しされます。

## Lint / Format / テスト

\`\`\`bash
bun run lint    # oxlint --fix + oxfmt --write
bun run test    # bun test
bunx tsc --noEmit
\`\`\`

lint設定は\`disbord/lint\`をextendsする\`oxlint.config.ts\`（TS製）。pre-commitでlint→fmt→env暗号化（\`--all\`）が自動実行されます。
`;
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
