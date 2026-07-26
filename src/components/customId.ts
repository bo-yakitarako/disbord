export function buildCustomId(key: string, args?: (string | number)[]): string {
  if (!args || args.length === 0) {
    return key;
  }
  return [key, ...args].join('-');
}

export function parseCustomId(customId: string): [string, ...string[]] {
  const [key, ...args] = customId.split('-');
  return [key as string, ...args];
}
