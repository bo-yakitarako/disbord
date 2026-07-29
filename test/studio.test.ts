import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateDrizzleStudioConfig, runStudio } from '../src/cli/studio';

const DB_DISABLED_CONFIG = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

describe('generateDrizzleStudioConfig', () => {
  test('cwd基準の絶対パスでschema・out・dbCredentials.urlを組み立てる', () => {
    const content = generateDrizzleStudioConfig('/tmp/my-bot');
    expect(content).toContain(`import { defineConfig } from 'drizzle-kit';`);
    expect(content).toContain(`dialect: 'sqlite'`);
    expect(content).toContain(`schema: '/tmp/my-bot/.disbord/db/schema.ts'`);
    expect(content).toContain(`out: '/tmp/my-bot/migrations'`);
    expect(content).toContain(`url: 'file:/tmp/my-bot/.disbord/db/dev.db'`);
  });
});

describe('runStudio', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(import.meta.dir, '.tmp-studio-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('disbord.config.tsでdb.enableが有効になっていない場合はthrow(drizzle-kitの起動には進まない)', async () => {
    writeFileSync(join(dir, 'disbord.config.ts'), DB_DISABLED_CONFIG);
    await expect(runStudio(dir)).rejects.toThrow();
  });
});
