// Tipos do motor de classificação (Central Trabalhista).
// O motor é puro: não lê tela, não grava nada. Entra a ENTRADA (respostas do vendedor) + a CALIBRAÇÃO (números),
// sai o RESULTADO (por tese e do caso). Roda no servidor; o widget só recebe faixa + comissão.

export type TeseId =
  | 'horas_extras' | 'intrajornada' | 'noturno' | 'insalubridade' | 'periculosidade'
  | 'verbas_rescisorias' | 'fgts' | 'equiparacao' | 'por_fora'
  | 'acidente' | 'doenca' | 'gestante' | 'dano_moral';

export type Saida = 'sem_justa_causa' | 'rescisao_indireta' | 'pedido_demissao' | 'sem_registro' | 'justa_causa';

export type Faixa = 'PRATA' | 'OURO' | 'TITANIO' | 'DIAMANTE';

/** Respostas de uma tese: as chaves são os ids das perguntas (ver perguntas.ts). */
export type RespostasTese = Record<string, string | number | string[] | undefined>;

/** O que o vendedor preenche no assistente. */
export interface Entrada {
  salario: number;             // R$ / mês
  meses: number;               // meses de vínculo
  funcionarios: number;        // nº de funcionários da empresa (corte de 20 → 21+)
  diasSemana: number;          // dias trabalhados por semana
  saida: Saida;
  local: 'interno' | 'externo';
  testemunha: boolean;         // fator GLOBAL: pesa em todas as teses em que o cliente prova fato
  // perguntas que só aparecem conforme a saída
  jcEmpresaTemProva?: boolean;                  // justa causa: advertências/suspensões/prova da falta
  riFalta?: 'doc' | 'verbas' | 'conduta';       // rescisão indireta: principal falta da empresa
  vinculoEmpresaAdmite?: boolean;               // sem registro: empresa admite o trabalho (diz PJ/autônomo)
  vinculoTemProva?: boolean;                    // sem registro: PIX, mensagens, crachá, fotos
  teses: TeseId[];                              // teses marcadas (a ordem não muda o resultado)
  respostas: Partial<Record<TeseId, RespostasTese>>;
  /** Ajuste manual da chance de uma tese (0–100). Só gestor, com motivo registrado. */
  ajusteManual?: Partial<Record<TeseId, number>>;
}

/**
 * Calibração = só números. Mesmo formato do "Exportar calibração" do protótipo (motor v3),
 * então o JSON exportado de lá entra direto aqui. Textos/rótulos ficam no catálogo (versão das regras).
 */
export interface CalibracaoTese {
  probs: Record<string, number>;                         // chances em % (0–100) ou pontos
  valores?: Record<string, number>;                      // valores de referência
  situacoes?: Record<string, { valor: number; prob: number }>;
  agentes?: Record<string, { grau: number; prob: number; prob_epi: number; prob_fora?: number }>;
}
export interface Calibracao {
  _versao: number;            // versão do formato
  _motor?: string;            // versão do motor para a qual foi feita
  _faixas: {
    limites: [number, number, number];             // Prata→Ouro, Ouro→Titânio, Titânio→Diamante (R$)
    comissao: [number, number, number, number];    // R$ por faixa
    peso_tamanho: number;                          // 0–100: peso do tamanho (o resto é solidez) no valor composto
    base_faixa: 'composto' | 'bruto' | 'esperado'; // valor que define a faixa
    score_faixas: { score?: string; mover_faixa: number; pct_comissao: number }[]; // 10 faixas de score
  };
  _pesos_tese: Partial<Record<TeseId, number>>;    // importância relativa da tese no score (padrão 1)
  _geral: { selo_forte: number; selo_media: number; sm: number; reflexo: number };
  [tese: string]: unknown;
}

export type Selo = 'forte' | 'media' | 'fraca';

export type Aviso =
  | '' | 'MARQUE OS AGENTES' | 'MARQUE AS SITUAÇÕES' | 'INFORME A DIFERENÇA'
  | 'SEM PROVA' | 'FORA DA ESTABILIDADE' | 'NÃO SE APLICA' | 'SÓ COM JUSTA CAUSA';

/** Avisos que impedem finalizar a classificação (falta preencher). */
export const AVISOS_BLOQUEANTES: Aviso[] = ['MARQUE OS AGENTES', 'MARQUE AS SITUAÇÕES', 'INFORME A DIFERENÇA'];

export interface ResultadoTese {
  tese: TeseId;
  bruto: number;        // R$ se ganhar tudo
  prob: number;         // 0–1 (já com ajuste manual, se houver)
  probAuto: number;     // 0–1 calculada
  esperado: number;     // bruto × prob
  selo: Selo;
  aviso: Aviso;
  detalhe: string;      // explicação interna (QA/admin) — NUNCA mostrar ao vendedor
  ajusteManual: boolean;
  excluida: boolean;    // insalubridade × periculosidade: fica só a de maior valor (art.193 §2º)
}

export interface ResultadoCaso {
  motor: string;                 // versão do motor
  teses: ResultadoTese[];
  faltaPreencher: { tese: TeseId; aviso: Aviso }[];
  brutoTotal: number;
  esperadoTotal: number;
  solidez: number;               // 0–1 (média das chances ponderada pelo valor e pelo peso da tese)
  score: number;                 // 0–100
  valorComposto: number;
  valorFaixa: number;            // valor usado para a faixa (conforme base_faixa)
  faixaPorValor: Faixa | null;
  ajusteScore: { faixaScore: number; mover: number; pct: number } | null;
  faixa: Faixa | null;           // faixa final (o que o vendedor vê)
  comissao: number;              // R$ (o que o vendedor vê)
  emRevisao: boolean;            // comissão 0 pela tabela de score → vai para revisão do jurídico
}
