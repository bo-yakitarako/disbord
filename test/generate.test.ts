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
});
