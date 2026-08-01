import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addTimerEntry } from './configPatch';
import { scanOnceFiles } from './generateOnceMain';
import { addWorkflowLefthookCommand } from './lefthookPatch';
import { readBotConfig } from './readBotConfig';

export type OnceTimerEntry = { name: string; cron: string };

const CONTENT_INDENT = '          ';

/**
 * onceスクリプトの中には手動実行のみを想定し常駐タイマーを持たせたくないものもあるため、
 * `config.timer.<name>`がfalsy（未設定・空文字）な場合はエラーにせず単にdeploy.yamlの
 * デプロイ対象から外す。`src/once/<name>.ts`自体が無い場合（config.timerにだけ古いエントリが
 * 残っている等）も同様にスキップする(該当once自体がbuildされずdist/<name>.jsが存在しないため)。
 */
export function resolveOnceTimerEntries(
  cwd: string,
  onceNames: string[],
  timer: Record<string, string> | undefined,
): OnceTimerEntry[] {
  const extraTimerNames = Object.keys(timer ?? {}).filter((name) => !onceNames.includes(name));
  const entries: OnceTimerEntry[] = [];
  for (const name of [...onceNames, ...extraTimerNames]) {
    const cron = timer?.[name];
    if (!cron) continue;
    if (!existsSync(join(cwd, `src/once/${name}.ts`))) continue;
    entries.push({ name, cron });
  }
  return entries;
}

function indentLines(text: string, indent: string): string {
  return text
    .split('\n')
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join('\n');
}

function buildMainServiceUnit(botName: string): string {
  return `[Unit]
Description=${botName} discord bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=\${{ secrets.DEPLOY_PATH }}
ExecStart=mise run main
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target`;
}

function buildOnceServiceUnit(botName: string, name: string): string {
  return `[Unit]
Description=${botName} discord bot one shot script: ${name}

[Service]
Type=oneshot
WorkingDirectory=\${{ secrets.DEPLOY_PATH }}
ExecStart=mise run ${name}

[Install]
WantedBy=default.target`;
}

function buildOnceTimerUnit(botName: string, name: string, cron: string): string {
  return `[Unit]
Description=Timer for ${botName} discord bot one shot script: ${name}

[Timer]
OnCalendar=${cron}
Persistent=false

[Install]
WantedBy=timers.target`;
}

const SSH_TARGET = '"${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}"';

/**
 * `disbord generate once`が`disbord.config.ts`のtimerへデフォルト値を登録してよいかの判定に使う。
 * `.github/workflows/deploy.yaml`が無い、またはSSH+systemdデプロイ用（`SSH_HOST`参照）でない場合、
 * timerを足しても宛先のsystemd timerユニットへ反映されないため登録しない
 * （代わりに`disbord generate workflow ssh`実行時にsrc/once配下の実ファイルから逆算して補完する）。
 */
export function hasSshDeployWorkflow(cwd: string): boolean {
  const deployYamlPath = join(cwd, '.github/workflows/deploy.yaml');
  if (!existsSync(deployYamlPath)) return false;
  return readFileSync(deployYamlPath, 'utf-8').includes('SSH_HOST');
}

/**
 * メインサービスのデプロイスクリプト。`~/.config/systemd/user/{name}.service`の有無で
 * restart(既存デプロイ)か新規作成+startかを分岐する。新規作成時は`start`でその場で起動した後、
 * `enable`でホスト再起動後も自動起動するようにする(起動有無と自動起動有効化は別概念のため、
 * onceスクリプトの`enable --now`のような一括指定はできず2行に分けている)。
 */
function buildMainServiceScript(botName: string): string {
  return `ssh ${SSH_TARGET} bash -s <<'EOF'
set -e
if [ -f ~/.config/systemd/user/${botName}.service ]; then
  systemctl --user restart ${botName}
else
  mkdir -p ~/.config/systemd/user
  cat > ~/.config/systemd/user/${botName}.service <<'UNIT'
${buildMainServiceUnit(botName)}
UNIT
  systemctl --user daemon-reload
  systemctl --user start ${botName}
  systemctl --user enable ${botName}
fi
EOF`;
}

/**
 * onceスクリプトごとのservice/timerユニットをデプロイ先へ書き込み、スケジュール変更にも
 * 追従できるよう毎回daemon-reload・enable --nowし直す(timerは冪等なので既存分の再enableも安全)。
 */
function buildOnceTimersScript(botName: string, entries: OnceTimerEntry[]): string {
  const unitBlocks = entries
    .map(
      (entry) => `cat > ~/.config/systemd/user/${botName}-${entry.name}.service <<'UNIT'
${buildOnceServiceUnit(botName, entry.name)}
UNIT
cat > ~/.config/systemd/user/${botName}-${entry.name}.timer <<'UNIT'
${buildOnceTimerUnit(botName, entry.name, entry.cron)}
UNIT`,
    )
    .join('\n');
  const enableLines = entries.map((entry) => `systemctl --user enable --now ${botName}-${entry.name}.timer`).join('\n');

  return `ssh ${SSH_TARGET} bash -s <<'EOF'
set -e
mkdir -p ~/.config/systemd/user
${unitBlocks}
systemctl --user daemon-reload
${enableLines}
EOF`;
}

function buildStep(name: string, runScript: string): string {
  return `      - name: ${name}
        run: |
${indentLines(runScript, CONTENT_INDENT)}`;
}

export function generateDeployWorkflow(botName: string, onceEntries: OnceTimerEntry[], dbEnabled: boolean): string {
  const steps = [
    `      - name: Checkout
        uses: actions/checkout@v4`,
    `      - name: Setup mise (bun)
        uses: jdx/mise-action@v2`,
    `      - name: Install dependencies
        run: bun install --frozen-lockfile`,
    `      - name: Write env keys
        run: echo "\${{ secrets.ENV_KEYS }}" > env/.env.keys.production`,
    `      - name: Build
        run: bun run build`,
    ...(dbEnabled
      ? [
          `      - name: Migrate
        run: bun run migrate --production`,
        ]
      : []),
    `      - name: Register slash commands
        run: bun run commands --production`,
    `      - name: Setup SSH agent
        uses: webfactory/ssh-agent@v0.9.0
        with:
          ssh-private-key: \${{ secrets.SSH_PRIVATE_KEY }}`,
    buildStep(
      'Add remote host to known_hosts',
      `mkdir -p ~/.ssh
ssh-keyscan -H "\${{ secrets.SSH_HOST }}" >> ~/.ssh/known_hosts`,
    ),
    buildStep('Upload build artifacts', `rsync -avz dist/ ${SSH_TARGET}:"\${{ secrets.DEPLOY_PATH }}"`),
    buildStep('Deploy service', buildMainServiceScript(botName)),
    ...(onceEntries.length > 0 ? [buildStep('Deploy once timers', buildOnceTimersScript(botName, onceEntries))] : []),
  ];

  return `name: Deploy

on:
  push:
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: publish
    steps:
${steps.join('\n\n')}
`;
}

export async function runGenerateWorkflowSsh(cwd: string): Promise<void> {
  const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf-8')) as { name?: string };
  if (!pkg.name) {
    throw new Error('disbord: package.jsonにnameが見つかりませんでした');
  }

  const onceNames = scanOnceFiles(join(cwd, 'src/once'));
  let config = await readBotConfig(cwd);

  // `disbord generate once`はtimerをデフォルトで登録しなくなったため、ここで
  // src/once配下の実ファイルから逆算し、timerキーが無いものにだけデフォルト値を補完する
  // (キー自体はあるが値がfalsy＝手動実行専用として明示的に外したものは対象外にする。
  // addTimerEntryが同名キーの二重登録をthrowするため、値の有無ではなくキーの有無で判定する)。
  const configPath = join(cwd, 'disbord.config.ts');
  const timerKeys = new Set(Object.keys(config.timer ?? {}));
  const missingTimerNames = onceNames.filter((name) => !timerKeys.has(name));
  if (missingTimerNames.length > 0) {
    let configSource = readFileSync(configPath, 'utf-8');
    for (const name of missingTimerNames) {
      configSource = addTimerEntry(configSource, name);
    }
    writeFileSync(configPath, configSource);
    config = await readBotConfig(cwd);
  }

  const onceEntries = resolveOnceTimerEntries(cwd, onceNames, config.timer);

  mkdirSync(join(cwd, '.github/workflows'), { recursive: true });
  writeFileSync(
    join(cwd, '.github/workflows/deploy.yaml'),
    generateDeployWorkflow(pkg.name, onceEntries, Boolean(config.db?.enable)),
  );

  const lefthookPath = join(cwd, 'lefthook.yml');
  if (existsSync(lefthookPath)) {
    writeFileSync(lefthookPath, addWorkflowLefthookCommand(readFileSync(lefthookPath, 'utf-8')));
  }

  console.log('disbord: .github/workflows/deploy.yaml を生成しました');
}
