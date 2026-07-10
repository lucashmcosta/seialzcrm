// Motor de roteiro determinístico do webchat (v1, sem IA).
//
// ⚠️ COSTURA DE IA (v2): esta é a ÚNICA peça que a versão com IA substitui.
// `advanceFlow` recebe (roteiro, estado, input do visitante) e devolve
// (mensagens do bot, novo estado, qualificado?). A versão IA troca esta
// função pelo agente (ai_agents) mantendo a MESMA interface — quarentena,
// promoção e transplante não mudam. Por isso:
//   - respostas vão ESTRUTURADAS em state.collected (não texto solto);
//   - "qualificado" é sinal explícito (name + phone válidos), não "chegou no fim".

export interface FlowStep {
  id: string;
  bot: string;
  buttons?: string[];
  input?: "text" | "phone" | "otp";
  save_as?: string;
  soft_gate?: boolean;
  timeout_s?: number;
}

export interface Flow {
  steps: FlowStep[];
  promote_on?: "flow_complete";
}

export interface FlowState {
  step_index: number;                 // próximo step aguardando input do visitante
  collected: Record<string, string>;  // respostas estruturadas por save_as
}

export interface BotTurn {
  step_id: string;
  text: string;
  buttons?: string[];
  input?: "text" | "phone" | "otp";
}

export interface AdvanceResult {
  bot: BotTurn[];
  state: FlowState;
  qualified: boolean;          // name + phone capturados => pronto pra promover
  needsInput: boolean;         // false quando o fluxo terminou
  error?: string;              // ex.: telefone inválido (não avança)
}

export function initialState(): FlowState {
  return { step_index: 0, collected: {} };
}

// Validação BR local (sem SMS no v1). Retorna E.164 canônico se válido.
export function validatePhoneBR(raw: string): { valid: boolean; e164?: string } {
  const digits = (raw || "").replace(/\D/g, "");
  let local = digits;
  if (digits.startsWith("55") && digits.length >= 12) local = digits.slice(2);
  if (local.length !== 10 && local.length !== 11) return { valid: false };
  const ddd = parseInt(local.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return { valid: false };
  // móvel BR: 11 dígitos com 9 na 3ª posição (ou 10 sem o 9 — toleramos, vira móvel)
  const rest = local.slice(2);
  if (local.length === 11 && rest[0] !== "9") return { valid: false };
  const canon = local.length === 10 ? `55${local.slice(0, 2)}9${local.slice(2)}` : `55${local}`;
  return { valid: true, e164: "+" + canon };
}

// Substitui {name} etc. no texto do bot pelos valores coletados.
function interpolate(text: string, collected: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => collected[k] ?? "");
}

// Emite as mensagens do bot a partir de `fromIndex`, parando DEPOIS de emitir
// o texto do primeiro step que exige input (é onde esperamos o visitante).
// Steps sem input (ex.: 'done') são informativos e o fluxo segue/termina.
// Steps input:'otp' são pulados no v1 (OTP adiado).
function render(flow: Flow, state: FlowState, fromIndex: number): AdvanceResult {
  const bot: BotTurn[] = [];
  let i = fromIndex;
  while (i < flow.steps.length) {
    const step = flow.steps[i];
    if (step.input === "otp") { i++; continue; } // v1: sem OTP
    bot.push({
      step_id: step.id,
      text: interpolate(step.bot, state.collected),
      buttons: step.buttons,
      input: step.input,
    });
    // Um step é interativo (espera resposta) se tem input OU botões.
    const isInteractive = !!step.input || (Array.isArray(step.buttons) && step.buttons.length > 0);
    if (isInteractive) {
      return { bot, state: { ...state, step_index: i }, qualified: false, needsInput: true };
    }
    i++;
  }
  // Chegou ao fim sem mais input: qualificado se temos nome + telefone válido.
  const hasName = !!(state.collected.name && state.collected.name.trim());
  const hasPhone = !!(state.collected.phone && validatePhoneBR(state.collected.phone).valid);
  return {
    bot,
    state: { ...state, step_index: flow.steps.length },
    qualified: hasName && hasPhone,
    needsInput: false,
  };
}

// Início da sessão: primeiras mensagens do bot até o primeiro input.
export function startFlow(flow: Flow): AdvanceResult {
  return render(flow, initialState(), 0);
}

// Visitante respondeu o step atual: salva, valida e avança.
export function advanceFlow(flow: Flow, state: FlowState, value: string): AdvanceResult {
  const step = flow.steps[state.step_index];
  if (!step) {
    return { bot: [], state, qualified: false, needsInput: false, error: "flow_already_complete" };
  }

  // Validação de telefone bloqueia o avanço (repete o mesmo step).
  if (step.input === "phone") {
    const v = validatePhoneBR(value);
    if (!v.valid) {
      return {
        bot: [{ step_id: step.id, text: "Hmm, esse número não parece certo. Manda com DDD, tipo (11) 91234-5678 👇", input: "phone" }],
        state,
        qualified: false,
        needsInput: true,
        error: "invalid_phone",
      };
    }
  }

  const collected = { ...state.collected };
  if (step.save_as) collected[step.save_as] = value;
  return render(flow, { ...state, collected }, state.step_index + 1);
}
