import { describe, expect, test } from 'bun:test';
import {
  generateButtonsStub,
  generateCoreStub,
  generateDisbordConfig,
  generateDisbordDts,
  generateEnvPlaceholder,
  generateGitignore,
  generateLefthookConfig,
  generateMiseToml,
  generateOxfmtrc,
  generateOxlintConfig,
  generatePackageJson,
  generateReadme,
  generateReadyEvent,
  generateSelectMenusStub,
  generateSlashCommandsStub,
  generateTsconfig,
} from '../src/cli/scaffold';

describe('generatePackageJson', () => {
  test('name・dev script・disbordのバージョン範囲依存を含む(npm公開後を想定、workspace:*ではない)', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    expect(content.name).toBe('my-bot');
    expect(content.scripts.dev).toBe('disbord dev');
    expect(content.dependencies.disbord).toBe('^2.2.6');
  });

  test('dev以外のnpm scripts(build/once/fmt/lint/gen:event/gen:once/gen:component/gen:workflow/enable/disable/env/encrypt/decrypt/help)も含む', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    expect(content.scripts.build).toBe('disbord build');
    expect(content.scripts.once).toBe('disbord once');
    expect(content.scripts.fmt).toBe('oxfmt --write src test');
    expect(content.scripts.lint).toBe('oxlint -c oxlint.config.ts --fix');
    expect(content.scripts['gen:event']).toBe('disbord generate event');
    expect(content.scripts['gen:once']).toBe('disbord generate once');
    expect(content.scripts['gen:component']).toBe('disbord generate component');
    expect(content.scripts['gen:workflow']).toBe('disbord generate workflow');
    expect(content.scripts.enable).toBe('disbord enable');
    expect(content.scripts.disable).toBe('disbord disable');
    expect(content.scripts.env).toBe('disbord env');
    expect(content.scripts.encrypt).toBe('disbord env encrypt');
    expect(content.scripts.decrypt).toBe('disbord env decrypt');
    expect(content.scripts.help).toBe('disbord help');
  });

  test('onceはbuildの直後に並ぶ', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    const keys = Object.keys(content.scripts);
    expect(keys.indexOf('once')).toBe(keys.indexOf('build') + 1);
  });

  test('gen:onceはgen:eventの直後、gen:componentはgen:onceの直後、gen:workflowはgen:componentの直後、enable/disableはgen:workflowの直後に並ぶ', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    const keys = Object.keys(content.scripts);
    expect(keys.indexOf('gen:once')).toBe(keys.indexOf('gen:event') + 1);
    expect(keys.indexOf('gen:component')).toBe(keys.indexOf('gen:once') + 1);
    expect(keys.indexOf('gen:workflow')).toBe(keys.indexOf('gen:component') + 1);
    expect(keys.indexOf('enable')).toBe(keys.indexOf('gen:workflow') + 1);
    expect(keys.indexOf('disable')).toBe(keys.indexOf('enable') + 1);
  });

  test('encrypt/decryptはenvの直後、helpの直前に並ぶ', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    const keys = Object.keys(content.scripts);
    expect(keys.indexOf('encrypt')).toBe(keys.indexOf('env') + 1);
    expect(keys.indexOf('decrypt')).toBe(keys.indexOf('encrypt') + 1);
    expect(keys.indexOf('help')).toBe(keys.indexOf('decrypt') + 1);
  });

  test('postinstallでlefthookのgit hooksを配線する(helpの直後に並ぶ)', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    const keys = Object.keys(content.scripts);
    expect(content.scripts.postinstall).toBe('lefthook install --reset-hooks-path');
    expect(keys.indexOf('postinstall')).toBe(keys.indexOf('help') + 1);
  });

  test('lefthookはdevDependenciesに固定バージョンで含まれる', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    expect(content.devDependencies.lefthook).toBeDefined();
    expect(content.devDependencies.lefthook).not.toBe('latest');
  });

  test('db関連の依存・gen:model/migrateスクリプトは含まない(disbord enable --dbが後から追加する)', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    expect(content.dependencies['@libsql/client']).toBeUndefined();
    expect(content.dependencies.dayjs).toBeUndefined();
    expect(content.dependencies['drizzle-orm']).toBeUndefined();
    expect(content.scripts['gen:model']).toBeUndefined();
    expect(content.scripts.migrate).toBeUndefined();
  });

  test('@typescript/native-previewは含まない(typescript@7系のtscが既にネイティブ実装のため不要。実機確認済み)', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    expect(content.devDependencies['@typescript/native-preview']).toBeUndefined();
    expect(content.devDependencies.typescript).toBeDefined();
  });

  test('@types/bun・oxlintは`latest`ではなく固定バージョン(@types/bunはgenerateMiseTomlのbunバージョンと一致、oxlintはoxfmtと同じ指定方法)', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    const miseToml = generateMiseToml();
    const bunVersionMatch = /bun = "([^"]+)"/.exec(miseToml);
    expect(bunVersionMatch).not.toBeNull();
    expect(content.devDependencies['@types/bun']).toBe(bunVersionMatch?.[1]);
    expect(content.devDependencies['@types/bun']).not.toBe('latest');
    expect(content.devDependencies.oxlint).not.toBe('latest');
    expect(content.devDependencies.oxlint).toMatch(/^\^\d+\.\d+\.\d+$/);
  });
});

describe('generateDisbordConfig', () => {
  test('intents・botErrorMessageのみの最小構成(db/coreClassの追加はdisbord enableが担う)', () => {
    const source = generateDisbordConfig();
    expect(source).not.toContain('coreClass');
    expect(source).not.toContain('db:');
    expect(source).toContain("import type { Config } from 'disbord';");
    expect(source).toContain('satisfies Config;');
  });
});

describe('generateOxlintConfig', () => {
  test('disbord/lintをextendsするだけの最小構成(rules/ignorePatternsはdisbord/lint側に集約済み)', () => {
    const source = generateOxlintConfig();
    expect(source).toContain("import { config } from 'disbord/lint';");
    expect(source).toContain('extends: [config]');
    expect(source).not.toContain('rules');
    expect(source).not.toContain('ignorePatterns');
  });
});

describe('generateTsconfig', () => {
  test('@/*エイリアスがsrc/*にマッピングされている', () => {
    const content = JSON.parse(generateTsconfig());
    expect(content.compilerOptions.paths).toEqual({ '@/*': ['./src/*'] });
  });

  test('baseUrlは含まない(TypeScript v7で廃止されたオプションのため。tsgoでTS5102を実機確認済み)', () => {
    const content = JSON.parse(generateTsconfig());
    expect(content.compilerOptions.baseUrl).toBeUndefined();
  });
});

describe('generateOxfmtrc', () => {
  test('.disbord/*をignorePatternsに含む', () => {
    const content = JSON.parse(generateOxfmtrc());
    expect(content.ignorePatterns).toContain('.disbord/*');
  });
});

describe('generateLefthookConfig', () => {
  test('pre-commitでlint/fmt/encryptを実行する', () => {
    const content = generateLefthookConfig();
    expect(content).toContain('pre-commit:');
    expect(content).toContain('bun run lint');
    expect(content).toContain('bun run fmt');
    expect(content).toContain('bun run encrypt -- --all');
  });

  test('fmt/encryptはstage_fixedでコミット対象に自動再ステージする', () => {
    const content = generateLefthookConfig();
    const fmtBlock = content.split('fmt:')[1]?.split('encrypt:')[0];
    const encryptBlock = content.split('encrypt:')[1];
    expect(fmtBlock).toContain('stage_fixed: true');
    expect(encryptBlock).toContain('stage_fixed: true');
  });

  test('encryptは--allでdevelopment/production両方を対象にする(片方だけ暗号化漏れの事故を防ぐ)', () => {
    const content = generateLefthookConfig();
    expect(content).not.toContain('--production');
  });

  test('mise execでラップし、git hook実行時にもmise.tomlで固定したbunバージョンを使う', () => {
    const content = generateLefthookConfig();
    expect(content).toContain('mise exec -- bun run lint');
    expect(content).toContain('mise exec -- bun run fmt');
    expect(content).toContain('mise exec -- bun run encrypt -- --all');
  });
});

describe('generateDisbordDts', () => {
  test('db無効時はschema関連の行を含まない', () => {
    const source = generateDisbordDts({ db: false, coreClass: false });
    expect(source).not.toContain('schema');
  });

  test('db有効時はschemaのimportとRegistryフィールドを含む', () => {
    const source = generateDisbordDts({ db: true, coreClass: false });
    expect(source).toContain(`import type { schema } from './db/schema';`);
    expect(source).toContain('schema: typeof schema;');
  });

  test('coreClass無効時はCore関連の行を含まない', () => {
    const source = generateDisbordDts({ db: false, coreClass: false });
    expect(source).not.toContain('Core');
  });

  test('coreClass有効時はsrc/Core.tsのimportとRegistryフィールド(core: InstanceType<typeof Core>)を含む(coreClassName省略時はCoreがデフォルト)', () => {
    const source = generateDisbordDts({ db: false, coreClass: true });
    expect(source).toContain(`import type { Core } from '@/Core';`);
    expect(source).toContain('core: InstanceType<typeof Core>;');
  });

  test('coreClassName指定時はそのクラス名・同名ファイル(src/{ClassName}.ts)からimportし、Registryフィールドも組み立てる', () => {
    const source = generateDisbordDts({ db: false, coreClass: true, coreClassName: 'Game' });
    expect(source).toContain(`import type { Game } from '@/Game';`);
    expect(source).toContain('core: InstanceType<typeof Game>;');
    expect(source).not.toContain('typeof Core');
    expect(source).not.toContain(`from '@/Core'`);
  });

  test('components importは@/絶対パスを使う(buttons/selectMenus省略時はtrue扱い)', () => {
    const source = generateDisbordDts({ db: false, coreClass: false });
    expect(source).toContain(`from '@/components/buttons'`);
    expect(source).toContain(`from '@/components/selectMenus'`);
    expect(source).toContain(`from '@/components/slashCommands'`);
  });

  test('slashCommandsは常に必須(buttons/selectMenusをfalseにしても含まれる)', () => {
    const source = generateDisbordDts({ db: false, coreClass: false, buttons: false, selectMenus: false });
    expect(source).toContain(`from '@/components/slashCommands'`);
    expect(source).toContain('slashCommands: typeof slashCommands;');
  });

  test('buttons: falseの場合はbuttons関連のimport・Registryフィールドを一切含まない', () => {
    const source = generateDisbordDts({ db: false, coreClass: false, buttons: false });
    expect(source).not.toContain('buttons');
  });

  test('selectMenus: falseの場合はselectMenus関連のimport・Registryフィールドを一切含まない', () => {
    const source = generateDisbordDts({ db: false, coreClass: false, selectMenus: false });
    expect(source).not.toContain('selectMenus');
  });

  test('envKeys未指定・空配列時はNodeJS.ProcessEnvのaugmentationを含まない', () => {
    expect(generateDisbordDts({ db: false, coreClass: false })).not.toContain('NodeJS');
    expect(generateDisbordDts({ db: false, coreClass: false, envKeys: [] })).not.toContain('NodeJS');
  });

  test('envKeys指定時はrequiredをstring、optionalを`?: string`でNodeJS.ProcessEnvに反映する', () => {
    const source = generateDisbordDts({
      db: false,
      coreClass: false,
      envKeys: [
        { key: 'TOKEN', required: true },
        { key: 'TURSO_DATABASE_URL', required: false },
      ],
    });
    expect(source).toContain('declare global {');
    expect(source).toContain('namespace NodeJS {');
    expect(source).toContain('interface ProcessEnv {');
    expect(source).toContain('TOKEN: string;');
    expect(source).toContain('TURSO_DATABASE_URL?: string;');
  });
});

describe('その他の静的テンプレート', () => {
  test('generateReadyEvent: Client<true>を引数に取る', () => {
    expect(generateReadyEvent()).toContain('client: Client<true>');
  });

  test('generateButtonsStub/SelectMenusStub/SlashCommandsStub: 空のRegistrationを満たす', () => {
    expect(generateButtonsStub()).toContain('satisfies ButtonRegistration');
    expect(generateSelectMenusStub()).toContain('satisfies SelectMenuRegistration');
    expect(generateSlashCommandsStub()).toContain('satisfies SlashCommandRegistration');
  });

  test('generateCoreStub: 引数省略時は空のCoreクラスをexportする', () => {
    const content = generateCoreStub();
    expect(content).toContain('export class Core {}');
  });

  test('generateCoreStub: クラス名を指定するとそのクラス名でexportする', () => {
    const content = generateCoreStub('Game');
    expect(content).toContain('export class Game {}');
  });

  test('generateEnvPlaceholder: developmentはTOKEN/CLIENT_ID/GUILD_IDの空プレースホルダー(guild単位rest対応)', () => {
    const content = generateEnvPlaceholder('development');
    expect(content).toContain('TOKEN=');
    expect(content).toContain('CLIENT_ID=');
    expect(content).toContain('GUILD_ID=');
  });

  test('generateEnvPlaceholder: productionはGUILD_IDを含まない(global登録のまま)', () => {
    const content = generateEnvPlaceholder('production');
    expect(content).toContain('TOKEN=');
    expect(content).toContain('CLIENT_ID=');
    expect(content).not.toContain('GUILD_ID=');
  });

  test('generateGitignore: node_modules/dist/.disbord/env keysを含む', () => {
    const content = generateGitignore();
    expect(content).toContain('node_modules/');
    expect(content).toContain('dist/');
    expect(content).toContain('.disbord/');
    expect(content).toContain('env/.env.keys.*');
  });

  test('generateMiseToml: bunのみ(dotenvxはdisbordのnpm依存経由で解決するため不要)', () => {
    const content = generateMiseToml();
    expect(content).toContain('bun =');
    expect(content).not.toContain('dotenvx');
  });

  test('generateMiseToml: bunは`latest`ではなく固定バージョン', () => {
    const content = generateMiseToml();
    expect(content).not.toContain('"latest"');
  });
});

describe('generateReadme', () => {
  test('タイトルにbot名を使う', () => {
    const content = generateReadme('my-bot');
    expect(content).toContain('# my-bot');
  });

  test('インストール・クイックスタートの節は含まない', () => {
    const content = generateReadme('my-bot');
    expect(content).not.toContain('## インストール');
    expect(content).not.toContain('## クイックスタート');
    expect(content).not.toContain('bunx create-disbord-app');
  });

  test('disbord.config.ts/CLIコマンド/components/events/once/Core機構/DB層/デプロイ/エラーハンドリング/lint節を含む', () => {
    const content = generateReadme('my-bot');
    expect(content).toContain('## `disbord.config.ts`');
    expect(content).toContain('## CLIコマンド');
    expect(content).toContain('## components（`src/components/`）');
    expect(content).toContain('## events（`src/events/`）');
    expect(content).toContain('## once（`src/once/`）');
    expect(content).toContain('## Core機構');
    expect(content).toContain('## DB層（`src/db/models/`）');
    expect(content).toContain('## デプロイ（`.github/workflows/`）');
    expect(content).toContain('## エラーハンドリング');
    expect(content).toContain('## Lint / Format / テスト');
  });
});
