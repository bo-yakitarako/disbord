import { EmbedBuilder, GuildMember } from 'discord.js';
import type { EmbedAuthorOptions as Author, EmbedField, RepliableInteraction } from 'discord.js';

type NameArrange = (name: string) => string;
export type MemberInfo = ReturnType<typeof getMemberInfo>;
export const getMemberInfo = ({ member, user }: RepliableInteraction, nameArrange?: NameArrange) => {
  const id = user.id;
  if (member instanceof GuildMember) {
    const name = nameArrange ? nameArrange(member.displayName) : member.displayName;
    return { id, name, iconURL: member.displayAvatarURL() };
  }
  const name = nameArrange ? nameArrange(user.username) : user.username;
  return { id, name, iconURL: user.displayAvatarURL() };
};

const colors = {
  info: 0xe8d44f,
  primary: 0x3b93ff,
  success: 0x53fc94,
  failure: 0xff5757,
};

type ColorKey = keyof typeof colors;
type DescriptionParams = [string] | [string, ColorKey];
type FieldsParams = [EmbedField[]] | [EmbedField[], ColorKey];
type AllParams = [string, EmbedField[]] | [string, EmbedField[], ColorKey];
export function buildEmbed(title: string, description: string): EmbedBuilder;
export function buildEmbed(title: string, description: string, color: ColorKey): EmbedBuilder;
export function buildEmbed(title: string, fields: EmbedField[]): EmbedBuilder;
export function buildEmbed(title: string, fields: EmbedField[], color: ColorKey): EmbedBuilder;
export function buildEmbed(title: string, description: string, fields: EmbedField[]): EmbedBuilder;
export function buildEmbed(title: string, description: string, fields: EmbedField[], color: ColorKey): EmbedBuilder;
export function buildEmbed(author: Author, description: string): EmbedBuilder;
export function buildEmbed(author: Author, description: string, color: ColorKey): EmbedBuilder;
export function buildEmbed(author: Author, description: string, fields: EmbedField[]): EmbedBuilder;
export function buildEmbed(author: Author, description: string, fields: EmbedField[], color: ColorKey): EmbedBuilder;
export function buildEmbed(title: string | Author, ...params: DescriptionParams | FieldsParams | AllParams) {
  let description = '';
  let fields: EmbedField[] = [];
  let color: ColorKey = 'primary';
  if (params[0] instanceof Array) {
    fields = params[0];
    if (typeof params[1] === 'string') {
      color = params[1];
    }
  } else {
    description = params[0];
    if (params[1] instanceof Array) {
      fields = params[1];
      if (typeof params[2] === 'string') {
        color = params[2];
      }
    } else if (typeof params[1] === 'string') {
      color = params[1];
    }
  }
  const embed = new EmbedBuilder();
  if (typeof title === 'string') {
    embed.setTitle(title);
  } else {
    embed.setAuthor(title);
  }
  embed.setColor(colors[color]);
  if (description) {
    embed.setDescription(description);
  }
  if (fields.length > 0) {
    embed.addFields(fields);
  }
  return embed;
}
