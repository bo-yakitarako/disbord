export interface Registry {}

export type RegistryOf<Key extends string, Fallback> = Registry extends Record<Key, infer Value> ? Value : Fallback;
