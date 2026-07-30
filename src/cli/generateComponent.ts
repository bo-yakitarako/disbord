import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateButtonsStub, generateSelectMenusStub } from './scaffold';

export type ComponentKind = 'button' | 'selectMenu';

const FILE_NAME_BY_KIND: Record<ComponentKind, string> = {
  button: 'buttons',
  selectMenu: 'selectMenus',
};

export function generateComponentFileContent(kind: ComponentKind): string {
  return kind === 'button' ? generateButtonsStub() : generateSelectMenusStub();
}

export async function runGenerateComponent(kind: ComponentKind, cwd: string): Promise<void> {
  const fileName = FILE_NAME_BY_KIND[kind];
  const targetPath = join(cwd, `src/components/${fileName}.ts`);
  if (existsSync(targetPath)) {
    throw new Error(`disbord: src/components/${fileName}.ts は既に存在します（上書きしません）`);
  }

  mkdirSync(join(cwd, 'src/components'), { recursive: true });
  writeFileSync(targetPath, generateComponentFileContent(kind));

  console.log(`disbord: src/components/${fileName}.ts を生成しました`);
}
