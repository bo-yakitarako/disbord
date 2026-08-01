import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateOnceFileContent, runGenerateOnce } from '../src/cli/generateOnce';
import { generateDeployWorkflow } from '../src/cli/generateWorkflow';

const BASE_CONFIG = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

describe('generateOnceFileContent', () => {
  test('Client<true>を引数に取るdefault export関数のひな形を返す(src/events/ready.tsと同じ形)', () => {
    const content = generateOnceFileContent();
    expect(content).toContain(`import type { Client } from 'discord.js';`);
    expect(content).toContain('export default async function (client: Client<true>) {');
  });

  test('client.destroy()は書かない(実実行ファイル.disbord/once/配下が自動で呼ぶため)', () => {
    expect(generateOnceFileContent()).not.toContain('destroy');
  });
});

describe('runGenerateOnce', () => {
  test('src/once/<name>.tsを生成する', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-once-'));
    try {
      await writeFile(join(dir, 'disbord.config.ts'), BASE_CONFIG);
      await runGenerateOnce('notice', dir);
      const targetPath = join(dir, 'src/once/notice.ts');
      expect(existsSync(targetPath)).toBe(true);
      const content = await readFile(targetPath, 'utf-8');
      expect(content).toBe(generateOnceFileContent());
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('SSHデプロイworkflow(.github/workflows/deploy.yaml、SSH_HOST参照)が既にある場合はdisbord.config.tsのtimerにデフォルトcron付きでnameを追加する', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-once-'));
    try {
      await writeFile(join(dir, 'disbord.config.ts'), BASE_CONFIG);
      await mkdir(join(dir, '.github/workflows'), { recursive: true });
      await writeFile(join(dir, '.github/workflows/deploy.yaml'), generateDeployWorkflow('my-bot', [], false));

      await runGenerateOnce('notice', dir);
      const config = await readFile(join(dir, 'disbord.config.ts'), 'utf-8');
      expect(config).toContain(`timer: {\n    notice: '*-*-* *:00:00',\n  },`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('.github/workflows/deploy.yamlが無い場合はtimerを追加しない(disbord generate workflow ssh実行時にsrc/once配下から補完する)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-once-'));
    try {
      await writeFile(join(dir, 'disbord.config.ts'), BASE_CONFIG);
      await runGenerateOnce('notice', dir);
      const config = await readFile(join(dir, 'disbord.config.ts'), 'utf-8');
      expect(config).toBe(BASE_CONFIG);
      expect(config).not.toContain('timer:');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('deploy.yamlがあってもSSH_HOSTを参照しない(SSHデプロイ用でない)場合はtimerを追加しない', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-once-'));
    try {
      await writeFile(join(dir, 'disbord.config.ts'), BASE_CONFIG);
      await mkdir(join(dir, '.github/workflows'), { recursive: true });
      await writeFile(join(dir, '.github/workflows/deploy.yaml'), 'name: Deploy\n');

      await runGenerateOnce('notice', dir);
      const config = await readFile(join(dir, 'disbord.config.ts'), 'utf-8');
      expect(config).not.toContain('timer:');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('既に存在する場合は上書きせずthrowする', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-once-'));
    try {
      await writeFile(join(dir, 'disbord.config.ts'), BASE_CONFIG);
      await runGenerateOnce('notice', dir);
      await expect(runGenerateOnce('notice', dir)).rejects.toThrow(/既に存在します/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('mainは予約済みでthrowする(dist/main.jsと衝突するため)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-once-'));
    try {
      await expect(runGenerateOnce('main', dir)).rejects.toThrow(/予約済み/);
      expect(existsSync(join(dir, 'src/once/main.ts'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
