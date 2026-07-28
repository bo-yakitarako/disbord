import { mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ModelClass } from '../db/decorators';

export type ScannedModel = { fileName: string; exportName: string; modelClass: ModelClass };

function isModelClass(value: unknown): value is ModelClass {
  return typeof value === 'function' && typeof (value as { _tableName?: unknown })._tableName === 'string';
}

export async function scanModelFiles(modelsDir: string): Promise<ScannedModel[]> {
  mkdirSync(modelsDir, { recursive: true });

  const fileNames = readdirSync(modelsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => entry.name.slice(0, -'.ts'.length))
    .sort();

  const models: ScannedModel[] = [];
  for (const fileName of fileNames) {
    const module: Record<string, unknown> = await import(pathToFileURL(join(modelsDir, `${fileName}.ts`)).href);
    for (const [exportName, value] of Object.entries(module)) {
      if (isModelClass(value)) {
        models.push({ fileName, exportName, modelClass: value });
      }
    }
  }
  return models;
}
