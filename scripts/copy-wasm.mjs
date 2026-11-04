// Copies the HiGHS solver binary into public/ so the browser worker can load it from /highs.wasm.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(join(root, 'public'), { recursive: true });
copyFileSync(join(root, 'node_modules/highs/build/highs.wasm'), join(root, 'public/highs.wasm'));
console.log('copied highs.wasm to public/');
