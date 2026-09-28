import { useOrganization } from "@/hooks/useOrganization";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useCommercialCampaigns,
  useCommercialHistoryJob,
  useCommercialOrigins,
  useCommercialRules,
} from "@/hooks/useCommercialOrigins";
import {
  campaignLabel,
  commercialDb,
  commercialRpc,
  type CommercialRule,
  dayAfter,
} from "@/lib/commercialOrigins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";
const newRule = {
  name: "",
  active: true,
  priority: 100,
  endpoint_id: "",
  operator: "exact" as const,
  pattern: "",
  origin_id: "",
  campaign_id: "",
};
type RuleDraft = Omit<CommercialRule, "id" | "version"> & { id?: string };
interface Decision {
  campaign_pending?: boolean;
  status: string;
  method?: string;
  origin_id?: string;
  campaign_id?: string;
  matches?: { id: string; name: string; winner: boolean }[];
  rules?: { name: string; version: number }[];
}
interface PreviewItem {
  id: string;
  occurred_at: string;
  contact_id: string;
  opportunity_id: string | null;
  entry_verified: boolean;
  first_contact_entry: boolean;
  text_content: string | null;
  decision: Decision;
  revisions: {
    origin_id: string | null;
    method: string;
    entity_type: string;
    revision: number;
  }[];
}
export function CommercialOriginsSettings() {
  const { organization } = useOrganization();
  return <CommercialOriginsSettingsContent key={organization?.id} />;
}
function CommercialOriginsSettingsContent() {
  const { permissions } = usePermissions();
  const { orgId, enabled, origins, error } = useCommercialOrigins();
  const queryClient = useQueryClient();
  const historyJob = useCommercialHistoryJob(permissions.canManageSettings ? orgId : undefined);
  const { data: campaigns = [] } = useCommercialCampaigns(
    permissions.canManageSettings ? orgId : undefined,
  );
  const { data: rules = [], error: rulesError } = useCommercialRules(
    permissions.canManageSettings ? orgId : undefined,
  );
  const { data: endpoints = [] } = useQuery({
    queryKey: ["commercial", orgId, "endpoints"],
    enabled: !!orgId && permissions.canManageSettings,
    queryFn: async () => {
      const { data, error } = await commercialDb.from("communication_endpoints")
        .select("id,display_name,external_address").eq(
          "organization_id",
          orgId!,
        ).eq("channel", "whatsapp");
      if (error) throw error;
      return data || [];
    },
  });
  const [rule, setRule] = useState<RuleDraft>(newRule);
  const [sourceName, setSourceName] = useState("");
  const [busy, setBusy] = useState(false);
  const [testText, setTestText] = useState("");
  const [testEndpoint, setTestEndpoint] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [preview, setPreview] = useState<
    { total: number; items: PreviewItem[] } | null
  >(null);
  useEffect(() => {
    setRule(newRule);
    setSourceName("");
    setTestText("");
    setTestEndpoint("");
    setDecision(null);
    setPreview(null);
    setOffset(0);
  }, [orgId]);
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: ["commercial", orgId] });
  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Não foi possível concluir.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function configure(action: string, data: unknown) {
    await commercialRpc("commercial_configure", {
      p_org: orgId,
      p_action: action,
      p_data: data,
    });
    await refresh();
    setPreview(null);
    setDecision(null);
  }
  async function loadPreview(nextOffset = 0) {
    if (!from || !to || from > to) {
      throw new Error("Informe um período válido.");
    }
    setPreview(
      await commercialRpc("commercial_backfill", {
        p_org: orgId,
        p_from: from,
        p_to: dayAfter(to),
        p_limit: 50,
        p_offset: nextOffset,
      }),
    );
    setOffset(nextOffset);
  }
  if (!permissions.canManageSettings) {
    return <p>Você não tem permissão para configurar origens comerciais.</p>;
  }
  return (
    <div className="space-y-8" key={orgId}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Origens comerciais</h1>
        <Button asChild variant="outline">
          <Link to="/commercial/origins">Ver resultados</Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Atribuição comercial independente. Configurações e correções aqui
        preservam a atribuição de marketing.
      </p>
      {(error || rulesError) && (
        <p role="alert" className="text-destructive">
          {String(error || rulesError)}
        </p>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          disabled={busy}
          checked={enabled}
          onChange={(e) =>
            run(() => configure("enable", { enabled: e.target.checked }))}
        />Ativar para esta organização
      </label>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Origens</h2>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await configure("source", { name: sourceName });
              setSourceName("");
            });
          }}
        >
          <Input
            aria-label="Nome da nova origem"
            placeholder="Ex.: Parceiro Alfa"
            maxLength={120}
            value={sourceName}
            onChange={(e) => setSourceName(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy || !sourceName.trim()}>Adicionar</Button>
        </form>
        <div className="flex flex-wrap gap-3">
          {origins.map((o) => (
            <label className="flex items-center gap-2 text-sm" key={o.id}>
              <input
                type="checkbox"
                checked={o.active}
                disabled={busy}
                onChange={(e) =>
                  run(() =>
                    configure("source", {
                      id: o.id,
                      name: o.name,
                      active: e.target.checked,
                    })
                  )}
              />
              {o.name}
            </label>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h2 className="text-lg font-medium">Regras de mensagem</h2>
        <p className="text-sm text-muted-foreground">
          Reconhece o texto enviado na entrada da oportunidade. Se o mesmo texto
          for usado em vários canais, ele não comprova a origem.
        </p>
        <div className="space-y-2">
          {rules.map((r) => (
            <div
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
              key={r.id}
            >
              <div>
                <strong className="text-sm">{r.name}</strong>
                <p className="text-sm text-muted-foreground">
                  {r.operator === "exact" ? "É exatamente" : "Contém"}:{" "}
                  {r.pattern} · {r.active ? "Ativa" : "Inativa"} · Prioridade
                  {" "}
                  {r.priority}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() =>
                  setRule({
                    ...r,
                    endpoint_id: r.endpoint_id || "",
                    campaign_id: r.campaign_id || "",
                  })}
              >
                Editar
              </Button>
            </div>
          ))}
        </div>
        <form
          className="grid gap-4 rounded border p-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await configure("rule", rule);
              setRule(newRule);
              toast.success("Regra salva.");
            });
          }}
        >
          <label className="space-y-1 text-sm">
            Nome<Input
              required
              maxLength={120}
              value={rule.name}
              onChange={(e) => setRule({ ...rule, name: e.target.value })}
            />
          </label>
          <label className="space-y-1 text-sm">
            Número de WhatsApp<select
              className={selectClass}
              value={rule.endpoint_id || ""}
              onChange={(e) =>
                setRule({ ...rule, endpoint_id: e.target.value })}
            >
              <option value="">Todos os números da organização</option>
              {endpoints.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.display_name || ep.external_address || ep.id}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Comparação<select
              className={selectClass}
              value={rule.operator}
              onChange={(e) =>
                setRule({
                  ...rule,
                  operator: e.target.value as "exact" | "contains",
                })}
            >
              <option value="exact">É exatamente</option>
              <option value="contains">Contém</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Prioridade (menor primeiro)<Input
              type="number"
              min={0}
              max={999999}
              required
              value={rule.priority}
              onChange={(e) =>
                setRule({ ...rule, priority: Number(e.target.value) })}
            />
          </label>
          <label className="space-y-1 text-sm sm:col-span-2">
            Texto<textarea
              className="min-h-24 w-full rounded border bg-background p-3"
              required
              maxLength={4000}
              value={rule.pattern}
              onChange={(e) => setRule({ ...rule, pattern: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">
              Ignora maiúsculas e espaços extras. Mantém acentos, pontuação e
              emojis. Regras exatas têm preferência.
            </span>
          </label>
          <label className="space-y-1 text-sm">
            Origem<select
              required
              className={selectClass}
              value={rule.origin_id}
              onChange={(e) => setRule({ ...rule, origin_id: e.target.value })}
            >
              <option value="">Selecione</option>
              {origins.filter((o) => o.active || o.id === rule.origin_id).map(
                (o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                    {o.active ? "" : " (inativa)"}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Campanha (opcional)<select
              className={selectClass}
              value={rule.campaign_id || ""}
              onChange={(e) =>
                setRule({ ...rule, campaign_id: e.target.value })}
            >
              <option value="">Sem campanha</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{campaignLabel(c)}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={rule.active}
              onChange={(e) => setRule({ ...rule, active: e.target.checked })}
            />Regra ativa
          </label>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRule(newRule)}
            >
              Limpar
            </Button>
            <Button type="submit" disabled={busy}>
              {rule.id ? "Salvar alterações" : "Cadastrar regra"}
            </Button>
          </div>
        </form>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Testar mensagem</h2>
        <textarea
          aria-label="Mensagem para testar"
          className="min-h-24 w-full rounded border bg-background p-3"
          maxLength={4000}
          value={testText}
          onChange={(e) => {
            setTestText(e.target.value);
            setDecision(null);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <select
            aria-label="Número do teste"
            className={selectClass + " sm:w-auto"}
            value={testEndpoint}
            onChange={(e) => {
              setTestEndpoint(e.target.value);
              setDecision(null);
            }}
          >
            <option value="">Sem número específico</option>
            {endpoints.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.display_name || ep.external_address || ep.id}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            disabled={busy || !testText.trim()}
            onClick={() =>
              run(async () =>
                setDecision(
                  await commercialRpc("commercial_configure", {
                    p_org: orgId,
                    p_action: "simulate",
                    p_data: { text: testText, endpoint_id: testEndpoint },
                  }),
                )
              )}
          >
            Testar sem aplicar
          </Button>
        </div>
        {decision && (
          <div role="status" className="rounded border p-3 text-sm">
            <p>
              {decision.status === "matched"
                ? `Origem: ${
                  origins.find((o) => o.id === decision.origin_id)?.name ||
                  "Não identificada"
                }`
                : decision.status === "conflict"
                ? "Conflito entre regras. Nenhuma origem será aplicada."
                : "Nenhuma regra corresponde."}
            </p>
            {decision.status === "matched" && (
              <p>
                Campanha: {campaigns.find((c) => c.id === decision.campaign_id)
                  ? campaignLabel(
                    campaigns.find((c) => c.id === decision.campaign_id)!,
                  )
                  : "Sem campanha"}
              </p>
            )}
            {decision.campaign_pending && (
              <p>
                A campanha da regra não está disponível. A origem será
                identificada e a campanha ficará pendente.
              </p>
            )}
            {decision.matches?.map((m) => (
              <p key={m.id}>
                {m.name} · {m.winner ? "Prioritária" : "Menor prioridade"}
              </p>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3" aria-label="Atualização automática do histórico">
        <h2 className="text-lg font-medium">Atualização do histórico</h2>
        <p className="text-sm text-muted-foreground">
          Ativar a organização ou salvar uma regra atualiza as origens ainda não identificadas em segundo plano.
          A recuperação usa evidências da entrada inicial e da própria oportunidade. Correções manuais são preservadas.
        </p>
        {historyJob.error && <p role="alert">Não foi possível consultar o processamento do histórico.</p>}
        {historyJob.data && <p role="status" className="text-sm">
          {historyJob.data.status === "complete" ? "Atualização concluída" :
            historyJob.data.status === "error" ? "Atualização interrompida. Tente novamente." :
            historyJob.data.status === "pending" ? "Atualização na fila" : "Atualizando histórico"}
          {" · "}{historyJob.data.examined.toLocaleString("pt-BR")} contatos examinados
          {" · "}{historyJob.data.updated.toLocaleString("pt-BR")} atribuições preenchidas
        </p>}
        <Button variant="outline" disabled={busy || !enabled || historyJob.data?.status === "pending" || historyJob.data?.status === "running"}
          onClick={() => run(async () => {
            await commercialRpc("commercial_queue_history", { p_org: orgId });
            await refresh();
            toast.success("Atualização iniciada. Você pode sair desta página.");
          })}>
          Atualizar histórico
        </Button>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-medium">Revisão por período</h2>
        <p className="text-sm text-muted-foreground">
          Somente origens comerciais ainda não identificadas serão preenchidas.
          Entradas antigas sem vínculo comprovado ficam para revisão.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="text-sm">
            De<Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <label className="text-sm">
            Até<Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPreview(null);
              }}
            />
          </label>
          <Button
            variant="outline"
            disabled={busy || !enabled}
            onClick={() =>
              run(async () => {
                if (!from || !to || from > to) {
                  throw new Error("Informe um período válido.");
                }
                let processed = 0;
                for (let start = 0;; start += 100) {
                  const n = await commercialRpc<number>(
                    "commercial_import_history",
                    {
                      p_org: orgId,
                      p_from: from,
                      p_to: dayAfter(to),
                      p_limit: 100,
                      p_offset: start,
                    },
                  );
                  processed += n;
                  if (n < 100) break;
                }
                toast.success(
                  `${processed} registros examinados. Nenhuma atribuição alterada.`,
                );
                await loadPreview();
              })}
          >
            Preparar histórico
          </Button>
          <Button
            disabled={busy || !enabled}
            onClick={() => run(() => loadPreview())}
          >
            Ver prévia
          </Button>
        </div>
        {preview && (
          <>
            <p className="text-sm">
              {preview.total} entradas · Página {offset / 50 + 1}
            </p>
            <div className="max-h-96 space-y-2 overflow-auto">
              {preview.items.map((item) => {
                const locked = item.revisions.some((r) =>
                  r.origin_id || r.method === "manual"
                );
                return (
                  <div className="rounded border p-3 text-sm" key={item.id}>
                    <p className="break-words">
                      {item.text_content || "Entrada sem texto"}
                    </p>
                    <p className="text-muted-foreground">
                      {new Date(item.occurred_at).toLocaleString()} ·{" "}
                      {!item.entry_verified
                        ? "Sem vínculo comprovado"
                        : item.decision.status === "conflict"
                        ? "Conflito"
                        : item.decision.status === "matched"
                        ? (locked
                          ? "Há atribuições preservadas; somente destinos vazios serão preenchidos"
                          : "Elegível para preencher")
                        : "Sem correspondência"}
                    </p>
                    <Link
                      className="underline"
                      to={`/contacts/${item.contact_id}`}
                    >
                      Ver contato
                    </Link>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={busy || offset === 0}
                onClick={() => run(() => loadPreview(offset - 50))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                disabled={busy || offset + 50 >= preview.total}
                onClick={() => run(() => loadPreview(offset + 50))}
              >
                Próxima
              </Button>
              <Button
                disabled={busy ||
                  !preview.items.some((i) =>
                    i.entry_verified && i.decision.status === "matched"
                  )}
                onClick={() =>
                  run(async () => {
                    const result = await commercialRpc<
                      { updated: number; skipped: number }
                    >("commercial_apply_preview", {
                      p_org: orgId,
                      p_items: preview.items,
                    });
                    toast.success(
                      `${result.updated} atribuições preenchidas; ${result.skipped} entradas ignoradas ou alteradas.`,
                    );
                    await refresh();
                    await loadPreview(offset);
                  })}
              >
                Aplicar esta página
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
