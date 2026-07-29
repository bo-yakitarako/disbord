import type { RepliableInteraction } from 'discord.js';
import { BotError } from '../BotError';
import type { InstanceLevel } from '../config';
import type { RegistryOf } from '../registry';
import { setCoreStoreState } from './state';

/**
 * ButtonRegistration/SelectMenuRegistrationのDefaultCore(components/types.ts)と同じ考え方。
 * Registry['core']が.disbord/disbord.d.tsで定義されていれば(--core-class時)、Tを明示しなくても
 * src/Core.tsの型が自動で流れ込む。未定義ならneverのまま(coreClass未使用bot向けの構築ブロック)。
 */
type DefaultCore = RegistryOf<'core', never>;

export function resolveInstanceKey(interaction: RepliableInteraction, instanceLevel: InstanceLevel): string | null {
  switch (instanceLevel) {
    case 'guild':
      return interaction.guildId;
    case 'channel':
      return interaction.channelId;
    case 'user':
      return interaction.user.id;
    case 'global':
      return '__global__';
    case 'category': {
      const channel = interaction.channel;
      if (channel === null || !('parentId' in channel)) {
        return null;
      }
      return channel.parentId;
    }
  }
}

export type CoreStore<T> = {
  get(interaction: RepliableInteraction): T | null;
  create(interaction: RepliableInteraction): T;
  remove(interaction: RepliableInteraction): void;
};

/**
 * factoryは`.disbord/main.ts`（`disbord dev`/`build`が生成）がsrc/{ClassName}.tsの実クラスを
 * importして渡す。bot側コード(src/components/*.ts等)は`coreStore.create(interaction)`と
 * 書くだけでよく、`new Core()`を自前で書く必要がない(disbordパッケージ自体はCoreの実体を
 * importできないため、この橋渡しは常に`.disbord/`側の生成コードが担う)。
 * factory/instanceInvalidMessageはoptional引数(coreClass.enableが無効なbotの生成コードは
 * instanceLevelのみで呼ぶため。その場合createは呼ばれない設計だが、型上はそちらの呼び出し
 * 形も許容する必要がある)。
 *
 * createはinstanceLevelに対応するキーを解決できない場合(guild単位のCoreをDMで使おうとした等)、
 * nullを返さずBotError(instanceInvalidMessage)をthrowする。この場合Coreの構築自体が失敗する
 * わけではなく、非同期処理も挟まないため、成功時の戻り値は常にTで確定させられる。
 */
export function createCoreStore<T = DefaultCore>(
  instanceLevel: InstanceLevel,
  factory?: () => T,
  instanceInvalidMessage?: string,
): CoreStore<T> {
  const instances = new Map<string, T>();
  const store: CoreStore<T> = {
    get(interaction) {
      const key = resolveInstanceKey(interaction, instanceLevel);
      return key === null ? null : (instances.get(key) ?? null);
    },
    create(interaction) {
      if (!factory || !instanceInvalidMessage) {
        throw new Error(
          'disbord: createCoreStoreにfactory/instanceInvalidMessageが渡されていません（coreClass.enable時は.disbord/main.tsが自動で渡します）。',
        );
      }
      const key = resolveInstanceKey(interaction, instanceLevel);
      if (key === null) {
        throw new BotError(instanceInvalidMessage);
      }
      const instance = factory();
      instances.set(key, instance);
      return instance;
    },
    remove(interaction) {
      const key = resolveInstanceKey(interaction, instanceLevel);
      if (key !== null) {
        instances.delete(key);
      }
    },
  };
  setCoreStoreState(store as CoreStore<unknown>);
  return store;
}
