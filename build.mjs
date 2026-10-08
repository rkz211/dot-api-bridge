import './ui/build.mjs';
import {mkdirSync, copyFileSync} from 'node:fs';
mkdirSync('dist/server', {recursive: true});
copyFileSync('worker.mjs', 'dist/server/index.js');
for (const file of ['generic.mjs', 'helpers.mjs', 'writes.mjs', 'services.mjs', 'services.example.mjs','connections.mjs','ui.mjs']) {
  copyFileSync(file, `dist/server/${file}`);
}
