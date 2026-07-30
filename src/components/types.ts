import type { RegistryOf } from '../registry';
import type { ButtonInteraction, ChatInputCommandInteraction, StringSelectMenuInteraction } from './interaction';

export type ButtonStyleName = 'primary' | 'secondary' | 'success' | 'danger';

export type ButtonComponent = {
  label: string;
  style?: ButtonStyleName;
  disabled?: boolean;
  args?: (string | number)[];
};

export type SelectMenuOption = {
  label: string;
  value: string;
  description?: string;
  default?: boolean;
};

export type SelectMenuComponent = {
  placeholder?: string;
  options: SelectMenuOption[];
  args?: (string | number)[];
};

export type SlashCommandOption = {
  type: 'number' | 'integer' | 'string' | 'boolean';
  name: string;
  description?: string;
  required?: boolean;
};

type ExecuteWithCore<TCore, Interaction> = [TCore] extends [never]
  ? (interaction: Interaction, ...args: string[]) => Promise<void>
  : (interaction: Interaction, core: TCore, ...args: string[]) => Promise<void>;

/**
 * Registry['core']が.disbord/disbord.d.tsのmodule augmentationで定義されていれば(--core-class時)、
 * TCoreを明示しなくてもsrc/Core.tsの型が自動で流れ込む。未定義ならneverのまま(coreなし)。
 */
type DefaultCore = RegistryOf<'core', never>;

export type ButtonRegistration<TCore = DefaultCore> = {
  [key: string]: {
    component: ButtonComponent | ((...args: any[]) => ButtonComponent);
    execute: ExecuteWithCore<TCore, ButtonInteraction>;
    argsSplitter?: string;
  };
};

export type SelectMenuRegistration<TCore = DefaultCore> = {
  [key: string]: {
    component: SelectMenuComponent | ((...args: any[]) => SelectMenuComponent);
    execute: ExecuteWithCore<TCore, StringSelectMenuInteraction>;
    argsSplitter?: string;
  };
};

export type SlashCommandExecute = (interaction: ChatInputCommandInteraction, ...args: string[]) => Promise<void>;

export type SlashCommandRegistration = {
  [key: string]:
    | SlashCommandExecute
    | {
        description?: string;
        options?: SlashCommandOption[];
        execute: SlashCommandExecute;
      };
};
