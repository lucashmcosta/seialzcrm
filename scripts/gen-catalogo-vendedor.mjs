// Gera o catálogo reduzido que vai para o navegador do vendedor (risco R3 do plano da classificação).
// O perguntas.ts do motor importa o CATALOGO inteiro (rótulos + explicações jurídicas de cada chance).
// O vendedor só precisa do nome de cada tese e dos rótulos de agentes/situações. O vite.config.ts troca
// o import `./catalogo` do perguntas.ts por este arquivo. Rodar após mudar o motor:
//   node scripts/gen-catalogo-vendedor.mjs
// O teste src/components/process-classification/catalogoVendedor.test.ts falha se ficar desatualizado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cat = JSON.parse(fs.readFileSync(path.join(root, 'packages/motor-classificacao/dados/catalogo.json'), 'utf8'));

export function catalogoVendedor(c) {
  return Object.fromEntries(Object.entries(c).map(([tese, v]) => {
    const out = { nome: v.nome };
    if (v.agentes) out.agentes = Object.fromEntries(Object.entries(v.agentes).map(([k, a]) => [k, { label: a.label, epi: a.epi }]));
    if (v.situacoes) out.situacoes = Object.fromEntries(Object.entries(v.situacoes).map(([k, x]) => [k, { label: x.label }]));
    return [tese, out];
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const body = `// GERADO por scripts/gen-catalogo-vendedor.mjs — não editar.\n` +
    `// Catálogo do vendedor: só nomes e rótulos (sem explicações jurídicas nem números).\n` +
    `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mesmo tipo do CATALOGO do motor\n` +
    `export const CATALOGO: any = ${JSON.stringify(catalogoVendedor(cat), null, 1)};\n`;
  fs.writeFileSync(path.join(root, 'src/components/process-classification/catalogoVendedor.ts'), body);
  console.log('ok');
}
