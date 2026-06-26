// Mapeia códigos de erro do Twilio/Meta para mensagens legíveis em PT-BR.
// Usado nos balões de mensagens WhatsApp quando whatsapp_status === 'failed'.

export interface WhatsAppErrorInfo {
  short: string;   // texto curto para inline ("Não entregue: ...")
  reason: string;  // explicação completa
  category: 'invalid_number' | 'window' | 'template' | 'rate_limit' | 'unknown';
}

const MAP: Record<string, WhatsAppErrorInfo> = {
  '63051': {
    short: 'Este número não possui WhatsApp ativo.',
    reason: 'Este número não possui WhatsApp ativo.',
    category: 'invalid_number',
  },
  '63049': {
    short: 'Número não encontrado no WhatsApp.',
    reason: 'Número não encontrado no WhatsApp.',
    category: 'invalid_number',
  },
  '63016': {
    short: 'Conversa fora da janela de 24h. Envie um template.',
    reason: 'Conversa fora da janela de 24h. Para reabrir, envie uma mensagem usando um template aprovado.',
    category: 'window',
  },
  '63024': {
    short: 'Parâmetros do template inválidos.',
    reason: 'Parâmetros do template inválidos. Verifique se todas as variáveis foram preenchidas corretamente.',
    category: 'template',
  },
  '21656': {
    short: 'Variáveis do template não correspondem ao modelo.',
    reason: 'As variáveis enviadas não correspondem ao modelo aprovado. Revise o template antes de reenviar.',
    category: 'template',
  },
  '63032': {
    short: 'Limite temporário do canal. Tente novamente depois.',
    reason: 'Limite temporário do canal atingido. Aguarde alguns minutos e tente novamente.',
    category: 'rate_limit',
  },
  '21610': {
    short: 'Contato bloqueou o recebimento de mensagens.',
    reason: 'O contato bloqueou o recebimento de mensagens desta conta.',
    category: 'invalid_number',
  },
  '63018': {
    short: 'Limite de mensagens da conta atingido.',
    reason: 'Limite de mensagens da conta WhatsApp Business foi atingido.',
    category: 'rate_limit',
  },
};

const UNKNOWN: WhatsAppErrorInfo = {
  short: 'Falha no envio. Verifique os detalhes.',
  reason: 'Falha no envio. Verifique os detalhes técnicos abaixo.',
  category: 'unknown',
};

export function getWhatsAppErrorInfo(
  errorCode: string | null | undefined,
): WhatsAppErrorInfo {
  if (!errorCode) return UNKNOWN;
  const key = String(errorCode).trim();
  return MAP[key] ?? UNKNOWN;
}
