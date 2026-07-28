import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function getDisbordVersion(): string {
  const pkgPath = join(import.meta.dir, '../../package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  return pkg.version;
}
