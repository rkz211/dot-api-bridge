import {mkdirSync, copyFileSync} from 'node:fs';
mkdirSync('dist/server', {recursive: true});
copyFileSync('worker.mjs', 'dist/server/index.js');
for (const file of ['generic.mjs', 'helpers.mjs', 'services.mjs', 'services.example.mjs']) {
  copyFileSync(file, `dist/server/${file}`);
}
