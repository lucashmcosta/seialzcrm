// Catálogo de erros de envio WhatsApp (Meta Cloud API + Twilio) → PT-BR.
// Usado nos balões de mensagem quando whatsapp_status === 'failed'.
// Cada entrada: short (inline curto), reason (explicação), action (o que fazer).

export type WhatsAppErrorCategory =
  | 'invalid_number'
  | 'window'
  | 'template'
  | 'rate_limit'
  | 'quality'
  | 'account'
  | 'media'
  | 'technical'
  | 'unknown';

export interface WhatsAppErrorInfo {
  short: string;   // inline ("Não entregue: ...")
  reason: string;  // explicação completa
  action?: string; // o que o operador deve fazer
  category: WhatsAppErrorCategory;
}

const MAP: Record<string, WhatsAppErrorInfo> = {
  // ============ META CLOUD API — entrega / número ============
  '131026': {
    short: 'O número não recebeu a mensagem.',
    reason: 'A Meta não conseguiu entregar. Em geral: o número não tem WhatsApp, o cliente não aceitou os termos do WhatsApp, o número é muito novo, ou o aparelho não pôde receber no momento.',
    action: 'Confirme se o número tem WhatsApp ativo. Pode ser um número inválido ou digitado errado.',
    category: 'invalid_number',
  },
  '131021': {
    short: 'Não é possível enviar para este número.',
    reason: 'O número de destino é inválido para envio (ex.: igual ao número de origem).',
    action: 'Verifique o número do contato.',
    category: 'invalid_number',
  },
  '131051': {
    short: 'Tipo de mensagem não suportado.',
    reason: 'O tipo de conteúdo enviado não é suportado pelo WhatsApp.',
    category: 'technical',
  },
  '131052': {
    short: 'Falha ao baixar a mídia.',
    reason: 'A Meta não conseguiu baixar a mídia recebida/enviada.',
    action: 'Tente reenviar o arquivo.',
    category: 'media',
  },
  '131053': {
    short: 'Falha ao enviar a mídia.',
    reason: 'A Meta não conseguiu processar a mídia (formato/tamanho).',
    action: 'Verifique o formato e o tamanho do arquivo e reenvie.',
    category: 'media',
  },
  '131056': {
    short: 'Muitas mensagens para este contato em pouco tempo.',
    reason: 'Limite de frequência entre a sua conta e este número específico.',
    action: 'Aguarde antes de reenviar para o mesmo contato.',
    category: 'rate_limit',
  },

  // ============ META CLOUD API — janela / política / qualidade ============
  '131047': {
    short: 'Fora da janela de 24h — envie um template.',
    reason: 'Passou mais de 24h desde a última mensagem do cliente. Só dá para reabrir a conversa com um template aprovado.',
    action: 'Envie um template aprovado para reabrir a conversa.',
    category: 'window',
  },
  '131048': {
    short: 'Limite de qualidade/spam da conta atingido.',
    reason: 'A Meta está limitando os envios desta conta por sinais de qualidade (bloqueios/denúncias).',
    action: 'Reduza o volume, evite conteúdo promocional e aguarde a qualidade recuperar.',
    category: 'quality',
  },
  '131049': {
    short: 'Não entregue para proteger o ecossistema.',
    reason: 'A Meta bloqueou este envio por frequência de mensagens (geralmente marketing) para este usuário.',
    action: 'Evite reenviar; priorize quem respondeu recentemente.',
    category: 'quality',
  },
  '130472': {
    short: 'Usuário com limite de marketing.',
    reason: 'O número do cliente está em um experimento da Meta que limita mensagens de marketing.',
    action: 'Evite marketing para este número; mensagens de utilidade/atendimento costumam passar.',
    category: 'quality',
  },
  '130429': {
    short: 'Limite de velocidade de envio atingido.',
    reason: 'Muitas mensagens em pouco tempo (throughput do Cloud API).',
    action: 'Envie mais devagar e tente novamente em instantes.',
    category: 'rate_limit',
  },
  '368': {
    short: 'Conta temporariamente bloqueada por política.',
    reason: 'A conta foi restringida temporariamente por violação das políticas do WhatsApp/Meta.',
    action: 'Revise as políticas do WhatsApp e aguarde o desbloqueio. Não force novos envios.',
    category: 'account',
  },

  // ============ META CLOUD API — template ============
  '132000': {
    short: 'Número de variáveis do template não confere.',
    reason: 'O template espera uma quantidade de variáveis diferente da enviada.',
    action: 'Confira se todas as variáveis ({{1}}, {{2}}…) foram preenchidas corretamente.',
    category: 'template',
  },
  '132001': {
    short: 'Template não existe nesta conta.',
    reason: 'O template não existe (ou não está aprovado) nesta conta WhatsApp (WABA) ou neste idioma. Comum depois de trocar de número/WABA.',
    action: 'Recrie e aprove o template na conta atual, ou escolha um template da conta certa.',
    category: 'template',
  },
  '132005': {
    short: 'Texto do template ficou longo demais.',
    reason: 'Depois de preencher as variáveis, o texto passou do limite permitido.',
    action: 'Use variáveis mais curtas.',
    category: 'template',
  },
  '132007': {
    short: 'Conteúdo do template viola a política de formatação.',
    reason: 'O conteúdo (caracteres/formatação) não é permitido pela Meta.',
    category: 'template',
  },
  '132012': {
    short: 'Formato de variável do template inválido.',
    reason: 'O valor enviado em uma variável não está no formato esperado.',
    action: 'Revise os valores das variáveis.',
    category: 'template',
  },
  '132015': {
    short: 'Template pausado por baixa qualidade.',
    reason: 'A Meta pausou este template por baixa qualidade.',
    action: 'Aguarde a reativação ou use outro template.',
    category: 'template',
  },
  '132016': {
    short: 'Template desativado por baixa qualidade.',
    reason: 'A Meta desativou este template permanentemente por baixa qualidade.',
    action: 'Use outro template.',
    category: 'template',
  },

  // ============ META CLOUD API — conta / registro / técnico ============
  '100': {
    short: 'Falha técnica no envio.',
    reason: 'O número de origem pode ter sido desconectado/removido da conta, ou o pedido foi malformado.',
    action: 'Confirme se o número de envio está conectado. Se persistir, fale com o suporte.',
    category: 'technical',
  },
  '190': {
    short: 'Credencial da integração expirada.',
    reason: 'O token de acesso da integração Meta expirou ou foi revogado.',
    action: 'Reconecte a integração Meta em Configurações.',
    category: 'account',
  },
  '131031': {
    short: 'Conta WhatsApp bloqueada/restrita.',
    reason: 'A conta WhatsApp Business foi bloqueada ou restringida pela Meta.',
    action: 'Verifique o status da conta no WhatsApp Manager.',
    category: 'account',
  },
  '131042': {
    short: 'Problema de cobrança/elegibilidade da conta.',
    reason: 'Há um problema de pagamento ou elegibilidade que impede o envio.',
    action: 'Verifique o método de pagamento no Business Manager.',
    category: 'account',
  },
  '131045': {
    short: 'Erro de registro do número.',
    reason: 'O número não está corretamente registrado/certificado.',
    action: 'Re-registre o número no WhatsApp Manager.',
    category: 'account',
  },
  '133006': {
    short: 'O número precisa ser re-registrado.',
    reason: 'O número de origem precisa ser registrado novamente no Cloud API.',
    action: 'Reconecte/registre o número.',
    category: 'account',
  },
  '133010': {
    short: 'Número de origem não registrado.',
    reason: 'O número de envio não está registrado no WhatsApp Cloud API (pode ter sido desconectado).',
    action: 'Reconecte/registre o número de envio.',
    category: 'account',
  },
  '133015': {
    short: 'Número em processo de desregistro.',
    reason: 'O número está sendo removido/registrado novamente.',
    action: 'Aguarde a conclusão do registro.',
    category: 'account',
  },
  '131000': {
    short: 'Erro temporário da Meta.',
    reason: 'Algo deu errado no servidor da Meta.',
    action: 'Tente reenviar em instantes.',
    category: 'technical',
  },
  '131016': {
    short: 'Serviço da Meta indisponível no momento.',
    reason: 'O serviço da Meta está temporariamente indisponível.',
    action: 'Tente novamente em alguns minutos.',
    category: 'technical',
  },
  '133004': {
    short: 'Servidor da Meta indisponível.',
    reason: 'O servidor da Meta está temporariamente fora do ar.',
    action: 'Tente novamente em instantes.',
    category: 'technical',
  },

  // ============ TWILIO (63xxx / 21xxx) ============
  '63051': { short: 'Este número não possui WhatsApp ativo.', reason: 'Este número não possui WhatsApp ativo.', action: 'Verifique o número do contato.', category: 'invalid_number' },
  '63049': { short: 'Número não encontrado no WhatsApp.', reason: 'Número não encontrado no WhatsApp.', action: 'Verifique o número do contato.', category: 'invalid_number' },
  '63016': { short: 'Conversa fora da janela de 24h — envie um template.', reason: 'Fora da janela de 24h. Para reabrir, envie um template aprovado.', action: 'Envie um template aprovado.', category: 'window' },
  '63021': { short: 'Mensagem livre fora da janela de 24h.', reason: 'Não é possível enviar mensagem livre fora da janela de 24h.', action: 'Use um template aprovado.', category: 'window' },
  '63024': { short: 'Parâmetros do template inválidos.', reason: 'Parâmetros do template inválidos. Confira se todas as variáveis foram preenchidas.', action: 'Revise as variáveis do template.', category: 'template' },
  '21656': { short: 'Variáveis do template não correspondem ao modelo.', reason: 'As variáveis enviadas não correspondem ao modelo aprovado.', action: 'Revise o template antes de reenviar.', category: 'template' },
  '63032': { short: 'Limite temporário do canal.', reason: 'Limite temporário do canal atingido.', action: 'Aguarde alguns minutos e tente novamente.', category: 'rate_limit' },
  '63018': { short: 'Limite de mensagens da conta atingido.', reason: 'Limite de mensagens da conta WhatsApp Business foi atingido.', action: 'Aguarde e reduza o volume.', category: 'rate_limit' },
  '21610': { short: 'Contato bloqueou o recebimento.', reason: 'O contato bloqueou o recebimento de mensagens desta conta.', category: 'invalid_number' },
  '21211': { short: 'Número de telefone inválido.', reason: 'O número informado é inválido.', action: 'Corrija o número do contato.', category: 'invalid_number' },
  '63003': { short: 'Canal WhatsApp não encontrado.', reason: 'O canal WhatsApp de origem não foi encontrado.', category: 'technical' },
  '63005': { short: 'Mensagem não pôde ser entregue.', reason: 'O WhatsApp não conseguiu entregar a mensagem.', action: 'Confirme o número e a janela de conversa.', category: 'invalid_number' },
  '63007': { short: 'Número de origem WhatsApp não encontrado.', reason: 'Não há um número WhatsApp de origem válido configurado.', action: 'Verifique a configuração do número de envio.', category: 'technical' },
  '63013': { short: 'Mensagem bloqueada por política do WhatsApp.', reason: 'O conteúdo foi bloqueado pelas políticas do WhatsApp.', action: 'Revise o conteúdo da mensagem/template.', category: 'account' },
};

// Fallback por família de código quando não há entrada exata.
function familyFallback(code: string): WhatsAppErrorInfo | null {
  if (/^132/.test(code)) {
    return { short: 'Problema com o template.', reason: 'A Meta recusou o template (formato, variáveis, idioma ou status).', action: 'Revise/recrie o template na conta correta.', category: 'template' };
  }
  if (/^133/.test(code)) {
    return { short: 'Problema de registro do número.', reason: 'O número de envio tem um problema de registro na conta WhatsApp.', action: 'Reconecte/registre o número.', category: 'account' };
  }
  if (/^131/.test(code)) {
    return { short: 'Mensagem não entregue.', reason: 'A Meta não entregou a mensagem (número, janela de 24h ou qualidade).', action: 'Confirme o número; se a janela estiver fechada, use um template.', category: 'invalid_number' };
  }
  if (/^63/.test(code)) {
    return { short: 'Falha no envio pelo WhatsApp (Twilio).', reason: 'O provedor não conseguiu enviar a mensagem.', action: 'Confirme o número e a janela de conversa.', category: 'technical' };
  }
  return null;
}

const UNKNOWN: WhatsAppErrorInfo = {
  short: 'Falha no envio.',
  reason: 'Não foi possível enviar a mensagem. Veja os detalhes técnicos abaixo.',
  category: 'unknown',
};

export function getWhatsAppErrorInfo(
  errorCode: string | null | undefined,
): WhatsAppErrorInfo {
  if (!errorCode) return UNKNOWN;
  const key = String(errorCode).trim();
  return MAP[key] ?? familyFallback(key) ?? UNKNOWN;
}
