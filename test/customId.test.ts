import { describe, expect, test } from 'bun:test';
import { buildCustomId, parseCustomId } from '../src/components/customId';

describe('buildCustomId', () => {
  test('argsがない場合はkeyそのまま', () => {
    expect(buildCustomId('withCpu')).toBe('withCpu');
  });

  test('argsがある場合はハイフン区切りで連結する', () => {
    expect(buildCustomId('grid', [3])).toBe('grid-3');
    expect(buildCustomId('join', ['にじえも'])).toBe('join-にじえも');
  });
});

describe('parseCustomId', () => {
  test('argsを伴わないcustomIdはkeyのみ返す', () => {
    expect(parseCustomId('withCpu')).toEqual(['withCpu']);
  });

  test('ハイフン区切りをkeyとargsに分解する', () => {
    expect(parseCustomId('grid-3')).toEqual(['grid', '3']);
  });

  test('buildCustomIdとの往復', () => {
    const customId = buildCustomId('grid', [3, 'x']);
    expect(parseCustomId(customId)).toEqual(['grid', '3', 'x']);
  });
});
