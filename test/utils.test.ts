import { describe, expect, test } from 'bun:test';
import { GuildMember, type RepliableInteraction } from 'discord.js';
import { buildEmbed, getMemberInfo } from '../src/utils';

function fakeGuildMember(displayName: string, iconURL: string) {
  const member = Object.create(GuildMember.prototype) as GuildMember;
  Object.defineProperty(member, 'displayName', { value: displayName, enumerable: true });
  member.displayAvatarURL = (() => iconURL) as GuildMember['displayAvatarURL'];
  return member;
}

function fakeInteraction(member: GuildMember | null, id: string, username: string, iconURL: string) {
  return {
    member,
    user: { id, username, displayAvatarURL: () => iconURL },
  } as unknown as RepliableInteraction;
}

describe('getMemberInfo', () => {
  test('GuildMemberの場合はdisplayNameとそのアイコンを使う', () => {
    const member = fakeGuildMember('にじえも@サーバー', 'https://example.com/member.png');
    const interaction = fakeInteraction(member, 'u1', 'にじえも', 'https://example.com/user.png');
    expect(getMemberInfo(interaction)).toEqual({
      id: 'u1',
      name: 'にじえも@サーバー',
      iconURL: 'https://example.com/member.png',
    });
  });

  test('GuildMemberでない場合(DM等)はuserのusernameとアイコンを使う', () => {
    const interaction = fakeInteraction(null, 'u2', 'にじえも', 'https://example.com/user.png');
    expect(getMemberInfo(interaction)).toEqual({
      id: 'u2',
      name: 'にじえも',
      iconURL: 'https://example.com/user.png',
    });
  });

  test('nameArrangeを渡すと名前を加工できる', () => {
    const member = fakeGuildMember('にじえも', 'https://example.com/member.png');
    const interaction = fakeInteraction(member, 'u1', 'にじえも', 'https://example.com/user.png');
    expect(getMemberInfo(interaction, (name) => `[${name}]`)).toEqual({
      id: 'u1',
      name: '[にじえも]',
      iconURL: 'https://example.com/member.png',
    });
  });
});

describe('buildEmbed', () => {
  test('title + descriptionのみ: colorはprimary既定', () => {
    const embed = buildEmbed('タイトル', '本文');
    expect(embed.data).toEqual({ title: 'タイトル', description: '本文', color: 0x3b93ff });
  });

  test('title + description + color', () => {
    const embed = buildEmbed('タイトル', '本文', 'failure');
    expect(embed.data).toEqual({ title: 'タイトル', description: '本文', color: 0xff5757 });
  });

  test('title + fields', () => {
    const fields = [{ name: 'a', value: 'b', inline: false }];
    const embed = buildEmbed('タイトル', fields);
    expect(embed.data).toEqual({ title: 'タイトル', color: 0x3b93ff, fields });
  });

  test('title + fields + color', () => {
    const fields = [{ name: 'a', value: 'b', inline: false }];
    const embed = buildEmbed('タイトル', fields, 'success');
    expect(embed.data).toEqual({ title: 'タイトル', color: 0x53fc94, fields });
  });

  test('title + description + fields + color', () => {
    const fields = [{ name: 'a', value: 'b', inline: false }];
    const embed = buildEmbed('タイトル', '本文', fields, 'info');
    expect(embed.data).toEqual({
      title: 'タイトル',
      description: '本文',
      color: 0xe8d44f,
      fields,
    });
  });

  test('authorを渡すとsetAuthorが使われる', () => {
    const embed = buildEmbed({ name: '作者' }, '本文');
    expect(embed.data).toEqual({
      author: { name: '作者' },
      description: '本文',
      color: 0x3b93ff,
    });
  });

  test('author + description + fields + color', () => {
    const fields = [{ name: 'a', value: 'b', inline: false }];
    const embed = buildEmbed({ name: '作者' }, '本文', fields, 'failure');
    expect(embed.data).toEqual({
      author: { name: '作者' },
      description: '本文',
      color: 0xff5757,
      fields,
    });
  });
});
