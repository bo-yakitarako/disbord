import { describe, expect, test } from 'bun:test';
import { addWorkflowLefthookCommand, buildWorkflowLefthookBlock } from '../src/cli/lefthookPatch';
import { generateLefthookConfig } from '../src/cli/scaffold';

describe('buildWorkflowLefthookBlock', () => {
  test('mise exec -- bun run gen:workflow sshの後にgit addで生成結果を明示的にステージする', () => {
    expect(buildWorkflowLefthookBlock()).toBe(
      '    workflow:\n      run: mise exec -- bun run gen:workflow ssh && git add .github/workflows/deploy.yaml disbord.config.ts\n',
    );
  });
});

describe('addWorkflowLefthookCommand', () => {
  test('encryptコマンドの直後にworkflowコマンドを挿入する', () => {
    const result = addWorkflowLefthookCommand(generateLefthookConfig());
    expect(result).toContain(
      '    encrypt:\n      run: mise exec -- bun run encrypt -- --all\n      stage_fixed: true\n' +
        '    workflow:\n      run: mise exec -- bun run gen:workflow ssh && git add .github/workflows/deploy.yaml disbord.config.ts\n',
    );
  });

  test('既にworkflowコマンドがある場合は何もしない(冪等)', () => {
    const once = addWorkflowLefthookCommand(generateLefthookConfig());
    const twice = addWorkflowLefthookCommand(once);
    expect(twice).toBe(once);
  });

  test('encryptコマンドが見つからない場合はthrow', () => {
    expect(() => addWorkflowLefthookCommand('pre-commit:\n  commands:\n    lint:\n      run: lint\n')).toThrow(
      /encryptコマンドが見つかりませんでした/,
    );
  });

  test('encryptの後に別コマンドが既にある場合でも、encryptの直後に正しく挿入する', () => {
    const source = `pre-commit:
  piped: true
  commands:
    encrypt:
      run: mise exec -- bun run encrypt -- --all
      stage_fixed: true
    custom:
      run: echo custom
`;
    const result = addWorkflowLefthookCommand(source);
    expect(result).toContain(
      '    encrypt:\n      run: mise exec -- bun run encrypt -- --all\n      stage_fixed: true\n' +
        '    workflow:\n      run: mise exec -- bun run gen:workflow ssh && git add .github/workflows/deploy.yaml disbord.config.ts\n' +
        '    custom:\n      run: echo custom\n',
    );
  });
});
