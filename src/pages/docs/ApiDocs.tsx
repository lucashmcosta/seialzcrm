import { useState } from "react";
import { CaretDown, CaretRight, Copy, Check, Lock, Key, Globe, ArrowLeft, ArrowSquareOut } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import seialzLogo from "@/assets/seialz-logo-green.png";

// ─── Types ───────────────────────────────────────────────────────
type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface Param {
  name: string;
  type: string;
  required?: boolean;
  description: string;
}

interface Endpoint {
  method: HttpMethod;
  path: string;
  summary: string;
  description: string;
  auth: "x-api-key" | "Bearer" | "none";
  scopes?: string[];
  queryParams?: Param[];
  bodyParams?: Param[];
  headers?: Param[];
  requestExample?: string;
  responseExample?: string;
  curlExample?: string;
}

interface EndpointGroup {
  title: string;
  description: string;
  baseUrl: string;
  endpoints: Endpoint[];
}

// ─── Data ────────────────────────────────────────────────────────

const SUPABASE_URL = "https://<your-project>.supabase.co";

const API_GROUPS: EndpointGroup[] = [
  {
    title: "Lead Webhook (API Pública)",
    description: "API pública para integração de leads. Use sua chave de API (x-api-key) gerada em Configurações > API & Webhooks. Suporta leitura de contatos, oportunidades e atividades, além de criação de leads.",
    baseUrl: `${SUPABASE_URL}/functions/v1`,
    endpoints: [
      {
        method: "GET",
        path: "/lead-webhook",
        summary: "Listar entidades",
        description: "Retorna contatos, oportunidades ou atividades da organização. Paginação via limit/offset.",
        auth: "x-api-key",
        scopes: ["contacts:read", "opportunities:read", "activities:read"],
        queryParams: [
          { name: "entity", type: "string", description: "Tipo de entidade: contacts | opportunities | activities", required: true },
          { name: "limit", type: "number", description: "Máximo de resultados (padrão: 50, máx: 100)" },
          { name: "offset", type: "number", description: "Offset para paginação (padrão: 0)" },
        ],
        headers: [
          { name: "x-api-key", type: "string", required: true, description: "Chave de API da organização" },
        ],
        curlExample: `curl -X GET \\
  "${SUPABASE_URL}/functions/v1/lead-webhook?entity=contacts&limit=10" \\
  -H "x-api-key: sua-chave-aqui"`,
        responseExample: JSON.stringify({
          data: [
            { id: "uuid", full_name: "João Silva", email: "joao@email.com", phone: "+5511999999999", source: "website", created_at: "2025-01-15T10:00:00Z" },
          ],
          total: 42,
          limit: 10,
          offset: 0,
        }, null, 2),
      },
      {
        method: "POST",
        path: "/lead-webhook",
        summary: "Criar lead/contato",
        description: "Cria um novo contato na organização. Suporta mapeamento de campos customizados, normalização de telefone para E.164, e criação automática de oportunidades. Detecção de duplicatas por e-mail ou telefone.",
        auth: "x-api-key",
        scopes: ["contacts:write"],
        headers: [
          { name: "x-api-key", type: "string", required: true, description: "Chave de API da organização" },
          { name: "Content-Type", type: "string", required: true, description: "application/json" },
        ],
        bodyParams: [
          { name: "name", type: "string", required: true, description: "Nome completo do contato" },
          { name: "email", type: "string", description: "E-mail do contato" },
          { name: "phone", type: "string", description: "Telefone (normalizado automaticamente para E.164)" },
          { name: "company", type: "string", description: "Nome da empresa" },
          { name: "source", type: "string", description: 'Origem do lead (ex: "website", "facebook")' },
          { name: "utm_source", type: "string", description: "UTM source" },
          { name: "utm_medium", type: "string", description: "UTM medium" },
          { name: "utm_campaign", type: "string", description: "UTM campaign" },
          { name: "notes", type: "string", description: "Notas adicionais (criadas como atividade)" },
          { name: "create_opportunity", type: "boolean", description: "Se true, cria oportunidade automaticamente" },
          { name: "opportunity_title", type: "string", description: "Título da oportunidade (se create_opportunity=true)" },
          { name: "opportunity_value", type: "number", description: "Valor da oportunidade em centavos" },
        ],
        curlExample: `curl -X POST \\
  "${SUPABASE_URL}/functions/v1/lead-webhook" \\
  -H "x-api-key: sua-chave-aqui" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "João Silva",
    "email": "joao@email.com",
    "phone": "11999999999",
    "company": "ACME",
    "source": "website",
    "create_opportunity": true,
    "opportunity_title": "Contrato ACME",
    "opportunity_value": 15000
  }'`,
        responseExample: JSON.stringify({
          success: true,
          contact_id: "uuid-do-contato",
          opportunity_id: "uuid-da-oportunidade",
          message: "Lead created successfully",
        }, null, 2),
      },
    ],
  },
  {
    title: "WhatsApp Templates (Backend)",
    description: "Gerenciamento de templates do WhatsApp Business API. Requer autenticação via Bearer token (JWT do Supabase).",
    baseUrl: `${SUPABASE_URL}/functions/v1`,
    endpoints: [
      {
        method: "POST",
        path: "/twilio-whatsapp-templates",
        summary: "Gerenciar templates WhatsApp",
        description: "Endpoint unificado para listar, criar, atualizar e sincronizar templates do WhatsApp via Twilio. A ação é definida pelo campo 'action' no body.",
        auth: "Bearer",
        bodyParams: [
          { name: "action", type: "string", required: true, description: "Ação: list | create | update | delete | sync" },
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
          { name: "template_name", type: "string", description: "Nome do template (para create/update)" },
          { name: "template_body", type: "string", description: "Corpo do template com variáveis {{1}}, {{2}}, etc." },
          { name: "template_id", type: "string", description: "ID do template (para update/delete)" },
          { name: "language", type: "string", description: 'Código do idioma (padrão: "pt_BR")' },
        ],
        curlExample: `curl -X POST \\
  "${SUPABASE_URL}/functions/v1/twilio-whatsapp-templates" \\
  -H "Authorization: Bearer <jwt-token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "action": "list",
    "organization_id": "uuid-da-org"
  }'`,
        responseExample: JSON.stringify({
          templates: [
            { sid: "HX...", friendly_name: "welcome_message", body: "Olá {{1}}, bem-vindo!", status: "approved" },
          ],
        }, null, 2),
      },
      {
        method: "POST",
        path: "/twilio-whatsapp-send",
        summary: "Enviar mensagem WhatsApp",
        description: "Envia uma mensagem WhatsApp para um contato usando um template aprovado ou mensagem livre (dentro da janela de 24h).",
        auth: "Bearer",
        bodyParams: [
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
          { name: "to", type: "string", required: true, description: "Número do destinatário (E.164)" },
          { name: "body", type: "string", description: "Texto da mensagem (mensagem livre)" },
          { name: "template_sid", type: "string", description: "SID do template Twilio" },
          { name: "template_variables", type: "object", description: "Variáveis do template {1: 'valor1', 2: 'valor2'}" },
          { name: "media_url", type: "string", description: "URL de mídia para enviar (imagem, documento)" },
          { name: "thread_id", type: "string", description: "ID do thread de conversa" },
          { name: "contact_id", type: "string", description: "ID do contato" },
        ],
        curlExample: `curl -X POST \\
  "${SUPABASE_URL}/functions/v1/twilio-whatsapp-send" \\
  -H "Authorization: Bearer <jwt-token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "organization_id": "uuid",
    "to": "+5511999999999",
    "body": "Olá, tudo bem?"
  }'`,
        responseExample: JSON.stringify({
          success: true,
          message_sid: "SM...",
        }, null, 2),
      },
    ],
  },
  {
    title: "Edge Functions (Internas)",
    description: "Funções serverless internas do Supabase. Requerem autenticação via Bearer token (JWT do Supabase Auth).",
    baseUrl: `${SUPABASE_URL}/functions/v1`,
    endpoints: [
      {
        method: "POST",
        path: "/ai-generate",
        summary: "Gerar conteúdo com IA",
        description: "Gera conteúdo usando modelos de IA (OpenAI GPT). Usado internamente para sugestões, resumos e geração de texto.",
        auth: "Bearer",
        bodyParams: [
          { name: "prompt", type: "string", required: true, description: "Prompt para o modelo de IA" },
          { name: "type", type: "string", description: 'Tipo de geração: "suggestion", "summary", "email", "note"' },
          { name: "context", type: "object", description: "Contexto adicional (contato, oportunidade, etc.)" },
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
        ],
        curlExample: `curl -X POST \\
  "${SUPABASE_URL}/functions/v1/ai-generate" \\
  -H "Authorization: Bearer <jwt-token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "Gere um e-mail de follow-up",
    "type": "email",
    "organization_id": "uuid"
  }'`,
        responseExample: JSON.stringify({
          content: "Olá João, gostaria de dar continuidade à nossa conversa...",
          tokens_used: 150,
        }, null, 2),
      },
      {
        method: "POST",
        path: "/ai-agent-respond",
        summary: "Resposta do Agente IA",
        description: "Gera uma resposta automatizada do agente de IA para uma conversa de WhatsApp. Utiliza knowledge base, memória do contato e regras de compliance.",
        auth: "Bearer",
        bodyParams: [
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
          { name: "thread_id", type: "string", required: true, description: "ID do thread de conversa" },
          { name: "contact_id", type: "string", required: true, description: "ID do contato" },
          { name: "message", type: "string", required: true, description: "Mensagem recebida do contato" },
        ],
        curlExample: `curl -X POST \\
  "${SUPABASE_URL}/functions/v1/ai-agent-respond" \\
  -H "Authorization: Bearer <jwt-token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "organization_id": "uuid",
    "thread_id": "uuid",
    "contact_id": "uuid",
    "message": "Qual o preço do plano Pro?"
  }'`,
        responseExample: JSON.stringify({
          response: "O plano Pro custa R$ 199/mês...",
          sources: ["knowledge_base"],
          confidence: 0.92,
        }, null, 2),
      },
      {
        method: "POST",
        path: "/twilio-call",
        summary: "Iniciar chamada telefônica",
        description: "Inicia uma chamada de voz outbound via Twilio. Requer integração Twilio configurada na organização.",
        auth: "Bearer",
        bodyParams: [
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
          { name: "to", type: "string", required: true, description: "Número de destino (E.164)" },
          { name: "contact_id", type: "string", description: "ID do contato associado" },
          { name: "user_id", type: "string", required: true, description: "ID do usuário que está ligando" },
        ],
        curlExample: `curl -X POST \\
  "${SUPABASE_URL}/functions/v1/twilio-call" \\
  -H "Authorization: Bearer <jwt-token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "organization_id": "uuid",
    "to": "+5511999999999",
    "contact_id": "uuid",
    "user_id": "uuid"
  }'`,
        responseExample: JSON.stringify({
          success: true,
          call_sid: "CA...",
          call_id: "uuid",
        }, null, 2),
      },
      {
        method: "POST",
        path: "/twilio-token",
        summary: "Gerar token Twilio Voice",
        description: "Gera um access token para o Twilio Voice SDK (Client-side). Necessário para receber chamadas no browser.",
        auth: "Bearer",
        bodyParams: [
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
          { name: "identity", type: "string", required: true, description: "Identidade do usuário no Twilio" },
        ],
        responseExample: JSON.stringify({ token: "eyJ...", identity: "user-uuid" }, null, 2),
      },
      {
        method: "POST",
        path: "/create-user",
        summary: "Criar usuário na organização",
        description: "Cria um novo usuário e o vincula à organização com o perfil de permissão especificado. Envia e-mail de convite.",
        auth: "Bearer",
        bodyParams: [
          { name: "email", type: "string", required: true, description: "E-mail do novo usuário" },
          { name: "full_name", type: "string", required: true, description: "Nome completo" },
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
          { name: "permission_profile_id", type: "string", required: true, description: "UUID do perfil de permissão" },
        ],
        responseExample: JSON.stringify({ success: true, user_id: "uuid", message: "Convite enviado" }, null, 2),
      },
      {
        method: "POST",
        path: "/export-conversations",
        summary: "Exportar conversas",
        description: "Exporta conversas de WhatsApp em formato CSV ou JSON. Filtros por data, contato e status.",
        auth: "Bearer",
        bodyParams: [
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
          { name: "format", type: "string", description: '"csv" ou "json" (padrão: csv)' },
          { name: "date_from", type: "string", description: "Data inicial (ISO 8601)" },
          { name: "date_to", type: "string", description: "Data final (ISO 8601)" },
          { name: "contact_id", type: "string", description: "Filtrar por contato específico" },
        ],
        responseExample: JSON.stringify({ download_url: "https://...", total_messages: 1250, file_size: "2.3 MB" }, null, 2),
      },
      {
        method: "POST",
        path: "/knowledge-wizard",
        summary: "Wizard de Knowledge Base",
        description: "Assistente interativo para criação de conteúdo na base de conhecimento. Faz perguntas e gera conteúdo estruturado.",
        auth: "Bearer",
        bodyParams: [
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
          { name: "action", type: "string", required: true, description: '"start", "answer", "generate"' },
          { name: "session_id", type: "string", description: "ID da sessão do wizard" },
          { name: "answer", type: "string", description: "Resposta do usuário à pergunta atual" },
        ],
        responseExample: JSON.stringify({ question: "Qual o nome do seu produto principal?", session_id: "uuid", step: 2, total_steps: 5 }, null, 2),
      },
      {
        method: "POST",
        path: "/generate-embedding",
        summary: "Gerar embedding vetorial",
        description: "Gera um embedding vetorial de um texto usando OpenAI. Usado internamente para busca semântica na knowledge base.",
        auth: "Bearer",
        bodyParams: [
          { name: "content", type: "string", required: true, description: "Texto para gerar embedding" },
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
        ],
        responseExample: JSON.stringify({ embedding: [0.012, -0.034, "..."], dimensions: 1536 }, null, 2),
      },
    ],
  },
  {
    title: "Webhooks Inbound",
    description: "Endpoints que recebem webhooks de serviços externos. Não requerem autenticação (validação via assinatura do serviço).",
    baseUrl: `${SUPABASE_URL}/functions/v1`,
    endpoints: [
      {
        method: "POST",
        path: "/twilio-webhook",
        summary: "Webhook Twilio Voice",
        description: "Recebe eventos de chamadas do Twilio (status callbacks, gravações). Configurado automaticamente ao ativar a integração de voz.",
        auth: "none",
        bodyParams: [
          { name: "CallSid", type: "string", required: true, description: "SID da chamada no Twilio" },
          { name: "CallStatus", type: "string", required: true, description: "Status: initiated, ringing, answered, completed, busy, no-answer, failed" },
          { name: "From", type: "string", description: "Número de origem" },
          { name: "To", type: "string", description: "Número de destino" },
          { name: "Duration", type: "string", description: "Duração em segundos (em callbacks finais)" },
          { name: "RecordingUrl", type: "string", description: "URL da gravação (se habilitado)" },
        ],
        responseExample: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Obrigado por ligar.</Say>
</Response>`,
      },
      {
        method: "POST",
        path: "/twilio-whatsapp-webhook",
        summary: "Webhook Twilio WhatsApp",
        description: "Recebe mensagens inbound do WhatsApp via Twilio. Processa texto, mídia, localização, e dispara o agente de IA se configurado.",
        auth: "none",
        bodyParams: [
          { name: "From", type: "string", required: true, description: "Número do remetente (whatsapp:+55...)" },
          { name: "To", type: "string", required: true, description: "Número do destino (whatsapp:+55...)" },
          { name: "Body", type: "string", description: "Conteúdo da mensagem" },
          { name: "NumMedia", type: "string", description: "Quantidade de mídias anexadas" },
          { name: "MediaUrl0", type: "string", description: "URL da primeira mídia" },
          { name: "MediaContentType0", type: "string", description: "MIME type da primeira mídia" },
          { name: "MessageSid", type: "string", description: "SID da mensagem no Twilio" },
        ],
        responseExample: `<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>`,
      },
      {
        method: "POST",
        path: "/suvsign-webhook",
        summary: "Webhook SuvSign (Assinatura Digital)",
        description: "Recebe callbacks do SuvSign quando um documento é assinado, recusado ou expirado. Atualiza o status da oportunidade automaticamente.",
        auth: "none",
        bodyParams: [
          { name: "event", type: "string", required: true, description: "Tipo de evento: signed, refused, expired, viewed" },
          { name: "document_id", type: "string", required: true, description: "ID do documento no SuvSign" },
          { name: "signer_email", type: "string", description: "E-mail do assinante" },
          { name: "signer_name", type: "string", description: "Nome do assinante" },
          { name: "signed_at", type: "string", description: "Data/hora da assinatura (ISO 8601)" },
        ],
        responseExample: JSON.stringify({ received: true }, null, 2),
      },
      {
        method: "POST",
        path: "/scheduled-messages-cron",
        summary: "Cron de mensagens agendadas",
        description: "Executado periodicamente para enviar mensagens agendadas que atingiram o horário programado.",
        auth: "none",
        responseExample: JSON.stringify({ processed: 5, errors: 0 }, null, 2),
      },
    ],
  },
  {
    title: "Migração Kommo",
    description: "Endpoints para migração de dados do Kommo CRM (AmoCRM). Processo em etapas: validar → preview → migrar → rollback.",
    baseUrl: `${SUPABASE_URL}/functions/v1`,
    endpoints: [
      {
        method: "POST",
        path: "/kommo-validate",
        summary: "Validar credenciais Kommo",
        description: "Valida as credenciais de acesso ao Kommo e retorna informações da conta.",
        auth: "Bearer",
        bodyParams: [
          { name: "organization_id", type: "string", required: true, description: "UUID da organização" },
          { name: "kommo_domain", type: "string", required: true, description: "Subdomínio do Kommo (ex: empresa.kommo.com)" },
          { name: "api_token", type: "string", required: true, description: "Token de API do Kommo" },
        ],
        responseExample: JSON.stringify({ valid: true, account_name: "ACME Corp", total_contacts: 1500, total_leads: 800 }, null, 2),
      },
      {
        method: "POST",
        path: "/kommo-preview",
        summary: "Preview da migração",
        description: "Mostra uma prévia dos dados que serão migrados, sem alterar nada.",
        auth: "Bearer",
        responseExample: JSON.stringify({ contacts: 1500, opportunities: 800, activities: 3200, estimated_time: "5 min" }, null, 2),
      },
      {
        method: "POST",
        path: "/kommo-migrate",
        summary: "Executar migração",
        description: "Inicia o processo de migração em lotes. Retorna um import_log_id para acompanhamento.",
        auth: "Bearer",
        responseExample: JSON.stringify({ import_log_id: "uuid", status: "processing", message: "Migration started" }, null, 2),
      },
      {
        method: "POST",
        path: "/kommo-rollback",
        summary: "Reverter migração",
        description: "Reverte uma migração anterior, removendo todos os dados importados.",
        auth: "Bearer",
        bodyParams: [
          { name: "import_log_id", type: "string", required: true, description: "ID do log de importação a reverter" },
        ],
        responseExample: JSON.stringify({ success: true, deleted_contacts: 1500, deleted_opportunities: 800 }, null, 2),
      },
    ],
  },
];

// ─── Sub-components ──────────────────────────────────────────────

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/20 text-red-400 border-red-500/30",
};

const METHOD_BG: Record<HttpMethod, string> = {
  GET: "border-l-emerald-500",
  POST: "border-l-blue-500",
  PUT: "border-l-amber-500",
  DELETE: "border-l-red-500",
};

function MethodBadge({ method }: { method: HttpMethod }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${METHOD_COLORS[method]}`}>
      {method}
    </span>
  );
}

function AuthBadge({ auth }: { auth: "x-api-key" | "Bearer" | "none" }) {
  if (auth === "none") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400 border border-gray-500/30">
        <Globe className="w-3 h-3" /> Público
      </span>
    );
  }
  if (auth === "x-api-key") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-purple-500/20 text-purple-400 border border-purple-500/30">
        <Key className="w-3 h-3" /> x-api-key
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30">
      <Lock className="w-3 h-3" /> Bearer Token
    </span>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-200"
      title="Copiar"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-gray-400 mb-1 font-medium">{label}</p>
      <div className="relative bg-gray-950 rounded-lg border border-gray-700/50 overflow-hidden">
        <CopyButton text={code} />
        <pre className="p-3 pr-10 text-xs text-gray-300 overflow-x-auto font-mono leading-relaxed">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}

function ParamsTable({ params, title }: { params: Param[]; title: string }) {
  return (
    <div className="mt-3">
      <p className="text-xs text-gray-400 mb-1.5 font-medium">{title}</p>
      <div className="border border-gray-700/50 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-800/50">
              <th className="text-left px-3 py-2 text-gray-400 font-medium">Parâmetro</th>
              <th className="text-left px-3 py-2 text-gray-400 font-medium">Tipo</th>
              <th className="text-left px-3 py-2 text-gray-400 font-medium">Obrigatório</th>
              <th className="text-left px-3 py-2 text-gray-400 font-medium">Descrição</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.name} className="border-t border-gray-700/50">
                <td className="px-3 py-2 font-mono text-emerald-400">{p.name}</td>
                <td className="px-3 py-2 text-gray-400">{p.type}</td>
                <td className="px-3 py-2">
                  {p.required ? (
                    <span className="text-amber-400">Sim</span>
                  ) : (
                    <span className="text-gray-500">Não</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-300">{p.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EndpointCard({ endpoint, baseUrl }: { endpoint: Endpoint; baseUrl: string }) {
  const [open, setOpen] = useState(false);
  const fullPath = `${baseUrl}${endpoint.path}`;

  return (
    <div className={`border-l-4 ${METHOD_BG[endpoint.method]} bg-gray-800/40 rounded-r-lg border border-gray-700/50 border-l-4`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-700/20 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {open ? <CaretDown className="w-4 h-4 text-gray-400 shrink-0" /> : <CaretRight className="w-4 h-4 text-gray-400 shrink-0" />}
        <MethodBadge method={endpoint.method} />
        <span className="font-mono text-sm text-gray-200 truncate">{endpoint.path}</span>
        <span className="text-sm text-gray-400 hidden sm:inline truncate">{endpoint.summary}</span>
        <div className="ml-auto shrink-0">
          <AuthBadge auth={endpoint.auth} />
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-700/50">
          <p className="text-sm text-gray-300 mt-3">{endpoint.description}</p>

          {endpoint.scopes && endpoint.scopes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {endpoint.scopes.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded text-xs font-mono bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                  {s}
                </span>
              ))}
            </div>
          )}

          {endpoint.headers && <ParamsTable params={endpoint.headers} title="Headers" />}
          {endpoint.queryParams && <ParamsTable params={endpoint.queryParams} title="Query Parameters" />}
          {endpoint.bodyParams && <ParamsTable params={endpoint.bodyParams} title="Request Body" />}
          {endpoint.curlExample && <CodeBlock code={endpoint.curlExample} label="cURL Example" />}
          {endpoint.responseExample && <CodeBlock code={endpoint.responseExample} label="Response" />}
        </div>
      )}
    </div>
  );
}

function GroupSection({ group }: { group: EndpointGroup }) {
  const [open, setOpen] = useState(true);

  return (
    <div className="mb-8">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 text-left mb-3 group"
      >
        {open ? <CaretDown className="w-5 h-5 text-emerald-400" /> : <CaretRight className="w-5 h-5 text-emerald-400" />}
        <h2 className="text-xl font-bold text-gray-100 group-hover:text-emerald-400 transition-colors">
          {group.title}
        </h2>
        <span className="text-xs text-gray-500 font-mono bg-gray-800 px-2 py-0.5 rounded">
          {group.endpoints.length} endpoints
        </span>
      </button>
      {open && (
        <>
          <p className="text-sm text-gray-400 mb-4 ml-8">{group.description}</p>
          <p className="text-xs text-gray-500 mb-3 ml-8 font-mono">Base URL: {group.baseUrl}</p>
          <div className="space-y-2 ml-8">
            {group.endpoints.map((ep) => (
              <EndpointCard key={`${ep.method}-${ep.path}`} endpoint={ep} baseUrl={group.baseUrl} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────

export default function ApiDocs() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/docs" className="text-gray-400 hover:text-gray-200 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <img src={seialzLogo} alt="Seialz" className="h-7" />
            <div>
              <h1 className="text-lg font-bold text-gray-100">Seialz API Reference</h1>
              <p className="text-xs text-gray-500">v1.0 · REST API</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/docs"
              className="text-sm text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
            >
              Docs <ArrowSquareOut className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      </header>

      {/* Intro */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Autenticação</h2>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-purple-400" />
                <span className="font-medium text-purple-400">x-api-key</span>
              </div>
              <p className="text-gray-400 text-xs">Para a API pública de Leads. Gere sua chave em <span className="text-gray-300">Configurações &gt; API &amp; Webhooks</span>.</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-orange-400" />
                <span className="font-medium text-orange-400">Bearer Token</span>
              </div>
              <p className="text-gray-400 text-xs">JWT do Supabase Auth. Obtido via login. Usado nas Edge Functions internas.</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700/50">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-4 h-4 text-gray-400" />
                <span className="font-medium text-gray-400">Público</span>
              </div>
              <p className="text-gray-400 text-xs">Webhooks inbound não requerem autenticação. Validados via assinatura do serviço.</p>
            </div>
          </div>
        </div>

        {/* Rate Limiting */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Rate Limiting & Boas Práticas</h2>
          <ul className="text-sm text-gray-400 space-y-1.5 list-disc list-inside">
            <li>API pública: <span className="text-gray-300">100 requests/minuto</span> por chave</li>
            <li>Paginação: use <code className="text-emerald-400 bg-gray-800 px-1 rounded">limit</code> e <code className="text-emerald-400 bg-gray-800 px-1 rounded">offset</code> para listar grandes volumes</li>
            <li>Telefones são normalizados automaticamente para formato <span className="text-gray-300">E.164</span> (+55...)</li>
            <li>Todas as datas seguem <span className="text-gray-300">ISO 8601</span> (UTC)</li>
            <li>Respostas de erro retornam <code className="text-emerald-400 bg-gray-800 px-1 rounded">{`{ "error": "mensagem" }`}</code> com status HTTP apropriado</li>
          </ul>
        </div>

        {/* Endpoint Groups */}
        {API_GROUPS.map((group) => (
          <GroupSection key={group.title} group={group} />
        ))}

        {/* Footer */}
        <div className="border-t border-gray-800 mt-12 pt-6 pb-8 text-center text-xs text-gray-500">
          <p>Seialz CRM API v1.0 · Precisa de ajuda? <a href="mailto:suporte@seialz.com" className="text-emerald-400 hover:underline">suporte@seialz.com</a></p>
        </div>
      </div>
    </div>
  );
}
