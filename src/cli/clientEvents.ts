const CLIENT_EVENTS_INTERFACE = 'ClientEvents';
const ALIAS_PATTERN = /^ClientEvents\['(\w+)'\]$/;

function splitTopLevel(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of text) {
    if (ch === '[' || ch === '<' || ch === '(') depth++;
    else if (ch === ']' || ch === '>' || ch === ')') depth--;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function stripComments(text: string): string {
  return text.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function extractInterfaceBody(source: string, interfaceName: string): string {
  const marker = `interface ${interfaceName} {`;
  const startIdx = source.indexOf(marker);
  if (startIdx === -1) {
    throw new Error(`disbord: discord.jsの型定義から interface ${interfaceName} が見つかりませんでした`);
  }
  let i = startIdx + marker.length;
  let depth = 1;
  const bodyStart = i;
  while (depth > 0) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    i++;
  }
  return source.slice(bodyStart, i - 1);
}

export function parseClientEventsInterface(source: string): Map<string, string> {
  const body = extractInterfaceBody(source, CLIENT_EVENTS_INTERFACE);
  const cleaned = stripComments(body);
  const entries = splitTopLevel(cleaned, ';');
  const members = new Map<string, string>();
  for (const entry of entries) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const name = trimmed.slice(0, colonIdx).trim();
    const type = trimmed.slice(colonIdx + 1).trim();
    members.set(name, type);
  }
  return members;
}

export type EventParam = { name: string; type: string };

export function resolveEventParams(
  eventName: string,
  members: Map<string, string>,
  seen = new Set<string>(),
): EventParam[] {
  const type = members.get(eventName);
  if (type === undefined) {
    throw new Error(`disbord: discord.jsに"${eventName}"というイベントは存在しません`);
  }
  if (seen.has(eventName)) {
    throw new Error(`disbord: "${eventName}"の型解決が循環参照しています`);
  }

  const aliasMatch = type.match(ALIAS_PATTERN);
  if (aliasMatch) {
    return resolveEventParams(aliasMatch[1]!, members, new Set(seen).add(eventName));
  }

  if (!type.startsWith('[') || !type.endsWith(']')) {
    throw new Error(`disbord: "${eventName}"の型定義を解釈できませんでした（想定外の形式: ${type}）`);
  }

  const inner = type.slice(1, -1);
  if (!inner.trim()) return [];

  return splitTopLevel(inner, ',').map((rawElement, index) => {
    const element = rawElement.trim();
    const match = element.match(/^([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*([\s\S]+)$/);
    if (match) {
      return { name: match[1]!, type: match[2]!.trim() };
    }
    return { name: `arg${index}`, type: element };
  });
}

export function collectDiscordJsTypeIdentifiers(paramTypes: string[]): string[] {
  const identifiers = new Set<string>();
  const pattern = /\b[A-Z][A-Za-z0-9_$]*\b/g;
  for (const type of paramTypes) {
    for (const match of type.matchAll(pattern)) {
      identifiers.add(match[0]);
    }
  }
  return [...identifiers];
}

export function isDiscordJsExport(source: string, identifier: string): boolean {
  const declPattern = new RegExp(
    `export\\s+(declare\\s+)?(abstract\\s+)?(class|interface|type|enum)\\s+${identifier}\\b`,
  );
  if (declPattern.test(source)) return true;

  const namedExportBlocks = source.match(/export\s*\{[^}]*\}/g) ?? [];
  const wordBoundary = new RegExp(`\\b${identifier}\\b`);
  return namedExportBlocks.some((block) => wordBoundary.test(block));
}
