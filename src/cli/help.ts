type CommandHelp = { usage: string; description: string; requiresDb?: boolean };

const COMMANDS: CommandHelp[] = [
  { usage: 'disbord dev', description: '開発サーバーを起動する（bun --watchのラッパー）' },
  { usage: 'disbord build', description: '本番デプロイ用にdist/を生成する' },
  { usage: 'disbord commands push [--env development|production]', description: 'slashCommandをDiscordへREST登録する' },
  { usage: 'disbord commands delete [--env development|production]', description: '登録済みslashCommandを削除する' },
  { usage: 'disbord env [--env development|production]', description: 'env/配下の環境変数を暗号化⇔復号にtoggleする' },
  { usage: 'disbord generate event <name>', description: 'イベントハンドラを追加生成する' },
  {
    usage: 'disbord generate model <Name>',
    description: 'src/db/models/にdecorator付きのモデルクラスを追加生成する',
    requiresDb: true,
  },
  {
    usage: 'disbord migrate [--production]',
    description: 'モデル定義からschema.ts・migrationファイルを生成し、DBに適用する',
    requiresDb: true,
  },
  {
    usage: 'disbord enable db',
    description: '後からdbを有効化する',
  },
  {
    usage: 'disbord enable core-class [ClassName]',
    description: '後からcoreClassを有効化する（ClassName省略時は対話で名前を聞く）',
  },
  {
    usage: 'disbord disable db',
    description: '有効化したdbを無効化する（確認プロンプトあり）',
  },
  {
    usage: 'disbord disable core-class',
    description: '有効化したcoreClassを無効化する（確認プロンプトあり）',
  },
];

export type BuildHelpTextOptions = { dbEnabled: boolean };

export function buildHelpText(options: BuildHelpTextOptions = { dbEnabled: false }): string {
  const commands = COMMANDS.filter((c) => !c.requiresDb || options.dbEnabled);
  const commandLines = commands.map((c) => `  ${c.usage}\n    ${c.description}`).join('\n\n');
  return `disbord: bo-yakitarako専用のオレオレDiscord botフレームワークCLI

使い方: disbord <command> [options]

コマンド:
${commandLines}

オプション:
  --version, -v   バージョンを表示する
  --help, -h      このヘルプを表示する
`;
}
