import { assertEquals } from "jsr:@std/assert@1";
import { typingIndicatorBody } from "../supabase/functions/_shared/meta-whatsapp/typing.ts";
import { DEFAULT_HANDOFF_ACK } from "../src/lib/agentDistribution.ts";
import { AGENT_HANDOFF_ACK, shouldHandOffSilent, decideSupportGate, agentTypeForThread, agentIdentityLine, aiQuestionMode, asksNameWhenNotReal, nameInstructionWhenNotReal, attachmentNote, followUpInstruction, isFollowUpSkip, stripCloseEcho, agentInputKind, billableInputTokens, currentTimeForPrompt, decideAgentGate, handoffAckText, joinAgentText, agentReplyText, splitIntoBubbles, splitPromptForCache, withoutRepeatedLast, placeCurrentMessage, CROSSED_REPLY_NOTE, toWhatsAppText } from "../supabase/functions/_shared/intelligence/agent-gate.ts";

const mine = { ai_agent_id: "a1", ai_agent_released_at: null, needs_human_attention: false, assigned_user_id: null };

Deno.test("conversa do agente, sem humano, ele responde", () => assertEquals(decideAgentGate(mine, "a1", false), "respond"));
Deno.test("conversa de antes ou de outro destino fica com humano", () => {
  assertEquals(decideAgentGate({ ...mine, ai_agent_id: null }, "a1", false), "human_owns");
  assertEquals(decideAgentGate({ ...mine, ai_agent_id: "a2" }, "a1", false), "human_owns");
  assertEquals(decideAgentGate(null, "a1", false), "human_owns");
});
Deno.test("depois da passagem ele nunca responde de novo", () => {
  assertEquals(decideAgentGate({ ...mine, ai_agent_released_at: "2026-11-09" }, "a1", false), "human_owns");
});
Deno.test("vendedor que entrou na conversa assume", () => {
  assertEquals(decideAgentGate(mine, "a1", true), "take_over");
  assertEquals(decideAgentGate({ ...mine, assigned_user_id: "u1" }, "a1", false), "take_over");
  assertEquals(decideAgentGate({ ...mine, needs_human_attention: true }, "a1", false), "take_over");
});
Deno.test("áudio é escutado; foto, documento, vídeo e figurinha seguem com o agente; o resto vai para humano", () => {
  assertEquals(agentInputKind(null), "text");
  assertEquals(agentInputKind("audio"), "audio");
  assertEquals(agentInputKind("audio/ogg"), "audio");
  for (const m of ["image", "document", "video", "sticker", "image/jpeg"]) assertEquals(agentInputKind(m), "attachment");
  assertEquals(agentInputKind("location"), "unsupported_media");
});
Deno.test("anexo chega ao agente como aviso, sem nome de arquivo de documento", () => {
  const photo = attachmentNote("image", "[Imagem]");
  assertEquals(photo.startsWith("[O cliente enviou uma foto. Você não consegue ver nem conferir o arquivo"), true);
  assertEquals(photo.includes("não pergunte o que é cada arquivo"), true);
  assertEquals(photo.includes("[Imagem]"), false);
  assertEquals(attachmentNote("image", "frente do RG").includes('com o texto: "frente do RG"'), true);
  const doc = attachmentNote("document", "CTPS_123.456.789-00.pdf");
  assertEquals(doc.includes("um documento"), true);
  assertEquals(doc.includes("123"), false);
});
Deno.test("aviso da passagem é configurável e pode não existir", () => {
  assertEquals(DEFAULT_HANDOFF_ACK, AGENT_HANDOFF_ACK);
  assertEquals(handoffAckText(null), AGENT_HANDOFF_ACK);
  assertEquals(handoffAckText(undefined), AGENT_HANDOFF_ACK);
  assertEquals(handoffAckText("Vou revisar aqui e já te falo"), "Vou revisar aqui e já te falo");
  assertEquals(handoffAckText(""), null);
  assertEquals(handoffAckText("   "), null);
});
Deno.test("mensagem longa vira até 3 mensagens, sem perder texto", () => {
  assertEquals(splitIntoBubbles("Oi"), ["Oi"]);
  assertEquals(splitIntoBubbles("a\n\nb"), ["a", "b"]);
  assertEquals(splitIntoBubbles("a\nb\n\n\nc"), ["a\nb", "c"]);
  assertEquals(splitIntoBubbles("a\n\nb\n\nc\n\nd"), ["a", "b", "c\n\nd"]);
  assertEquals(splitIntoBubbles(""), []);
});
Deno.test("texto antes da ferramenta não se perde nem repete", () => {
  assertEquals(joinAgentText(["Isso não é golpe."], "Qual seu nome?"), "Isso não é golpe.\n\nQual seu nome?");
  assertEquals(joinAgentText(["Oi"], "Oi"), "Oi");
  assertEquals(joinAgentText([], ""), "");
  assertEquals(joinAgentText(["Obrigada.\n\nVocê recebe?"], "Obrigada.  Você recebe?"), "Obrigada.\n\nVocê recebe?");
  assertEquals(joinAgentText(["Obrigada, Ana."], "Você recebe?"), "Obrigada, Ana.\n\nVocê recebe?");
});
Deno.test("mensagem atual não aparece duas vezes", () => {
  const h = [{ role: "assistant", content: "Oi" }, { role: "user", content: "5 de maio" }];
  assertEquals(withoutRepeatedLast(h, "5 de maio"), h.slice(0, 1));
  assertEquals(withoutRepeatedLast(h, "outra"), h);
});
Deno.test("custo do cache entra no limite mensal", () => {
  assertEquals(billableInputTokens({ input_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 1000 }), 1450);
  assertEquals(billableInputTokens(null), 0);
});
Deno.test("data no fuso certo, e fuso inválido não quebra", () => {
  const t = new Date("2026-11-09T02:30:00Z");
  assertEquals(currentTimeForPrompt("America/Sao_Paulo", t).includes("8 de novembro de 2026"), true);
  assertEquals(currentTimeForPrompt("fuso/errado", t).includes("2026"), true);
});
Deno.test("só a parte fixa vai para o cache", () => {
  assertEquals(splitPromptForCache("fixo\n## CONTEXTO DO CONTATO\nmuda"), ["fixo", "\n## CONTEXTO DO CONTATO\nmuda"]);
  assertEquals(splitPromptForCache("sem marcador"), ["sem marcador", ""]);
});

Deno.test("apresentação: padrão é assistente virtual; pelo nome mantém a verdade quando perguntam", () => {
  assertEquals(agentIdentityLine("Gabi", true), "Você é Gabi, um assistente virtual.");
  assertEquals(agentIdentityLine("Gabi", null), "Você é Gabi, um assistente virtual.");
  const own = agentIdentityLine("Gabi", false);
  assertEquals(own.startsWith("Você é Gabi, da equipe de atendimento."), true);
  assertEquals(own.includes("diga a verdade"), true);
});

Deno.test("perguntaram se é IA: no modo de passagem, não responde, não se diz pessoa e passa para a equipe", () => {
  const line = agentIdentityLine("Bruna", false, "handoff");
  assertEquals(line.includes("transfer_to_human"), true);
  assertEquals(line.includes("Não afirme que é uma pessoa"), true);
  assertEquals(line.includes("diga a verdade"), false);
  // Quem se apresenta como assistente virtual não muda.
  assertEquals(agentIdentityLine("Gabi", true, "handoff"), "Você é Gabi, um assistente virtual.");
});

Deno.test("modo de passagem só vale com a configuração e com a ferramenta de passar a conversa", () => {
  assertEquals(aiQuestionMode({ ai_question: "handoff" }, ["transfer_to_human"]), "handoff");
  assertEquals(aiQuestionMode({ ai_question: "handoff" }, ["update_contact"]), "tell");
  assertEquals(aiQuestionMode({}, ["transfer_to_human"]), "tell");
  assertEquals(aiQuestionMode(null, ["transfer_to_human"]), "tell");
});

Deno.test("perguntar o nome: só com a opção ligada no agente e com update_contact", () => {
  const on = { update_contact: { ask_name: "if_not_real" } };
  assertEquals(asksNameWhenNotReal(on, ["update_contact"]), true);
  assertEquals(asksNameWhenNotReal(on, ["transfer_to_human"]), false);
  assertEquals(asksNameWhenNotReal({}, ["update_contact"]), false);
  assertEquals(asksNameWhenNotReal(null, ["update_contact"]), false);
});

Deno.test("perguntar o nome: primeira pergunta quando não é nome de pessoa; uma vez só", () => {
  const first = nameInstructionWhenNotReal({ name: "🦋Nanda🦋", confirmed: false, asked: false });
  assertEquals(first.includes('Nome registrado: "🦋Nanda🦋"'), true);
  assertEquals(first.includes("PRIMEIRA pergunta"), true);
  assertEquals(first.includes("mark_name_asked"), true);
  assertEquals(first.includes("mesmo só o primeiro nome"), true);
  assertEquals(nameInstructionWhenNotReal({ name: null, confirmed: false, asked: false }).includes('"não informado"'), true);
  assertEquals(nameInstructionWhenNotReal({ name: "x", confirmed: false, asked: true }).includes("Não pergunte de novo"), true);
  assertEquals(nameInstructionWhenNotReal({ name: "Ana Souza", confirmed: true, asked: true }), 'Nome confirmado pelo cliente: "Ana Souza". Não pergunte de novo.');
});

Deno.test("parágrafo repetido na mesma resposta sai uma vez só", () => {
  assertEquals(splitIntoBubbles("Faz sentido perguntar.\n\nÓtimo, o ponto ajuda.\n\nFaz sentido  perguntar."), ["Faz sentido perguntar.", "Ótimo, o ponto ajuda."]);
});

Deno.test("retomada: instrução interna, e a última tentativa avisa que continua por aqui", () => {
  assertEquals(followUpInstruction(1, 2).includes("INSTRUÇÃO INTERNA"), true);
  assertEquals(followUpInstruction(1, 2).includes("última tentativa"), false);
  assertEquals(followUpInstruction(2, 2).includes("última tentativa"), true);
});

Deno.test("retomada pulada só com o marcador", () => {
  assertEquals(isFollowUpSkip("NADA"), true);
  assertEquals(isFollowUpSkip(" nada. "), true);
  assertEquals(isFollowUpSkip("Nada de pressa, conseguiu ver?"), false);
});

Deno.test("stripCloseEcho tira o eco no fim de uma frase", () => {
  assertEquals(stripCloseEcho("E se você indicar uma mamãe que fechar contrato com a gente, ganha R$ 50. Conversa encerrada."),
    "E se você indicar uma mamãe que fechar contrato com a gente, ganha R$ 50.");
});
Deno.test("stripCloseEcho tira o eco sozinho e variações", () => {
  assertEquals(stripCloseEcho("Conversa encerrada."), "");
  assertEquals(stripCloseEcho("Encerrado."), "");
  assertEquals(stripCloseEcho("Obrigada! A conversa foi encerrada."), "Obrigada!");
  assertEquals(stripCloseEcho("Até mais.\n\nConversa finalizada"), "Até mais.");
});
Deno.test("stripCloseEcho não mexe em texto normal", () => {
  assertEquals(stripCloseEcho("Se mudar alguma coisa, é só me chamar."), "Se mudar alguma coisa, é só me chamar.");
  assertEquals(stripCloseEcho("A licença foi encerrada em março?"), "A licença foi encerrada em março?");
});

Deno.test("pergunta repetida com outras palavras depois da ferramenta sai uma vez", () => {
  const antes = "Anotado, dia 7 de março. Falta pouco, mamãe.\n\nHoje você trabalha? De carteira assinada, como MEI, por conta própria, ou não está trabalhando?";
  const depois = "Conta pra mim, mamãe: hoje você trabalha de carteira assinada, como MEI, por conta própria, ou não está trabalhando?";
  assertEquals(joinAgentText([antes], depois), antes);
});

Deno.test("retorno repetido depois da ferramenta sai uma vez, frase nova fica", () => {
  const antes = "Vou conferir seu caso com cuidado e te retorno hoje, a partir das 8h, por aqui mesmo.";
  const depois = "Pronto, já deixei tudo anotado para a equipe. Você recebe o retorno por aqui hoje, a partir das 8h.";
  assertEquals(joinAgentText([antes], depois), antes + "\n\nPronto, já deixei tudo anotado para a equipe.");
});

Deno.test("resposta sem ferramenta não muda", () => {
  const t = "Hoje você trabalha? Conta pra mim: hoje você trabalha?";
  assertEquals(joinAgentText([], t), t);
});

Deno.test("texto novo depois da ferramenta continua", () => {
  assertEquals(joinAgentText(["Anotei a data do parto."], "Você consegue me mandar o extrato do INSS?"),
    "Anotei a data do parto.\n\nVocê consegue me mandar o extrato do INSS?");
});

Deno.test("depois de encerrar ou passar para a equipe, o texto de depois não vai", () => {
  assertEquals(agentReplyText(["Se mudar alguma coisa, é só me chamar."], "Se ficar alguma dúvida, estou por aqui.", true),
    "Se mudar alguma coisa, é só me chamar.");
  // Sem texto antes, o de depois é a resposta.
  assertEquals(agentReplyText([], "Se mudar alguma coisa, é só me chamar.", true), "Se mudar alguma coisa, é só me chamar.");
  // Sem encerrar, segue a regra normal.
  assertEquals(agentReplyText(["Anotei."], "Qual a data do parto?", false), "Anotei.\n\nQual a data do parto?");
});

Deno.test("mensagem que se cruzou com a resposta vai para o fim e avisa o agente", () => {
  const h = [
    { role: "assistant", content: "Tinha hora extra no holerite?" },
    { role: "user", content: "Sim" },
    { role: "user", content: "178 valor que eles pagam" },
    { role: "assistant", content: "Aparecia algum valor de hora extra?" },
  ];
  const r = placeCurrentMessage(h, "178 valor que eles pagam");
  assertEquals(r.crossed, true);
  assertEquals(r.history.map((m) => m.content), ["Tinha hora extra no holerite?", "Sim", "Aparecia algum valor de hora extra?"]);
  assertEquals(CROSSED_REPLY_NOTE.includes("INSTRUÇÃO INTERNA"), true);
});
Deno.test("sem cruzamento: a mensagem atual sai do fim e nada muda", () => {
  const h = [{ role: "assistant", content: "Oi" }, { role: "user", content: "5 de maio" }];
  assertEquals(placeCurrentMessage(h, "5 de maio"), { history: h.slice(0, 1), crossed: false });
  assertEquals(placeCurrentMessage(h, "outra"), { history: h, crossed: false });
  // Mensagem igual a uma antiga, que já teve resposta e não é a última do cliente: não mexe.
  const old = [{ role: "user", content: "Sim" }, { role: "assistant", content: "Ok" }, { role: "user", content: "Não" }];
  assertEquals(placeCurrentMessage(old, "Sim"), { history: old, crossed: false });
});
Deno.test("digitando no WhatsApp marca como lida e mostra o aviso", () => {
  assertEquals(typingIndicatorBody("wamid.X"), {
    messaging_product: "whatsapp", status: "read", message_id: "wamid.X", typing_indicator: { type: "text" },
  });
});

Deno.test("Markdown vira formato do WhatsApp", () => {
  assertEquals(toWhatsAppText("foi **com** ou **sem** justa causa?"), "foi *com* ou *sem* justa causa?");
  assertEquals(toWhatsAppText("Imagina, [Ana](#), foi um prazer."), "Imagina, Ana, foi um prazer.");
  assertEquals(toWhatsAppText("Veja [aqui](https://x.com/a)"), "Veja aqui (https://x.com/a)");
  assertEquals(toWhatsAppText("### Documentos\n*Cálculo* _ok_"), "Documentos\n*Cálculo* _ok_");
});

Deno.test("shouldHandOffSilent: conversa quente sem resposta às retomadas vai para a equipe depois de 2 h", () => {
  const now = Date.parse("2026-11-18T15:00:00Z");
  const base = { hasWidgetResult: true, followupCount: 2, followupTotal: 2, lastFollowupAt: "2026-11-18T12:30:00Z", lastInboundAt: "2026-11-18T10:00:00Z" };
  assertEquals(shouldHandOffSilent(base, now), true);
  assertEquals(shouldHandOffSilent({ ...base, hasWidgetResult: false }, now), false);
  assertEquals(shouldHandOffSilent({ ...base, followupCount: 1 }, now), false);
  assertEquals(shouldHandOffSilent({ ...base, lastFollowupAt: "2026-11-18T13:30:00Z" }, now), false);
  assertEquals(shouldHandOffSilent({ ...base, lastInboundAt: "2026-11-18T12:45:00Z" }, now), false);
  assertEquals(shouldHandOffSilent({ ...base, followupTotal: 0, followupCount: 0 }, now), false);
});

Deno.test("decideSupportGate: quieto com a equipe conversando, espera a passagem e volta depois de 24 h", () => {
  const now = Date.parse("2026-11-18T15:00:00Z");
  assertEquals(decideSupportGate({ releasedAt: null, lastHumanReplyAt: null }, now), "respond");
  assertEquals(decideSupportGate({ releasedAt: null, lastHumanReplyAt: "2026-11-18T14:00:00Z" }, now), "human_active");
  assertEquals(decideSupportGate({ releasedAt: null, lastHumanReplyAt: "2026-11-18T10:00:00Z" }, now), "respond");
  assertEquals(decideSupportGate({ releasedAt: "2026-11-18T09:00:00Z", lastHumanReplyAt: null }, now), "waiting_human");
  assertEquals(decideSupportGate({ releasedAt: "2026-11-17T09:00:00Z", lastHumanReplyAt: null }, now), "resume");
  assertEquals(decideSupportGate({ releasedAt: "2026-11-18T09:00:00Z", lastHumanReplyAt: "2026-11-18T10:00:00Z" }, now), "resume");
  assertEquals(agentTypeForThread("customer_service"), "support");
  assertEquals(agentTypeForThread("sales"), "sdr");
  assertEquals(agentTypeForThread(null), "sdr");
});

Deno.test("joinAgentText: bilhete do modelo depois da ferramenta não vai para o cliente", () => {
  const antes = "Oi! Eu sou a Gabi, da Auxilius. Com quem eu falo?";
  assertEquals(joinAgentText([antes], "(Sem nada a acrescentar: a saudação e a pergunta do nome já foram enviadas.)"), antes);
  assertEquals(joinAgentText([antes], "O texto já foi enviado, e não falta nada a dizer por enquanto. Agora é só esperar o nome dela."), antes);
  assertEquals(joinAgentText([antes], "Pode me mandar a data de nascimento do bebê?"), antes + "\n\nPode me mandar a data de nascimento do bebê?");
  assertEquals(joinAgentText([antes], "Nada a acrescentar por enquanto. Fico esperando o nome dela."), antes);
  assertEquals(joinAgentText([antes], "Não falta nada a dizer, a mensagem anterior já cobre o que ela precisa saber."), antes);
  assertEquals(joinAgentText([antes], "(Não falta nada a dizer ao cliente.)"), antes);
  // Frase normal entre parênteses ou "já foi enviado" de outra coisa continua.
  assertEquals(joinAgentText([antes], "(If you prefer English, just let me know.)"), antes + "\n\n(If you prefer English, just let me know.)");
  assertEquals(joinAgentText([antes], "O contrato já foi enviado para o seu e-mail."), antes + "\n\nO contrato já foi enviado para o seu e-mail.");
  // Sem ferramenta (um texto só), nada é cortado.
  assertEquals(joinAgentText([], "(Pode responder quando puder.)"), "(Pode responder quando puder.)");
});
