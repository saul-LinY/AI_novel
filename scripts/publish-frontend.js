import { copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
// Publishing the entry also updates already-running servers without restarting a turn.
await copyFile(new URL('public/ui/index.html', root), new URL('public/index.html', root));
console.log('[AI novel] frontend published to public/index.html');
