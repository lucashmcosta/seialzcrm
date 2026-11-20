// Dados do cadastro que o agente de IA pede para gerar o contrato (CPF, e-mail, endereço).
// Grava nos campos do próprio contato, os mesmos que a equipe e os modelos de documento leem.
// Serve para qualquer org: o agente só tem a ferramenta se ela estiver ligada nele.
import { isValidCpfValue, lookupBrasilApiCep, lookupViaCep } from "../registry/providers.ts";

export const SAVE_REGISTRATION_TOOL = "save_registration_data";

export interface RegistrationArgs {
  cpf?: unknown;
  email?: unknown;
  cep?: unknown;
  address_number?: unknown;
  address_complement?: unknown;
  address_street?: unknown;
  address_neighborhood?: unknown;
}

export interface CepAddress { street?: string | null; neighborhood?: string | null; city?: string | null; state?: string | null }

/** O que já está no contato depois de gravar, para dizer o que ainda falta. */
export interface RegistrationState {
  cpf: string | null;
  email: string | null;
  address_zip: string | null;
  address_number: string | null;
  address_street: string | null;
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const clean = (v: unknown, max: number) =>
  typeof v === "string" || typeof v === "number" ? String(v).replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * Converte o que o cliente escreveu em campos do contato. Só entra o que é válido; o resto volta
 * como problema para o agente pedir de novo. `cep` = endereço achado pelo CEP (null = não achou).
 */
export function registrationFields(args: RegistrationArgs, cep: CepAddress | "not_found" | null) {
  const fields: Record<string, string> = {};
  const problems: string[] = [];

  const cpf = digits(args?.cpf);
  if (cpf) {
    if (isValidCpfValue(cpf)) fields.cpf = cpf;
    else problems.push("o CPF não confere (peça para conferir os 11 números)");
  }

  const email = clean(args?.email, 120).replace(/\s+/g, "");
  if (email) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fields.email = email.toLowerCase();
    else problems.push("o e-mail está incompleto (falta o @ ou o final, como .com)");
  }

  const zip = digits(args?.cep);
  if (zip) {
    if (zip.length !== 8) problems.push("o CEP precisa ter 8 números");
    else if (cep === "not_found") problems.push("esse CEP não existe (peça para conferir)");
    else {
      fields.address_zip = zip;
      if (cep?.street) fields.address_street = cep.street;
      if (cep?.neighborhood) fields.address_neighborhood = cep.neighborhood;
      if (cep?.city) fields.address_city = cep.city;
      if (cep?.state) fields.address_state = cep.state.toUpperCase();
      fields.address_country_code = "BR";
    }
  }

  // Rua e bairro escritos pelo cliente só entram quando o CEP não trouxe (CEP geral de cidade pequena).
  const street = clean(args?.address_street, 120);
  if (street && !fields.address_street) fields.address_street = street;
  const neighborhood = clean(args?.address_neighborhood, 80);
  if (neighborhood && !fields.address_neighborhood) fields.address_neighborhood = neighborhood;

  const number = clean(args?.address_number, 20);
  if (number) fields.address_number = number;
  const complement = clean(args?.address_complement, 80);
  if (complement) fields.address_complement = complement;

  return { fields, problems };
}

const LABELS: Array<[keyof RegistrationState, string]> = [
  ["cpf", "CPF"],
  ["email", "e-mail"],
  ["address_zip", "CEP"],
  ["address_number", "número da casa ou do prédio"],
];

/** O que volta para o agente: o que entrou, o que tem problema e o que ainda falta. */
export function registrationReply(fields: Record<string, string>, problems: string[], after: RegistrationState, saved: boolean): string {
  const missing = LABELS.filter(([k]) => !String(after[k] ?? "").trim()).map(([, label]) => label);
  // CEP geral (sem rua): a rua vem do cliente.
  if (String(after.address_zip ?? "").trim() && !String(after.address_street ?? "").trim()) missing.push("nome da rua (o CEP não traz a rua)");
  return [
    Object.keys(fields).length
      ? (saved ? "Dados gravados no cadastro do cliente." : "Modo de teste: os dados seriam gravados no cadastro do cliente.")
      : "Nenhum dado novo para gravar.",
    problems.length ? `Problema: ${problems.join("; ")}. Peça só isso de novo, uma vez.` : "",
    missing.length
      ? `Ainda falta: ${missing.join(", ")}. Se o cliente já recusou ou não respondeu a esse pedido, não insista: siga com o que tem.`
      : "O cadastro para o contrato está completo.",
    "Não repita o CPF nem o e-mail na conversa. No resumo da passagem, diga só que os dados estão no cadastro.",
  ].filter(Boolean).join("\n");
}

/** Endereço do CEP: BrasilAPI e, se falhar, ViaCEP. null = fora do ar (o cadastro segue só com o CEP). */
export async function lookupCepAddress(zip: string): Promise<CepAddress | "not_found" | null> {
  let notFound = false;
  for (const lookup of [lookupBrasilApiCep, lookupViaCep]) {
    const r = await lookup(zip);
    if (r.ok) {
      const p = r.payload as Record<string, string | null>;
      return { street: p.street, neighborhood: p.neighborhood, city: p.city, state: p.region };
    }
    if (r.error === "not_found") notFound = true;
  }
  return notFound ? "not_found" : null;
}

export const SAVE_REGISTRATION_TOOL_DEF = {
  type: "function",
  function: {
    name: SAVE_REGISTRATION_TOOL,
    description:
      "Grava no cadastro do cliente os dados que ele mandou para o contrato: CPF, e-mail, CEP, número, complemento " +
      "(e rua/bairro só quando o CEP não trouxer). O endereço é completado pelo CEP. Passe só o que o cliente escreveu; " +
      "não invente nem complete nada. Pode chamar de novo quando ele mandar o que faltou.",
    parameters: {
      type: "object",
      properties: {
        cpf: { type: "string", description: "CPF do cliente, como ele escreveu." },
        email: { type: "string", description: "E-mail do cliente." },
        cep: { type: "string", description: "CEP do endereço, 8 números." },
        address_number: { type: "string", description: "Número da casa ou do prédio." },
        address_complement: { type: "string", description: "Apartamento, bloco, casa dos fundos." },
        address_street: { type: "string", description: "Rua, só se o CEP não trouxer a rua." },
        address_neighborhood: { type: "string", description: "Bairro, só se o CEP não trouxer o bairro." },
      },
    },
  },
};
