export interface Registry {}

/**
 * `Registry extends Record<Key, infer Value> ? Value : Fallback` は使わない。
 * bot側のsrc/disbord.d.tsは`buttons: typeof buttons`のようにRegistry自身の他フィールドも
 * 一緒に宣言するため、Registry全体を対象にした`extends`の構造チェックはRegistryの全プロパティを
 * 解決しようとし、`ButtonRegistration`のデフォルト型引数(`RegistryOf<'core', never>`)経由で
 * buttons.ts自身の型と循環してしまう(実機確認済み: `Type 'RegistryOf' is not generic` /
 * `circularly references itself`エラーになる)。`Key extends keyof Registry`によるindexed access
 * ならKeyに対応するプロパティ1つだけを見るため、この循環を起こさない。
 */
export type RegistryOf<Key extends string, Fallback> = Key extends keyof Registry ? Registry[Key] : Fallback;
