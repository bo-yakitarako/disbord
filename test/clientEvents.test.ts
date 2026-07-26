import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import {
  collectDiscordJsTypeIdentifiers,
  isDiscordJsExport,
  parseClientEventsInterface,
  resolveEventParams,
} from '../src/cli/clientEvents';

// discord.jsの実際の型定義に対してテストする。将来discord.jsが構造を変えて
// パーサーが壊れたら、このテスト自体が気づかせてくれる。
const pkgJsonPath = Bun.resolveSync('discord.js/package.json', import.meta.dir);
const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf-8')) as { types: string };
const dtsPath = join(dirname(pkgJsonPath), pkg.types);
const source = readFileSync(dtsPath, 'utf-8');
const members = parseClientEventsInterface(source);

describe('parseClientEventsInterface', () => {
  test('ClientEventsの全メンバーをパースできる(90件前後)', () => {
    expect(members.size).toBeGreaterThan(50);
  });

  test('messageCreateはタプルの生テキストを持つ', () => {
    expect(members.get('messageCreate')).toContain('message:');
  });

  test('invalidataedは空タプル', () => {
    expect(members.get('invalidated')).toBe('[]');
  });

  test('webhookUpdateは別名参照の生テキストを持つ', () => {
    expect(members.get('webhookUpdate')).toBe(`ClientEvents['webhooksUpdate']`);
  });
});

describe('resolveEventParams', () => {
  test('messageCreateは1引数(message)', () => {
    const params = resolveEventParams('messageCreate', members);
    expect(params).toHaveLength(1);
    expect(params[0]!.name).toBe('message');
    expect(params[0]!.type).toContain('Message');
  });

  test('guildMemberUpdateは2引数(oldMember, newMember)', () => {
    const params = resolveEventParams('guildMemberUpdate', members);
    expect(params.map((p) => p.name)).toEqual(['oldMember', 'newMember']);
  });

  test('invalidatedは0引数', () => {
    expect(resolveEventParams('invalidated', members)).toEqual([]);
  });

  test('webhookUpdateは別名参照(webhooksUpdate)を再帰的に解決する', () => {
    const viaAlias = resolveEventParams('webhookUpdate', members);
    const direct = resolveEventParams('webhooksUpdate', members);
    expect(viaAlias).toEqual(direct);
  });

  test('存在しないイベント名はthrow', () => {
    expect(() => resolveEventParams('doesNotExist', members)).toThrow();
  });

  test('予約済みのinteractionCreateもタプルとして解決できる(呼び出し側で拒否する想定)', () => {
    const params = resolveEventParams('interactionCreate', members);
    expect(params[0]!.name).toBe('interaction');
  });
});

describe('collectDiscordJsTypeIdentifiers', () => {
  test('大文字始まりの識別子を重複なく集める', () => {
    const ids = collectDiscordJsTypeIdentifiers(['GuildMember | PartialGuildMember', 'GuildMember']);
    expect(ids.sort()).toEqual(['GuildMember', 'PartialGuildMember']);
  });

  test('小文字始まりの型(string, number等)は拾わない', () => {
    const ids = collectDiscordJsTypeIdentifiers(['string', 'number', 'Snowflake']);
    expect(ids).toEqual(['Snowflake']);
  });
});

describe('isDiscordJsExport', () => {
  test('直接宣言されている型(Message, Client, GuildMember)はtrue', () => {
    expect(isDiscordJsExport(source, 'Message')).toBe(true);
    expect(isDiscordJsExport(source, 'Client')).toBe(true);
    expect(isDiscordJsExport(source, 'GuildMember')).toBe(true);
    expect(isDiscordJsExport(source, 'OmitPartialGroupDMChannel')).toBe(true);
  });

  test('再エクスポートブロック経由の型(Snowflake, ReadonlyCollection)もtrue', () => {
    expect(isDiscordJsExport(source, 'Snowflake')).toBe(true);
    expect(isDiscordJsExport(source, 'ReadonlyCollection')).toBe(true);
  });

  test('グローバル組み込み型(Date, Error)はfalse', () => {
    expect(isDiscordJsExport(source, 'Date')).toBe(false);
    expect(isDiscordJsExport(source, 'Error')).toBe(false);
  });
});
