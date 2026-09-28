import { useOrganization } from "@/hooks/useOrganization";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { usePermissions } from "@/hooks/usePermissions";
import { useCommercialOrigins } from "@/hooks/useCommercialOrigins";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { CommercialFilters } from "@/components/commercial/CommercialFilters";
import {
  commercialRpc,
  dayAfter,
  emptyCommercialFilters,
} from "@/lib/commercialOrigins";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
interface Group {
  origin_id: string | null;
  campaign_id: string | null;
  origin_name: string;
  campaign_name: string;
  currency: string | null;
  created: number;
  open: number;
  won: number;
  lost: number;
  open_value: number;
  won_value: number;
  conversion: number;
}
interface Report {
  contacts: number;
  opportunities: number;
  unidentified: number;
  groups: Group[];
  contact_groups: {
    origin_name: string;
    campaign_name: string;
    origin_id: string | null;
    campaign_id: string | null;
    contacts: number;
  }[];
}
export default function OriginsReport() {
  const { organization } = useOrganization();
  return <OriginsReportContent key={organization?.id} />;
}
function OriginsReportContent() {
  const { orgId, enabled, loading } = useCommercialOrigins();
  const { permissions } = usePermissions();
  const [filters, setFilters, , hydrated] = usePersistedFilters(
    "commercial.report.filters",
    emptyCommercialFilters,
  );
  const [from, setFrom] = useState(
    new Date().toISOString().slice(0, 7) + "-01",
  );
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [drill, setDrill] = useState<
    {
      type: "contact" | "opportunity";
      origin: string;
      campaign: string;
      currency?: string;
    } | null
  >(null);
  const [page, setPage] = useState(0);
  const period = { ...filters, from, to: dayAfter(to) };
  const report = useQuery({
    queryKey: ["commercial", orgId, "report", period],
    enabled: !!orgId && enabled && hydrated &&
      permissions.canViewOpportunities && !!from && !!to && from <= to,
    queryFn: () =>
      commercialRpc<Report>("commercial_report", {
        p_org: orgId,
        p_filters: period,
      }),
  });
  const records = useQuery({
    queryKey: ["commercial", orgId, "drill", period, drill, page],
    enabled: !!orgId && enabled && !!drill,
    queryFn: () =>
      commercialRpc<
        {
          total: number;
          items: { id: string; title?: string; full_name?: string }[];
        }
      >("commercial_records", {
        p_org: orgId,
        p_type: drill!.type,
        p_filters: {
          ...period,
          origin: drill!.origin,
          campaign: drill!.campaign,
          currency: drill!.currency,
        },
        p_limit: 25,
        p_offset: page * 25,
      }),
  });
  const money = (v: number, c: string | null) =>
    new Intl.NumberFormat(
      "pt-BR",
      c ? { style: "currency", currency: c } : { maximumFractionDigits: 2 },
    ).format(v);
  const showRecords = (
    type: "contact" | "opportunity",
    origin: string | null,
    campaign: string | null,
    currency?: string,
  ) => {
    setDrill({
      type,
      currency,
      origin: origin || "unknown",
      campaign: campaign || "none",
    });
    setPage(0);
  };
  return (
    <Layout>
      <main className="space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">
            Resultados por origem comercial
          </h1>
          {permissions.canManageSettings && (
            <Button asChild variant="outline">
              <Link to="/settings/commercial-origins">Configurar origens</Link>
            </Button>
          )}
        </div>
        {!permissions.canViewOpportunities
          ? <p>Você não tem acesso aos resultados comerciais.</p>
          : loading
          ? <p>Carregando…</p>
          : !enabled
          ? (
            <p>
              As origens comerciais ainda não estão ativas nesta organização.
            </p>
          )
          : (
            <>
              <div className="flex flex-wrap gap-3">
                <label className="text-sm">
                  Criados de<Input
                    type="date"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <label className="text-sm">
                  Até<Input
                    type="date"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setPage(0);
                    }}
                  />
                </label>
              </div>
              <CommercialFilters
                value={filters}
                onChange={(v) => {
                  setFilters(v);
                  setPage(0);
                }}
              />
              <p className="text-sm text-muted-foreground">
                Oportunidades criadas no período, com situação atual. Conversão:
                ganhas ÷ criadas. Contatos usam a origem inicial e a própria
                data de criação.
              </p>
              {report.error
                ? (
                  <p role="alert" className="text-destructive">
                    {String(report.error)}
                  </p>
                )
                : report.isLoading
                ? <p>Carregando resultados…</p>
                : report.data && (
                  <>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                      {[["Contatos adquiridos", report.data.contacts], [
                        "Oportunidades criadas",
                        report.data.opportunities,
                      ], [
                        "Sem origem identificada",
                        `${report.data.unidentified} (${
                          report.data.opportunities
                            ? Math.round(
                              report.data.unidentified /
                                report.data.opportunities * 100,
                            )
                            : 0
                        }%)`,
                      ]].map(([label, value]) => (
                        <div className="rounded border p-4" key={String(label)}>
                          <p className="text-sm text-muted-foreground">
                            {label}
                          </p>
                          <p className="text-2xl font-semibold">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="overflow-auto">
                      <table className="w-full text-left text-sm">
                        <caption className="sr-only">
                          Oportunidades por origem, campanha e moeda
                        </caption>
                        <thead>
                          <tr>
                            {[
                              "Origem",
                              "Campanha",
                              "Moeda",
                              "Criadas",
                              "Abertas",
                              "Ganhas",
                              "Perdidas",
                              "Em aberto",
                              "Valor ganho",
                              "Conversão",
                            ].map((h) => (
                              <th
                                className="whitespace-nowrap border-b p-3"
                                key={h}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {report.data.groups.map((g, i) => (
                            <tr key={i}>
                              <td className="border-b p-3">
                                <button
                                  className="underline"
                                  onClick={() =>
                                    showRecords(
                                      "opportunity",
                                      g.origin_id,
                                      g.campaign_id,
                                      g.currency || "unknown",
                                    )}
                                >
                                  {g.origin_name}
                                </button>
                              </td>
                              <td className="border-b p-3">
                                {g.campaign_name}
                              </td>
                              <td className="border-b p-3">
                                {g.currency || "Não informada"}
                              </td>
                              {[
                                g.created,
                                g.open,
                                g.won,
                                g.lost,
                                money(g.open_value, g.currency),
                                money(g.won_value, g.currency),
                                `${g.conversion}%`,
                              ].map((v, j) => (
                                <td
                                  key={j}
                                  className="whitespace-nowrap border-b p-3"
                                >
                                  {v}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {report.data.groups.length === 0 && (
                        <p className="py-4">
                          Nenhuma oportunidade corresponde aos filtros.
                        </p>
                      )}
                    </div>
                    <details className="rounded border p-4">
                      <summary className="cursor-pointer font-medium">
                        Contatos por origem
                      </summary>
                      <ul className="mt-3 space-y-2">
                        {report.data.contact_groups.map((g, i) => (
                          <li key={i}>
                            <button
                              className="text-sm underline"
                              onClick={() =>
                                showRecords(
                                  "contact",
                                  g.origin_id,
                                  g.campaign_id,
                                )}
                            >
                              {g.origin_name} · {g.campaign_name}: {g.contacts}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
              {drill && (
                <section className="space-y-3 rounded border p-4">
                  <div className="flex justify-between">
                    <h2 className="font-medium">Registros do resultado</h2>
                    <Button variant="ghost" onClick={() => setDrill(null)}>
                      Fechar
                    </Button>
                  </div>
                  {records.error
                    ? <p role="alert">{String(records.error)}</p>
                    : records.isLoading
                    ? <p>Carregando…</p>
                    : (
                      <>
                        <ul className="space-y-2">
                          {records.data?.items.map((r) => (
                            <li key={r.id}>
                              <Link
                                className="underline"
                                to={`/${
                                  drill.type === "contact"
                                    ? "contacts"
                                    : "opportunities"
                                }/${r.id}`}
                              >
                                {r.full_name || r.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            disabled={page === 0}
                            onClick={() => setPage((p) => p - 1)}
                          >
                            Anterior
                          </Button>
                          <span className="text-sm">
                            {records.data?.total || 0} registros · Página{" "}
                            {page + 1}
                          </span>
                          <Button
                            variant="outline"
                            disabled={(page + 1) * 25 >=
                              (records.data?.total || 0)}
                            onClick={() => setPage((p) => p + 1)}
                          >
                            Próxima
                          </Button>
                        </div>
                      </>
                    )}
                </section>
              )}
            </>
          )}
      </main>
    </Layout>
  );
}
