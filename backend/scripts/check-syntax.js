// Verifica la sintaxis de todo el JavaScript del backend (CommonJS) y del frontend (modulos ES).
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function collect(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : collect(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const root = path.resolve(__dirname, '..', '..');
const backendFiles = [...collect(path.join(root, 'backend', 'src')), ...collect(path.join(root, 'backend', 'scripts'))];
const frontendFiles = collect(path.join(root, 'frontend', 'js'));
let failed = 0;

for (const file of backendFiles) {
  try { execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' }); }
  catch (error) { failed += 1; console.error(error.stderr.toString()); }
}
for (const file of frontendFiles) {
  // Los archivos del navegador son modulos ES: se comprueban como tales.
  try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(file), stdio: 'pipe' }); }
  catch (error) { failed += 1; console.error(`${file}\n${error.stderr.toString()}`); }
}

console.log(`Sintaxis verificada: ${backendFiles.length + frontendFiles.length} archivos, ${failed} con errores.`);
process.exitCode = failed ? 1 : 0;
