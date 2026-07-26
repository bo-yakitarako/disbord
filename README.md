# disbord

bo-yakitarako専用のオレオレDiscord botフレームワーク。

## 現在のスコープ（Phase 1: コア機構 + Phase 2: CLI本体）

このリポジトリは「コア機構優先で段階実装」として、以下を実装済み（`disbord` CLI本体の`dev`/`build`/`commands push|delete`/`env`/`generate event`は出揃った。残るPhase 2は`create-disbord-app`のみ）。

- `Config` 型（`src/config.ts`）
- `BotError` / `handleBotError`（`src/BotError.ts`）
- `Registry`（module augmentationの受け口。`src/registry.ts`）
- Core機構: `createCoreStore` / `resolveInstanceKey`（`src/core/store.ts`）
  - instanceLevel（guild/category/channel/user/global）単位でインスタンスをget/create/removeする仕組み
- components層: `makeButtonRow` / `makeSelectMenuRow` / `routeButtonInteraction` / `routeSelectMenuInteraction` / `collectSlashCommandsData` / `routeSlashCommandInteraction`（`src/components/`）
- DB層: `createDbClient` / `Model`（`src/db/`）
- `disbord/lint`（`src/lint/`）
- `disbord dev`（`src/cli/`）: `.disbord/main.ts`の生成（events静的import・components動的import・REST登録・`InteractionCreate`の汎用ルーティング配線）、`dotenvx run -- bun --watch`のラッパー起動、`src/events/`のファイル増減検知による再生成
- `disbord commands push|delete`（`src/cli/commands.ts` / `commandsRunner.ts`）: `src/components/slashCommands.ts`を元にしたREST一括登録・一括削除。`--env development|production`（未指定時は`development`）でdotenvxが読む`env/`を切り替える
- `disbord env`（`src/cli/env.ts`）: `env/.env.<target>`（`--env`未指定時は`development`）を暗号化⇔復号にtoggle。各値が`encrypted:`prefixを持つかで現在の状態を判定し、逆のdotenvx操作（`encrypt`/`decrypt`）を呼ぶ。`DOTENV_PUBLIC_KEY`ヘッダー行はdecrypt後も残り続ける（dotenvx自身の挙動）ため、状態判定にヘッダーの有無は使えない点に注意
- `disbord build`（`src/cli/build.ts`）: `.disbord/main.ts`を`registerCommands: false`で生成（REST登録なし）→`Bun.build({ target: 'bun', minify: true })`で`dist/main.js`にバンドル（components配下の動的importも含め完全にインライン化される）→`env/.env.production`を`dotenvx decrypt --stdout`で復号（元ファイルは変更しない）した平文を`dist/.env`に同梱。本番では`dist/`をそのままデプロイ単位にし、`dist/`をcwdにして`bun main.js`を実行する想定（Bunの`.env`自動読み込みはcwd基準のため）
  - `--external <pkg>`（複数指定可、`bun build --external`と同じ挙動）でバンドルから除外するパッケージを指定できる。動作確認済み: `--external discord.js`指定時はdiscord.js関連のimportがバンドルに残り、サイズも大幅に縮小する
- `disbord generate event <name>`（`src/cli/clientEvents.ts` / `generateEvent.ts`）: discord.jsの`ClientEvents`インターフェース（bot側の`node_modules/discord.js`から`.d.ts`を`.env`ではなくcwd基準で解決）を軽量パーサーでテキスト解析し、`client.on(name, listener)`が実際に渡す引数の型をそのまま`src/events/<name>.ts`のひな形に書き出す（TypeScriptコンパイラAPIには依存しない。理由はコード内コメント参照）。既存ファイルは上書きしない。`interactionCreate`は生成不可

## まだ実装していないもの（Phase 2以降）

- `create-disbord-app`（`new-bot`）
- **DBのschema注入**: `createDbClient(schema)` / `Model` は実装済みだが、実際に「いつ・どこで `createDbClient(schema)` を呼ぶか」の配線はcreate-disbord-app生成時に行う予定。それまでは `db` / `Model` を使う前に `createDbClient(schema)` を明示的に呼んでおく必要がある
- `makeButtonRow` 等はいったん `registration` オブジェクトを第一引数で明示的に渡す形にしてある（`import { makeButtonRow } from 'disbord'` だけで自botのregistrationを暗黙に解決する糖衣構文は、CLIのランタイム起動（`src/components/*.ts`の動的import）が前提のため後回し）

## 開発

```bash
bun install
bun test
bunx tsgo --noEmit
bunx oxlint && bunx oxfmt --write src test
```

lint設定は `.oxlintrc.json` ではなく `oxlint.config.ts`（TS製、`disbord/lint`の`config`をそのままdefault export）。oxlintのTS/JS設定ファイル読み込みは実験的機能でNode.js経由での実行が必要になるため、`oxlint`実行にはNode.jsのインストールが要る（bunだけでは動かない）。
