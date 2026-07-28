import { describe, expect, test } from 'bun:test';
import { buildHelpText } from '../src/cli/help';

describe('buildHelpText', () => {
  test('dbEnabled: trueならmigrateを含め、DB非依存の全コマンドも含む', () => {
    const text = buildHelpText({ dbEnabled: true });
    for (const usage of [
      'disbord dev',
      'disbord build',
      'disbord commands push',
      'disbord commands delete',
      'disbord env',
      'disbord generate event <name>',
      'disbord migrate',
    ]) {
      expect(text).toContain(usage);
    }
  });

  test('dbEnabled: falseならmigrateを含まない', () => {
    const text = buildHelpText({ dbEnabled: false });
    expect(text).not.toContain('disbord migrate');
    expect(text).toContain('disbord dev');
  });

  test('dbEnabled省略時はfalse相当(migrateを含まない)', () => {
    expect(buildHelpText()).not.toContain('disbord migrate');
  });

  test('--version/-vと--help/-hの説明を含む', () => {
    const text = buildHelpText({ dbEnabled: true });
    expect(text).toContain('--version, -v');
    expect(text).toContain('--help, -h');
  });
});
