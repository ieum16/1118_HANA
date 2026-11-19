import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const source = new URL('../index.html', import.meta.url);
const output = new URL('../dist/', import.meta.url);
const html = await readFile(source, 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error('페이지 스크립트를 찾을 수 없습니다.');
new Script(script);
await mkdir(output, { recursive: true });
await copyFile(source, new URL('index.html', output));
console.log(`Built ${fileURLToPath(new URL('index.html', output))}`);
