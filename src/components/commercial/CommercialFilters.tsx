import {
  campaignLabel,
  type CommercialFilters as Filters,
  methodLabels,
} from "@/lib/commercialOrigins";
import {
  useCommercialCampaigns,
  useCommercialOrigins,
} from "@/hooks/useCommercialOrigins";
const selectClass =
  "h-9 max-w-full rounded-md border bg-background px-2 text-sm";
export function CommercialFilters(
  { value, onChange }: { value: Filters; onChange: (value: Filters) => void },
) {
  const { enabled, orgId, origins } = useCommercialOrigins();
  const { data: campaigns = [] } = useCommercialCampaigns(
    enabled ? orgId : undefined,
  );
  if (!enabled) return null;
  return (
    <fieldset className="flex flex-wrap items-end gap-2 py-3">
      <legend className="text-sm font-medium">Origem comercial</legend>
      <select
        aria-label="Origem comercial"
        className={selectClass}
        value={value.origin}
        onChange={(e) => onChange({ ...value, origin: e.target.value })}
      >
        <option value="">Todas as origens</option>
        <option value="unknown">Não identificada</option>
        {origins.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.active ? "" : " (inativa)"}
          </option>
        ))}
      </select>
      <select
        aria-label="Campanha comercial"
        className={selectClass}
        value={value.campaign}
        onChange={(e) => onChange({ ...value, campaign: e.target.value })}
      >
        <option value="">Todas as campanhas</option>
        <option value="none">Sem campanha</option>
        {campaigns.map((c) => (
          <option key={c.id} value={c.id}>{campaignLabel(c)}</option>
        ))}
      </select>
      <select
        aria-label="Método de atribuição"
        className={selectClass}
        value={value.method}
        onChange={(e) => onChange({ ...value, method: e.target.value })}
      >
        <option value="">Todos os métodos</option>
        {Object.entries(methodLabels).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
      <select
        aria-label="Canal de entrada"
        className={selectClass}
        value={value.channel}
        onChange={(e) => onChange({ ...value, channel: e.target.value })}
      >
        <option value="">Todos os canais</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="form">Formulário</option>
        <option value="legacy">Legado (canal não comprovado)</option>
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.pending}
          onChange={(e) => onChange({ ...value, pending: e.target.checked })}
        />Pendentes de revisão
      </label>
    </fieldset>
  );
}
