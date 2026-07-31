import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateDeployWorkflow, resolveOnceTimerEntries, runGenerateWorkflowSsh } from '../src/cli/generateWorkflow';

const BASE_CONFIG = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

describe('resolveOnceTimerEntries', () => {
  async function setupOnceDir(names: string[]): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-resolve-once-timer-'));
    await mkdir(join(dir, 'src/once'), { recursive: true });
    for (const name of names) {
      await writeFile(join(dir, `src/once/${name}.ts`), '');
    }
    return dir;
  }

  test('onceスクリプト名とtimer設定からcron付きのエントリを組み立てる', async () => {
    const dir = await setupOnceDir(['notice', 'cleanup']);
    try {
      expect(
        resolveOnceTimerEntries(dir, ['notice', 'cleanup'], { notice: '0 9 * * *', cleanup: '*-*-* *:00:00' }),
      ).toEqual([
        { name: 'notice', cron: '0 9 * * *' },
        { name: 'cleanup', cron: '*-*-* *:00:00' },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('onceスクリプトが無ければ空配列', async () => {
    const dir = await setupOnceDir([]);
    try {
      expect(resolveOnceTimerEntries(dir, [], undefined)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('timerがfalsy(未設定)なonceスクリプトはスキップする(手動実行のみ想定で常駐タイマー不要なケース)', async () => {
    const dir = await setupOnceDir(['notice', 'manual']);
    try {
      expect(resolveOnceTimerEntries(dir, ['notice', 'manual'], { notice: '0 9 * * *', manual: '' })).toEqual([
        { name: 'notice', cron: '0 9 * * *' },
      ]);
      expect(resolveOnceTimerEntries(dir, ['notice', 'manual'], { notice: '0 9 * * *' })).toEqual([
        { name: 'notice', cron: '0 9 * * *' },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('timer設定はあるがsrc/once/<name>.tsが存在しない(削除済み等)場合はスキップする', async () => {
    const dir = await setupOnceDir(['notice']);
    try {
      expect(resolveOnceTimerEntries(dir, ['notice'], { notice: '0 9 * * *', removed: '0 0 * * *' })).toEqual([
        { name: 'notice', cron: '0 9 * * *' },
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('generateDeployWorkflow', () => {
  test('onceスクリプトが無い場合はDeploy service止まりで、once timersのステップは含まない', () => {
    const content = generateDeployWorkflow('my-bot', [], false);
    expect(content).toContain('name: Deploy');
    expect(content).toContain('- name: Checkout');
    expect(content).toContain('- name: Setup mise (bun)');
    expect(content).toContain('- name: Install dependencies');
    expect(content).toContain('- name: Write env keys');
    expect(content).toContain('echo "${{ secrets.ENV_KEYS }}" > env/.env.keys.production');
    expect(content).toContain('- name: Build');
    expect(content).toContain('- name: Setup SSH agent');
    expect(content).toContain('- name: Upload build artifacts');
    expect(content).toContain('rsync -avz dist/');
    expect(content).toContain('- name: Deploy service');
    expect(content).not.toContain('- name: Deploy once timers');
  });

  test('env keysの書き込みはbuildより前に行う(buildがenv/.env.keys.productionを使って復号するため)', () => {
    const content = generateDeployWorkflow('my-bot', [], false);
    expect(content.indexOf('- name: Write env keys')).toBeLessThan(content.indexOf('- name: Build'));
  });

  test('dbEnabled: falseならMigrateステップを含まない', () => {
    const content = generateDeployWorkflow('my-bot', [], false);
    expect(content).not.toContain('- name: Migrate');
    expect(content).not.toContain('bun run migrate --production');
  });

  test('dbEnabled: trueならBuildの直後にMigrateステップを挟む', () => {
    const content = generateDeployWorkflow('my-bot', [], true);
    expect(content).toContain('- name: Migrate');
    expect(content).toContain('run: bun run migrate --production');
    const buildIndex = content.indexOf('- name: Build');
    const migrateIndex = content.indexOf('- name: Migrate');
    const sshIndex = content.indexOf('- name: Setup SSH agent');
    expect(buildIndex).toBeLessThan(migrateIndex);
    expect(migrateIndex).toBeLessThan(sshIndex);
  });

  test('systemdサービスの有無でrestart/新規作成+startを分岐する', () => {
    const content = generateDeployWorkflow('my-bot', [], false);
    expect(content).toContain('if [ -f ~/.config/systemd/user/my-bot.service ]; then');
    expect(content).toContain('systemctl --user restart my-bot');
    expect(content).toContain("cat > ~/.config/systemd/user/my-bot.service <<'UNIT'");
    expect(content).toContain('systemctl --user start my-bot');
  });

  test('メインサービスユニットの中身(WorkingDirectory/ExecStart等)', () => {
    const content = generateDeployWorkflow('my-bot', [], false);
    expect(content).toContain('Description=my-bot discord bot');
    expect(content).toContain('WorkingDirectory=${{ secrets.DEPLOY_PATH }}');
    expect(content).toContain('ExecStart=mise run main');
    expect(content).toContain('WantedBy=default.target');
  });

  test('onceスクリプトがある場合、Deploy once timersステップでservice/timerユニットを生成しenable --nowする', () => {
    const content = generateDeployWorkflow('my-bot', [{ name: 'notice', cron: '0 9 * * *' }], false);
    expect(content).toContain('- name: Deploy once timers');
    expect(content).toContain("cat > ~/.config/systemd/user/my-bot-notice.service <<'UNIT'");
    expect(content).toContain('ExecStart=mise run notice');
    expect(content).toContain("cat > ~/.config/systemd/user/my-bot-notice.timer <<'UNIT'");
    expect(content).toContain('OnCalendar=0 9 * * *');
    expect(content).toContain('systemctl --user daemon-reload');
    expect(content).toContain('systemctl --user enable --now my-bot-notice.timer');
  });

  test('onceスクリプトが複数ある場合、それぞれ分のservice/timer/enableを含む', () => {
    const content = generateDeployWorkflow(
      'my-bot',
      [
        { name: 'notice', cron: '0 9 * * *' },
        { name: 'cleanup', cron: '*-*-* *:00:00' },
      ],
      false,
    );
    expect(content).toContain('my-bot-notice.service');
    expect(content).toContain('my-bot-notice.timer');
    expect(content).toContain('my-bot-cleanup.service');
    expect(content).toContain('my-bot-cleanup.timer');
    expect(content).toContain('systemctl --user enable --now my-bot-notice.timer');
    expect(content).toContain('systemctl --user enable --now my-bot-cleanup.timer');
  });

  test('有効なYAMLとしてパースでき、ヒアドキュメントの終端行(EOF/UNIT)がYAML側のインデント除去後に行頭へ揃う', () => {
    const content = generateDeployWorkflow('my-bot', [{ name: 'notice', cron: '0 9 * * *' }], false);

    type Step = { name: string; run?: string };
    const parsed = Bun.YAML.parse(content) as { jobs: { deploy: { steps: Step[] } } };
    const steps = parsed.jobs.deploy.steps;
    expect(steps.map((s) => s.name)).toContain('Deploy service');

    const deployService = steps.find((s) => s.name === 'Deploy service');
    // bashのヒアドキュメント終端行は行頭(先頭スペース無し)でなければ認識されない。
    // YAML block scalarのインデント除去が正しく効いていることをここで検証する。
    expect(deployService?.run).toContain('\nEOF\n');
    expect(deployService?.run).toContain('\nUNIT\n');
    expect(deployService?.run).not.toMatch(/\n +EOF/);
    expect(deployService?.run).not.toMatch(/\n +UNIT/);

    const deployTimers = steps.find((s) => s.name === 'Deploy once timers');
    expect(deployTimers?.run).not.toMatch(/\n +EOF/);
    expect(deployTimers?.run).not.toMatch(/\n +UNIT/);
  });
});

describe('runGenerateWorkflowSsh', () => {
  async function setupDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-workflow-'));
    await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'my-bot' }, null, 2) + '\n');
    await writeFile(join(dir, 'disbord.config.ts'), BASE_CONFIG);
    return dir;
  }

  test('.github/workflows/deploy.yamlを生成する', async () => {
    const dir = await setupDir();
    try {
      await runGenerateWorkflowSsh(dir);
      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).toContain('my-bot');
      expect(content).not.toContain('- name: Deploy once timers');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('disbord.config.tsのdb.enableがtrueならMigrateステップを生成する', async () => {
    const dir = await setupDir();
    try {
      await writeFile(
        join(dir, 'disbord.config.ts'),
        BASE_CONFIG.replace('botErrorMessage:', `db: { enable: true },\n  botErrorMessage:`),
      );

      await runGenerateWorkflowSsh(dir);
      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).toContain('- name: Migrate');
      expect(content).toContain('run: bun run migrate --production');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('src/once/配下のスクリプトとdisbord.config.tsのtimerからonce timersステップを生成する', async () => {
    const dir = await setupDir();
    try {
      await mkdir(join(dir, 'src/once'), { recursive: true });
      await writeFile(join(dir, 'src/once/notice.ts'), '');
      await writeFile(
        join(dir, 'disbord.config.ts'),
        BASE_CONFIG.replace('botErrorMessage:', `timer: { notice: '0 9 * * *' },\n  botErrorMessage:`),
      );

      await runGenerateWorkflowSsh(dir);
      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).toContain('- name: Deploy once timers');
      expect(content).toContain('my-bot-notice.service');
      expect(content).toContain('OnCalendar=0 9 * * *');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('onceスクリプトがあるのにtimer設定が無い場合はエラーにせず、その分だけdeploy.yamlから除外する', async () => {
    const dir = await setupDir();
    try {
      await mkdir(join(dir, 'src/once'), { recursive: true });
      await writeFile(join(dir, 'src/once/notice.ts'), '');

      await runGenerateWorkflowSsh(dir);
      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).not.toContain('- name: Deploy once timers');
      expect(content).not.toContain('my-bot-notice');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('package.jsonにnameが無い場合はthrow', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-generate-workflow-'));
    try {
      await writeFile(join(dir, 'package.json'), JSON.stringify({}, null, 2) + '\n');
      await writeFile(join(dir, 'disbord.config.ts'), BASE_CONFIG);
      await expect(runGenerateWorkflowSsh(dir)).rejects.toThrow(/nameが見つかりませんでした/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
