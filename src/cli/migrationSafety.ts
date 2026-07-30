/**
 * SQLiteは`ALTER TABLE ... ADD COLUMN`にNOT NULL制約を付ける場合、DEFAULTも同時に
 * 指定しないと`SQLITE_ERROR: Cannot add a NOT NULL column with default value NULL`で
 * 失敗する（新規`CREATE TABLE`なら無関係。既存テーブルへの追加時のみ発生する）。
 * このエラーで一度migrationファイルが書き出されると、未適用分はファイル名昇順に順に
 * 適用されるため、以降の`disbord migrate`は毎回この壊れたファイルの適用に失敗し続け、
 * それより後のmigrationも一切進まなくなる（実際に発生した不具合）。そのため生成段階で
 * 弾き、そもそも書き出さないようにする。
 */
function isUnsafeAddColumnStatement(statement: string): boolean {
  const isAlterTableAdd = /^\s*ALTER TABLE\b.*\bADD\b/is.test(statement);
  if (!isAlterTableAdd) return false;

  const hasNotNull = /\bNOT NULL\b/i.test(statement);
  const hasDefault = /\bDEFAULT\b/i.test(statement);
  return hasNotNull && !hasDefault;
}

export function findUnsafeAddColumnStatements(statements: string[]): string[] {
  return statements.filter(isUnsafeAddColumnStatement);
}

export function describeUnsafeAddColumnError(unsafeStatements: string[]): string {
  const list = unsafeStatements.map((statement) => `  - ${statement}`).join('\n');
  return (
    'disbord: 既存テーブルへNOT NULLかつdefault未設定のカラムを追加しようとしています。' +
    'SQLiteは`SQLITE_ERROR: Cannot add a NOT NULL column with default value NULL`で失敗するため、migrationファイルの生成を中止しました。\n' +
    `${list}\n` +
    '該当する@Columnに`nullable: true`を指定するか、`default`オプションで初期値を設定してください。'
  );
}
