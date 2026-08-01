/**
 * lefthook.ymlはdisbord.config.tsと同様ユーザーが自由に手編集する前提のファイルのため、
 * `disbord generate workflow ssh`実行時も丸ごと再生成はせず、encryptコマンドの直後へ
 * workflowコマンドのブロックだけをテキストレベルで挿入する。
 */

const WORKFLOW_COMMAND_MARKER = 'gen:workflow ssh';

/**
 * `stage_fixed: true`は元々ステージ済みだったファイルがコマンド実行で書き換わった場合のみ
 * 再ステージする仕組みのため、deploy.yamlを直接ステージしていないcommit（例:
 * disbord.config.tsだけをステージした場合）では効かない。ここでは`run:`内で
 * 明示的に`git add`することで、生成結果を確実に同じcommitへ含める。
 *
 * disbord.config.tsも合わせてgit addするのは、`disbord generate workflow ssh`（＝この
 * gen:workflow ssh）がsrc/once配下の未登録timerをdisbord.config.tsへ書き足す副作用を持つため
 * （generateWorkflow.ts参照）。deploy.yamlだけをステージすると、その副作用の書き込みが
 * ステージされないままcommitに含まれず、次回commitまでdisbord.config.tsとdeploy.yamlの
 * 内容が食い違った状態になってしまう。
 */
export function buildWorkflowLefthookBlock(): string {
  return `    workflow:\n      run: mise exec -- bun run gen:workflow ssh && git add .github/workflows/deploy.yaml disbord.config.ts\n`;
}

/**
 * `disbord generate workflow ssh`はdeploy.yaml自体は毎回上書き再生成する仕様のため、
 * このコマンドも複数回実行され得る。既にworkflowコマンドが挿入済みなら何もしない(冪等)。
 */
export function addWorkflowLefthookCommand(source: string): string {
  if (source.includes(WORKFLOW_COMMAND_MARKER)) {
    return source;
  }

  const pattern = /^( {4}encrypt:\n(?: {6}\S.*\n)*)/m;
  const match = pattern.exec(source);
  if (!match || match.index === undefined) {
    throw new Error('disbord: lefthook.ymlにencryptコマンドが見つかりませんでした');
  }

  const insertAt = match.index + match[0].length;
  return source.slice(0, insertAt) + buildWorkflowLefthookBlock() + source.slice(insertAt);
}
