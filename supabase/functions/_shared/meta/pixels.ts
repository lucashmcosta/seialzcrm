// Regras puras da lista de Pixels da Conversions API (testadas em tests/meta-pixels.test.ts).
export interface PixelOption {
  id: string;
  name: string | null;
  ad_account_name: string | null;
  /** false quando a Meta nunca recebeu evento neste Pixel. */
  has_fired: boolean;
}

// A Meta devolve a data zero (1970) ou nada quando o Pixel nunca recebeu evento.
export function pixelHasFired(lastFired: unknown): boolean {
  if (typeof lastFired !== "string" || !lastFired) return false;
  const t = Date.parse(lastFired);
  return Number.isFinite(t) && t > 0;
}

// Junta os Pixels de várias contas sem repetir (o mesmo Pixel pode estar em mais de uma).
export function mergePixels(
  accounts: Array<{ ad_account_name: string | null; rows: Array<{ id?: unknown; name?: unknown; last_fired_time?: unknown }> }>,
): PixelOption[] {
  const byId = new Map<string, PixelOption>();
  for (const account of accounts) {
    for (const row of account.rows) {
      if (row.id === undefined || row.id === null || row.id === "") continue;
      const id = String(row.id);
      const hasFired = pixelHasFired(row.last_fired_time);
      const current = byId.get(id);
      if (current) {
        current.has_fired = current.has_fired || hasFired;
        continue;
      }
      byId.set(id, {
        id,
        name: typeof row.name === "string" && row.name ? row.name : null,
        ad_account_name: account.ad_account_name,
        has_fired: hasFired,
      });
    }
  }
  // Pixels que já recebem eventos primeiro; depois por nome.
  return [...byId.values()].sort((a, b) =>
    Number(b.has_fired) - Number(a.has_fired) || (a.name ?? a.id).localeCompare(b.name ?? b.id)
  );
}

// Só preenche a Página sozinho quando não há dúvida (uma única selecionada).
export function singleOrNull(values: Array<string | null | undefined>): string | null {
  const unique = [...new Set(values.filter((v): v is string => !!v))];
  return unique.length === 1 ? unique[0] : null;
}
