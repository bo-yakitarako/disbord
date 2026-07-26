import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction as DiscordButtonInteraction,
} from 'discord.js';
import type { CoreStore } from '../core/store';
import { buildCustomId, parseCustomId } from './customId';
import { wrapButtonInteraction } from './interaction';
import type { ButtonComponent, ButtonRegistration, ButtonStyleName } from './types';

const buttonStyleMap: Record<ButtonStyleName, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

function buildButtonComponent(key: string, spec: ButtonComponent): ButtonBuilder {
  const builder = new ButtonBuilder()
    .setCustomId(buildCustomId(key, spec.args))
    .setLabel(spec.label)
    .setStyle(buttonStyleMap[spec.style ?? 'secondary']);
  if (spec.disabled) {
    builder.setDisabled(true);
  }
  return builder;
}

type ButtonRowItem<R extends ButtonRegistration<any>> = {
  [K in keyof R]: R[K]['component'] extends (...args: infer P) => ButtonComponent ? [K, ...P] : K;
}[keyof R];

export function makeButtonRow<R extends ButtonRegistration<any>>(
  registration: R,
  ...items: ButtonRowItem<R>[]
): ActionRowBuilder<ButtonBuilder> {
  const buttons = items.map((item) => {
    const [key, ...args] = (Array.isArray(item) ? item : [item]) as [keyof R, ...unknown[]];
    // 呼び出し側の型(ButtonRowItem<R>)がkeyofRを保証しているため必ず存在する
    const entry = registration[key]!;
    const spec =
      typeof entry.component === 'function'
        ? (entry.component as (...a: unknown[]) => ButtonComponent)(...args)
        : entry.component;
    return buildButtonComponent(key as string, spec);
  });
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

type CoreOption<TCore> = { store: CoreStore<TCore>; nullMessage: string };

export async function routeButtonInteraction<TCore>(
  interaction: DiscordButtonInteraction,
  registration: ButtonRegistration<TCore>,
  core?: CoreOption<TCore>,
): Promise<void> {
  const wrapped = wrapButtonInteraction(interaction);
  const [key, ...args] = parseCustomId(interaction.customId);
  const entry = registration[key];
  if (!entry) {
    throw new Error(`disbord: unknown button customId "${interaction.customId}"`);
  }
  if (core) {
    const instance = core.store.get(interaction);
    if (instance === null) {
      await wrapped.ephemeral(core.nullMessage);
      return;
    }
    await (entry.execute as (i: typeof wrapped, c: TCore, ...a: string[]) => Promise<void>)(wrapped, instance, ...args);
    return;
  }
  await (entry.execute as (i: typeof wrapped, ...a: string[]) => Promise<void>)(wrapped, ...args);
}
