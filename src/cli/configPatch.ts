/**
 * disbord.config.tsはbotErrorMessageの動的組み立てやtoken/clientIdの追記など
 * ユーザーが自由に手編集する前提のファイルのため(disbord.d.tsと違い)、`disbord enable`/`disable`
 * では丸ごと再生成せず、coreClass/dbのブロックだけをテキストレベルで挿入・削除する。
 */

const CORE_CLASS_NULL_MESSAGE = 'まだ始まっていません';
const CORE_CLASS_INSTANCE_INVALID_MESSAGE = 'このコマンドはここでは使えません';

/**
 * `className`はここで`disbord.config.ts`自身に埋め込んで永続化する。`.disbord/disbord.d.ts`から
 * 逆算する方式だと`.disbord/`ごと削除された際にクラス名を復元できなくなるため
 * （dev/buildがdisbord.d.tsを都度再生成する際の唯一の情報源にする。dtsRegen.ts参照）。
 */
export function buildCoreClassConfigBlock(className: string): string {
  return `  coreClass: {\n    enable: true,\n    className: '${className}',\n    nullMessage: '${CORE_CLASS_NULL_MESSAGE}',\n    instanceInvalidMessage: '${CORE_CLASS_INSTANCE_INVALID_MESSAGE}',\n  },\n`;
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

export const DEFAULT_TIMER_CRON = '*-*-* *:00:00';

export function buildTimerConfigBlock(name: string, cron: string = DEFAULT_TIMER_CRON): string {
  return `  timer: {\n    ${name}: '${cron}',\n  },\n`;
}

/**
 * coreClass/dbと違いtimerは複数のonceスクリプト名をキーに持つ1つのオブジェクトのため、
 * 既存ブロックがあれば末尾にキーを追記し、無ければ新規ブロックとして挿入する
 * (`disbord generate once <name>`のたびに呼ばれる。1回目はブロック新設、2回目以降は追記になる)。
 */
export function addTimerEntry(source: string, name: string, cron: string = DEFAULT_TIMER_CRON): string {
  const blockPattern = /^ *timer: \{([\s\S]*?)\n( *)\},\n/m;
  const match = blockPattern.exec(source);
  if (!match || match.index === undefined) {
    return insertConfigBlock(source, buildTimerConfigBlock(name, cron));
  }

  const body = match[1] ?? '';
  const indent = match[2] ?? '  ';
  if (new RegExp(`^ *${name}: `, 'm').test(body)) {
    throw new Error(`disbord: disbord.config.tsのtimerに${name}は既に存在します`);
  }

  const newBlock = `  timer: {${body}\n    ${name}: '${cron}',\n${indent}},\n`;
  return source.slice(0, match.index) + newBlock + source.slice(match.index + match[0].length);
}
