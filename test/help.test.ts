import { describe, expect, test } from 'bun:test';
import { buildHelpText } from '../src/cli/help';

describe('buildHelpText', () => {
  test('dbEnabled: trueならmigrate/generate modelを含め、DB非依存の全コマンドも含む', () => {
    const text = buildHelpText({ dbEnabled: true });
    for (const usage of [
      'disbord dev',
      'disbord build',
      'disbord commands push',
      'disbord commands delete',
      'disbord env',
      'disbord generate event <name>',
      'disbord generate model <Name>',
      'disbord migrate',
      'disbord studio',
    ]) {
      expect(text).toContain(usage);
    }
  });

  test('dbEnabled: falseならmigrate/generate model/studioを含まない', () => {
    const text = buildHelpText({ dbEnabled: false });
    expect(text).not.toContain('disbord migrate');
    expect(text).not.toContain('disbord generate model');
    expect(text).not.toContain('disbord studio');
    expect(text).toContain('disbord dev');
    expect(text).toContain('disbord generate event <name>');
  });

  test('dbEnabled省略時はfalse相当(migrate/generate model/studioを含まない)', () => {
    const text = buildHelpText();
    expect(text).not.toContain('disbord migrate');
    expect(text).not.toContain('disbord generate model');
    expect(text).not.toContain('disbord studio');
  });

  test('--version/-vと--help/-hの説明を含む', () => {
    const text = buildHelpText({ dbEnabled: true });
    expect(text).toContain('--version, -v');
    expect(text).toContain('--help, -h');
  });
});
