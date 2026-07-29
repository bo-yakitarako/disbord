export const CORE_CLASS_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function promptYesNo(question: string): boolean {
  const answer = prompt(`${question} (y/N)`);
  return (answer ?? '').trim().toLowerCase().startsWith('y');
}

export function promptCoreClassName(defaultName: string): string {
  const answer = prompt(`Coreクラスの名前を入力してください(無記入の場合は「${defaultName}」になります)`);
  const trimmed = (answer ?? '').trim();
  if (trimmed === '') {
    return defaultName;
  }
  if (!CORE_CLASS_NAME_PATTERN.test(trimmed)) {
    throw new Error(
      `disbord: Coreクラスの名前が不正です（"${trimmed}"）。クラス名として使える文字列を指定してください`,
    );
  }
  return trimmed;
}
