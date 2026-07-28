import { describe, expect, test } from 'bun:test';
import { generateEventFileContent } from '../src/cli/generateEvent';

describe('generateEventFileContent', () => {
  test('messageCreateは disbord から Message 型をimportし、bot発言ガードを先頭行に入れる', () => {
    const content = generateEventFileContent(
      'messageCreate',
      [{ name: 'message', type: 'OmitPartialGroupDMChannel<Message>' }],
      ['Message', 'OmitPartialGroupDMChannel'],
    );
    expect(content).toContain(`import type { Message } from 'disbord';`);
    expect(content).not.toContain('discord.js');
    expect(content).not.toContain('OmitPartialGroupDMChannel');
    expect(content).toContain('export default async function (message: Message) {');

    const functionSignature = 'export default async function (message: Message) {';
    const bodyStart = content.indexOf(functionSignature) + functionSignature.length;
    const firstStatement = content.slice(bodyStart).trimStart().split('\n')[0];
    expect(firstStatement).toBe('if (message.author.bot) return;');
  });

  test('messageCreate以外は従来通りdiscord.jsから直接importする(botガードは入らない)', () => {
    const content = generateEventFileContent('ready', [{ name: 'client', type: 'Client<true>' }], ['Client']);
    expect(content).toContain(`import type { Client } from 'discord.js';`);
    expect(content).toContain('export default async function (client: Client<true>) {');
    expect(content).not.toContain('bot) return');
    expect(content).not.toContain(`from 'disbord'`);
  });

  test('typeIdentifiersが空(0引数イベント)ならimport行を出さない', () => {
    const content = generateEventFileContent('invalidated', [], []);
    expect(content).not.toContain('import');
    expect(content).toContain('export default async function () {');
  });
});
