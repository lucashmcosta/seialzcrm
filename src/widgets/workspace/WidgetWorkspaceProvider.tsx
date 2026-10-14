import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { useIsMobile } from '@/hooks/use-mobile';
import { WIDGET_REGISTRY } from '../registry';
import { orgWidgetsKey, useOrgWidgetConfig } from '../useOrgWidgets';
import type { WidgetContext } from '../types';
import { WorkspaceCtx, type WidgetWorkspaceApi } from './WidgetWorkspaceContext';
import { WidgetWorkspaceLayer } from './WidgetWorkspaceLayer';
import {
  clampAll, emptyLayout, focusWindow, moveResize, openWindow, parseLayout, removeWindow, setState,
  type WorkspaceLayout,
} from './layout';

const SAVE_DEBOUNCE_MS = 600;
const vp = () => ({ vw: window.innerWidth, vh: window.innerHeight });

/** Montado uma vez, fora das rotas. Só renderiza com sessão + org, fora de /admin, desktop. */
export function WidgetWorkspaceRoot({ children }: { children?: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { organization, userProfile } = useOrganization();
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const blocked = pathname.startsWith('/admin') || pathname.startsWith('/auth') || pathname === '/obs';
  const active = isAuthenticated && !!organization?.id && !!userProfile?.id && !isMobile && !blocked;
  const [api, setApi] = useState<WidgetWorkspaceApi | null>(null);
  // As rotas (children) nunca são remontadas: só o motor interno é recriado.
  return (
    <WorkspaceCtx.Provider value={active ? api : null}>
      {children}
      {active && (
        // key: trocar org/usuário desmonta estado, canal e contexto — sem vazamento entre tenants.
        <WorkspaceInner key={`${userProfile!.id}:${organization!.id}`} orgId={organization!.id} userId={userProfile!.id} onApi={setApi} />
      )}
    </WorkspaceCtx.Provider>
  );
}

function WorkspaceInner({ orgId, userId, onApi }: { orgId: string; userId: string; onApi: (a: WidgetWorkspaceApi | null) => void }) {
  const qc = useQueryClient();
  const { data: config } = useOrgWidgetConfig();
  const [layout, setLayout] = useState<WorkspaceLayout>(emptyLayout);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [context, setCtx] = useState<WidgetContext | null>(null);

  // Persistência serializada: uma gravação por vez, sempre do layout mais recente.
  const latest = useRef(layout);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<number | null>(null);
  const alive = useRef(true);

  // Realtime único por org para a configuração dos widgets.
  useEffect(() => {
    const filter = `organization_id=eq.${orgId}`;
    const invalidate = () => qc.invalidateQueries({ queryKey: orgWidgetsKey(orgId) });
    const ch = supabase
      .channel(`widget-workspace-config-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'organization_widgets', filter }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orgId, qc]);

  // Carrega layout pessoal.
  useEffect(() => {
    alive.current = true;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('user_widget_workspace').select('layout')
        .eq('organization_id', orgId).eq('user_id', userId).maybeSingle();
      if (!alive.current) return;
      if (error) console.warn('[widgets] falha ao carregar workspace', error.message);
      const { vw, vh } = vp();
      const l = clampAll(parseLayout(data?.layout), vw, vh);
      latest.current = l;
      setLayout(l);
      setLoaded(true);
    })();
    return () => { alive.current = false; if (timer.current) window.clearTimeout(timer.current); };
  }, [orgId, userId]);

  const flush = useCallback(async () => {
    if (inFlight.current || !dirty.current) return;
    inFlight.current = true;
    dirty.current = false;
    const payload = latest.current;
    const { error } = await (supabase as any).from('user_widget_workspace').upsert(
      { organization_id: orgId, user_id: userId, layout: payload },
      { onConflict: 'organization_id,user_id' },
    );
    inFlight.current = false;
    if (!alive.current) return;
    if (error) {
      dirty.current = true;
      setSaveError((was) => {
        if (!was) toast.error('Não foi possível salvar a posição dos widgets. Tentaremos de novo.');
        return true;
      });
      timer.current = window.setTimeout(flush, 5000);
      return;
    }
    setSaveError(false);
    if (dirty.current) flush();
  }, [orgId, userId]);

  const apply = useCallback((fn: (l: WorkspaceLayout) => WorkspaceLayout) => {
    const next = fn(latest.current);
    if (next === latest.current) return;
    latest.current = next;
    setLayout(next);
    dirty.current = true;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  // Ajusta janelas ao redimensionar o navegador (só reposiciona; grava se mudou).
  useEffect(() => {
    if (!loaded) return;
    let t: number | null = null;
    const onResize = () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => { const { vw, vh } = vp(); apply((l) => clampAll(l, vw, vh)); }, 150);
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); if (t) window.clearTimeout(t); };
  }, [loaded, apply]);

  const enabledKeys = useMemo(() => {
    const on = new Set((config?.widgets ?? []).filter((w) => w.is_enabled).map((w) => w.widget_key));
    return new Set(WIDGET_REGISTRY.filter((d) => on.has(d.key)).map((d) => d.key));
  }, [config]);

  const setContext = useCallback((c: WidgetContext | null) => {
    setCtx((prev) => {
      if (prev === c) return prev;
      if (prev && c && JSON.stringify(prev) === JSON.stringify(c)) return prev;
      return c;
    });
  }, []);

  const api: WidgetWorkspaceApi = useMemo(() => ({
    organizationId: orgId,
    layout,
    enabledKeys,
    context,
    saveError,
    open: (k) => { const { vw, vh } = vp(); apply((l) => openWindow(l, k, vw, vh)); },
    minimize: (k) => apply((l) => setState(l, k, 'minimized')),
    close: (k) => apply((l) => setState(l, k, 'closed')),
    remove: (k) => apply((l) => removeWindow(l, k)),
    focus: (k) => apply((l) => focusWindow(l, k)),
    commitGeometry: (k, p) => { const { vw, vh } = vp(); apply((l) => moveResize(l, k, p, vw, vh)); },
    setContext,
  }), [orgId, layout, enabledKeys, context, saveError, apply, setContext]);

  useEffect(() => { onApi(api); }, [api, onApi]);
  useEffect(() => () => onApi(null), [onApi]);

  return loaded ? <WidgetWorkspaceLayer /> : null;
}
