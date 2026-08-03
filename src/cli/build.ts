import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnDotenvxCapture } from './dotenvxSpawn';
import { regenerateDisbordDtsFromConfig } from './dtsRegen';
import { generateMainSource, scanComponentFiles, scanEventFiles } from './generate';
import { generateOnceMainSource, scanOnceFiles } from './generateOnceMain';
import { readBotConfig } from './readBotConfig';
import { regenerateSchemaFile } from './schemaGen';

export const BUILD_BUNDLE_BANNER = '/* disbord | MIT License | github.com/bo-yakitarako/disbord */';

/**
 * `dotenvx decrypt --stdout`は復号したKEY=VALUEの手前に、暗号化用の公開鍵バナーコメントと
 * `DOTENV_PUBLIC_KEY_*`行、`# .env.production`のようなファイル名コメントも含めて出力する
 * （実機確認済み。末尾にも余分な空行が付く）。dist/.envはbot実行時にそのまま読まれるだけの
 * 素のenvファイルなので、この`# .env.*`行より下のKEY=VALUE部分だけを、末尾の改行1つに
 * 揃えて残す。
 */
export function stripDotenvxEnvHeader(text: string): string {
  const match = /^# \.env\.\S*[^\S\r\n]*\r?\n/m.exec(text);
  const body = match ? text.slice(match.index + match[0].length) : text;
  return `${body.trimEnd()}\n`;
}

export function parseBuildArgs(args: (string | undefined)[]): { external: string[] } {
  const external: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--external') {
      const value = args[i + 1];
      if (value === undefined) {
        throw new Error('disbord: --externalには値を指定してください');
      }
      external.push(value);
      i++;
      continue;
    }
    if (args[i] !== undefined) {
      throw new Error(`disbord: 不明な引数 "${args[i]}"`);
    }
  }
  return { external };
}

/**
 * `dist/mise.toml`の中身を組み立てる。ボット自身のルート`mise.toml`（bunバージョン固定用）を
 * そのまま基礎にし、デプロイ先でsystemdサービスから`mise run main`/`mise run <once名>`で
 * 起動できるよう`[tasks.*]`をmain・onceスクリプトの数だけ追記する
 * （`disbord generate workflow ssh`が生成するservice/timerユニットのExecStartと対応する）。
 */
export function buildDistMiseToml(baseMiseToml: string, onceNames: string[]): string {
  const taskBlocks = ['main', ...onceNames].map((name) => `[tasks.${name}]\nrun = 'bun ${name}.js'\n`);
  return `${baseMiseToml.trimEnd()}\n\n${taskBlocks.join('\n')}`;
}

/**
 * `src/once/*.ts`ごとに`.disbord/once/<name>.ts`（実実行ファイル）を生成し、個別に
 * `dist/<name>.js`（main.jsと同じdist直下）へbundleする。runBuild本体の複雑度
 * (oxlint complexity)を抑えるため分離している。
 */
async function buildOnceScripts(
  cwd: string,
  onceNames: string[],
  options: { dbEnabled: boolean; coreClassName?: string; external: string[] },
): Promise<void> {
  if (onceNames.length === 0) return;

  mkdirSync(join(cwd, '.disbord/once'), { recursive: true });
  for (const name of onceNames) {
    const mainPath = join(cwd, `.disbord/once/${name}.ts`);
    writeFileSync(
      mainPath,
      generateOnceMainSource(name, {
        origin: 'build',
        dbEnabled: options.dbEnabled,
        coreClassName: options.coreClassName,
      }),
    );

    const result = await Bun.build({
      entrypoints: [mainPath],
      outdir: join(cwd, 'dist'),
      target: 'bun',
      minify: true,
      external: options.external,
      banner: BUILD_BUNDLE_BANNER,
    });
    if (!result.success) {
      for (const log of result.logs) {
        console.error(log);
      }
      throw new Error(`disbord: bun build（once/${name}）に失敗しました`);
    }
  }
}

/**
 * `.disbord/main.ts`を生成し`dist/main.js`へbundleする。runBuild本体の複雑度
 * (oxlint complexity)を抑えるため、buildOnceScriptsと同様に分離している。
 */
async function buildMainEntry(
  cwd: string,
  eventNames: string[],
  options: {
    dbEnabled: boolean;
    coreClassName?: string;
    hasButtons: boolean;
    hasSelectMenus: boolean;
    external: string[];
  },
): Promise<void> {
  writeFileSync(
    join(cwd, '.disbord/main.ts'),
    generateMainSource(eventNames, {
      origin: 'build',
      dbEnabled: options.dbEnabled,
      coreClassName: options.coreClassName,
      hasButtons: options.hasButtons,
      hasSelectMenus: options.hasSelectMenus,
    }),
  );

  const result = await Bun.build({
    entrypoints: [join(cwd, '.disbord/main.ts')],
    outdir: join(cwd, 'dist'),
    target: 'bun',
    minify: true,
    external: options.external,
    banner: BUILD_BUNDLE_BANNER,
  });
  if (!result.success) {
    for (const log of result.logs) {
      console.error(log);
    }
    throw new Error('disbord: bun buildに失敗しました');
  }
}

export async function runBuild(cwd: string, options: { external?: string[] } = {}): Promise<void> {
  const eventNames = scanEventFiles(join(cwd, 'src/events'));
  mkdirSync(join(cwd, '.disbord'), { recursive: true });

  const config = await readBotConfig(cwd);
  const dbEnabled = Boolean(config.db?.enable);
  const coreClassName = config.coreClass?.enable ? config.coreClass.className : undefined;
  const { hasButtons, hasSelectMenus } = scanComponentFiles(join(cwd, 'src/components'));

  // dev.tsと同様、`.disbord/`ごと削除されていてもbuild単体でdisbord.d.tsを再構築できるようにする。
  regenerateDisbordDtsFromConfig(cwd, config);
  // src/db/schema.tsはmigrate時点のモデル定義から生成される派生物なので、build時点でも
  // 最新化しておく(migrate未実行のまま手でmodelsだけ書き換えた場合との食い違いを防ぐ)。
  if (dbEnabled) {
    await regenerateSchemaFile(cwd);
  }

  const external = new Set(options.external ?? []);
  if (dbEnabled) {
    external.add('@libsql/client');
  }

  await buildMainEntry(cwd, eventNames, {
    dbEnabled,
    coreClassName,
    hasButtons,
    hasSelectMenus,
    external: [...external],
  });

  const onceNames = scanOnceFiles(join(cwd, 'src/once'));
  await buildOnceScripts(cwd, onceNames, { dbEnabled, coreClassName, external: [...external] });

  const baseMiseToml = readFileSync(join(cwd, 'mise.toml'), 'utf-8');
  writeFileSync(join(cwd, 'dist/mise.toml'), buildDistMiseToml(baseMiseToml, onceNames));

  const { text, exitCode } = await spawnDotenvxCapture(cwd, [
    'decrypt',
    '-f',
    'env/.env.production',
    '-fk',
    'env/.env.keys.production',
    '--stdout',
  ]);
  if (exitCode !== 0) {
    throw new Error('disbord: env/.env.production の復号に失敗しました（存在確認・dotenvx導入状況を確認してください）');
  }
  writeFileSync(join(cwd, 'dist/.env'), stripDotenvxEnvHeader(text));

  const onceSummary = onceNames.length > 0 ? `、dist/直下に${onceNames.length}件のonceスクリプト` : '';
  console.log(
    `disbord: dist/main.js（${eventNames.length}イベント同梱・minify済み）と dist/.env・dist/mise.toml${onceSummary}を生成しました`,
  );
}
