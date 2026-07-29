export function buildCustomId(key: string, args?: (string | number)[], separator = '-'): string {
  if (!args || args.length === 0) {
    return key;
  }
  return [key, ...args].join(separator);
}

/**
 * customIdからregistrationのkeyとargsを復元する。区切り文字はentry単位の`argsSplitter`を優先し、
 * 未指定ならglobalSplitter、それも未指定ならデフォルトの'-'を使う(entryごとに異なる区切りを
 * 使い得るため、まずkeyで候補を絞ってからそのentryの区切りで判定する)。
 */
export function matchCustomId<T extends { argsSplitter?: string }>(
  customId: string,
  registration: Record<string, T>,
  globalSplitter?: string,
): [string, string[]] | undefined {
  for (const key of Object.keys(registration)) {
    if (customId === key) {
      return [key, []];
    }
    const separator = registration[key]!.argsSplitter ?? globalSplitter ?? '-';
    const prefix = `${key}${separator}`;
    if (customId.startsWith(prefix)) {
      return [key, customId.slice(prefix.length).split(separator)];
    }
  }
  return undefined;
}
