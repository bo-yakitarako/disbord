import { describe, expect, test } from 'bun:test';
import {
  addTimerEntry,
  buildCoreClassConfigBlock,
  buildDbConfigBlock,
  buildTimerConfigBlock,
  insertConfigBlock,
  removeConfigBlock,
} from '../src/cli/configPatch';

const BASE_CONFIG = `import type { Config } from 'disbord';

export default {
  intents: ['Guilds', 'GuildMessages'],
  botErrorMessage: 'エラーが発生しました',
} satisfies Config;
`;

describe('buildCoreClassConfigBlock', () => {
  test('classNameをdisbord.config.ts自身に埋め込む(.disbord/削除時にも復元できるよう永続化するため)', () => {
    const block = buildCoreClassConfigBlock('Game');
    expect(block).toContain(`className: 'Game',`);
  });
});

describe('insertConfigBlock', () => {
  test('botErrorMessageの直前にブロックを挿入する', () => {
    const result = insertConfigBlock(BASE_CONFIG, buildDbConfigBlock());
    expect(result).toContain('  db: {\n    enable: true,\n  },\n  botErrorMessage:');
  });

  test('coreClass→dbの順で挿入すると、テンプレの並び順(intents→coreClass→db→botErrorMessage)通りになる', () => {
    let result = insertConfigBlock(BASE_CONFIG, buildCoreClassConfigBlock('Game'));
    result = insertConfigBlock(result, buildDbConfigBlock());

    const coreClassIndex = result.indexOf('coreClass:');
    const dbIndex = result.indexOf('db:');
    const botErrorMessageIndex = result.indexOf('botErrorMessage:');
    expect(coreClassIndex).toBeGreaterThan(-1);
    expect(coreClassIndex).toBeLessThan(dbIndex);
    expect(dbIndex).toBeLessThan(botErrorMessageIndex);
  });

  test('botErrorMessageが見つからない場合はthrow', () => {
    expect(() => insertConfigBlock('export default {} satisfies Config;\n', buildDbConfigBlock())).toThrow();
  });
});

describe('removeConfigBlock', () => {
  test('coreClassブロックを丸ごと除去する', () => {
    const withCoreClass = insertConfigBlock(BASE_CONFIG, buildCoreClassConfigBlock('Game'));
    const result = removeConfigBlock(withCoreClass, 'coreClass');
    expect(result).toBe(BASE_CONFIG);
  });

  test('dbブロックを丸ごと除去する', () => {
    const withDb = insertConfigBlock(BASE_CONFIG, buildDbConfigBlock());
    const result = removeConfigBlock(withDb, 'db');
    expect(result).toBe(BASE_CONFIG);
  });

  test('coreClass/db両方入っている場合、片方だけ除去してももう片方は残る', () => {
    let source = insertConfigBlock(BASE_CONFIG, buildCoreClassConfigBlock('Game'));
    source = insertConfigBlock(source, buildDbConfigBlock());

    const result = removeConfigBlock(source, 'coreClass');
    expect(result).not.toContain('coreClass');
    expect(result).toContain('db: {');
  });

  test('ブロックが存在しない場合はthrow', () => {
    expect(() => removeConfigBlock(BASE_CONFIG, 'db')).toThrow();
  });
});

describe('buildTimerConfigBlock', () => {
  test('デフォルトcronでブロックを組み立てる', () => {
    expect(buildTimerConfigBlock('notice')).toBe(`  timer: {\n    notice: '*-*-* *:00:00',\n  },\n`);
  });

  test('cronを指定できる', () => {
    expect(buildTimerConfigBlock('notice', '0 0 * * *')).toBe(`  timer: {\n    notice: '0 0 * * *',\n  },\n`);
  });
});

describe('addTimerEntry', () => {
  test('timerブロックが無ければ新規挿入する(botErrorMessageの直前)', () => {
    const result = addTimerEntry(BASE_CONFIG, 'notice');
    expect(result).toContain(`  timer: {\n    notice: '*-*-* *:00:00',\n  },\n  botErrorMessage:`);
  });

  test('既にtimerブロックがあれば末尾にキーを追記する', () => {
    let result = addTimerEntry(BASE_CONFIG, 'notice');
    result = addTimerEntry(result, 'cleanup');
    expect(result).toContain(`  timer: {\n    notice: '*-*-* *:00:00',\n    cleanup: '*-*-* *:00:00',\n  },\n`);
  });

  test('同名キーが既に存在する場合はthrow', () => {
    const withTimer = addTimerEntry(BASE_CONFIG, 'notice');
    expect(() => addTimerEntry(withTimer, 'notice')).toThrow(/既に存在します/);
  });
});
