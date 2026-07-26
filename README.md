# disbord

bo-yakitarako専用のオレオレDiscord botフレームワーク。

## 現在のスコープ（Phase 1: コア機構）

このリポジトリは「コア機構優先で段階実装」の第1段階として、以下のみを実装済み。

- `Config` 型（`src/config.ts`）
- `BotError` / `handleBotError`（`src/BotError.ts`）
- `Registry`（module augmentationの受け口。`src/registry.ts`）
- Core機構: `createCoreStore` / `resolveInstanceKey`（`src/core/store.ts`）
  - instanceLevel（guild/category/channel/user/global）単位でインスタンスをget/create/removeする仕組み
- components層: `makeButtonRow` / `makeSelectMenuRow` / `routeButtonInteraction` / `routeSelectMenuInteraction` / `collectSlashCommandsData` / `routeSlashCommandInteraction`（`src/components/`）
- DB層: `createDbClient` / `Model`（`src/db/`）
- `disbord/lint`（`src/lint/`）

## まだ実装していないもの（Phase 2以降）

- `disbord` CLI本体（`dev` / `build` / `env` / `commands push|delete` / `generate event`）
- `create-disbord-app`（`new-bot`）
- `.disbord/` 以下への実行可能ファイル生成（events静的import、REST登録、`InteractionCreate`の汎用ルーティング配線など）
- `env/` 配下のdotenvx暗号化運用
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
