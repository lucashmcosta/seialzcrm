// Resultado das réguas da org: inscritos, respostas, ganhos, envios e o que travou (rpc_cadence_report_v1).
import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { uiText } from '@/lib/ui-locale';

interface StepRow { step_id: string; position: number; kind: string; label: string; sent: number; skipped: number; failed: number; pending: number; cancelled: number; delivered: number; opened: number; clicked: number }
interface CadenceRow {
  id: string; name: string; is_active: boolean; deleted: boolean; enrolled: number; live: number; completed: number;
  replied: number; won: number; exits: Record<string, number>; sends: Record<string, number>; problems: Record<string, number>; steps: StepRow[];
}

const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const KIND: Record<string, string> = { whatsapp_template: 'WhatsApp', email: 'E-mail', task: 'Tarefa' };

function Rate({ n, d }: { n: number; d: number }) {
  const p = pct(n, d);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${p}%` }} /></div>
      <span className="tabular-nums">{n} <span className="text-muted-foreground">({p}%)</span></span>
    </div>
  );
}

export function CadenceReport({ organizationId }: { organizationId: string }) {
  const [days, setDays] = useState('30');
  const [showDeleted, setShowDeleted] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['cadence-report', organizationId, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_cadence_report_v1' as never, { p_org: organizationId, p_days: Number(days) } as never);
      if (error) throw error;
      return data as unknown as { since: string; cadences: CadenceRow[] };
    },
  });
  const rows = (data?.cadences ?? []).filter((c) => showDeleted || !c.deleted);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{uiText('Resultados')}</CardTitle>
          <CardDescription>{uiText('Quem entrou nas réguas no período. "Ganhou" = ganhou depois de entrar.')}</CardDescription>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={showDeleted} onCheckedChange={(v) => setShowDeleted(v === true)} />{uiText('Incluir excluídas')}
          </label>
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{uiText('Últimos 7 dias')}</SelectItem>
              <SelectItem value="30">{uiText('Últimos 30 dias')}</SelectItem>
              <SelectItem value="90">{uiText('Últimos 90 dias')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">{uiText('Carregando...')}</p>
          : rows.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{uiText('Nenhuma régua com inscrições no período.')}</p>
          : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-2 font-medium">{uiText('Régua')}</th>
                  <th className="py-2 pr-2 font-medium">{uiText('Inscritos')}</th>
                  <th className="py-2 pr-2 font-medium">{uiText('Em andamento')}</th>
                  <th className="py-2 pr-2 font-medium">{uiText('Responderam')}</th>
                  <th className="py-2 pr-2 font-medium">{uiText('Ganhou')}</th>
                  <th className="py-2 pr-2 font-medium">{uiText('Enviados')}</th>
                  <th className="py-2 font-medium">{uiText('Não enviados')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const expanded = open === c.id;
                  const problemCount = (c.sends.skipped ?? 0) + (c.sends.failed ?? 0);
                  return (
                    <Fragment key={c.id}>
                      <tr className="cursor-pointer border-b hover:bg-muted/40" onClick={() => setOpen(expanded ? null : c.id)}>
                        <td className="py-2 pr-2">
                          <div className="flex items-center gap-1">
                            {expanded ? <CaretDown className="h-3.5 w-3.5" /> : <CaretRight className="h-3.5 w-3.5" />}
                            <span className="font-medium">{c.name}</span>
                            {c.deleted ? <Badge variant="outline" className="text-[10px]">{uiText('excluída')}</Badge>
                              : !c.is_active ? <Badge variant="outline" className="text-[10px]">{uiText('desligada')}</Badge> : null}
                          </div>
                        </td>
                        <td className="py-2 pr-2 tabular-nums">{c.enrolled}</td>
                        <td className="py-2 pr-2 tabular-nums">{c.live}</td>
                        <td className="py-2 pr-2"><Rate n={c.replied} d={c.enrolled} /></td>
                        <td className="py-2 pr-2"><Rate n={c.won} d={c.enrolled} /></td>
                        <td className="py-2 pr-2 tabular-nums">{c.sends.sent ?? 0}</td>
                        <td className={`py-2 tabular-nums ${problemCount ? 'text-amber-600 dark:text-amber-400' : ''}`}>{problemCount}</td>
                      </tr>
                      {expanded && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={7} className="space-y-3 p-3">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-muted-foreground">
                                  <th className="py-1 pr-2 font-medium">{uiText('Passo')}</th>
                                  <th className="py-1 pr-2 font-medium">{uiText('Enviados')}</th>
                                  <th className="py-1 pr-2 font-medium">{uiText('Pulados')}</th>
                                  <th className="py-1 pr-2 font-medium">{uiText('Falhas')}</th>
                                  <th className="py-1 pr-2 font-medium">{uiText('Agendados')}</th>
                                  <th className="py-1 pr-2 font-medium">{uiText('Cancelados')}</th>
                                  <th className="py-1 font-medium">{uiText('E-mail: entregues · abertos · clicados')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.steps.map((s) => (
                                  <tr key={s.step_id} className="border-t">
                                    <td className="py-1 pr-2">{s.position + 1}. {uiText(KIND[s.kind] ?? s.kind)}: {s.label}</td>
                                    <td className="py-1 pr-2 tabular-nums">{s.sent}</td>
                                    <td className="py-1 pr-2 tabular-nums">{s.skipped}</td>
                                    <td className="py-1 pr-2 tabular-nums">{s.failed}</td>
                                    <td className="py-1 pr-2 tabular-nums">{s.pending}</td>
                                    <td className="py-1 pr-2 tabular-nums">{s.cancelled}</td>
                                    <td className="py-1 tabular-nums">{s.kind === 'email' ? `${s.delivered} · ${s.opened} · ${s.clicked}` : '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-medium">{uiText('Por que saíram')}</p>
                                {Object.keys(c.exits).length === 0 ? <p className="text-xs text-muted-foreground">{uiText('Ninguém saiu antes do fim.')}</p>
                                  : Object.entries(c.exits).sort((a, b) => b[1] - a[1]).map(([r, n]) => <p key={r} className="text-xs">{uiText(r)}: <span className="tabular-nums">{n}</span></p>)}
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium">{uiText('O que travou envios')}</p>
                                {Object.keys(c.problems).length === 0 ? <p className="text-xs text-muted-foreground">{uiText('Nada travou.')}</p>
                                  : Object.entries(c.problems).sort((a, b) => b[1] - a[1]).map(([r, n]) => <p key={r} className="text-xs">{uiText(r)}: <span className="tabular-nums">{n}</span></p>)}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
