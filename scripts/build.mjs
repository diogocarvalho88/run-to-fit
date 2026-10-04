import { cp, mkdir, rm, copyFile, readFile, writeFile } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/assets', { recursive: true });
await cp('src', 'dist/assets', { recursive: true });
await copyFile('index.html', 'dist/index.html');
await copyFile('favicon.svg', 'dist/favicon.svg');
const modules=await Promise.all(['workout.js','fit.js','app.js'].map(file=>readFile(`src/${file}`,'utf8')));
const code=modules.map(s=>s.replace(/^import .*;\n/gm,'').replace(/^export /gm,'')).join('\n');
const standalone=(await readFile('index.html','utf8'))
  .replace('<link rel="stylesheet" href="./assets/styles.css">',`<style>${await readFile('src/styles.css','utf8')}</style>`)
  .replace('<script type="module" src="./assets/app.js"></script>',`<script>window.addEventListener('DOMContentLoaded',()=>{${code}\n});</script>`);
await writeFile('dist/run-to-fit.html',standalone);
console.log('Static site ready in dist/');
