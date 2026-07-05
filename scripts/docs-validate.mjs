#!/usr/bin/env node
// Validação leve da documentação (docs/**/*.md):
//   1. links markdown relativos que apontam para arquivo/pasta inexistente;
//   2. referências em backtick a paths `docs/...` ou `supabase/...` inexistentes.
//
// docs/audit/** é histórico congelado: links quebrados lá viram AVISO, não erro
// (arquivos citados podem ter sido movidos depois do congelamento).
//
// Uso: node scripts/docs-validate.mjs   (ou: npm run docs:validate)
// Exit code 1 se houver erro fora de docs/audit/.

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, normalize, relative } from "node:path";

const ROOT = process.cwd();
const DOCS = join(ROOT, "docs");

const MD_LINK = /\]\(([^)#\s]+?)(?:#[^)]*)?\)/g;
const BACKTICK_PATH = /`((?:docs|supabase|src|scripts)\/[A-Za-z0-9_\-./]+\.(?:md|sql|ts|tsx|toml|json))`/g;

function* mdFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* mdFiles(p);
    else if (entry.name.endsWith(".md")) yield p;
  }
}

const errors = [];
const warnings = [];

for (const file of mdFiles(DOCS)) {
  const rel = relative(ROOT, file);
  const isFrozen = rel.startsWith(join("docs", "audit") + "/");
  const text = readFileSync(file, "utf8");
  const sink = isFrozen ? warnings : errors;

  for (const m of text.matchAll(MD_LINK)) {
    const target = m[1];
    if (/^(https?:|mailto:|wss?:)/.test(target)) continue;
    const resolved = normalize(join(dirname(file), decodeURIComponent(target)));
    if (!existsSync(resolved)) sink.push(`${rel}: link → ${target}`);
  }

  for (const m of text.matchAll(BACKTICK_PATH)) {
    const resolved = join(ROOT, m[1]);
    if (!existsSync(resolved)) sink.push(`${rel}: ref → ${m[1]}`);
  }
}

if (warnings.length) {
  console.log(`⚠ ${warnings.length} aviso(s) em docs/audit/ (congelado, não bloqueia):`);
  for (const w of warnings) console.log(`  ${w}`);
}

if (errors.length) {
  console.error(`✗ ${errors.length} referência(s) quebrada(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

console.log(`✓ docs OK (${warnings.length ? warnings.length + " avisos em audit/" : "sem avisos"})`);
