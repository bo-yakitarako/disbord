import { describe, expect, test } from 'bun:test';
import { parseBuildArgs } from '../src/cli/build';

describe('parseBuildArgs', () => {
  test('引数なし時はexternalが空配列', () => {
    expect(parseBuildArgs([])).toEqual({ external: [] });
    expect(parseBuildArgs([undefined])).toEqual({ external: [] });
  });

  test('--externalを1つ指定できる', () => {
    expect(parseBuildArgs(['--external', '@libsql/client'])).toEqual({ external: ['@libsql/client'] });
  });

  test('--externalを複数回指定すると全て集める(bun buildと同じ挙動)', () => {
    expect(parseBuildArgs(['--external', 'sharp', '--external', '@libsql/client'])).toEqual({
      external: ['sharp', '@libsql/client'],
    });
  });

  test('--externalに値が無い場合はthrow', () => {
    expect(() => parseBuildArgs(['--external'])).toThrow();
  });

  test('未知の余分な引数はthrow', () => {
    expect(() => parseBuildArgs(['--foo'])).toThrow();
  });
});
