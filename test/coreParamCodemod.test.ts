import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyCoreParamRewrite, rewriteExecuteCoreParam, toCamelCase } from '../src/cli/coreParamCodemod';

describe('toCamelCase', () => {
  test('先頭文字だけ小文字化する', () => {
    expect(toCamelCase('Core')).toBe('core');
    expect(toCamelCase('Game')).toBe('game');
  });

  test('既に小文字始まりならそのまま', () => {
    expect(toCamelCase('game')).toBe('game');
  });

  test('空文字はそのまま', () => {
    expect(toCamelCase('')).toBe('');
  });
});

describe('rewriteExecuteCoreParam (insert)', () => {
  test('メソッド省略記法: interactionのみ → interaction, core', () => {
    const source = `export default {
  sample: {
    component: { label: 'x' },
    async execute(interaction) {
      await interaction.reply('x');
    },
  },
} satisfies ButtonRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'insert', paramName: 'core' });
    expect(result).toContain('async execute(interaction, core) {');
  });

  test('メソッド省略記法: restありでもcoreがrestの手前に挿入される', () => {
    const source = `export default {
  args: {
    component: (i: number) => ({ label: 'x', args: [i] }),
    async execute(interaction, ...args) {
      await interaction.reply(args.join(','));
    },
  },
} satisfies ButtonRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'insert', paramName: 'core' });
    expect(result).toContain('async execute(interaction, core, ...args) {');
  });

  test('プロパティ形式のアロー関数(async)にも挿入する', () => {
    const source = `export default {
  sample: {
    component: { placeholder: 'x', options: [] },
    execute: async (interaction, ...args) => {
      await interaction.reply(args.join(','));
    },
  },
} satisfies SelectMenuRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'insert', paramName: 'game' });
    expect(result).toContain('execute: async (interaction, game, ...args) => {');
  });

  test('複数entryをそれぞれ独立して書き換える', () => {
    const source = `export default {
  a: { component: { label: 'a' }, async execute(interaction) { await interaction.reply('a'); } },
  b: { component: { label: 'b' }, async execute(interaction, ...args) { await interaction.reply('b'); } },
} satisfies ButtonRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'insert', paramName: 'core' });
    expect(result).toContain('execute(interaction, core) {');
    expect(result).toContain('execute(interaction, core, ...args) {');
  });

  test('第1引数自体がrest(異常系)の場合はスキップする', () => {
    const source = `export default {
  weird: { component: { label: 'x' }, async execute(...args) { } },
} satisfies ButtonRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'insert', paramName: 'core' });
    expect(result).toBe(source);
  });
});

describe('rewriteExecuteCoreParam (remove)', () => {
  test('メソッド省略記法: interaction, core, ...args → interaction, ...args', () => {
    const source = `export default {
  args: {
    component: (i: number) => ({ label: 'x', args: [i] }),
    async execute(interaction, core, ...args) {
      await interaction.reply(args.join(','));
      core.hello();
    },
  },
} satisfies ButtonRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'remove' });
    expect(result).toContain('async execute(interaction, ...args) {');
    // 関数本体側のcore参照(core.hello())まではcodemodの責務外。tscの未定義変数エラーで
    // ユーザーに気づかせる想定のため、シグネチャからcoreパラメータが消えたことだけ確認する。
    expect(result).not.toContain('async execute(interaction, core');
  });

  test('interaction, core(restなし) → interaction', () => {
    const source = `export default {
  sample: {
    component: { label: 'x' },
    async execute(interaction, core) {
      core.hello();
    },
  },
} satisfies ButtonRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'remove' });
    expect(result).toContain('async execute(interaction) {');
  });

  test('coreを使っていないentry(interactionのみ)はそのまま', () => {
    const source = `export default {
  sample: { component: { label: 'x' }, async execute(interaction) { await interaction.reply('x'); } },
} satisfies ButtonRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'remove' });
    expect(result).toBe(source);
  });

  test('第2引数が既にrest(core未使用)の場合はスキップする', () => {
    const source = `export default {
  sample: { component: { label: 'x' }, async execute(interaction, ...args) { } },
} satisfies ButtonRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'remove' });
    expect(result).toBe(source);
  });

  test('プロパティ形式のアロー関数からも除去する', () => {
    const source = `export default {
  sample: {
    component: {},
    execute: async (interaction, core, ...args) => {
      core.hello();
    },
  },
} satisfies SelectMenuRegistration;
`;
    const result = rewriteExecuteCoreParam(source, { mode: 'remove' });
    expect(result).toContain('execute: async (interaction, ...args) => {');
  });
});

describe('applyCoreParamRewrite', () => {
  test('buttons.ts/selectMenus.tsが存在する場合のみ、差分があるときだけ書き換える', () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-codemod-'));
    try {
      mkdirSync(join(dir, 'src/components'), { recursive: true });
      writeFileSync(
        join(dir, 'src/components/buttons.ts'),
        `export default {
  sample: { component: { label: 'x' }, async execute(interaction) { await interaction.reply('x'); } },
} satisfies ButtonRegistration;
`,
      );
      writeFileSync(
        join(dir, 'src/components/selectMenus.ts'),
        `export default {} satisfies SelectMenuRegistration;
`,
      );

      applyCoreParamRewrite(dir, { mode: 'insert', paramName: 'core' });

      expect(readFileSync(join(dir, 'src/components/buttons.ts'), 'utf-8')).toContain('execute(interaction, core) {');
      // 中身がないselectMenus.tsは差分なしなのでそのまま
      expect(readFileSync(join(dir, 'src/components/selectMenus.ts'), 'utf-8')).toBe(
        `export default {} satisfies SelectMenuRegistration;\n`,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('component配下のファイルが存在しなくてもエラーにならない', () => {
    const dir = mkdtempSync(join(tmpdir(), 'disbord-codemod-'));
    try {
      applyCoreParamRewrite(dir, { mode: 'remove' });
      expect(existsSync(join(dir, 'src/components/buttons.ts'))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
