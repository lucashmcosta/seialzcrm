import type { CommercialOrigin } from "@/lib/commercialOrigins";
import { methodLabels } from "@/lib/commercialOrigins";
export function CommercialOriginBadge(
  { origin }: { origin?: CommercialOrigin | null },
) {
  // undefined denotes disabled feature; null denotes an enabled but unidentified record.
  if (origin === undefined) return null;
  return (
    <span
      className="inline-flex max-w-full rounded border px-2 py-0.5 text-xs text-muted-foreground"
      title={`Origem comercial · ${methodLabels[origin?.method || "unknown"]}${
        origin?.campaign_name ? ` · ${origin.campaign_name}` : ""
      }`}
    >
      {origin?.name || "Não identificada"}
      {origin?.pending ? " · Revisar" : ""}
    </span>
  );
}
