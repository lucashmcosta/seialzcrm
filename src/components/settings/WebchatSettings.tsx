import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, PencilSimple, Copy, ChatCircleDots, SpinnerGap } from "@phosphor-icons/react";
import { WebchatFlowBuilder, flowToSteps, stepsToFlow, DEFAULT_STEPS, type UIStep } from "./WebchatFlowBuilder";

interface Stage { id: string; name: string; }
interface Widget {
  id: string;
  external_account_id: string;
  display_name: string | null;
  is_active: boolean;
  inbound_settings: any;
}
interface Metrics { sessions: number; promoted: number; }

// Roteiro padrão de qualificação (o operador edita). Costura de IA: as respostas
// vão estruturadas em collected[save_as]; promoção dispara ao completar com name+phone.
const WIDGET_HOST = window.location.origin; // v1: servido pelo mesmo host (Vercel)

function genKey() {
  const r = crypto.getRandomValues(new Uint8Array(12));
  return "wgt_" + Array.from(r).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function WebchatSettings() {
  const { organization } = useOrganization();
  const { toast } = useToast();
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [metrics, setMetrics] = useState<Record<string, Metrics>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Widget | null>(null);
  const [open, setOpen] = useState(false);

  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [domains, setDomains] = useState("");
  const [color, setColor] = useState("#0E7C5A");
  const [stageId, setStageId] = useState("");
  const [steps, setSteps] = useState<UIStep[]>(DEFAULT_STEPS);
  const [bubble, setBubble] = useState(true);
  const [autoOpen, setAutoOpen] = useState(0);

  useEffect(() => { if (organization?.id) { fetchAll(); } }, [organization?.id]);

  async function fetchAll() {
    if (!organization?.id) return;
    setLoading(true);
    const [{ data: eps }, { data: st }] = await Promise.all([
      supabase.from("communication_endpoints")
        .select("id, external_account_id, display_name, is_active, inbound_settings")
        .eq("organization_id", organization.id).eq("channel", "webchat")
        .order("created_at", { ascending: false }),
      supabase.from("pipeline_stages").select("id, name").eq("organization_id", organization.id).order("name"),
    ]);
    setWidgets((eps as Widget[]) || []);
    setStages((st as Stage[]) || []);
    // métricas do funil por widget
    const { data: sess } = await supabase.from("webchat_sessions")
      .select("endpoint_id, status").eq("organization_id", organization.id);
    const m: Record<string, Metrics> = {};
    (sess || []).forEach((s: any) => {
      m[s.endpoint_id] = m[s.endpoint_id] || { sessions: 0, promoted: 0 };
      m[s.endpoint_id].sessions++;
      if (s.status === "promoted") m[s.endpoint_id].promoted++;
    });
    setMetrics(m);
    setLoading(false);
  }

  function openNew() {
    setEditing(null); setName(""); setBrandName(""); setAvatarUrl(""); setDomains(""); setColor("#0E7C5A");
    setStageId(stages[0]?.id || ""); setSteps(DEFAULT_STEPS);
    setBubble(true); setAutoOpen(0); setOpen(true);
  }
  function openEdit(w: Widget) {
    const s = w.inbound_settings || {};
    setEditing(w); setName(w.display_name || "");
    setBrandName(s.brand?.display_name || w.display_name || "");
    setAvatarUrl(s.brand?.avatar_url || "");
    setDomains((s.allowed_domains || []).join(", "));
    setColor(s.theme?.primary_color || "#0E7C5A");
    setStageId(s.target?.pipeline_stage_id || stages[0]?.id || "");
    setSteps(flowToSteps(s.flow));
    setBubble(s.launcher?.bubble !== false); setAutoOpen(s.launcher?.autoOpen || 0);
    setOpen(true);
  }

  async function save() {
    if (!organization?.id) return;
    if (!name.trim()) { toast({ variant: "destructive", description: "Dê um nome ao widget." }); return; }
    if (!stageId) { toast({ variant: "destructive", description: "Escolha a etapa de destino do lead." }); return; }
    if (!steps.some((s) => s.kind === "name") || !steps.some((s) => s.kind === "phone")) {
      toast({ variant: "destructive", description: "O roteiro precisa de um passo 'Pedir o nome' e um 'Pedir o WhatsApp' para gerar o lead." }); return;
    }
    const flow = stepsToFlow(steps);

    const inbound_settings = {
      ...(editing?.inbound_settings || {}),
      allowed_domains: domains.split(",").map((d) => d.trim()).filter(Boolean),
      theme: { ...(editing?.inbound_settings?.theme || {}), primary_color: color },
      brand: { display_name: brandName.trim() || name, avatar_url: avatarUrl.trim() || null },
      flow,
      target: { pipeline_stage_id: stageId, opportunity_source: "webchat" },
      assignment: { mode: "round_robin" },
      launcher: { bubble, autoOpen: Number(autoOpen) || 0 },
    };

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase.from("communication_endpoints")
          .update({ display_name: name, inbound_settings }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("communication_endpoints").insert({
          organization_id: organization.id,
          channel: "webchat", provider: "seialz", purpose: "commercial",
          status: "online", is_active: true,
          external_account_id: genKey(), display_name: name,
          metadata: {}, inbound_settings,
        });
        if (error) throw error;
      }
      toast({ description: "Widget salvo." });
      setOpen(false); fetchAll();
    } catch (e: any) {
      toast({ variant: "destructive", description: e.message || "Erro ao salvar." });
    } finally { setSaving(false); }
  }

  async function toggleActive(w: Widget) {
    await supabase.from("communication_endpoints").update({ is_active: !w.is_active }).eq("id", w.id);
    fetchAll();
  }

  function snippet(w: Widget) {
    const l = w.inbound_settings?.launcher || {};
    const c = w.inbound_settings?.theme?.primary_color;
    const opts = [`key:"${w.external_account_id}"`];
    if (c) opts.push(`color:"${c}"`);
    if (l.bubble === false) opts.push("bubble:false");
    if (l.autoOpen > 0) opts.push(`autoOpen:${l.autoOpen}`);
    const base = `<script>window.SeialzWidget={${opts.join(",")}}</script>\n<script src="${WIDGET_HOST}/webchat/loader.js" async></script>`;
    // Sem balão flutuante: o chat só abre por um botão/link seu. Já entregamos o
    // exemplo pronto no snippet (com comentário), pra não ficar dúvida de "o que chamar".
    if (l.bubble === false) {
      return base +
        `\n\n<!-- Sem balao: coloque data-seialz-chat em QUALQUER botao/link da sua pagina para abrir o chat -->\n` +
        `<button data-seialz-chat>Falar com um especialista</button>\n` +
        `<!-- Ou, via codigo, chame: SeialzWidget.open() -->`;
    }
    return base;
  }
  function copySnippet(w: Widget) {
    navigator.clipboard.writeText(snippet(w));
    toast({ description: "Snippet copiado. Cole antes do </body> da sua landing page." });
  }

  if (loading) return <div className="flex justify-center p-8"><SpinnerGap className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ChatCircleDots className="w-6 h-6" weight="light" /> Webchat</h1>
          <p className="text-sm text-muted-foreground mt-1">Chat de captação para suas landing pages. Não depende do WhatsApp/Meta — leads qualificados caem direto no seu pipeline.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> Novo widget</Button>
      </div>

      {widgets.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ChatCircleDots className="w-10 h-10 mx-auto mb-3 opacity-50" weight="light" />
          Nenhum widget ainda. Crie um e cole o snippet na sua landing page.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4">
          {widgets.map((w) => {
            const m = metrics[w.id] || { sessions: 0, promoted: 0 };
            return (
              <Card key={w.id}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    {w.display_name || "Widget"}
                    <Badge variant={w.is_active ? "default" : "secondary"}>{w.is_active ? "Ativo" : "Inativo"}</Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Switch checked={w.is_active} onCheckedChange={() => toggleActive(w)} />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(w)}><PencilSimple className="w-4 h-4" /></Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-6 text-sm">
                    <span className="text-muted-foreground">Sessões: <span className="font-data text-foreground">{m.sessions}</span></span>
                    <span className="text-muted-foreground">Leads: <span className="font-data text-foreground">{m.promoted}</span></span>
                    <span className="text-muted-foreground">Conversão: <span className="font-data text-foreground">{m.sessions ? Math.round((m.promoted / m.sessions) * 100) : 0}%</span></span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {w.inbound_settings?.launcher?.bubble === false
                      ? "🔘 Modo botão — sem balão flutuante. O chat abre por um botão/link seu (já incluído no snippet)."
                      : "💬 Modo balão — aparece flutuando no canto da página."}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs bg-muted rounded px-3 py-2 overflow-x-auto whitespace-pre">{snippet(w)}</code>
                    <Button variant="outline" size="icon" onClick={() => copySnippet(w)}><Copy className="w-4 h-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? "Editar widget" : "Novo widget"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Nome do widget (interno)</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Landing Insalubridade" /></div>
            <div className="flex items-center gap-3">
              <div className="flex-1"><Label>Nome exibido no chat</Label><Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="Central Trabalhista" /></div>
              {avatarUrl.trim() ? <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover border" /> : <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-medium">{(brandName || "?").slice(0, 1).toUpperCase()}</div>}
            </div>
            <div><Label>Foto/avatar no chat (URL)</Label><Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://.../logo.png (opcional)" /></div>
            <div><Label>Domínios permitidos (separados por vírgula)</Label><Input value={domains} onChange={(e) => setDomains(e.target.value)} placeholder="landingtal.com.br, www.landingtal.com.br" /></div>
            <div className="flex items-center gap-3">
              <div><Label>Cor</Label><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-16 p-1" /></div>
              <div className="flex-1"><Label>Etapa de destino do lead</Label>
                <select value={stageId} onChange={(e) => setStageId(e.target.value)} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">Selecione...</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <Label>Roteiro da conversa</Label>
              <div className="mt-2"><WebchatFlowBuilder steps={steps} onChange={setSteps} /></div>
            </div>
            <div className="border-t pt-4 space-y-3">
              <Label className="text-sm font-semibold">Como o chat abre</Label>
              <div className="flex items-center justify-between">
                <div><Label className="font-normal">Bolha flutuante</Label><p className="text-xs text-muted-foreground">Mostra a bolinha 💬 no canto da página</p></div>
                <Switch checked={bubble} onCheckedChange={setBubble} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div><Label className="font-normal">Abrir sozinho após</Label><p className="text-xs text-muted-foreground">0 = não abre sozinho</p></div>
                <div className="flex items-center gap-2"><Input type="number" min={0} value={autoOpen} onChange={(e) => setAutoOpen(Number(e.target.value))} className="w-20" /><span className="text-sm text-muted-foreground">seg</span></div>
              </div>
              <p className="text-xs text-muted-foreground">💡 Botão próprio: coloque <code className="bg-muted px-1 rounded">data-seialz-chat</code> em qualquer botão ou link da sua página que ele abre o chat. Ex: <code className="bg-muted px-1 rounded">&lt;button data-seialz-chat&gt;Simular minha rescisão&lt;/button&gt;</code></p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving ? <SpinnerGap className="w-4 h-4 animate-spin" /> : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
