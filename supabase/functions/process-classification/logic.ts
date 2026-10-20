// Regras puras da edge process-classification (sem I/O; testadas em logic.test.ts).
// O vendedor só recebe faixa + comissão. Nada de chances, valores, score ou calibração sai daqui para ele.

import {
  calcularEntrada,
  type Calibracao,
  ErroCalculo,
} from "../_shared/classificacao/certificar.ts";

// A conta (canonicalizar, calcular, o que mudou, o que vale) mora em
// _shared/classificacao/certificar.ts porque o `nammux-webhook-ingest` faz a
// MESMA conta quando a entrevista acontece no Nammux. Daqui sai só a tradução
// para a resposta HTTP do vendedor.
export { camposAlterados, decidirCertificacao } from "../_shared/classificacao/certificar.ts";
export type { Calibracao };

export const MODULE_KEY = "process_classification";

export type Perms = { ferramentas?: Record<string, boolean>; dados?: { classificacoes?: { ver?: string } } } | null;

export const podeClassificar = (p: Perms) => p?.ferramentas?.classificar === true;
/** Ver o estado de uma oportunidade de outra pessoa: só com "Ver classificações = Todos" (o resto fica na RLS). */
export const podeVerTodas = (p: Perms) => p?.dados?.classificacoes?.ver === "todos";
export const podeLiberar = (p: Perms) => p?.ferramentas?.liberar_correcao === true;

/** O que o navegador do vendedor recebe de uma classificação. Whitelist: nada além disso. */
export interface VisaoVendedor { faixa: string | null; comissao: number; emRevisao: boolean; classificadoEm: string }
export function visaoVendedor(row: { band: string | null; commission: number | string; in_review: boolean; created_at: string }): VisaoVendedor {
  return { faixa: row.band, comissao: Number(row.commission), emRevisao: row.in_review, classificadoEm: row.created_at };
}

export type Estado =
  | "fechada_sem_classificacao" | "fechada_classificada"
  | "sem_classificacao" | "classificada" | "em_revisao" | "pedido_pendente" | "pedido_recusado" | "correcao_liberada";

export interface Pedido { status: "pending" | "released" | "refused"; created_at: string; reason: string | null; replacement_id: string | null }

/** Estado do widget (§5.1) a partir da oportunidade, da classificação ativa e do último pedido de correção. */
export function estadoDoWidget(aberta: boolean, ativa: { in_review: boolean } | null, pedido: Pedido | null): Estado {
  if (!aberta) return ativa ? "fechada_classificada" : "fechada_sem_classificacao";
  if (!ativa) return "sem_classificacao";
  if (pedido?.status === "released" && !pedido.replacement_id) return "correcao_liberada";
  if (pedido?.status === "pending") return "pedido_pendente";
  if (ativa.in_review) return "em_revisao";
  if (pedido?.status === "refused") return "pedido_recusado";
  return "classificada";
}

export class Recusa extends Error {
  constructor(public status: number, public codigo: string, public mensagem: string, public extra?: Record<string, unknown>) {
    super(codigo);
  }
}

/** Erros da RPC pc_record_classification → resposta para o vendedor (textos da SPEC). */
export function recusaDaRpc(msg: string): Recusa {
  const code = /pc:([a-z_]+)/.exec(msg)?.[1] ?? "erro";
  const tabela: Record<string, [number, string]> = {
    opportunity_closed: [409, "A oportunidade foi fechada: não dá mais para classificar."],
    already_classified: [409, "Esta oportunidade já tem uma classificação registrada."],
    not_owner: [403, "Só o responsável pela oportunidade pode classificar."],
    no_contact: [409, "Vincule um contato à oportunidade antes de classificar."],
    daily_limit: [429, "Esta oportunidade já foi classificada o máximo de vezes permitido hoje. Tente amanhã ou fale com o gestor."],
    calibration_changed: [409, "A calibração mudou enquanto você preenchia. Tente finalizar de novo."],
    idempotency_conflict: [409, "Não foi possível finalizar. Recarregue a página e tente de novo."],
    opportunity_not_found: [404, "Oportunidade não encontrada."],
    not_classified: [409, "Esta oportunidade ainda não foi classificada."],
    request_open: [409, "Já existe um pedido de correção em aberto para esta classificação."],
    no_pending_request: [409, "Não há pedido de correção pendente nesta oportunidade."],
    own_request: [403, "Você não pode decidir o seu próprio pedido de correção."],
    reason_required: [422, "Informe o motivo da recusa."],
    not_won: [409, "A certificação só pode ser feita depois que a oportunidade é ganha."],
    already_certified: [409, "Esta classificação já foi certificada. Só o Admin pode refazer."],
    note_required: [422, "Explique o que a entrevista mostrou."],
  };
  const [status, mensagem] = tabela[code] ?? [500, "Não foi possível finalizar a classificação."];
  return new Recusa(status, code, mensagem);
}

/** Núcleo do "Finalizar": delega o cálculo e traduz o erro para o vendedor (sem ecoar a entrada). */
export function calcular(entradaBruta: unknown, cal: Calibracao) {
  try {
    return calcularEntrada(entradaBruta, cal);
  } catch (e) {
    if (!(e instanceof ErroCalculo)) throw e;
    if (e.codigo === "motor_incompativel") {
      throw new Recusa(409, "motor_incompativel", "A calibração publicada não é compatível com esta versão. Fale com o administrador.");
    }
    if (e.codigo === "entrada_invalida") {
      throw new Recusa(422, "entrada_invalida", "Confira as respostas e tente de novo.", { campo: e.campo });
    }
    throw new Recusa(422, "falta_preencher", "Faltam respostas obrigatórias.", { pendencias: e.pendencias });
  }
}

const IDEM = /^[A-Za-z0-9_-]{8,100}$/;
export const chaveValida = (k: unknown): k is string => typeof k === "string" && IDEM.test(k);

// ===== Certificação pós-ganho (Fase 3b) =====
export const podeCertificar = (p: Perms) => p?.ferramentas?.certificar_classificacao === true;

