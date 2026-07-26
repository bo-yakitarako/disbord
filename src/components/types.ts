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
};

export type SlashCommandOption = {
  type: 'number' | 'string' | 'boolean';
  name: string;
  description?: string;
  required?: boolean;
};

// Core無効(TCore = never)なbotではexecuteの第2引数がCoreではなく素の引数になる
type ExecuteWithCore<TCore, Interaction> = [TCore] extends [never]
  ? (interaction: Interaction, ...args: string[]) => Promise<void>
  : (interaction: Interaction, core: TCore, ...args: string[]) => Promise<void>;

export type ButtonRegistration<TCore = never> = {
  [key: string]: {
    component: ButtonComponent | ((...args: any[]) => ButtonComponent);
    execute: ExecuteWithCore<TCore, ButtonInteraction>;
  };
};

export type SelectMenuRegistration<TCore = never> = {
  [key: string]: {
    component: SelectMenuComponent | ((...args: any[]) => SelectMenuComponent);
    execute: ExecuteWithCore<TCore, StringSelectMenuInteraction>;
  };
};

export type SlashCommandRegistration = {
  [key: string]: {
    description?: string;
    options?: SlashCommandOption[];
    execute(interaction: ChatInputCommandInteraction, ...args: string[]): Promise<void>;
  };
};
