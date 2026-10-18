// Helpers puros do editor de calibração (Fase 4). A calibração é só números (mesmo formato do "Exportar" do protótipo).
export type Calibracao = Record<string, unknown>;
export type Caminho = (string | number)[];

export function ler(cal: Calibracao | null | undefined, caminho: Caminho): unknown {
  return caminho.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string | number, unknown>)[k]), cal);
}

/** Cópia com o valor trocado no caminho (não muta a original). */
export function gravar(cal: Calibracao, caminho: Caminho, valor: unknown): Calibracao {
  const copia = structuredClone(cal);
  let o = copia as Record<string | number, unknown>;
  for (const k of caminho.slice(0, -1)) o = o[k] as Record<string | number, unknown>;
  o[caminho[caminho.length - 1]] = valor;
  return copia;
}

export const mudou = (publicada: Calibracao | null | undefined, atual: Calibracao, caminho: Caminho) =>
  !!publicada && JSON.stringify(ler(publicada, caminho)) !== JSON.stringify(ler(atual, caminho));

/** Teses na ordem do catálogo (o catálogo vem do servidor). */
export const tesesDoCatalogo = (catalogo: Record<string, { nome: string }>) => Object.keys(catalogo);

/** Arquivo para baixar: o mesmo formato do "Exportar calibração" do protótipo. */
export function arquivoExportacao(cal: Calibracao, numero: number | null) {
  const conteudo = JSON.stringify({ ...cal, _salvo_em: new Date().toISOString() }, null, 2);
  return { nome: `calibracao-${numero ? `v${numero}` : 'rascunho'}.json`, conteudo };
}

/** Baixa o JSON no navegador. */
export function baixar(conteudo: Calibracao, numero: number | null) {
  const { nome, conteudo: texto } = arquivoExportacao(conteudo, numero);
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  URL.revokeObjectURL(url);
}
