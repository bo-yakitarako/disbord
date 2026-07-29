import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { confirmMessage, parseDisableArgs, runDisable } from '../src/cli/disable';
import { runEnable } from '../src/cli/enable';
import { generateDisbordDts } from '../src/cli/scaffold';

const BASE_CONFIG = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

let dir: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'disbord-disable-'));
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
  writeFileSync(join(dir, '.disbord/disbord.d.ts'), generateDisbordDts({ db: false, coreClass: false }));
  writeFileSync(
    join(dir, 'src/components/buttons.ts'),
    `export default {
  sample: { component: { label: 'x' }, async execute(interaction) { await interaction.reply('x'); } },
} satisfies ButtonRegistration;
`,
  );

  await runEnable(dir, { target: 'db' });
  await runEnable(dir, { target: 'core-class', name: 'Game' });

  mkdirSync(join(dir, 'src/db/models'), { recursive: true });
  writeFileSync(join(dir, 'src/db/models/User.ts'), '// model');
  writeFileSync(join(dir, 'src/db/schema.ts'), '// schema');
  mkdirSync(join(dir, 'migrations'), { recursive: true });
  writeFileSync(join(dir, 'migrations/20260101000000.sql'), '-- sql');
  writeFileSync(join(dir, '.disbord/dev.db'), '');
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('parseDisableArgs', () => {
  test('db', () => {
    expect(parseDisableArgs(['db'])).toEqual({ target: 'db' });
  });

  test('core-class', () => {
    expect(parseDisableArgs(['core-class'])).toEqual({ target: 'core-class' });
  });

  test('何も指定しない場合はthrow', () => {
    expect(() => parseDisableArgs([])).toThrow();
  });

  test('db・core-class以外の対象はthrow', () => {
    expect(() => parseDisableArgs(['foo'])).toThrow();
  });

  test('余分な引数はthrow', () => {
    expect(() => parseDisableArgs(['db', 'extra'])).toThrow();
  });
});

describe('confirmMessage', () => {
  test('dbは「migrationやdb以下のファイル群」に言及する(括弧書きの補足は付けない)', () => {
    const message = confirmMessage('db');
    expect(message).toBe('migrationやdb以下のファイル群は消去されます。よろしいですか？');
    expect(message).not.toContain('（');
    expect(message).not.toContain('(');
  });

  test('core-classは「Coreクラス」に言及する(括弧書きの補足は付けない)', () => {
    const message = confirmMessage('core-class');
    expect(message).toBe('Coreクラスは消去されます。よろしいですか？');
    expect(message).not.toContain('（');
    expect(message).not.toContain('(');
  });
});

describe('runDisable', () => {
  test('confirmがfalseを返すと何も変更しない', async () => {
    const before = readFileSync(join(dir, 'disbord.config.ts'), 'utf-8');
    await runDisable(dir, { target: 'db' }, () => false);

    expect(readFileSync(join(dir, 'disbord.config.ts'), 'utf-8')).toBe(before);
    expect(existsSync(join(dir, 'src/db/models'))).toBe(true);
  });

  test('dbを無効化するとdbブロック・関連ファイルが消え、coreClassは残る', async () => {
    await runDisable(dir, { target: 'db' }, () => true);

    const config = readFileSync(join(dir, 'disbord.config.ts'), 'utf-8');
    expect(config).not.toContain('db:');
    expect(config).toContain('coreClass: {');

    expect(existsSync(join(dir, 'src/db/models'))).toBe(false);
    expect(existsSync(join(dir, 'src/db/schema.ts'))).toBe(false);
    expect(existsSync(join(dir, 'migrations'))).toBe(false);
    expect(existsSync(join(dir, '.disbord/dev.db'))).toBe(false);
    expect(existsSync(join(dir, 'src/Game.ts'))).toBe(true);

    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
    expect(pkg.scripts.migrate).toBeUndefined();
    expect(pkg.dependencies['@libsql/client']).toBeUndefined();

    const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
    expect(dts).not.toContain('schema');
    expect(dts).toContain(`from '@/Game'`);
  });

  test('coreClassを無効化するとCoreファイル・configブロックが消え、dbは残る', async () => {
    await runDisable(dir, { target: 'core-class' }, () => true);

    const config = readFileSync(join(dir, 'disbord.config.ts'), 'utf-8');
    expect(config).not.toContain('coreClass');
    expect(config).toContain('db: {');

    expect(existsSync(join(dir, 'src/Game.ts'))).toBe(false);
    expect(existsSync(join(dir, 'src/db/models'))).toBe(true);

    const dts = readFileSync(join(dir, '.disbord/disbord.d.ts'), 'utf-8');
    expect(dts).not.toContain('Game');
    expect(dts).toContain(`from '@/db/schema'`);
  });

  test('coreClassを無効化すると、有効化時に挿入されたbuttons.tsのgame引数が除去される(引数ズレ対策)', async () => {
    // beforeEachのcore-class有効化時点でgameパラメータが挿入済みであることの前提確認
    expect(readFileSync(join(dir, 'src/components/buttons.ts'), 'utf-8')).toContain(
      'async execute(interaction, game) {',
    );

    await runDisable(dir, { target: 'core-class' }, () => true);

    const buttons = readFileSync(join(dir, 'src/components/buttons.ts'), 'utf-8');
    expect(buttons).toContain('async execute(interaction) {');
    expect(buttons).not.toContain('game');
  });

  test('有効になっていない機能を指定するとthrow', async () => {
    await runDisable(dir, { target: 'db' }, () => true);
    await expect(runDisable(dir, { target: 'db' }, () => true)).rejects.toThrow();
  });
});
