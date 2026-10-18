// Risco R3 da classificação de processos: o JavaScript publicado (dist/) NUNCA pode conter a calibração,
// as explicações jurídicas do catálogo nem o cálculo do motor. Rodar depois de `bun run build`:
//   node scripts/check-seller-bundle.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'dist', 'assets');
if (!fs.existsSync(dir)) { console.error('dist/assets não existe: rode o build antes.'); process.exit(2); }

const PROIBIDO = {
  'calibração (chaves de chance)': ['ponto_real_nao_pagou', 'forte_sem_ponto_test', 'fraude_com_test'],
  'calibração (faixas e pesos)': ['score_faixas', '_pesos_tese', 'selo_forte'],
  'catálogo jurídico (explicações)': ['Súm.338', 'ônus da empresa', 'o próprio ponto prova'],
  'cálculo do motor': ['devidas de qualquer jeito', 'MOTOR_VERSAO', 'faltaPreencher'],
};
// Sanidade: as perguntas do vendedor estão no bundle (senão o teste não prova nada).
const ESPERADO = ['Como marcava o ponto?', 'Agentes (marque todos'];

const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
const achados = [];
const vistos = new Set();
for (const f of arquivos) {
  const txt = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const [grupo, marcas] of Object.entries(PROIBIDO)) for (const m of marcas) if (txt.includes(m)) achados.push(`${f}: ${grupo} → "${m}"`);
  for (const m of ESPERADO) if (txt.includes(m)) vistos.add(m);
}
const faltando = ESPERADO.filter((m) => !vistos.has(m));
if (faltando.length) { console.error(`Perguntas do vendedor não encontradas no bundle: ${faltando.join(', ')}`); process.exit(1); }
if (achados.length) { console.error(`Bundle do navegador contém dados do motor:\n  ${achados.join('\n  ')}`); process.exit(1); }
console.log(`ok: ${arquivos.length} arquivos JS sem calibração, catálogo jurídico ou cálculo do motor`);
