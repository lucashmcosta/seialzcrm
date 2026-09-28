import { useQuery } from "@tanstack/react-query";
import {
  useCommercialCampaigns,
  useCommercialOrigins,
} from "@/hooks/useCommercialOrigins";
import {
  campaignLabel,
  commercialDb,
  type CommercialSelection,
} from "@/lib/commercialOrigins";
export function CommercialOriginSelection(
  { contactId, value, onChange }: {
    contactId?: string | null;
    value: CommercialSelection;
    onChange: (v: CommercialSelection) => void;
  },
) {
  const { enabled, orgId, origins } = useCommercialOrigins();
  const { data: campaigns = [] } = useCommercialCampaigns(
    enabled ? orgId : undefined,
  );
  const events = useQuery({
    queryKey: ["commercial", orgId, "select-events", contactId],
    enabled: enabled && !!contactId && !!orgId,
    queryFn: async () => {
      const { data, error } = await commercialDb.from(
        "commercial_origin_events",
      ).select("id,occurred_at,text_content,result").eq(
        "organization_id",
        orgId!,
      ).eq("contact_id", contactId!).order("occurred_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });
  if (!enabled) return null;
  const cls = "h-10 w-full rounded border bg-background px-2 text-sm";
  return (
    <fieldset className="space-y-2 rounded border p-3">
      <legend className="text-sm font-medium">
        Origem comercial (opcional)
      </legend>
      {contactId && (
        <label className="block text-sm">
          Evento do contato<select
            className={cls}
            value={value.event}
            onChange={(e) => {
              const ev = events.data?.find((v) => v.id === e.target.value);
              onChange({
                origin: ev?.result?.origin_id || "",
                campaign: ev?.result?.campaign_id || "",
                event: e.target.value,
              });
            }}
          >
            <option value="">Selecionar origem diretamente</option>
            {events.data?.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {new Date(ev.occurred_at).toLocaleString()} ·{" "}
                {(ev.text_content || "Entrada sem texto").slice(0, 65)}
              </option>
            ))}
          </select>
        </label>
      )}
      {events.error && (
        <p role="alert" className="text-sm">
          Não foi possível carregar os eventos deste contato.
        </p>
      )}
      <label className="block text-sm">
        Origem<select
          className={cls}
          value={value.origin}
          onChange={(e) => onChange({ ...value, origin: e.target.value })}
        >
          <option value="">Não identificada</option>
          {origins.filter((o) => o.active).map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Campanha<select
          className={cls}
          value={value.campaign}
          onChange={(e) => onChange({ ...value, campaign: e.target.value })}
        >
          <option value="">Sem campanha</option>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>{campaignLabel(c)}</option>
          ))}
        </select>
      </label>
    </fieldset>
  );
}
