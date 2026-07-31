# disbord

bo-yakitarako専用のオレオレDiscord botフレームワーク。プラグイン機構は持たず、気に入った機能は都度フレームワーク本体に直接組み込む方針（拡張性より一体性を優先）。

新規bot作成は [`create-disbord-app`](https://github.com/bo-yakitarako/create-disbord-app) から始めてください。このREADMEは`disbord`パッケージ自体（CLI・ランタイム）の使い方をまとめたものです。

## インストール

`create-disbord-app`が生成するbotの`package.json`には`disbord`が依存として自動的に追加されます。手動で追加する場合は次の通りです。

```bash
bun add disbord
```

TypeScript v7系を`peerDependencies`として要求します。

## クイックスタート

```bash
bunx create-disbord-app my-bot
cd my-bot
bun run dev
```

`bun run dev`（`disbord dev`）は起動時にslashCommandのREST登録・（DB有効時は）migrationを自動で行い、そのままbotを起動します。

## `disbord.config.ts`

プロジェクトルートに1つだけ置く設定ファイルです。

```ts
import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラっちゃったサンプル',
} satisfies Config;
```

- `token` / `clientId` / `guildId` / `db.tursoDatabaseUrl` / `db.tursoAuthToken`: 値そのもの（`process.env.ALT_TOKEN`のような任意の環境変数を参照する式でもよい）を書く。未指定時はキー名をUPPER_SNAKE_CASEにしたデフォルトの環境変数名（`clientId` → `CLIENT_ID`）へ自動フォールバックする
- `guildId`: 指定すると`disbord commands push`がguild単位登録（反映が即時）になる。未指定ならglobal登録（反映まで最大1時間）
- `coreClass` / `db`: それぞれ`disbord enable core-class` / `disbord enable db`で有効化する（後述）
- `botErrorMessage`: `BotError`（`message`未指定のもの）がthrowされた際に返信する文言。固定文字列または`(error: Error) => string`
- `argsSplitter`: customIdへ引数を埋め込む際の区切り文字のグローバル既定値（未指定時`-`）

## CLIコマンド

| コマンド | 説明 |
| --- | --- |
| `disbord dev` | 開発サーバーを起動する（`bun --watch`のラッパー。起動時にcommands push・（DB有効時）migrateを自動実行） |
| `disbord build` | 本番デプロイ用に`dist/main.js`・`dist/.env`を生成する |
| `disbord commands push [--env development\|production]` | slashCommandをDiscordへREST登録する |
| `disbord commands delete [--env development\|production]` | 登録済みslashCommandを削除する |
| `disbord env [--production\|--all]` | `env/`配下の環境変数を暗号化⇔復号にtoggleする |
| `disbord env encrypt [--production\|--all]` | `env/`配下を暗号化する（固定） |
| `disbord env decrypt [--production\|--all]` | `env/`配下を復号する（固定） |
| `disbord generate event <name>` | `src/events/<name>.ts`のひな形を追加生成する |
| `disbord generate once <name>` | `src/once/<name>.ts`のひな形を追加生成する |
| `disbord generate component <button\|selectMenu>` | `src/components/buttons.ts`・`selectMenus.ts`を追加生成する（未生成なら） |
| `disbord generate workflow ssh` | `.github/workflows/deploy.yaml`を（再）生成する（SSH+systemd userサービスへのデプロイ用） |
| `disbord once <name> [--production]` | `src/once/<name>.ts`をbotとして1回だけ起動して実行する |
| `disbord generate model <Name>` | `src/db/models/<Name>.ts`にdecorator付きモデルクラスを追加生成する（DB有効時のみ） |
| `disbord migrate [--production]` | モデル定義から`schema.ts`・migrationファイルを生成し、DBに適用する（DB有効時のみ） |
| `disbord studio` | `.disbord/db/dev.db`を対象にdrizzle studioサーバーを起動する（DB有効時のみ） |
| `disbord enable db` / `disbord enable core-class [ClassName]` | 後からdb/coreClassを個別に有効化する |
| `disbord disable db` / `disbord disable core-class` | 有効化したdb/coreClassを個別に無効化する（確認プロンプトあり） |
| `disbord --version`, `-v` | バージョンを表示する |
| `disbord --help`, `-h` / `disbord help` | コマンド一覧を表示する（DB有効時のみDB系コマンドも表示） |

本番実行は`disbord build`が生成した`dist/main.js`を`bun`で直接叩くだけで、`disbord start`のようなコマンドは存在しません。

## components（`src/components/`）

`buttons.ts` / `selectMenus.ts` / `slashCommands.ts`にそれぞれ`export default { ... } satisfies XxxRegistration`の形でルーティングを宣言します。discord.jsのBuilderは直書きせず、素朴なオブジェクト（例: `{ label, style?, disabled?, args? }`）または`(...args) => component`の関数で書きます。

`slashCommands.ts`だけは必須で、`buttons.ts`/`selectMenus.ts`は任意です。使う時だけ`disbord generate component button` / `disbord generate component selectMenu`で追加生成してください。

```ts
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
```

- `execute`の第1引数はdisbordが軽くラップしたInteraction（`reply`と同じシグネチャの`ephemeral`メンバーを追加で持つ）
- `execute`の第2引数はCoreクラスのインスタンス（`coreClass.enable`時）、それ以外は`...args: string[]`（customIdに埋め込んだ引数の復元値）
- `argsSplitter?: string`をentryごとに指定でき、customIdの区切り文字を上書きできる
- `slashCommands.ts`は`{ description?, options?, execute }`のオブジェクト形に加え、`execute`関数を直接指定する形（例: `ping: async (interaction) => {...}`）も書ける

`makeButtonRow` / `makeSelectMenuRow`は`disbord`から直接importして使い、ジェネリクスは書きません。

## events（`src/events/`）

1ファイル1イベント、ファイル名はdiscord.jsのイベント名（例: `messageCreate.ts`）。`disbord generate event <name>`で追加生成します。`interactionCreate`用のイベントファイルは存在しません（componentsのルーティングに統合済み）。

```ts
// src/events/messageCreate.ts
import type { Message } from 'disbord';

export default async function (message: Message) {
  if (message.author.bot) return;
};
```

## once（`src/once/`）

常駐せず1回だけ処理を実行して終了するbot用の入り口です。`disbord generate once <name>`で`src/once/<name>.ts`を生成し、`disbord once <name> [--production]`で実行します（`disbord build`は`dist/<name>.js`としても出力します。`main`はbot本体のエントリ`dist/main.js`と衝突するため予約済みで使えません）。DB有効時は`db`/`Model`、coreClass有効時は`coreStore`もそのままimportして使えます。

```ts
// src/once/notice.ts
import type { Client } from 'discord.js';

export default async function (client: Client<true>) {
  //
}
```

## Core機構

複数のcomponentsで使い回す制御クラス（Core）を、guild/category/channel/user/globalいずれかの単位でインスタンス管理する仕組みです。`disbord enable core-class`で有効化すると`src/{ClassName}.ts`が生成されます。

```ts
import { coreStore } from 'disbord';

// 任意のタイミング（例: 開始用slashCommandのexecute内）でインスタンスを登録する
const core = coreStore.create(interaction);
```

`instanceLevel`に対応するキーがinteractionから解決できない場合（例: guild単位のCoreをDM上で使おうとした）は`BotError(instanceInvalidMessage)`がthrowされます。

## DB層（`src/db/models/`）

Drizzle + libSQL。モデルクラスを1つ書くだけで`disbord migrate`が`schema.ts`・migrationファイルを自動生成します。`disbord enable db`で有効化します。

```ts
// src/db/models/Job.ts
import type { Dayjs } from 'dayjs';
import { Model, Table, Column, Relate } from 'disbord';
import { User } from './User';

@Table('jobs')
export class Job extends Model {
  @Relate(() => User, { onDelete: 'cascade' })
  accessor userId!: string;

  @Column('text')
  accessor displayName!: string;

  @Column('integer', { mode: 'timestamp_ms' })
  accessor actAt!: Dayjs;
}
```

`id` / `createdAt` / `updatedAt`は全モデル共通で自動付与されます。`Job.create()`/`find()`/`update()`等の入力型（`namespace Job { export type Data = ... }`のような手書き・自動生成ブロック）は不要で、`@Column`/`@Relate`のaccessor宣言からクラス定義そのものを元に機械的に導出されます（`timestamp_ms`のaccessorだけは読み取り時`Dayjs`・書き込み時`Date`と非対称なため、その変換のみ`disbord`側で吸収します。Model内の型定義は`Dayjs`にします）。接続先はTurso用の環境変数の有無で自動判定され（未設定ならローカルsqlite`.disbord/db/dev.db`）、中身は`disbord studio`で確認できます。

`@Column`の`default`オプションは値の種類でDB側/JS側どちらのdefaultになるか変わります。固定値（例: `default: 'pending'`）はDBスキーマの`DEFAULT`句として、関数（例: `default: () => crypto.randomUUID()`）はdrizzle-orm（JS側）がINSERT時に評価する値として扱われます（生SQLでのINSERTには効きません）。`type`/`mode`ごとに`default`の型も絞られており（例: `mode: 'boolean'`なら`boolean`のみ）、`mode: 'timestamp_ms'`のカラムは`Date`ではなく`Dayjs`（固定値・`() => Dayjs`関数どちらも）で指定します（DBへ渡す際は内部でDateへ変換されます）。さらに`mode: 'timestamp_ms'`のカラムに限り特別な値`default: 'now'`も使え、DB側の`DEFAULT (unixepoch('subsec') * 1000)`（挿入時刻のミリ秒unix時間）になります。ただしTypeScriptの`accessor`は`?`を付けたoptionalにできない言語仕様のため、`Job.create()`呼び出し時にこの値の指定を省略できるようにはなりません（DBやdrizzle-kit studio等から直接INSERTする場合にのみ効きます）。

## デプロイ（`.github/workflows/`）

`disbord generate workflow ssh`で`.github/workflows/deploy.yaml`を生成します。pushをトリガーにビルド後、SSH経由でリモートホストへ配置し、systemd（`--user`）のサービスとして起動・再起動します。onceスクリプトがある場合はそれぞれtimerユニットも合わせてデプロイし、`disbord.config.ts`の`timer`で指定したスケジュールで定期実行します。`lefthook.yml`があればpre-commitにも再生成コマンドが追加され、config変更などがdeploy.yamlへ自動で反映されます。

## エラーハンドリング

`BotError`がthrowされると大元のtry/catchでcatchされ、`message`があればそれを、無ければ`disbord.config.ts`の`botErrorMessage`を返信します。`BotError`以外のdiscord.js由来のエラーは素通しされます。

## Lint / Format / テスト

```bash
bun run lint    # oxlint --fix + oxfmt --write
bun run test    # bun test
bunx tsc --noEmit
```

lint設定は`disbord/lint`をextendsする`oxlint.config.ts`（TS製）。`create-disbord-app`が生成する`lefthook.yml`により、pre-commitでlint→fmt→env暗号化（`--all`）が自動実行されます。
