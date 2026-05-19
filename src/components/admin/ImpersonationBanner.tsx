import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Warning, CaretDown, MagnifyingGlass } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

interface OrgOption {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
}

export function ImpersonationBanner() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState('');
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(null);
  const [currentOrgName, setCurrentOrgName] = useState<string>('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    checkImpersonation();
  }, []);

  const checkImpersonation = async () => {
    const params = new URLSearchParams(window.location.search);
    const urlSessionId = params.get('imp_session');
    const sid = urlSessionId || localStorage.getItem('impersonation_session_id');

    if (!sid) return;
    if (urlSessionId) localStorage.setItem('impersonation_session_id', urlSessionId);
    setSessionId(sid);

    const { data: session } = await supabase
      .from('impersonation_sessions')
      .select('target_user_name, organization_id, organizations(name)')
      .eq('id', sid)
      .single();

    if (session) {
      setImpersonatedUser(session.target_user_name || 'Usuário');
      setCurrentOrgId(session.organization_id ?? null);
      setCurrentOrgName((session as any).organizations?.name ?? '');
    }
  };

  const loadOrgs = async () => {
    if (orgs.length > 0) return;
    setLoadingOrgs(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-list-orgs-for-switch', {
        body: { sessionId },
      });
      if (error) throw error;
      setOrgs(data?.organizations ?? []);
    } catch (e) {
      console.error('Erro ao carregar organizações:', e);
    } finally {
      setLoadingOrgs(false);
    }
  };

  const handleSwitchOrg = async (orgId: string) => {
    if (switching || orgId === currentOrgId) {
      setPopoverOpen(false);
      return;
    }
    setSwitching(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-impersonate-switch', {
        body: {
          currentSessionId: sessionId,
          targetOrganizationId: orgId,
          redirectUrl: window.location.origin,
        },
      });
      if (error) throw error;
      if (!data?.action_link) throw new Error('Sem link de acesso');

      localStorage.removeItem('impersonation_session_id');
      await supabase.auth.signOut();
      window.location.href = data.action_link;
    } catch (e: any) {
      console.error('Erro ao trocar de tenant:', e);
      alert(e?.message || 'Falha ao trocar de organização');
      setSwitching(false);
    }
  };

  const handleEndSession = async () => {
    try {
      if (sessionId) {
        await supabase.functions.invoke('admin-impersonate-end', {
          body: { sessionId },
        });
      }
      localStorage.removeItem('impersonation_session_id');
      await supabase.auth.signOut();
      window.close();
    } catch (error) {
      console.error('Error ending impersonation:', error);
      localStorage.removeItem('impersonation_session_id');
      await supabase.auth.signOut();
      window.close();
    }
  };

  if (!sessionId) return null;

  return (
    <div className="bg-destructive text-destructive-foreground px-4 py-2 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 min-w-0">
        <Warning size={16} className="shrink-0" />
        <span className="text-sm truncate">
          Logado como <strong>{impersonatedUser}</strong> (Modo Admin)
        </span>
        <Popover
          open={popoverOpen}
          onOpenChange={(open) => {
            setPopoverOpen(open);
            if (open) loadOrgs();
          }}
        >
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              className="h-7 px-2 gap-1 text-xs"
              disabled={switching}
            >
              <span className="max-w-[160px] truncate">
                {currentOrgName || 'Selecionar conta'}
              </span>
              <CaretDown size={12} />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
            <Command>
              <div className="flex items-center border-b px-2">
                <MagnifyingGlass size={14} className="opacity-60" />
                <CommandInput
                  placeholder="Buscar organização..."
                  className="h-9 border-0 focus:ring-0"
                />
              </div>
              <CommandList>
                {loadingOrgs && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    Carregando...
                  </div>
                )}
                {!loadingOrgs && (
                  <>
                    <CommandEmpty>Nenhuma organização encontrada.</CommandEmpty>
                    <CommandGroup>
                      {orgs.map((org) => (
                        <CommandItem
                          key={org.id}
                          value={`${org.name} ${org.slug}`}
                          onSelect={() => handleSwitchOrg(org.id)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm">{org.name}</span>
                            <span className="text-[10px] text-muted-foreground">
                              {org.slug}
                            </span>
                          </div>
                          {org.id === currentOrgId && (
                            <span className="ml-auto text-[10px] text-muted-foreground">
                              atual
                            </span>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleEndSession}
        disabled={switching}
      >
        {switching ? 'Trocando...' : 'Encerrar Sessão'}
      </Button>
    </div>
  );
}
