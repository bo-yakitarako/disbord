import { describe, expect, test } from 'bun:test';
import {
  generateButtonsStub,
  generateCoreStub,
  generateDisbordConfig,
  generateDisbordDts,
  generateEnvPlaceholder,
  generateGitignore,
  generateMiseToml,
  generateOxfmtrc,
  generateOxlintConfig,
  generatePackageJson,
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
    expect(content.dependencies.disbord).toBe('^0.0.2');
  });

  test('dev以外のnpm scripts(build/fmt/lint/gen:event/enable/disable/env/help)も含む', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    expect(content.scripts.build).toBe('disbord build');
    expect(content.scripts.fmt).toBe('oxfmt --write src test');
    expect(content.scripts.lint).toBe('oxlint -c oxlint.config.ts --fix');
    expect(content.scripts['gen:event']).toBe('disbord generate event');
    expect(content.scripts.enable).toBe('disbord enable');
    expect(content.scripts.disable).toBe('disbord disable');
    expect(content.scripts.env).toBe('disbord env');
    expect(content.scripts.help).toBe('disbord help');
  });

  test('enable/disableはgen:eventの直後に並ぶ', () => {
    const content = JSON.parse(generatePackageJson('my-bot'));
    const keys = Object.keys(content.scripts);
    expect(keys.indexOf('enable')).toBe(keys.indexOf('gen:event') + 1);
    expect(keys.indexOf('disable')).toBe(keys.indexOf('enable') + 1);
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

  test('components importは@/絶対パスを使う', () => {
    const source = generateDisbordDts({ db: false, coreClass: false });
    expect(source).toContain(`from '@/components/buttons'`);
    expect(source).toContain(`from '@/components/selectMenus'`);
    expect(source).toContain(`from '@/components/slashCommands'`);
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
});
