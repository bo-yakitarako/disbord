/**
 * bot側の src/disbord.d.ts が module augmentation でこの interface に
 * buttons / selectMenus / slashCommands / schema を書き足す。CLIが1度だけ生成し、以後さわらない想定。
 */
export interface Registry {}

export type RegistryOf<Key extends string, Fallback> = Registry extends Record<Key, infer Value> ? Value : Fallback;
