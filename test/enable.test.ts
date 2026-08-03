import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnableArgs, runEnable } from '../src/cli/enable';
import { generateDisbordDts } from '../src/cli/scaffold';

const BASE_CONFIG = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'disbord-enable-'));
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'bot-test',
        scripts: { dev: 'disbord dev', help: 'disbord help' },
        dependencies: { disbord: '^0.0.2', 'discord.js': '^14.27.0' },
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(join(dir, 'disbord.config.ts'), BASE_CONFIG);
  mkdirSync(join(dir, 'src/components'), { recursive: true });
  mkdirSync(join(dir, '.disbord'), { recursive: true });
  mkdirSync(join(dir, 'env'), { recursive: true });
  writeFileSync(join(dir, 'env/.env.development'), 'TOKEN=\nCLIENT_ID=\nGUILD_ID=\n');
  writeFileSync(join(dir, 'env/.env.production'), 'TOKEN=\nCLIENT_ID=\n');
  writeFileSync(join(dir, '.disbord/disbord.d.ts'), generateDisbordDts({ db: false, coreClass: false }));
  writeFileSync(
    join(dir, 'src/components/buttons.ts'),
    `export default {
  sample: { component: { label: 'x' }, async execute(interaction) { await interaction.reply('x'); } },
  args: { component: { label: 'y' }, async execute(interaction, ...args) { await interaction.reply('y'); } },
} satisfies ButtonRegistration;
`,
  );
  writeFileSync(
    join(dir, 'src/components/selectMenus.ts'),
    `export default {} satisfies SelectMenuRegistration;
`,
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseEnableArgs', () => {
  test('db', () => {
    expect(parseEnableArgs(['db'])).toEqual({ target: 'db' });
  });

  test('core-classのみ(名前は対話で聞く)', () => {
    expect(parseEnableArgs(['core-class'])).toEqual({ target: 'core-class', name: undefined });
  });

  test('core-class ClassNameで名前まで指定できる', () => {
    expect(parseEnableArgs(['core-class', 'Game'])).toEqual({ target: 'core-class', name: 'Game' });
  });

  test('何も指定しない場合はthrow', () => {
    expect(() => parseEnableArgs([])).toThrow();
  });

  test('db・core-class以外の対象はthrow', () => {
    expect(() => parseEnableArgs(['foo'])).toThrow();
  });

  test('dbに名前を続けるとthrow(dbは名前を取らない)', () => {
    expect(() => parseEnableArgs(['db', 'Game'])).toThrow();
  });

  test('不正なクラス名はthrow', () => {
    expect(() => parseEnableArgs(['core-class', '1Game'])).toThrow();
  });

  test('余分な引数はthrow', () => {
    expect(() => parseEnableArgs(['core-class', 'Game', 'extra'])).toThrow();
  });
});

describe('runEnable', () => {
  test('dbでdisbord.config.tsにdbブロックを追加し、package.jsonにmigrateスクリプト・依存を追加する', async () => {
    await runEnable(dir, { target: 'db' });

    const config = readFileSync(join(dir, 'disbord.config.ts'), 'utf-8');
    expect(config).toContain('db: {');
    expect(config).toContain('enable: true,');

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
    expect(pkg.scripts.migrate).toBe('disbord migrate');
    expect(pkg.dependencies['@libsql/client']).toBe('^0.17.2');

    const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
    expect(dts).toContain(`from '../src/db/schema'`);
  });

  test('dbでenv/.env.productionにTURSO_DATABASE_URL/TURSO_AUTH_TOKENを追記し、disbord.d.tsのprocess.env型にもoptionalで反映する', async () => {
    await runEnable(dir, { target: 'db' });

    const prodEnv = readFileSync(join(dir, 'env/.env.production'), 'utf-8');
    expect(prodEnv).toContain('TURSO_DATABASE_URL=');
    expect(prodEnv).toContain('TURSO_AUTH_TOKEN=');
    expect(readFileSync(join(dir, 'env/.env.development'), 'utf-8')).not.toContain('TURSO_DATABASE_URL');

    const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
    expect(dts).toContain('TURSO_DATABASE_URL?: string;');
    expect(dts).toContain('TURSO_AUTH_TOKEN?: string;');
  });

  test('env/.env.productionが存在しない場合でも新規作成してTURSO系キーを書き込む', async () => {
    rmSync(join(dir, 'env/.env.production'));

    await runEnable(dir, { target: 'db' });

    const prodEnv = readFileSync(join(dir, 'env/.env.production'), 'utf-8');
    expect(prodEnv).toBe('TURSO_DATABASE_URL=\nTURSO_AUTH_TOKEN=\n');
  });

  test('core-class Nameでsrc/{Name}.tsを生成し、disbord.d.tsにRegistryフィールドを追加する', async () => {
    await runEnable(dir, { target: 'core-class', name: 'Game' });

    expect(existsSync(join(dir, 'src/Game.ts'))).toBe(true);
    expect(readFileSync(join(dir, 'src/Game.ts'), 'utf-8')).toContain('export class Game {}');

    const config = readFileSync(join(dir, 'disbord.config.ts'), 'utf-8');
    expect(config).toContain('coreClass: {');

    const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
    expect(dts).toContain(`from '@/Game'`);
    expect(dts).toContain('core: InstanceType<typeof Game>;');
  });

  test('core-class有効化時、既存のbuttons.tsのexecuteにclassNameのcamelCase名(第2引数)を挿入する(引数ズレ対策)', async () => {
    await runEnable(dir, { target: 'core-class', name: 'Game' });

    const buttons = readFileSync(join(dir, 'src/components/buttons.ts'), 'utf-8');
    expect(buttons).toContain('async execute(interaction, game) {');
    expect(buttons).toContain('async execute(interaction, game, ...args) {');
  });

  test('db→core-classの順で2回有効化すると、その呼び出し順(いずれもbotErrorMessageの直前に挿入)でconfigに並ぶ', async () => {
    await runEnable(dir, { target: 'db' });
    await runEnable(dir, { target: 'core-class', name: 'Game' });

    const config = readFileSync(join(dir, 'disbord.config.ts'), 'utf-8');
    const dbIndex = config.indexOf('db:');
    const coreClassIndex = config.indexOf('coreClass:');
    const botErrorMessageIndex = config.indexOf('botErrorMessage:');
    expect(dbIndex).toBeLessThan(coreClassIndex);
    expect(coreClassIndex).toBeLessThan(botErrorMessageIndex);

    const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
    expect(dts).toContain(`from '../src/db/schema'`);
    expect(dts).toContain(`from '@/Game'`);
  });

  test('既にdbが有効な状態でさらにdbを有効化しようとするとthrow', async () => {
    await runEnable(dir, { target: 'db' });
    await expect(runEnable(dir, { target: 'db' })).rejects.toThrow();
  });

  test('既にcoreClassが有効な状態でさらにcoreClassを有効化しようとするとthrow', async () => {
    await runEnable(dir, { target: 'core-class', name: 'Game' });
    await expect(runEnable(dir, { target: 'core-class', name: 'Other' })).rejects.toThrow();
  });
});
