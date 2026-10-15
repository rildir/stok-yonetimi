import * as fs from 'fs';
import * as path from 'path';

/**
 * Location of backend/src/assets/ebelge at run time: next to the webpack bundle (dist/backend/assets),
 * in the source tree (jest, ts-node) or relative to the working directory.
 */
let resolvedRoot: string | null = null;

export function ebelgeAssetsRoot(): string {
  if (resolvedRoot) return resolvedRoot;
  const candidates = [
    path.join(__dirname, 'assets/ebelge'),
    path.join(__dirname, '../../../assets/ebelge'),
    path.join(process.cwd(), 'backend/src/assets/ebelge'),
    path.join(process.cwd(), 'src/assets/ebelge'),
    path.join(process.cwd(), 'dist/backend/assets/ebelge'),
  ];
  const found = candidates.find((c) => fs.existsSync(path.join(c, 'MANIFEST.json')));
  if (!found) throw new Error(`e-Belge assets not found (looked in ${candidates.join(', ')})`);
  resolvedRoot = found;
  return found;
}

export function ebelgeAsset(rel: string): string {
  return path.join(ebelgeAssetsRoot(), rel);
}

export function readEbelgeAsset(rel: string, encoding: BufferEncoding = 'utf8'): string {
  return fs.readFileSync(ebelgeAsset(rel), encoding);
}
