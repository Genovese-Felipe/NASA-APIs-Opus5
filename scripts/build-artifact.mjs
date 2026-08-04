import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'index.html');
const target = path.join(root, 'private-artifact.html');
fs.copyFileSync(source, target);
console.log(`Private artifact generated: ${path.relative(root, target)}`);
