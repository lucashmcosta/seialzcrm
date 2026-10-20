export interface VinculoCtps {
  cnpj: string;
  empregador: string | null;
  periodo: string | null;
  atual: boolean;
}

/**
 * Os vínculos da CTPS digital. O texto vem como
 *   "<período> Empregador <NOME> CNPJ RAIZ: … Estabelecimento <NOME> CNPJ: <completo> <endereço>"
 * e é isso que a gente aproveita: nome e período já vêm ao lado do número, e
 * é o que a pessoa precisa para saber qual é o caso.
 */
export function vinculosDaCtps(texto: string, cnpjValido: (c: string) => boolean): VinculoCtps[] {
  const out: VinculoCtps[] = [];
  const vistos = new Set<string>();
  const partes = texto.split(/\bEmpregador\b/g);
  for (let i = 1; i < partes.length; i++) {
    const bruto = partes[i];
    const bloco = bruto.replace(/\s+/g, " ").trim();
    const mCnpj = bloco.match(/CNPJ:\s*(\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2})/);
    if (!mCnpj) continue;
    const cnpj = mCnpj[1].replace(/\D/g, "");
    if (cnpj.length !== 14 || !cnpjValido(cnpj) || vistos.has(cnpj)) continue;
    vistos.add(cnpj);
    const nome = bloco.split(/\s+CNPJ RAIZ/)[0]?.trim() || null;
    // o período fica ANTES da palavra "Empregador", no fim do trecho anterior
    // O último período do trecho anterior. Não pode exigir que esteja no fim:
    // em vínculo com aviso prévio indenizado vem um "Data da projeção …"
    // depois dele. O formato de FAIXA é o que distingue do resto.
    const todos = (partes[i - 1] ?? "").replace(/\s+/g, " ").match(
      /\d{2}\/\d{2}\/\d{4}\s*-\s*(?:\d{2}\/\d{2}\/\d{4}|Aberto)/gi,
    );
    const periodo = todos?.[todos.length - 1]?.trim() ?? null;
    out.push({
      cnpj,
      empregador: nome && nome.length < 120 ? nome : null,
      periodo,
      atual: /aberto/i.test(periodo ?? ""),
    });
  }
  return out;
}
