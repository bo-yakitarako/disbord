# disbord

bo-yakitarako専用のオレオレDiscord botフレームワーク。

## 現在のスコープ（Phase 1 + Phase 2 完了）

このリポジトリは「コア機構優先で段階実装」として、`disbord.md`記載の2つの配布パッケージ（`disbord` CLI本体・`create-disbord-app`）をすべて実装済み。本モノレポは`disbord`/`create-disbord-app`を明示的なメンバーとするbun workspace（root `package.json`の`workspaces`）として構成しており、生成されるbot側`package.json`は`"disbord": "workspace:*"`を参照する（disbord公開後にバージョン参照へ切り替えるのは将来対応）。

- `Config` 型（`src/config.ts`）
- `BotError` / `handleBotError`（`src/BotError.ts`）
- `Registry`（module augmentationの受け口。`src/registry.ts`）
- Core機構: `createCoreStore` / `resolveInstanceKey`（`src/core/store.ts`）
  - instanceLevel（guild/category/channel/user/global）単位でインスタンスをget/create/removeする仕組み
- components層: `makeButtonRow` / `makeSelectMenuRow` / `routeButtonInteraction` / `routeSelectMenuInteraction` / `collectSlashCommandsData` / `routeSlashCommandInteraction`（`src/components/`）。`makeButtonRow`/`makeSelectMenuRow`はregistrationを引数に取らず、`src/disbord.d.ts`のmodule augmentation（`Registry.buttons`/`Registry.selectMenus`）経由で自botのregistrationを暗黙解決する（`src/components/state.ts`の`setComponentsState`/`getComponentsState`という実行時singleton。`db`層の`setDbState`/`getDbState`と同じパターン）。実体注入は`.disbord/main.ts`がcomponentsの動的import直後に`setComponentsState({ buttons, selectMenus })`を呼ぶことで行う
- DB層: `createDbClient` / `Model`（`src/db/`）
- `disbord/lint`（`src/lint/`）
- `disbord dev`（`src/cli/`）: `.disbord/main.ts`の生成（events静的import・components動的import・REST登録・`InteractionCreate`の汎用ルーティング配線）、`dotenvx run -- bun --watch`のラッパー起動、`src/events/`のファイル増減検知による再生成
- `disbord commands push|delete`（`src/cli/commands.ts` / `commandsRunner.ts`）: `src/components/slashCommands.ts`を元にしたREST一括登録・一括削除。`--env development|production`（未指定時は`development`）でdotenvxが読む`env/`を切り替える
- `disbord env`（`src/cli/env.ts`）: `env/.env.<target>`（`--env`未指定時は`development`）を暗号化⇔復号にtoggle。各値が`encrypted:`prefixを持つかで現在の状態を判定し、逆のdotenvx操作（`encrypt`/`decrypt`）を呼ぶ。`DOTENV_PUBLIC_KEY`ヘッダー行はdecrypt後も残り続ける（dotenvx自身の挙動）ため、状態判定にヘッダーの有無は使えない点に注意
- `disbord build`（`src/cli/build.ts`）: `.disbord/main.ts`を`registerCommands: false`で生成（REST登録なし）→`Bun.build({ target: 'bun', minify: true })`で`dist/main.js`にバンドル（components配下の動的importも含め完全にインライン化される）→`env/.env.production`を`dotenvx decrypt --stdout`で復号（元ファイルは変更しない）した平文を`dist/.env`に同梱。本番では`dist/`をそのままデプロイ単位にし、`dist/`をcwdにして`bun main.js`を実行する想定（Bunの`.env`自動読み込みはcwd基準のため）
  - `--external <pkg>`（複数指定可、`bun build --external`と同じ挙動）でバンドルから除外するパッケージを指定できる。動作確認済み: `--external discord.js`指定時はdiscord.js関連のimportがバンドルに残り、サイズも大幅に縮小する
- `disbord generate event <name>`（`src/cli/clientEvents.ts` / `generateEvent.ts`）: discord.jsの`ClientEvents`インターフェース（bot側の`node_modules/discord.js`から`.d.ts`を`.env`ではなくcwd基準で解決）を軽量パーサーでテキスト解析し、`client.on(name, listener)`が実際に渡す引数の型をそのまま`src/events/<name>.ts`のひな形に書き出す（TypeScriptコンパイラAPIには依存しない。理由はコード内コメント参照）。既存ファイルは上書きしない。`interactionCreate`は生成不可
- **DBのschema注入**: `generateMainSource`に`dbEnabled`オプションを追加し、`dev.ts`/`build.ts`が生成対象botの`disbord.config.ts`を動的import（`readBotConfig.ts`）して`config.db?.enable`を読み、生成時点で`createDbClient(schema)`配線の有無を切り替えるようにした（実行時分岐だとDB未使用botで`disbord build`のバンドル解決が失敗するため）
- `create-disbord-app`（`/home/shinnijiemo/bot/create-disbord-app/`）: `create-disbord-app <name> [--db] [--core-class]`（`<name>`が生成したいbot名の引数）。「DBは使用しますか？」→「Coreは使用しますか？」の対話フロー（フラグ指定時はスキップ）で`disbord.config.ts`はじめ一式（`package.json`・`.oxfmtrc.json`・`oxlint.config.ts`・`tsconfig.json`・`mise.toml`・`.gitignore`・`src/events/ready.ts`・components3種の空stub・`src/disbord.d.ts`・`env/.env.{development,production}`平文プレースホルダー、db有効時は`src/db/schema.ts`も）を生成する。既存ディレクトリは上書きしない
  - 生成されるbotのtsconfig.jsonは`@/*` → `src/*`のエイリアスを持ち、`oxlint.config.ts`に`no-restricted-imports`（`patterns: ['./**', '../**']`）を追加して相対importを禁止・`@/`絶対パスimportを必須にしている（この制限は`disbord/lint`共有configには入れていない。disbord自身は`@/`エイリアスを持たず相対importで書かれているため、共有configに入れるとdisbord自身のlintが壊れる）
  - db有効時、`@libsql/client`はプラットフォーム別ネイティブバインディングを持ちバンドルしきれないため`disbord build`が自動的に`--external`扱いにする。そのためbot自身の`package.json`にも`@libsql/client`/`drizzle-orm`を直接の依存として含めている（disbord内部の依存だけでは、bot自身のディレクトリツリー基準で解決される`dist/main.js`実行時に見つからない。実機で確認済み）
  - 生成される`tsconfig.json`は`baseUrl`を含まない（TypeScript v7で廃止されたオプションのため。当初含めていて`tsc`実行時に`TS5102`エラーになるのを実機検証で発見・修正。`paths`だけで`@/*`エイリアスは機能する）

`disbord.md`記載の機能は全て実装済み。

## 開発

```bash
bun install
bun test
bunx tsc --noEmit
bunx oxlint && bunx oxfmt --write src test
```

typecheckは`tsgo`（`@typescript/native-preview`）ではなく`tsc`を使う。`typescript@7`系の`tsc`は既にネイティブ実装（プラットフォーム別バイナリへの薄いシム）になっており、`tsgo`は不要（実機確認済み。`@typescript/native-preview`のREADME曰く「TypeScript 7.0 RC以降は`tsc`をそのまま使う。`tsgo`が要るのはそれ以前のdevビルドのみ」）。

lint設定は `.oxlintrc.json` ではなく `oxlint.config.ts`（TS製、`disbord/lint`の`config`をそのままdefault export）。oxlintのTS/JS設定ファイル読み込みは実験的機能でNode.js経由での実行が必要になるため、`oxlint`実行にはNode.jsのインストールが要る（bunだけでは動かない）。
