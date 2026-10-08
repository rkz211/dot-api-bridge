import { readFileSync, writeFileSync } from 'node:fs';
const template = readFileSync(new URL('./template.html', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
const client = readFileSync(new URL('./client.js', import.meta.url), 'utf8');
const html = template.replace('/*__STYLES__*/', styles.replaceAll('</style', '<\\/style')).replace('/*__CLIENT__*/', client.replaceAll('</script', '<\\/script'));
const source = '// Generated from template.html, styles.css, and client.js. Run node build.mjs after source edits.\nexport const HTML = ' + JSON.stringify(html) + ';\nexport const html = HTML;\nexport default HTML;\nexport function renderUi({ nonce } = {}) {\n  if (!nonce) return HTML;\n  if (!/^[A-Za-z0-9+/_=-]{8,256}$/.test(nonce)) throw new TypeError("Invalid CSP nonce");\n  return HTML.replace("<style data-bridge-style>", `<style data-bridge-style nonce="${nonce}">`).replace("<script data-bridge-script>", `<script data-bridge-script nonce="${nonce}">`);\n}\n';
writeFileSync(new URL('../ui.mjs', import.meta.url), source);

console.log('Built self-contained ui.mjs (' + Buffer.byteLength(html) + ' bytes HTML)');
