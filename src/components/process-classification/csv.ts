// CSV para Excel em português (pt-BR): separador ";", vírgula decimal, BOM UTF-8 (acentos certos no Excel).
type Valor = string | number | boolean | null | undefined;

const celula = (v: Valor): string => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : typeof v === 'boolean' ? (v ? 'sim' : 'não') : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function gerarCsv(colunas: { chave: string; titulo: string }[], linhas: Record<string, Valor>[]): string {
  const cab = colunas.map((c) => celula(c.titulo)).join(';');
  const corpo = linhas.map((l) => colunas.map((c) => celula(l[c.chave])).join(';'));
  return '﻿' + [cab, ...corpo].join('\r\n') + '\r\n';
}

export function baixarCsv(nome: string, conteudo: string) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
