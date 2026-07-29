import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `execute`の第2引数(core)をButtonRegistration/SelectMenuRegistrationのentryへ
 * 挿入/除去する。`disbord enable/disable core-class`のたびに、既存の
 * `src/components/{buttons,selectMenus}.ts`を書き換えて引数のズレを防ぐために使う。
 *
 * TypeScript 7系の`typescript`パッケージはコンパイラAPI(`ts.createSourceFile`/`ts.factory`等)を
 * 一切exportしなくなっている(実機確認済み: `require('typescript')`は`{ version, versionMajorMinor }`
 * の2キーのみを持つ。disbord.md「TypeScript」節の「v7のtscは既にネイティブ実装への薄いシムになっている」
 * という話がJS API自体にも及んでいる)。そのため本格的なAST変換ではなく、括弧の対応だけを追跡する
 * 軽量スキャナで実装している。
 */
export type CoreParamRewrite = { mode: 'insert'; paramName: string } | { mode: 'remove' };

type ParamSpan = { end: number; text: string };

function isQuoteChar(ch: string): boolean {
  return ch === '"' || ch === "'" || ch === '`';
}

function isOpenBracket(ch: string): boolean {
  return ch === '(' || ch === '[' || ch === '{';
}

function isCloseBracket(ch: string): boolean {
  return ch === ')' || ch === ']' || ch === '}';
}

/** 開始引用符の位置から、対応する終端引用符の次の位置を返す(バックスラッシュエスケープを1文字読み飛ばす)。 */
function skipStringLiteral(source: string, quoteStart: number): number {
  const quote = source.charAt(quoteStart);
  let i = quoteStart + 1;
  while (i < source.length && source.charAt(i) !== quote) {
    i += source.charAt(i) === '\\' ? 2 : 1;
  }
  return i + 1;
}

/**
 * `(`の次の位置から走査し、トップレベル(括弧の深さ0)のカンマ区切りでパラメータを分割する。
 * 文字列・テンプレートリテラルの中身、`()`/`[]`/`{}`の中のカンマは無視する
 * (`<>`のジェネリクスは対象パラメータリスト（interaction/core/...args程度の単純な型注釈のみ想定）
 * では現れない前提で追跡しない)。
 */
function scanTopLevelParams(source: string, openParenIndex: number): ParamSpan[] {
  const params: ParamSpan[] = [];
  let depth = 0;
  let paramStart = openParenIndex + 1;
  let i = paramStart;
  const len = source.length;

  const pushParam = (end: number): void => {
    const text = source.slice(paramStart, end);
    if (text.trim() !== '') {
      params.push({ end, text });
    }
  };

  while (i < len) {
    const ch = source.charAt(i);
    if (isQuoteChar(ch)) {
      i = skipStringLiteral(source, i);
      continue;
    }
    if (isOpenBracket(ch)) {
      depth++;
      i++;
      continue;
    }
    if (ch === ')' && depth === 0) {
      pushParam(i);
      return params;
    }
    if (isCloseBracket(ch)) {
      depth--;
      i++;
      continue;
    }
    if (ch === ',' && depth === 0) {
      pushParam(i);
      paramStart = i + 1;
      i++;
      continue;
    }
    i++;
  }
  throw new Error('disbord: executeのパラメータリストの閉じ括弧が見つかりませんでした');
}

/**
 * `execute`という識別子の出現ごとに、それがプロパティ形式(`execute: async (...) => `等)か
 * メソッド省略記法(`async execute(...) `等)かを判定し、パラメータリストの開き括弧の位置を返す。
 * どちらの形にも当てはまらない場合(外部関数を直接参照している等)はスキップする
 * (安全側に倒し、書き換えずそのまま残す)。
 */
function findExecuteParamListStarts(source: string): number[] {
  const starts: number[] = [];
  const tokenRegex = /\bexecute\b/g;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(source)) !== null) {
    let j = match.index + 'execute'.length;
    const skipWs = (): void => {
      while (j < source.length && /\s/.test(source.charAt(j))) j++;
    };
    skipWs();

    if (source.charAt(j) === ':') {
      // execute: async (...) => {} / execute: function(...) {} / execute: async function*(...) {}
      j++;
      skipWs();
      for (const keyword of ['async', 'function']) {
        if (source.startsWith(keyword, j) && !/[A-Za-z0-9_$]/.test(source.charAt(j + keyword.length))) {
          j += keyword.length;
          skipWs();
        }
      }
      if (source.charAt(j) === '*') {
        j++;
        skipWs();
      }
      if (source.charAt(j) === '(') {
        starts.push(j);
      }
      continue;
    }

    // メソッド省略記法: execute(...) / async execute(...)（`(`直前の空白は上のskipWs()で吸収済み）
    if (source.charAt(j) === '(') {
      starts.push(j);
    }
  }

  return starts;
}

/**
 * `mode: 'insert'`は`execute`の第1引数(interaction)の直後にcoreパラメータを挿入する
 * (第1引数が`...`始まりのrestの場合は元々interaction自体を宣言していない異常系なのでスキップする)。
 * `mode: 'remove'`は第2引数(core相当。名前は問わず位置だけで判定する)を除去する
 * (第2引数が無い、または第2引数自体が`...`始まりのrest(=coreを元々使っていない)場合はスキップする)。
 */
export function rewriteExecuteCoreParam(source: string, rewrite: CoreParamRewrite): string {
  const edits: { start: number; end: number; text: string }[] = [];

  for (const openParenIndex of findExecuteParamListStarts(source)) {
    const params = scanTopLevelParams(source, openParenIndex);

    if (rewrite.mode === 'insert') {
      const first = params[0];
      if (first === undefined || first.text.trim().startsWith('...')) continue;
      edits.push({ start: first.end, end: first.end, text: `, ${rewrite.paramName}` });
    } else {
      const first = params[0];
      const second = params[1];
      if (first === undefined || second === undefined || second.text.trim().startsWith('...')) continue;
      edits.push({ start: first.end, end: second.end, text: '' });
    }
  }

  edits.sort((a, b) => b.start - a.start);
  let result = source;
  for (const edit of edits) {
    result = result.slice(0, edit.start) + edit.text + result.slice(edit.end);
  }
  return result;
}

export function toCamelCase(className: string): string {
  if (className === '') return className;
  return className.charAt(0).toLowerCase() + className.slice(1);
}

const COMPONENT_FILES = ['src/components/buttons.ts', 'src/components/selectMenus.ts'];

/**
 * `disbord enable/disable core-class`から呼ぶ。存在するcomponentファイルだけを対象に、
 * 書き換えが実際に発生した場合のみ書き戻す(差分がなければファイルのmtimeも変えない)。
 */
export function applyCoreParamRewrite(cwd: string, rewrite: CoreParamRewrite): void {
  for (const relativePath of COMPONENT_FILES) {
    const filePath = join(cwd, relativePath);
    if (!existsSync(filePath)) continue;

    const source = readFileSync(filePath, 'utf-8');
    const rewritten = rewriteExecuteCoreParam(source, rewrite);
    if (rewritten !== source) {
      writeFileSync(filePath, rewritten);
    }
  }
}
