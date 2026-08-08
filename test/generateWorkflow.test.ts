import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  generateDeployWorkflow,
  hasAssetsDir,
  hasSshDeployWorkflow,
  resolveOnceTimerEntries,
  runGenerateWorkflowSsh,
} from '../src/cli/generateWorkflow';
import { generateLefthookConfig } from '../src/cli/scaffold';

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

  test('Build(Migrate)の後・SSHセットアップの前にスラッシュコマンド登録ステップを挟む', () => {
    const content = generateDeployWorkflow('my-bot', [], false);
    expect(content).toContain('- name: Register slash commands');
    expect(content).toContain('run: bun run commands --production');
    const buildIndex = content.indexOf('- name: Build');
    const commandsIndex = content.indexOf('- name: Register slash commands');
    const sshIndex = content.indexOf('- name: Setup SSH agent');
    expect(buildIndex).toBeLessThan(commandsIndex);
    expect(commandsIndex).toBeLessThan(sshIndex);
  });

  test('dbEnabled: trueの場合、スラッシュコマンド登録ステップはMigrateの後になる', () => {
    const content = generateDeployWorkflow('my-bot', [], true);
    const migrateIndex = content.indexOf('- name: Migrate');
    const commandsIndex = content.indexOf('- name: Register slash commands');
    expect(migrateIndex).toBeLessThan(commandsIndex);
  });

  test('systemdサービスの有無でrestart/新規作成+startを分岐する', () => {
    const content = generateDeployWorkflow('my-bot', [], false);
    expect(content).toContain('if [ -f ~/.config/systemd/user/my-bot.service ]; then');
    expect(content).toContain('systemctl --user restart my-bot');
    expect(content).toContain("cat > ~/.config/systemd/user/my-bot.service <<'UNIT'");
    expect(content).toContain('systemctl --user start my-bot');
  });

  test('新規作成時はdaemon-reload・startの後にenableでホスト再起動後の自動起動も有効化する', () => {
    const content = generateDeployWorkflow('my-bot', [], false);
    expect(content).toContain(
      'systemctl --user daemon-reload\n            systemctl --user start my-bot\n            systemctl --user enable my-bot\n',
    );
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

  test('assetsEnabled: falseならassetsのrsyncを含まない(デフォルトもfalse相当)', () => {
    const content = generateDeployWorkflow('my-bot', [], false);
    expect(content).toContain('rsync -avz dist/');
    expect(content).not.toContain('rsync -avz assets/');
  });

  test('assetsEnabled: trueならdist/のrsyncに続けてassets/を${DEPLOY_PATH}/assets/へrsyncする', () => {
    const content = generateDeployWorkflow('my-bot', [], false, true);
    expect(content).toContain(
      'rsync -avz dist/ "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}":"${{ secrets.DEPLOY_PATH }}"',
    );
    expect(content).toContain(
      'rsync -avz assets/ "${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}":"${{ secrets.DEPLOY_PATH }}/assets/"',
    );
    const distIndex = content.indexOf('rsync -avz dist/');
    const assetsIndex = content.indexOf('rsync -avz assets/');
    expect(distIndex).toBeLessThan(assetsIndex);
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

  test('lefthook.ymlが存在すればencryptの直後にworkflowコマンドを追記する', async () => {
    const dir = await setupDir();
    try {
      await writeFile(join(dir, 'lefthook.yml'), generateLefthookConfig());
      await runGenerateWorkflowSsh(dir);
      const lefthook = await readFile(join(dir, 'lefthook.yml'), 'utf-8');
      expect(lefthook).toContain(
        '    encrypt:\n      run: mise exec -- bun run encrypt -- --all\n      stage_fixed: true\n' +
          '    workflow:\n      run: mise exec -- bun run gen:workflow ssh && git add .github/workflows/deploy.yaml disbord.config.ts $([ -d assets ] && echo assets)\n',
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('lefthook.ymlに既にworkflowコマンドがある場合は重複追記しない(複数回実行しても冪等)', async () => {
    const dir = await setupDir();
    try {
      await writeFile(join(dir, 'lefthook.yml'), generateLefthookConfig());
      await runGenerateWorkflowSsh(dir);
      const once = await readFile(join(dir, 'lefthook.yml'), 'utf-8');
      await runGenerateWorkflowSsh(dir);
      const twice = await readFile(join(dir, 'lefthook.yml'), 'utf-8');
      expect(twice).toBe(once);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('lefthook.ymlが存在しない場合は何もせずスキップする(deploy.yaml生成は失敗しない)', async () => {
    const dir = await setupDir();
    try {
      await runGenerateWorkflowSsh(dir);
      expect(existsSync(join(dir, 'lefthook.yml'))).toBe(false);
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

  test('onceスクリプトがあるのにtimer設定が無い場合、disbord.config.tsへ補完せずdeploy.yamlからも除外する', async () => {
    const dir = await setupDir();
    try {
      await mkdir(join(dir, 'src/once'), { recursive: true });
      await writeFile(join(dir, 'src/once/notice.ts'), '');

      await runGenerateWorkflowSsh(dir);

      const config = await readFile(join(dir, 'disbord.config.ts'), 'utf-8');
      expect(config).toBe(BASE_CONFIG);

      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).not.toContain('- name: Deploy once timers');
      expect(content).not.toContain('my-bot-notice');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('既にtimer設定がある場合は上書きせず既存のcronを使う', async () => {
    const dir = await setupDir();
    try {
      await mkdir(join(dir, 'src/once'), { recursive: true });
      await writeFile(join(dir, 'src/once/notice.ts'), '');
      await writeFile(
        join(dir, 'disbord.config.ts'),
        BASE_CONFIG.replace('botErrorMessage:', `timer: { notice: '0 9 * * *' },\n  botErrorMessage:`),
      );

      await runGenerateWorkflowSsh(dir);

      const config = await readFile(join(dir, 'disbord.config.ts'), 'utf-8');
      expect(config).toContain(`timer: { notice: '0 9 * * *' }`);

      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).toContain('OnCalendar=0 9 * * *');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('timerがfalsy(手動実行専用の明示的opt-out)な場合は補完せずdeploy.yamlから除外する', async () => {
    const dir = await setupDir();
    try {
      await mkdir(join(dir, 'src/once'), { recursive: true });
      await writeFile(join(dir, 'src/once/notice.ts'), '');
      await writeFile(
        join(dir, 'disbord.config.ts'),
        BASE_CONFIG.replace('botErrorMessage:', `timer: { notice: '' },\n  botErrorMessage:`),
      );

      await runGenerateWorkflowSsh(dir);

      const config = await readFile(join(dir, 'disbord.config.ts'), 'utf-8');
      expect(config).toContain(`timer: { notice: '' }`);

      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).not.toContain('- name: Deploy once timers');
      expect(content).not.toContain('my-bot-notice');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('複数のonceスクリプトのうち一部だけtimer未設定の場合、設定済みの分だけdeploy.yamlに含み未設定分は補完しない', async () => {
    const dir = await setupDir();
    try {
      await mkdir(join(dir, 'src/once'), { recursive: true });
      await writeFile(join(dir, 'src/once/notice.ts'), '');
      await writeFile(join(dir, 'src/once/cleanup.ts'), '');
      await writeFile(
        join(dir, 'disbord.config.ts'),
        BASE_CONFIG.replace('botErrorMessage:', `timer: {\n    notice: '0 9 * * *',\n  },\n  botErrorMessage:`),
      );

      await runGenerateWorkflowSsh(dir);

      const config = await readFile(join(dir, 'disbord.config.ts'), 'utf-8');
      expect(config).toContain(`notice: '0 9 * * *'`);
      expect(config).not.toContain('cleanup');

      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).toContain('my-bot-notice');
      expect(content).not.toContain('my-bot-cleanup');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('assets/ディレクトリが存在する場合はassetsのrsyncステップを含める', async () => {
    const dir = await setupDir();
    try {
      await mkdir(join(dir, 'assets'), { recursive: true });
      await writeFile(join(dir, 'assets/calendar_base.png'), '');

      await runGenerateWorkflowSsh(dir);
      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).toContain('rsync -avz assets/');
      expect(content).toContain('${{ secrets.DEPLOY_PATH }}/assets/');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('assets/ディレクトリが無い場合はassetsのrsyncステップを含めない', async () => {
    const dir = await setupDir();
    try {
      await runGenerateWorkflowSsh(dir);
      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).not.toContain('rsync -avz assets/');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('assets/ディレクトリが空の場合はassetsのrsyncステップを含めない', async () => {
    const dir = await setupDir();
    try {
      await mkdir(join(dir, 'assets'), { recursive: true });

      await runGenerateWorkflowSsh(dir);
      const content = await readFile(join(dir, '.github/workflows/deploy.yaml'), 'utf-8');
      expect(content).not.toContain('rsync -avz assets/');
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

describe('hasSshDeployWorkflow', () => {
  test('.github/workflows/deploy.yamlが存在しない場合はfalse', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-has-ssh-workflow-'));
    try {
      expect(hasSshDeployWorkflow(dir)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('deploy.yamlがSSH_HOSTを参照するSSHデプロイ用の場合はtrue', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-has-ssh-workflow-'));
    try {
      await mkdir(join(dir, '.github/workflows'), { recursive: true });
      await writeFile(join(dir, '.github/workflows/deploy.yaml'), generateDeployWorkflow('my-bot', [], false));
      expect(hasSshDeployWorkflow(dir)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('deploy.yamlはあるがSSH_HOSTを参照しない場合はfalse', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-has-ssh-workflow-'));
    try {
      await mkdir(join(dir, '.github/workflows'), { recursive: true });
      await writeFile(join(dir, '.github/workflows/deploy.yaml'), 'name: Deploy\n');
      expect(hasSshDeployWorkflow(dir)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('hasAssetsDir', () => {
  test('assets/ディレクトリが存在しない場合はfalse', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-has-assets-dir-'));
    try {
      expect(hasAssetsDir(dir)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('assets/ディレクトリが空の場合はfalse', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-has-assets-dir-'));
    try {
      await mkdir(join(dir, 'assets'), { recursive: true });
      expect(hasAssetsDir(dir)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('assets/ディレクトリにファイルが1件以上ある場合はtrue', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'disbord-has-assets-dir-'));
    try {
      await mkdir(join(dir, 'assets'), { recursive: true });
      await writeFile(join(dir, 'assets/calendar_base.png'), '');
      expect(hasAssetsDir(dir)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
