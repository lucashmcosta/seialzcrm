// Rótulos e ordem dos blocos de categoria de documento (agrupamento visual — não é fato do domínio).
export const CATEGORY_LABELS: Record<string, string> = {
  IDENTIFICACAO: 'Identificação', ENDERECO: 'Endereço', REPRESENTACAO: 'Representação', TRIAGEM: 'Triagem',
  CONTRATACAO: 'Contratação', FINANCEIRO: 'Financeiro', PARCERIA: 'Parceria', VINCULO: 'Vínculo',
  REMUNERACAO: 'Remuneração', JORNADA: 'Jornada', RESCISAO: 'Rescisão', SAUDE: 'Saúde',
  PREVIDENCIARIO_FISCAL: 'Previdenciário / Fiscal', PARTE_CONTRARIA: 'Parte contrária', VIAGEM: 'Viagem',
  OCORRENCIA_VOO: 'Ocorrência de voo', DANOS_DESPESAS: 'Danos e despesas', ATENDIMENTO: 'Atendimento',
  PROVA: 'Prova', OUTROS: 'Outros',
};

export const CATEGORY_ORDER = Object.keys(CATEGORY_LABELS);
export const categoryLabel = (code: string | null | undefined) => (code && CATEGORY_LABELS[code]) || 'Outros';
