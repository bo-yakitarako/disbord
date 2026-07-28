import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDisbordVersion } from '../src/cli/version';

describe('getDisbordVersion', () => {
  test('package.jsonのversionフィールドを返す', () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf-8')) as { version: string };
    expect(getDisbordVersion()).toBe(pkg.version);
  });
});
