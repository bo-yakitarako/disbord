import { describe, expect, test } from 'bun:test';
import { buildCustomId, matchCustomId } from '../src/components/customId';

describe('buildCustomId', () => {
  test('argsがない場合はkeyそのまま', () => {
    expect(buildCustomId('withCpu')).toBe('withCpu');
  });

  test('argsがある場合はデフォルトのハイフン区切りで連結する', () => {
    expect(buildCustomId('grid', [3])).toBe('grid-3');
    expect(buildCustomId('join', ['にじえも'])).toBe('join-にじえも');
  });

  test('separatorを指定するとそちらで連結する', () => {
    expect(buildCustomId('grid', [3, 'x'], ':')).toBe('grid:3:x');
  });
});

describe('matchCustomId', () => {
  test('argsを伴わないcustomIdはkeyのみ・args空配列で返す', () => {
    const registration = { withCpu: {} };
    expect(matchCustomId('withCpu', registration)).toEqual(['withCpu', []]);
  });

  test('デフォルトのハイフン区切りをkeyとargsに分解する', () => {
    const registration = { grid: {} };
    expect(matchCustomId('grid-3', registration)).toEqual(['grid', ['3']]);
  });

  test('buildCustomIdとの往復', () => {
    const registration = { grid: {} };
    const customId = buildCustomId('grid', [3, 'x']);
    expect(matchCustomId(customId, registration)).toEqual(['grid', ['3', 'x']]);
  });

  test('未登録のcustomIdはundefinedを返す', () => {
    const registration = { grid: {} };
    expect(matchCustomId('unknown-1', registration)).toBeUndefined();
  });

  test('entry単位のargsSplitterはglobalSplitterより優先される', () => {
    const registration = { grid: { argsSplitter: ':' } };
    const customId = buildCustomId('grid', [3, 'x'], ':');
    expect(matchCustomId(customId, registration, '-')).toEqual(['grid', ['3', 'x']]);
  });

  test('entryにargsSplitter指定がなければglobalSplitterを使う', () => {
    const registration = { grid: {} };
    const customId = buildCustomId('grid', [3, 'x'], ':');
    expect(matchCustomId(customId, registration, ':')).toEqual(['grid', ['3', 'x']]);
    expect(matchCustomId(customId, registration)).toBeUndefined();
  });
});
