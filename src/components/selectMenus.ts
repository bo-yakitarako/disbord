import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type StringSelectMenuInteraction as DiscordStringSelectMenuInteraction,
} from 'discord.js';
import type { CoreStore } from '../core/store';
import type { RegistryOf } from '../registry';
import { wrapSelectMenuInteraction } from './interaction';
import { getComponentsState } from './state';
import type { SelectMenuComponent, SelectMenuRegistration } from './types';

function buildSelectMenuComponent(key: string, spec: SelectMenuComponent): StringSelectMenuBuilder {
  const options = spec.options.map((option) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(option.label)
      .setValue(option.value)
      .setDescription(option.description ?? option.label)
      .setDefault(option.default ?? false),
  );
  const builder = new StringSelectMenuBuilder().setCustomId(key).addOptions(options);
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
): ActionRowBuilder<StringSelectMenuBuilder> {
  // 呼び出し側の型(K extends keyof R)がkeyofRを保証しているため必ず存在する
  const entry = registration[key]!;
  const spec =
    typeof entry.component === 'function'
      ? (entry.component as (...a: unknown[]) => SelectMenuComponent)(...args)
      : entry.component;
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(buildSelectMenuComponent(key as string, spec));
}

type Registration = RegistryOf<'selectMenus', SelectMenuRegistration<any>>;

/**
 * 呼び出し側はregistrationを渡さず、src/disbord.d.tsのmodule augmentation経由で
 * 自botのselectMenus registrationを暗黙解決する(disbord.md「components配下」節)。
 */
export function makeSelectMenuRow<K extends keyof Registration>(
  key: K,
  ...args: ComponentArgs<Registration[K]['component']>
): ActionRowBuilder<StringSelectMenuBuilder> {
  return buildSelectMenuRow(getComponentsState().selectMenus as Registration, key, args);
}

type CoreOption<TCore> = { store: CoreStore<TCore>; nullMessage: string };

export async function routeSelectMenuInteraction<TCore>(
  interaction: DiscordStringSelectMenuInteraction,
  registration: SelectMenuRegistration<TCore>,
  core?: CoreOption<TCore>,
): Promise<void> {
  const wrapped = wrapSelectMenuInteraction(interaction);
  const key = interaction.customId;
  const entry = registration[key];
  if (!entry) {
    throw new Error(`disbord: unknown select menu customId "${key}"`);
  }
  if (core) {
    const instance = core.store.get(interaction);
    if (instance === null) {
      await wrapped.ephemeral(core.nullMessage);
      return;
    }
    await (entry.execute as (i: typeof wrapped, c: TCore) => Promise<void>)(wrapped, instance);
    return;
  }
  await (entry.execute as (i: typeof wrapped) => Promise<void>)(wrapped);
}
