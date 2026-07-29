import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction as DiscordButtonInteraction,
} from 'discord.js';
import type { CoreStore } from '../core/store';
import type { RegistryOf } from '../registry';
import { buildCustomId, matchCustomId } from './customId';
import { wrapButtonInteraction } from './interaction';
import { getComponentsState } from './state';
import type { ButtonComponent, ButtonRegistration, ButtonStyleName } from './types';

const buttonStyleMap: Record<ButtonStyleName, ButtonStyle> = {
  primary: ButtonStyle.Primary,
  secondary: ButtonStyle.Secondary,
  success: ButtonStyle.Success,
  danger: ButtonStyle.Danger,
};

function buildButtonComponent(key: string, spec: ButtonComponent, separator: string): ButtonBuilder {
  const builder = new ButtonBuilder()
    .setCustomId(buildCustomId(key, spec.args, separator))
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

function buildButtonRow<R extends ButtonRegistration<any>>(
  registration: R,
  items: ButtonRowItem<R>[],
  globalSplitter: string | undefined,
): ActionRowBuilder<ButtonBuilder> {
  const buttons = items.map((item) => {
    const [key, ...args] = (Array.isArray(item) ? item : [item]) as [keyof R, ...unknown[]];
    const entry = registration[key]!;
    const spec =
      typeof entry.component === 'function'
        ? (entry.component as (...a: unknown[]) => ButtonComponent)(...args)
        : entry.component;
    return buildButtonComponent(key as string, spec, entry.argsSplitter ?? globalSplitter ?? '-');
  });
  return new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
}

type Registration = RegistryOf<'buttons', ButtonRegistration<any>>;

export function makeButtonRow(...items: ButtonRowItem<Registration>[]): ActionRowBuilder<ButtonBuilder> {
  const state = getComponentsState();
  return buildButtonRow(state.buttons as Registration, items, state.argsSplitter);
}

type CoreOption<TCore> = { store: CoreStore<TCore>; nullMessage: string };

export async function routeButtonInteraction<TCore>(
  interaction: DiscordButtonInteraction,
  registration: ButtonRegistration<TCore>,
  core?: CoreOption<TCore>,
  options?: { argsSplitter?: string },
): Promise<void> {
  const wrapped = wrapButtonInteraction(interaction);
  const matched = matchCustomId(interaction.customId, registration, options?.argsSplitter);
  if (!matched) {
    throw new Error(`disbord: unknown button customId "${interaction.customId}"`);
  }
  const [key, args] = matched;
  const entry = registration[key]!;
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
