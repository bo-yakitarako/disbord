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

`makeButtonRow` / `makeSelectMenuRow`は`disbord`から直接importして使い、ジェネリクスは書きません（`.disbord/disbord.d.ts`のmodule augmentationで自botのregistration型を暗黙解決します）。

## events（`src/events/`）

1ファイル1イベント、ファイル名はdiscord.jsのイベント名（例: `messageCreate.ts`）。`disbord generate event <name>`で追加生成します。`interactionCreate`用のイベントファイルは存在しません（componentsのルーティングに統合済み）。

```ts
// src/events/messageCreate.ts
import type { Message } from 'disbord';

export default async function (message: Message) {
  if (message.author.bot) return;
};
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
import { Model, Table, Column, Relate } from 'disbord';
import { User } from './User';

@Table('jobs')
export class Job extends Model<Job.Data> {
  @Relate(() => User, { onDelete: 'cascade' })
  accessor userId!: string;

  @Column('text')
  accessor displayName!: string;
}
```

`id` / `createdAt` / `updatedAt`は全モデル共通で自動付与されます。`namespace Job { export type Data = ... }`ブロックは`disbord generate model` / `disbord migrate`実行のたびにファイル末尾へ自動生成されるため手書き不要です。接続先はTurso用の環境変数の有無で自動判定され（未設定ならローカルsqlite`.disbord/db/dev.db`）、中身は`disbord studio`で確認できます。

## エラーハンドリング

`BotError`がthrowされると大元のtry/catchでcatchされ、`message`があればそれを、無ければ`disbord.config.ts`の`botErrorMessage`を返信します。`BotError`以外のdiscord.js由来のエラーは素通しされます。

## Lint / Format / テスト

```bash
bun run lint    # oxlint --fix + oxfmt --write
bun run test    # bun test
bunx tsc --noEmit
```

lint設定は`disbord/lint`をextendsする`oxlint.config.ts`（TS製）。typecheckは`tsgo`ではなく`tsc`を使います（TypeScript v7の`tsc`は既にネイティブ実装への薄いシムのため）。`create-disbord-app`が生成する`lefthook.yml`により、pre-commitでlint→fmt→env暗号化（`--all`）が自動実行されます。
