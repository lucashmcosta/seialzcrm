// Núcleo puro da classificação e da certificação: canonicalizar, calcular com a
// calibração, dizer o que mudou e decidir o que vale.
//
// Mora em _shared porque hoje tem DOIS chamadores e a conta é a mesma dinheiro:
//   - `process-classification` (ação `certify`), quando a certificação é feita
//     pela interface do Seialz;
//   - `nammux-webhook-ingest` (`classification.certified`), quando a entrevista
//     é feita no Nammux.
// Duas cópias dessa conta divergem com o tempo, e aqui divergir significa pagar
// comissão diferente dependendo de qual tela foi usada.

// @ts-types="./motor.d.ts"
import * as Motor from "./motor.mjs";
import { criarCanonicalizador, EntradaInvalida } from "./canonicalizar.ts";

const { canonicalizar } = criarCanonicalizador(Motor);

export interface Calibracao {
  id: string;
  content: Record<string, unknown>;
  motor_version: string;
}

export const major = (v: string) => String(v ?? "").split(".")[0];

/** Erro de cálculo sem HTTP: cada chamador traduz para a resposta dele. */
export class ErroCalculo extends Error {
  constructor(
    public codigo:
      | "motor_incompativel"
      | "entrada_invalida"
      | "falta_preencher",
    public campo?: string,
    public pendencias?: { tese: string; aviso: string }[],
  ) {
    super(codigo);
  }
}

/**
 * Canonicaliza a Entrada (R1), confere a versão do motor (R8), calcula e exige
 * as respostas obrigatórias. Nunca ecoa a entrada no erro.
 */
export function calcularEntrada(entradaBruta: unknown, cal: Calibracao) {
  if (major(cal.motor_version) !== major(Motor.MOTOR_VERSAO)) {
    throw new ErroCalculo("motor_incompativel");
  }
  let entrada: Record<string, unknown>;
  try {
    entrada = canonicalizar(entradaBruta);
  } catch (e) {
    if (e instanceof EntradaInvalida) {
      throw new ErroCalculo("entrada_invalida", e.campo);
    }
    throw e;
  }
  const resultado = Motor.calcularCaso(entrada, cal.content);
  if (resultado.faltaPreencher.length > 0) {
    throw new ErroCalculo(
      "falta_preencher",
      undefined,
      resultado.faltaPreencher.map(
        (f: { tese: string; aviso: string }) => ({
          tese: f.tese,
          aviso: f.aviso,
        }),
      ),
    );
  }
  return { entrada, resultado, motorVersao: Motor.MOTOR_VERSAO as string };
}

/** Caminhos da Entrada que mudaram entre o declarado e o certificado (ex.: "testemunha", "horas_extras.he_dia"). */
export function camposAlterados(
  declarada: Record<string, unknown>,
  certificada: Record<string, unknown>,
): string[] {
  const igual = (x: unknown, y: unknown) =>
    JSON.stringify(x) === JSON.stringify(y);
  const out: string[] = [];
  const topo = new Set(
    [...Object.keys(declarada), ...Object.keys(certificada)].filter((k) =>
      k !== "respostas" && k !== "teses"
    ),
  );
  for (const k of [...topo].sort()) {
    if (!igual(declarada[k], certificada[k])) out.push(k);
  }
  const tA = (declarada.teses ?? []) as string[],
    tB = (certificada.teses ?? []) as string[];
  for (const t of tA) if (!tB.includes(t)) out.push(`-${t}`);
  for (const t of tB) if (!tA.includes(t)) out.push(`+${t}`);
  const rA = (declarada.respostas ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  const rB = (certificada.respostas ?? {}) as Record<
    string,
    Record<string, unknown>
  >;
  for (const t of tB.filter((x) => tA.includes(x))) {
    const ids = new Set([
      ...Object.keys(rA[t] ?? {}),
      ...Object.keys(rB[t] ?? {}),
    ]);
    for (const id of [...ids].sort()) {
      if (!igual(rA[t]?.[id], rB[t]?.[id])) out.push(`${t}.${id}`);
    }
  }
  return out;
}

/** Só para baixo: comissão certificada menor que a original → vale a certificada; senão nada muda. Mesma regra da RPC. */
export function decidirCertificacao(
  original: { faixa: string | null; comissao: number },
  certificada: { faixa: string | null; comissao: number },
) {
  const reduzida = Math.round(certificada.comissao * 100) <
    Math.round(original.comissao * 100);
  return {
    resultado: reduzida ? "reduced" as const : "confirmed" as const,
    final: reduzida ? certificada : original,
  };
}
