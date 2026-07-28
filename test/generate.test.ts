import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { generateMainSource, scanEventFiles } from '../src/cli/generate';

const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

describe('scanEventFiles', () => {
  test('src/events/直下の.tsファイル名(拡張子抜き)をソート済みで返す', () => {
    const names = scanEventFiles(join(FIXTURES_DIR, 'events'));
    expect(names).toEqual(['messageCreate', 'ready']);
  });

  test('イベントファイルが存在しない場合は空配列', () => {
    const names = scanEventFiles(join(FIXTURES_DIR, 'events-empty'));
    expect(names).toEqual([]);
  });

  test('interactionCreate.tsが存在する場合はthrow', () => {
    expect(() => scanEventFiles(join(FIXTURES_DIR, 'events-reserved'))).toThrow(/interactionCreate/);
  });
});

describe('generateMainSource', () => {
  test('イベントごとに静的importとclient.onバインドを生成する', () => {
    const source = generateMainSource(['ready', 'messageCreate']);
    expect(source).toContain(`import readyHandler from '../src/events/ready';`);
    expect(source).toContain(`import messageCreateHandler from '../src/events/messageCreate';`);
    expect(source).toContain(`client.on('ready', readyHandler);`);
    expect(source).toContain(`client.on('messageCreate', messageCreateHandler);`);
  });

  test('イベントが1つもない場合でも有効なソースを生成する(ぶら下がりimportなし)', () => {
    const source = generateMainSource([]);
    expect(source).not.toContain('Handler');
    expect(source).toContain('async function main()');
  });

  test('componentsは動的import、REST登録はloginより前', () => {
    const source = generateMainSource([]);
    expect(source).toContain(`await import('../src/components/buttons')`);
    expect(source).toContain(`await import('../src/components/selectMenus')`);
    expect(source).toContain(`await import('../src/components/slashCommands')`);
    expect(source.indexOf('rest.put')).toBeLessThan(source.indexOf('client.login'));
  });

  test('setComponentsStateはcomponentsの動的import直後・Client生成より前に呼ばれる', () => {
    const source = generateMainSource([]);
    expect(source).toContain('setComponentsState({ buttons, selectMenus });');
    const importsIdx = source.indexOf(`await import('../src/components/slashCommands')`);
    const setStateIdx = source.indexOf('setComponentsState(');
    const clientIdx = source.indexOf('new Client(');
    expect(importsIdx).toBeLessThan(setStateIdx);
    expect(setStateIdx).toBeLessThan(clientIdx);
  });

  test('setComponentsStateはregisterCommands/dbEnabledの組み合わせによらず常に含まれる', () => {
    for (const registerCommands of [true, false]) {
      for (const dbEnabled of [true, false]) {
        const source = generateMainSource([], { registerCommands, dbEnabled });
        expect(source).toContain('setComponentsState({ buttons, selectMenus });');
      }
    }
  });

  test('coreOptionはbutton/selectMenuルーティングにのみ渡り、slashCommandには渡らない', () => {
    const source = generateMainSource([]);
    expect(source).toContain('routeButtonInteraction(interaction, buttons, coreOption as never)');
    expect(source).toContain('routeSelectMenuInteraction(interaction, selectMenus, coreOption as never)');
    expect(source).toContain('routeSlashCommandInteraction(interaction, slashCommands)');
    expect(source).not.toContain('routeSlashCommandInteraction(interaction, slashCommands, coreOption');
  });

  test('token/clientIdの環境変数名はconfig未指定時にTOKEN/CLIENT_IDへfallbackする', () => {
    const source = generateMainSource([]);
    expect(source).toContain(`process.env[config.token ?? 'TOKEN']`);
    expect(source).toContain(`process.env[config.clientId ?? 'CLIENT_ID']`);
  });

  test('BotErrorはconfig.botErrorMessageでhandleBotErrorに渡される', () => {
    const source = generateMainSource([]);
    expect(source).toContain('handleBotError(error, interaction, config.botErrorMessage)');
  });

  test('registerCommands省略時はtrue相当(REST登録を含む)', () => {
    const omitted = generateMainSource([]);
    const explicitTrue = generateMainSource([], { registerCommands: true });
    expect(omitted).toBe(explicitTrue);
    expect(omitted).toContain('rest.put');
  });

  test('registerCommands: falseはREST登録関連を一切含まない', () => {
    const source = generateMainSource([], { registerCommands: false });
    expect(source).not.toContain('REST');
    expect(source).not.toContain('Routes');
    expect(source).not.toContain('collectSlashCommandsData');
    expect(source).not.toContain('CLIENT_ID');
    expect(source).not.toContain('rest.put');
  });

  test('registerCommands: falseでもTOKEN解決とclient.loginは残る', () => {
    const source = generateMainSource([], { registerCommands: false });
    expect(source).toContain(`process.env[config.token ?? 'TOKEN']`);
    expect(source).toContain('await client.login(TOKEN);');
  });

  test('registerCommands: falseでもslashCommandのルーティングは残る(登録しないだけで実行はする)', () => {
    const source = generateMainSource([], { registerCommands: false });
    expect(source).toContain(`await import('../src/components/slashCommands')`);
    expect(source).toContain('routeSlashCommandInteraction(interaction, slashCommands)');
  });

  test('dbEnabled省略時はfalse相当(DB関連コードを一切含まない)', () => {
    const source = generateMainSource([]);
    expect(source).not.toContain('createDbClient');
    expect(source).not.toContain('db/schema');
  });

  test('dbEnabled: trueはschema importとcreateDbClient呼び出しを含む', () => {
    const source = generateMainSource([], { dbEnabled: true });
    expect(source).toContain('createDbClient');
    expect(source).toContain(`import { schema } from '../src/db/schema';`);
    expect(source).toContain('createDbClient(schema);');
  });

  test('dbEnabled: trueのcreateDbClient呼び出しはclient生成より前', () => {
    const source = generateMainSource([], { dbEnabled: true });
    expect(source.indexOf('createDbClient(schema)')).toBeLessThan(source.indexOf('new Client('));
  });

  test('dbEnabled: falseはschema importを含まない', () => {
    const source = generateMainSource([], { dbEnabled: false });
    expect(source).not.toContain('db/schema');
  });

  test('registerCommands・dbEnabledは独立に組み合わせられる(build用: false/true)', () => {
    const source = generateMainSource([], { registerCommands: false, dbEnabled: true });
    expect(source).not.toContain('rest.put');
    expect(source).toContain('createDbClient(schema);');
  });
});
