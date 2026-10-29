// =============================================================================
// Checks estáticos de CI — Open Defense Fortress
// -----------------------------------------------------------------------------
// Zero-dependency (solo stdlib de Node). Verifica lo que la suite de tests no ve:
//   1. `node --check` de cada archivo JS/MJS del repo (sintaxis).
//   2. Que package.json siga sin dependencias (regla dura del proyecto).
//   3. Que toda referencia local de index.html / privacy.html exista en disco.
//   4. Que los assets referenciados en js/ existan (rutas de string de assets/).
//   5. Que no haya archivos binarios grandes accidentales (> 1 MB sin ser assets
//      declarados) ni artefactos de trabajo trackeados.
//
// Uso:  node .github/scripts/ci-checks.mjs
// Sale con código 1 si algo falla.
// =============================================================================
import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const errors = [];
const notes = [];

// Normaliza SIEMPRE a `/`: en Windows `relative()` devuelve `\` y los
// patrones de abajo usan `/` (rompía el check de binarios y de artefactos).
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // `.codegraph/` es un índice local (gitignored) de la herramienta de
    // análisis: no es un artefacto del repo y puede superar los 2 MB.
    if (entry.name === ".git" || entry.name === "node_modules"
      || entry.name === ".codegraph") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// --- 1. Sintaxis -------------------------------------------------------------
const allFiles = walk(ROOT);
const jsFiles = allFiles.filter((f) => /\.(m?js)$/.test(f));
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    errors.push(`sintaxis: ${rel(file)}\n${err.stderr?.toString() ?? err.message}`);
  }
}
notes.push(`node --check: ${jsFiles.length} archivos`);

// --- 2. Zero-dependency ------------------------------------------------------
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
for (const field of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
  const deps = pkg[field];
  if (deps && Object.keys(deps).length > 0) {
    errors.push(`package.json: "${field}" debe estar vacío (proyecto zero-dependency)`);
  }
}
if (existsSync(join(ROOT, "node_modules"))) {
  errors.push("node_modules/ existe en el repo: no debe estar versionado");
}
notes.push("package.json: sin dependencias");

// --- 3. Referencias locales en el HTML --------------------------------------
for (const html of ["index.html", "privacy.html"]) {
  const path = join(ROOT, html);
  if (!existsSync(path)) {
    errors.push(`falta ${html}`);
    continue;
  }
  const src = readFileSync(path, "utf8");
  const refs = [...src.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(https?:|mailto:|#|data:|\/\/)/i.test(ref)) continue;
    const clean = ref.split("?")[0].split("#")[0];
    if (!clean) continue;
    const target = resolve(ROOT, clean);
    if (!existsSync(target)) errors.push(`${html}: referencia rota -> ${ref}`);
  }
  notes.push(`${html}: ${refs.length} referencias revisadas`);
}

// --- 4. Rutas de assets usadas desde js/ ------------------------------------
const assetRefs = new Set();
for (const file of jsFiles) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/["'`](assets\/[^"'`\n]+)["'`]/g)) assetRefs.add(m[1]);
}
for (const ref of assetRefs) {
  if (!existsSync(join(ROOT, ref))) errors.push(`asset inexistente referenciado en js/: ${ref}`);
}
notes.push(`assets referenciados en js/: ${assetRefs.size}`);

// --- 5. Artefactos y binarios ------------------------------------------------
const banned = [/^node_modules\//, /^\.codegraph\//, /^docs-private\//, /\.log$/, /\.DS_Store$/, /\.env$/];
for (const file of allFiles) {
  const r = rel(file);
  if (banned.some((re) => re.test(r))) errors.push(`archivo que no debe versionarse: ${r}`);
  const size = statSync(file).size;
  if (size > 2 * 1024 * 1024 && !/^assets\//.test(r)) {
    errors.push(`archivo > 2 MB fuera de assets/: ${r} (${(size / 1048576).toFixed(1)} MB)`);
  }
}
notes.push(`${allFiles.length} archivos revisados`);

// --- Resultado ---------------------------------------------------------------
for (const n of notes) console.log(`ok   ${n}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} problema(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("\nTodos los checks estáticos pasaron.");
