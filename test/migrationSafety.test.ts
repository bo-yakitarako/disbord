import { describe, expect, test } from 'bun:test';
import { describeUnsafeAddColumnError, findUnsafeAddColumnStatements } from '../src/cli/migrationSafety';

describe('findUnsafeAddColumnStatements', () => {
  test('NOT NULLかつDEFAULT未指定のALTER TABLE ADDはunsafeとして検出する', () => {
    const statements = ['ALTER TABLE `jobs` ADD `extra` text NOT NULL;'];
    expect(findUnsafeAddColumnStatements(statements)).toEqual(statements);
  });

  test('DEFAULTが指定されていればsafe', () => {
    const statements = ["ALTER TABLE `jobs` ADD `extra` text DEFAULT 'x' NOT NULL;"];
    expect(findUnsafeAddColumnStatements(statements)).toEqual([]);
  });

  test('NOT NULLでなければ(nullable)safe', () => {
    const statements = ['ALTER TABLE `jobs` ADD `extra` text;'];
    expect(findUnsafeAddColumnStatements(statements)).toEqual([]);
  });

  test('@RelateのNOT NULL/REFERENCESつきのADDも同様に検出する(FKでも同じSQLiteエラーになるため)', () => {
    const statements = ['ALTER TABLE `jobs` ADD `user_id` text NOT NULL REFERENCES users(id);'];
    expect(findUnsafeAddColumnStatements(statements)).toEqual(statements);
  });

  test('新規CREATE TABLEはNOT NULLかつdefault無しでも対象外(既存行が無い新規テーブルには問題が起きないため)', () => {
    const statements = ['CREATE TABLE `jobs` (\n\t`id` text PRIMARY KEY NOT NULL,\n\t`sample` text NOT NULL\n);'];
    expect(findUnsafeAddColumnStatements(statements)).toEqual([]);
  });

  test('ALTER TABLE DROP COLUMNは対象外', () => {
    const statements = ['ALTER TABLE `jobs` DROP COLUMN `sample`;'];
    expect(findUnsafeAddColumnStatements(statements)).toEqual([]);
  });

  test('複数文のうちunsafeなものだけを抽出する', () => {
    const safe = 'ALTER TABLE `jobs` ADD `note` text;';
    const unsafe = 'ALTER TABLE `jobs` ADD `extra` text NOT NULL;';
    expect(findUnsafeAddColumnStatements([safe, unsafe])).toEqual([unsafe]);
  });
});

describe('describeUnsafeAddColumnError', () => {
  test('該当statementと対処方法(nullable: true / default)を含む', () => {
    const message = describeUnsafeAddColumnError(['ALTER TABLE `jobs` ADD `extra` text NOT NULL;']);
    expect(message).toContain('ALTER TABLE `jobs` ADD `extra` text NOT NULL;');
    expect(message).toContain('nullable: true');
    expect(message).toContain('default');
    expect(message).toContain('SQLITE_ERROR');
  });
});
