/* Junta index.html + css + js em um único estudy.html (abre direto no navegador; o chat exige o servidor local).
 * Uso: node tools/build-estudy.js */
const fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let html = read('index.html');
html = html.replace(/<link rel="stylesheet" href="(css\/[\w.-]+\.css)">/g, (_, f) => `<style>\n${read(f)}\n</style>`);
html = html.replace(/<script src="(js\/[\w.-]+\.js)"><\/script>/g, (_, f) => `<script>\n${read(f).replace(/<\/script/gi, '<\\/script')}\n</script>`);
if (/(href|src)="(css|js)\//.test(html)) throw new Error('Sobrou referência externa no HTML.');
fs.writeFileSync(path.join(root, 'estudy.html'), html);
console.log(`estudy.html gerado (${Math.round(html.length / 1024)} KB)`);
