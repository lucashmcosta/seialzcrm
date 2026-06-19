import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle, XCircle, Briefcase, Target, CurrencyDollar } from '@phosphor-icons/react';
import type { UserStats } from './UserLeaderboard';

interface Opp {
  id: string;
  title: string;
  amount: number | null;
  status: string;
  pipeline_stage_id: string | null;
  close_date: string | null;
  created_at: string;
  updated_at: string;
  contacts?: { full_name: string | null } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserStats;
  organizationId: string;
  range: { from: Date; to: Date };
  formatCurrency: (n: number) => string;
  stagesById: Record<string, string>;
}

function initials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('') || '?'
  );
}

export default function UserDetailDialog({
  open,
  onOpenChange,
  user,
  organizationId,
  range,
  formatCurrency,
  stagesById,
}: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [opps, setOpps] = useState<Opp[]>([]);

  useEffect(() => {
    if (!open || !user.userId || user.userId === 'unassigned') {
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const fromIso = range.from.toISOString();
      const toIso = range.to.toISOString();
      const { data } = await supabase
        .from('opportunities')
        .select(
          'id, title, amount, status, pipeline_stage_id, close_date, created_at, updated_at, contacts(full_name)'
        )
        .eq('organization_id', organizationId)
        .eq('owner_user_id', user.userId)
        .is('deleted_at', null)
        .or(
          `status.eq.open,and(status.in.(won,lost),updated_at.gte.${fromIso},updated_at.lte.${toIso})`
        )
        .order('updated_at', { ascending: false })
        .limit(500);
      if (!cancelled) {
        setOpps((data as Opp[]) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, user.userId, organizationId, range.from, range.to]);

  const grouped = useMemo(() => {
    const open: Opp[] = [];
    const won: Opp[] = [];
    const lost: Opp[] = [];
    opps.forEach((o) => {
      if (o.status === 'open') open.push(o);
      else if (o.status === 'won') won.push(o);
      else if (o.status === 'lost') lost.push(o);
    });
    return { open, won, lost };
  }, [opps]);

  const winRate =
    user.created > 0 ? (user.won / user.created) * 100 : 0;

  const renderList = (items: Opp[]) => {
    if (loading) {
      return (
        <div className="space-y-2 p-1">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      );
    }
    if (items.length === 0) {
      return (
        <div className="py-10 text-center text-sm text-muted-foreground">
          Nenhuma oportunidade
        </div>
      );
    }
    return (
      <div className="divide-y divide-border">
        {items.map((o) => {
          const stageName = (o.pipeline_stage_id && stagesById[o.pipeline_stage_id]) || '—';
          const dateStr = o.close_date
            ? format(new Date(o.close_date), 'dd MMM yyyy', { locale: ptBR })
            : format(new Date(o.updated_at), 'dd MMM yyyy', { locale: ptBR });
          return (
            <button
              key={o.id}
              onClick={() => {
                onOpenChange(false);
                navigate(`/opportunities/${o.id}`);
              }}
              className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{o.title}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {stageName}
                  {o.contacts?.full_name ? ` · ${o.contacts.full_name}` : ''}
                </p>
              </div>
              <div className="flex flex-col items-end shrink-0">
                <span className="font-mono text-sm font-semibold text-foreground">
                  {formatCurrency(Number(o.amount) || 0)}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">{dateStr}</span>
              </div>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="border-b border-border p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
              {initials(user.fullName)}
            </div>
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold">
                {user.fullName}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Período: {format(range.from, 'dd MMM', { locale: ptBR })} —{' '}
                {format(range.to, 'dd MMM yyyy', { locale: ptBR })}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
          <div className="bg-card p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Briefcase size={11} weight="duotone" /> Abertas
            </div>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground">{user.open}</p>
          </div>
          <div className="bg-card p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <CheckCircle size={11} weight="duotone" /> Ganhas
            </div>
            <p className="mt-1 font-mono text-lg font-semibold text-success">{user.won}</p>
          </div>
          <div className="bg-card p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <XCircle size={11} weight="duotone" /> Perdidas
            </div>
            <p className="mt-1 font-mono text-lg font-semibold text-destructive">{user.lost}</p>
          </div>
          <div className="bg-card p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <Target size={11} weight="duotone" /> Conversão
            </div>
            <p className="mt-1 font-mono text-lg font-semibold text-primary">
              {winRate.toFixed(1)}%
            </p>
          </div>
          <div className="col-span-2 bg-card p-3 sm:col-span-1">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              <CurrencyDollar size={11} weight="duotone" /> Valor ganho
            </div>
            <p className="mt-1 truncate font-mono text-lg font-semibold text-foreground">
              {formatCurrency(user.wonValue)}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="open" className="p-5">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="open">Abertas ({grouped.open.length})</TabsTrigger>
            <TabsTrigger value="won">Ganhas ({grouped.won.length})</TabsTrigger>
            <TabsTrigger value="lost">Perdidas ({grouped.lost.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="open" className="mt-3">
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
              {renderList(grouped.open)}
            </div>
          </TabsContent>
          <TabsContent value="won" className="mt-3">
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
              {renderList(grouped.won)}
            </div>
          </TabsContent>
          <TabsContent value="lost" className="mt-3">
            <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border">
              {renderList(grouped.lost)}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
