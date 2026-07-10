import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, TrashSimple, CaretUp, CaretDown, X } from "@phosphor-icons/react";

// Construtor visual do roteiro do webchat. Produz/consome exatamente o mesmo
// `flow` (steps) que as edge functions e o motor de roteiro já usam — o editor
// é só uma camada amigável por cima. Cobre 100% do que o motor v1 suporta.

export type StepKind = "buttons" | "text" | "name" | "phone" | "final";
export interface UIStep { kind: StepKind; bot: string; buttons: string[]; }

export const KIND_LABEL: Record<StepKind, string> = {
  buttons: "Pergunta com botões",
  text: "Pergunta aberta (texto livre)",
  name: "Pedir o nome",
  phone: "Pedir o WhatsApp",
  final: "Mensagem final",
};

export const DEFAULT_STEPS: UIStep[] = [
  { kind: "buttons", bot: "Oi! 👋 Como posso te ajudar hoje?", buttons: ["Quero saber mais", "Tenho uma dúvida"] },
  { kind: "name", bot: "Legal! Como posso te chamar?", buttons: [] },
  { kind: "phone", bot: "Perfeito, {name}! Me passa seu WhatsApp com DDD pra não te perder 👇", buttons: [] },
  { kind: "final", bot: "Prontinho, {name}! ✅ Nosso time já vai te chamar.", buttons: [] },
];

// flow (JSON) -> passos da UI
export function flowToSteps(flow: any): UIStep[] {
  const steps = flow?.steps;
  if (!Array.isArray(steps) || steps.length === 0) return DEFAULT_STEPS;
  return steps.map((s: any): UIStep => {
    let kind: StepKind = "final";
    if (s.input === "phone") kind = "phone";
    else if (s.save_as === "name" || s.input === "text" && s.id === "nome") kind = "name";
    else if (Array.isArray(s.buttons) && s.buttons.length) kind = "buttons";
    else if (s.input === "text") kind = "text";
    else kind = "final";
    return { kind, bot: s.bot || "", buttons: Array.isArray(s.buttons) ? s.buttons.slice() : [] };
  });
}

// passos da UI -> flow (JSON) que o motor consome
export function stepsToFlow(steps: UIStep[]): any {
  return {
    steps: steps.map((s, i) => {
      const id = s.kind === "name" ? "name" : s.kind === "phone" ? "phone" : "s" + i;
      if (s.kind === "phone") return { id, bot: s.bot, input: "phone", save_as: "phone" };
      if (s.kind === "name") return { id, bot: s.bot, input: "text", save_as: "name" };
      if (s.kind === "final") return { id, bot: s.bot };
      const st: any = { id, bot: s.bot, save_as: id };
      if (s.kind === "buttons") st.buttons = s.buttons.map((b) => b.trim()).filter(Boolean);
      else st.input = "text";
      return st;
    }),
    promote_on: "flow_complete",
  };
}

interface Props { steps: UIStep[]; onChange: (s: UIStep[]) => void; }

export function WebchatFlowBuilder({ steps, onChange }: Props) {
  const update = (i: number, patch: Partial<UIStep>) => onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = steps.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const remove = (i: number) => onChange(steps.filter((_, idx) => idx !== i));
  const add = () => onChange([...steps, { kind: "buttons", bot: "", buttons: ["Opção 1", "Opção 2"] }]);

  const hasPhone = steps.some((s) => s.kind === "phone");
  const hasName = steps.some((s) => s.kind === "name");

  return (
    <div className="space-y-3">
      {(!hasName || !hasPhone) && (
        <p className="text-xs text-warning bg-warning/10 rounded px-3 py-2">
          ⚠️ Para virar lead, o roteiro precisa de um passo "Pedir o nome" e um "Pedir o WhatsApp".
        </p>
      )}

      {steps.map((s, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2 bg-card">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-data text-muted-foreground">{i + 1}</span>
              <select
                value={s.kind}
                onChange={(e) => update(i, { kind: e.target.value as StepKind })}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                {(Object.keys(KIND_LABEL) as StepKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === 0} onClick={() => move(i, -1)}><CaretUp className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={i === steps.length - 1} onClick={() => move(i, 1)}><CaretDown className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" disabled={steps.length <= 1} onClick={() => remove(i)}><TrashSimple className="w-4 h-4" /></Button>
            </div>
          </div>

          <Textarea
            value={s.bot}
            onChange={(e) => update(i, { bot: e.target.value })}
            rows={2}
            placeholder="Texto que o cliente vê..."
            className="text-sm"
          />

          {s.kind === "buttons" && (
            <div className="space-y-1.5 pl-2">
              {s.buttons.map((b, bi) => (
                <div key={bi} className="flex items-center gap-1.5">
                  <Input
                    value={b}
                    onChange={(e) => update(i, { buttons: s.buttons.map((x, xi) => (xi === bi ? e.target.value : x)) })}
                    placeholder={`Botão ${bi + 1}`}
                    className="h-8 text-sm"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => update(i, { buttons: s.buttons.filter((_, xi) => xi !== bi) })}><X className="w-3.5 h-3.5" /></Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => update(i, { buttons: [...s.buttons, ""] })}><Plus className="w-3 h-3 mr-1" /> Botão</Button>
            </div>
          )}

          {(s.kind === "name" || s.kind === "phone") && (
            <p className="text-xs text-muted-foreground pl-2">↳ captura {s.kind === "name" ? "o nome" : "o WhatsApp"} do cliente{s.kind === "phone" ? " e finaliza o cadastro" : ""}.</p>
          )}
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={add}><Plus className="w-4 h-4 mr-1" /> Adicionar passo</Button>
      <p className="text-xs text-muted-foreground">💡 Use <code className="bg-muted px-1 rounded">{"{name}"}</code> para inserir o nome nas falas seguintes e <code className="bg-muted px-1 rounded">*texto*</code> para <strong>negrito</strong>.</p>
    </div>
  );
}
