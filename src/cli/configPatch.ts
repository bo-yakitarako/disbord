/**
 * disbord.config.tsはbotErrorMessageの動的組み立てやtoken/clientIdの追記など
 * ユーザーが自由に手編集する前提のファイルのため(disbord.d.tsと違い)、`disbord enable`/`disable`
 * では丸ごと再生成せず、coreClass/dbのブロックだけをテキストレベルで挿入・削除する。
 */

const CORE_CLASS_NULL_MESSAGE = 'まだ始まっていません';

/**
 * `className`はここで`disbord.config.ts`自身に埋め込んで永続化する。`.disbord/disbord.d.ts`から
 * 逆算する方式だと`.disbord/`ごと削除された際にクラス名を復元できなくなるため
 * （dev/buildがdisbord.d.tsを都度再生成する際の唯一の情報源にする。dtsRegen.ts参照）。
 */
export function buildCoreClassConfigBlock(className: string): string {
  return `  coreClass: {\n    enable: true,\n    className: '${className}',\n    nullMessage: '${CORE_CLASS_NULL_MESSAGE}',\n  },\n`;
}

export function buildDbConfigBlock(): string {
  return `  db: {\n    enable: true,\n  },\n`;
}

/**
 * `botErrorMessage:`の行の直前にブロックを挿入する(生成テンプレの並び順が常に
 * intents → coreClass → db → botErrorMessageのため、この位置に挿入すれば既存ブロックの
 * 後ろ・botErrorMessageの前に収まる)。
 */
export function insertConfigBlock(source: string, blockText: string): string {
  const match = source.match(/^ *botErrorMessage:/m);
  if (!match || match.index === undefined) {
    throw new Error('disbord: disbord.config.tsにbotErrorMessageが見つかりませんでした');
  }
  return source.slice(0, match.index) + blockText + source.slice(match.index);
}

export function removeConfigBlock(source: string, key: 'coreClass' | 'db'): string {
  const pattern = new RegExp(`^ *${key}: \\{[\\s\\S]*?\\n *\\},\\n`, 'm');
  if (!pattern.test(source)) {
    throw new Error(`disbord: disbord.config.tsに${key}のブロックが見つかりませんでした`);
  }
  return source.replace(pattern, '');
}
