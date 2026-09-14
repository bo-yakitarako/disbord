import { describe, expect, test } from 'bun:test';
import { generateMigrateMainSource } from '../src/cli/generateMigrateMain';

describe('generateMigrateMainSource', () => {
  test('disbordからrunProductionMigrationをimportし、disbord.config.tsを読んでmigrationsDirを渡す', () => {
    const source = generateMigrateMainSource();
    expect(source).toContain(`import { runProductionMigration, type Config } from 'disbord';`);
    expect(source).toContain(`import rawConfig from '../disbord.config';`);
    expect(source).toContain('runProductionMigration(config,');
  });

  test('CLIのdisbord migrate --productionと違い--productionフラグの解析等は行わない(常に本番想定のスクリプトのため)', () => {
    const source = generateMigrateMainSource();
    expect(source).not.toContain('--production');
    expect(source).not.toContain('process.argv');
  });
});
