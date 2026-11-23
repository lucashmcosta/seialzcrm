import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useCommercialCampaigns,
  useCommercialOrigins,
} from "@/hooks/useCommercialOrigins";
import {
  campaignLabel,
  commercialDb,
  commercialRpc,
} from "@/lib/commercialOrigins";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { OriginSummary } from "@/components/commercial/OriginSummary";
import { entryLabel } from "@/lib/originDisplay";
const selectClass = "h-10 w-full rounded border bg-background px-2 text-sm";
const evidenceLabels: Record<string, string> = {
  utm_source: "Fonte (utm_source)", utm_medium: "Meio (utm_medium)", utm_campaign: "Campanha (utm_campaign)",
  utm_content: "Anúncio (utm_content)", utm_term: "Termo (utm_term)", utm_id: "ID (utm_id)",
  meta_campaign_id: "ID da campanha Meta", meta_adset_id: "ID do conjunto Meta",
  ad_id: "ID do anúncio", landing_url: "Página de entrada", referrer_url: "Veio do site",
};
const channelLabels: Record<string, string> = { whatsapp: "WhatsApp", form: "Formulário", webchat: "Chat do site", legacy: "Importado" };
export function CommercialAttributionPanel(
  { entityType, entityId, contactId, entrySource }: {
    entityType: "contact" | "opportunity";
    entityId: string;
    contactId?: string | null;
    /** contacts.source: mostra "Entrou por" (fixo, separado da origem). */
    entrySource?: string | null;
  },
) {
  const { orgId, enabled, origins } = useCommercialOrigins();
  const { permissions } = usePermissions();
  const queryClient = useQueryClient();
  const { data: campaigns = [] } = useCommercialCampaigns(
    enabled ? orgId : undefined,
  );
  const [editing, setEditing] = useState(false);
  const [origin, setOrigin] = useState("");
  const [campaign, setCampaign] = useState("");
  const [event, setEvent] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setEditing(false);
    setReason("");
    setEvent("");
    setOrigin("");
    setCampaign("");
  }, [orgId, entityId, entityType]);
  const canEdit = entityType === "contact"
    ? permissions.canEditContacts
    : permissions.canEditOpportunities;
  const attribution = useQuery({
    queryKey: ["commercial", orgId, "entity", entityType, entityId],
    enabled: enabled && !!orgId,
    queryFn: async () => {
      const { data, error } = await commercialDb.from("commercial_attributions")
        .select("*").eq("organization_id", orgId!).eq("entity_type", entityType)
        .eq("entity_id", entityId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const history = useQuery({
    queryKey: ["commercial", orgId, "history", entityType, entityId],
    enabled: enabled && !!orgId,
    queryFn: async () => {
      const { data, error } = await commercialDb.from(
        "commercial_attribution_history",
      ).select("*").eq("organization_id", orgId!).eq("entity_type", entityType)
        .eq("entity_id", entityId).order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });
  const events = useQuery({
    queryKey: ["commercial", orgId, "events", contactId || entityId],
    enabled: enabled && !!orgId && (entityType === "contact" || !!contactId),
    queryFn: async () => {
      const { data, error } = await commercialDb.from(
        "commercial_origin_events",
      ).select("id,occurred_at,channel,text_content,result,entry_verified,evidence").eq(
        "organization_id",
        orgId!,
      ).eq("contact_id", entityType === "contact" ? entityId : contactId!)
        .order("occurred_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
  });
  if (!enabled) return null;
  const a = attribution.data;
  return (
    <section className="space-y-3 rounded border bg-background p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-medium">Origem</h2>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(!editing);
              setOrigin(a?.origin_id || "");
              setCampaign(a?.campaign_id || "");
              setEvent(a?.event_id || "");
            }}
          >
            Corrigir
          </Button>
        )}
      </div>
      {attribution.error
        ? <p role="alert">{String(attribution.error)}</p>
        : (
          <div className="space-y-1 text-sm">
            <OriginSummary entityType={entityType} entityId={entityId} />
            {entityType === "contact" && (
              <p className="text-xs text-muted-foreground">Entrou por: <span className="text-foreground">{entryLabel(entrySource)}</span></p>
            )}
            {a?.pending && <p className="text-xs text-amber-600 dark:text-amber-400">Campanha a confirmar</p>}
          </div>
        )}
      {editing && (
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await commercialRpc("commercial_correct", {
                p_org: orgId,
                p_type: entityType,
                p_id: entityId,
                p_origin: origin || null,
                p_campaign: campaign || null,
                p_event: event || null,
                p_reason: reason,
              });
              await queryClient.invalidateQueries({
                queryKey: ["commercial", orgId],
              });
              setEditing(false);
              setReason("");
              toast.success("Origem atualizada.");
            } catch (err) {
              toast.error(String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="block text-sm">
            Com base em qual entrada (opcional)<select
              className={selectClass}
              value={event}
              onChange={(e) => {
                setEvent(e.target.value);
                const selected = events.data?.find((ev) =>
                  ev.id === e.target.value
                );
                if (selected) {
                  setOrigin(selected.result?.origin_id || "");
                  setCampaign(selected.result?.campaign_id || "");
                }
              }}
            >
              <option value="">Nenhuma</option>
              {events.data?.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {new Date(ev.occurred_at).toLocaleString()} · {channelLabels[ev.channel] || ev.channel} ·
                  {" "}
                  {(ev.text_content || "Sem texto").slice(0, 70)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Origem<select
              className={selectClass}
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            >
              <option value="">Não identificado</option>
              {origins.filter((o) => o.active).map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Campanha<select
              className={selectClass}
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
            >
              <option value="">Sem campanha</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{campaignLabel(c)}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Motivo<Input
              minLength={3}
              maxLength={1000}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy}>Salvar correção</Button>
        </form>
      )}
      {a?.details?.evidence && Object.keys(evidenceLabels).some((k) => typeof a.details.evidence[k] === "string" && a.details.evidence[k]) && (
        <details>
        <summary className="cursor-pointer text-sm">Pistas que definiram a origem</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          {Object.entries(evidenceLabels).map(([key, label]) => {
            const value = a.details.evidence[key];
            return typeof value === "string" && value ? (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-all">{value}</dd>
              </div>
            ) : null;
          })}
        </dl>
        </details>
      )}
      <details>
        <summary className="cursor-pointer text-sm">
          Histórico
        </summary>
        {(events.error || history.error) && (
          <p role="alert">Não foi possível carregar o histórico.</p>
        )}
        <ul className="mt-3 space-y-3 text-sm">
          {events.data?.map((ev) => (
            <li key={ev.id}>
              <p>
                {new Date(ev.occurred_at).toLocaleString()} · {channelLabels[ev.channel] || ev.channel} ·
                {" "}
                {ev.evidence?.historical_initial
                  ? "Primeiro contato"
                  : ev.entry_verified
                  ? "Entrada"
                  : "Mensagem sem vínculo comprovado"}
              </p>
              <p className="break-words text-muted-foreground">
                {ev.text_content}
              </p>
              {ev.result?.rules?.map((
                r: { id: string; name: string; version: number },
              ) => <p key={r.id}>Regra: {r.name} · versão {r.version}</p>)}
            </li>
          ))}
        </ul>
        <ul className="mt-4 space-y-3 text-sm">
          {history.data?.map((h) => (
            <li key={h.id}>
              <p>{new Date(h.created_at).toLocaleString()} · {h.reason}</p>
              <p className="text-muted-foreground">
                {origins.find((o) => o.id === h.before_data?.origin_id)?.name ||
                  "Não identificado"} →{" "}
                {origins.find((o) => o.id === h.after_data?.origin_id)?.name ||
                  "Não identificado"} ·{" "}
                {h.actor_id ? "Alteração por usuário" : "Automático"}
              </p>
            </li>
          ))}
        </ul>
        {events.data?.length === 100 || history.data?.length === 100
          ? (
            <p className="text-xs text-muted-foreground">
              Exibindo os 100 registros mais recentes.
            </p>
          )
          : null}
      </details>
    </section>
  );
}
