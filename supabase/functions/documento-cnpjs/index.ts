// Lê os CNPJs de um documento anexado e devolve quem são, para a pessoa
// escolher qual é a empresa do caso.
//
// Por que PERGUNTAR em vez de adivinhar: a CTPS é o histórico de empregos
// inteiro. Traz várias empresas, e o documento não diz qual delas é o caso --
// só a pessoa sabe. Por isso aqui só se lê e se identifica; escolher é da
// tela, e nada é vinculado sozinho.
//
// Só lê a CAMADA DE TEXTO do PDF. Documento escaneado (PDF que é foto por
// dentro, ou JPEG) não entra: OCR de carteira fotografada erra dígito, e um
// dígito errado de CNPJ vira empresa errada na petição. Quando não há texto,
// a resposta é `sem_texto` e a tela não pergunta nada.
//
// Qual documento vale é dito pelo DADO, não pelo código:
// `document_types.scans_cnpj`.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";
import {
  isValidCnpjValue,
  lookupBrasilApiCnpj,
} from "../_shared/registry/providers.ts";
import { vinculosDaCtps } from "../_shared/documentos/ctps.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** CNPJs do texto, sem repetir, só os que passam no dígito verificador. */
function cnpjsDoTexto(texto: string): string[] {
  const achados = texto.match(/\d{2}[.\s]?\d{3}[.\s]?\d{3}[\/\s]?\d{4}[-\s]?\d{2}/g) ?? [];
  const vistos = new Set<string>();
  for (const bruto of achados) {
    const limpo = bruto.replace(/\D/g, "");
    if (limpo.length !== 14) continue;
    if (!isValidCnpjValue(limpo)) continue;
    vistos.add(limpo);
  }
  return [...vistos];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

  const { document_id, meses_prescricao } = await req.json().catch(() => ({}));
  if (!document_id) return json({ error: "document_id_required" }, 400);

  // Quem pergunta é o usuário: a leitura respeita a RLS dele.
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: doc, error: docErr } = await comoUsuario
    .from("documents")
    .select("id, organization_id, bucket, storage_path, mime_type, document_type_id")
    .eq("id", document_id)
    .maybeSingle();
  if (docErr || !doc) return json({ error: "document_not_found" }, 404);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: tipo } = await admin
    .from("document_types")
    .select("code, name, scans_cnpj")
    .eq("id", doc.document_type_id)
    .maybeSingle();
  if (!tipo?.scans_cnpj) return json({ ok: true, motivo: "tipo_nao_escaneia", cnpjs: [] });

  if (doc.mime_type !== "application/pdf") {
    return json({ ok: true, motivo: "nao_e_pdf", cnpjs: [] });
  }

  const dl = await admin.storage.from(doc.bucket ?? "attachments").download(doc.storage_path);
  if (dl.error || !dl.data) return json({ error: "download_failed" }, 502);

  let texto = "";
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await dl.data.arrayBuffer()));
    const { text } = await extractText(pdf, { mergePages: true });
    texto = Array.isArray(text) ? text.join("\n") : String(text ?? "");
  } catch (_e) {
    return json({ ok: true, motivo: "pdf_ilegivel", cnpjs: [] });
  }

  // Pouco texto = PDF escaneado. Não é erro, é o caso que a gente decidiu não
  // atender: sem camada de texto, não se sugere nada.
  if (texto.replace(/\s/g, "").length < 200) {
    return json({ ok: true, motivo: "sem_texto", cnpjs: [] });
  }

  // A CTPS digital traz nome do empregador e período colados no CNPJ -- é o
  // que a pessoa precisa para saber qual é o caso. Quando o documento tem
  // outro formato, sobra a varredura simples por CNPJ válido.
  const vinculos = vinculosDaCtps(texto, isValidCnpjValue, {
    mesesPrescricao: Number(meses_prescricao) > 0 ? Number(meses_prescricao) : undefined,
  });
  const encontrados = vinculos.length > 0
    ? vinculos.map((v) => v.cnpj)
    : cnpjsDoTexto(texto);
  if (encontrados.length === 0) {
    return json({ ok: true, motivo: "nenhum_cnpj", cnpjs: [] });
  }

  // Número sozinho não diz nada para quem vai escolher. A consulta oficial dá
  // o nome -- e, se o dígito tiver sido lido errado, ela não acha e o item
  // some, em vez de virar empresa errada.
  const cnpjs = [];
  for (const cnpj of encontrados.slice(0, 15)) {
    const doDocumento = vinculos.find((v) => v.cnpj === cnpj);
    // Consulta à Receita só para quem ainda pode virar caso. Na CTPS do teste
    // eram 11 vínculos e 5 dentro do prazo: consultar os 11 gastaria o dobro
    // à toa. O que está fora continua na lista, com o nome que o documento dá.
    const r = doDocumento && !doDocumento.dentro_do_prazo
      ? { ok: false, payload: null }
      : await lookupBrasilApiCnpj(cnpj);
    const p = (r.ok ? r.payload : null) as Record<string, unknown> | null;
    cnpjs.push({
      cnpj,
      empregador_no_documento: doDocumento?.empregador ?? null,
      periodo: doDocumento?.periodo ?? null,
      vinculo_aberto: doDocumento?.atual ?? false,
      fim_do_contrato: doDocumento?.fim ?? null,
      prescreve_em: doDocumento?.prescreve_em ?? null,
      dentro_do_prazo: doDocumento?.dentro_do_prazo ?? true,
      dias_para_prescrever: doDocumento?.dias_para_prescrever ?? null,
      encontrado: r.ok,
      razao_social: (p?.legal_name ?? p?.razao_social ?? null) as string | null,
      nome_fantasia: (p?.trade_name ?? p?.nome_fantasia ?? null) as string | null,
      situacao: (p?.registration_status ?? p?.situacao ?? null) as string | null,
      cidade: (p?.address_city ?? null) as string | null,
      uf: (p?.address_state ?? null) as string | null,
      dados: p,
    });
  }

  return json({
    ok: true,
    documento: { id: doc.id, tipo: tipo.code },
    caracteres_lidos: texto.length,
    cnpjs,
  });
});
