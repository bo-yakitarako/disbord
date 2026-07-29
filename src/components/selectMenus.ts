import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type StringSelectMenuInteraction as DiscordStringSelectMenuInteraction,
} from 'discord.js';
import type { CoreStore } from '../core/store';
import type { RegistryOf } from '../registry';
import { buildCustomId, matchCustomId } from './customId';
import { wrapSelectMenuInteraction } from './interaction';
import { getComponentsState } from './state';
import type { SelectMenuComponent, SelectMenuRegistration } from './types';

function buildSelectMenuComponent(key: string, spec: SelectMenuComponent, separator: string): StringSelectMenuBuilder {
  const options = spec.options.map((option) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(option.label)
      .setValue(option.value)
      .setDescription(option.description ?? option.label)
      .setDefault(option.default ?? false),
  );
  const builder = new StringSelectMenuBuilder()
    .setCustomId(buildCustomId(key, spec.args, separator))
    .addOptions(options);
  if (spec.placeholder) {
    builder.setPlaceholder(spec.placeholder);
  }
  return builder;
}

type ComponentArgs<C> = C extends (...args: infer P) => SelectMenuComponent ? P : [];

function buildSelectMenuRow<R extends SelectMenuRegistration<any>, K extends keyof R>(
  registration: R,
  key: K,
  args: ComponentArgs<R[K]['component']>,
  globalSplitter: string | undefined,
): ActionRowBuilder<StringSelectMenuBuilder> {
  const entry = registration[key]!;
  const spec =
    typeof entry.component === 'function'
      ? (entry.component as (...a: unknown[]) => SelectMenuComponent)(...args)
      : entry.component;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    buildSelectMenuComponent(key as string, spec, entry.argsSplitter ?? globalSplitter ?? '-'),
  );
}

type Registration = RegistryOf<'selectMenus', SelectMenuRegistration<any>>;

export function makeSelectMenuRow<K extends keyof Registration>(
  key: K,
  ...args: ComponentArgs<Registration[K]['component']>
): ActionRowBuilder<StringSelectMenuBuilder> {
  const state = getComponentsState();
  return buildSelectMenuRow(state.selectMenus as Registration, key, args, state.argsSplitter);
}

type CoreOption<TCore> = { store: CoreStore<TCore>; nullMessage: string };

export async function routeSelectMenuInteraction<TCore>(
  interaction: DiscordStringSelectMenuInteraction,
  registration: SelectMenuRegistration<TCore>,
  core?: CoreOption<TCore>,
  options?: { argsSplitter?: string },
): Promise<void> {
  const wrapped = wrapSelectMenuInteraction(interaction);
  const matched = matchCustomId(interaction.customId, registration, options?.argsSplitter);
  if (!matched) {
    throw new Error(`disbord: unknown select menu customId "${interaction.customId}"`);
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
