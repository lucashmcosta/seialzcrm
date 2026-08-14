// ============================================================================
// Painel de provisionamento de números Evolution.
//
// Porta de entrada OFICIAL (card "Evolution WhatsApp" em Configurações >
// Integrações). Aqui o usuário cria uma nova sessão, lê o QR e acompanha o
// estado real. O vínculo do número com a Route Comercial continua sendo feito
// em WhatsApp Comercial (INTEGRAÇÃO ≠ CONFIGURAÇÃO ≠ REGRA).
//
// Garantias:
//  - Nenhuma credencial é exibida, criada ou duplicada no cliente.
//  - Excluir uma sessão em uso é bloqueado pelo servidor (409).
//  - Nada aqui altera número ativo, rotações ou o módulo Atendimento.
// ============================================================================

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowsClockwise,
  Broadcast,
  Info,
  Link as LinkIcon,
  Plus,
  QrCode,
  SpinnerGap,
  Trash,
  WarningCircle,
} from '@phosphor-icons/react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  useCreateEvolutionInstance,
  useDeleteEvolutionInstance,
  useEvolutionProvisionedInstances,
  useLinkPendingInstance,
  useSyncEvolutionWebhook,
  useSyncPendingInstanceIdentity,
} from '@/hooks/useEvolutionProvisioning';
import { useConnectInstance } from '@/hooks/useEvolutionInstances';

const STATE_LABEL: Record<string, string> = {
  open: 'Conectado',
  connecting: 'Conectando',
  close: 'Aguardando QR',
  unknown: '—',
};

const DELETE_ERROR: Record<string, string> = {
  EVOLUTION_INSTANCE_IN_USE:
    'Esta sessão está em uso por um número ativo. Troque o número ativo da Route antes de excluir.',
  INSTANCE_NOT_FOUND: 'Sessão não encontrada.',
  FEATURE_DISABLED: 'A integração Evolution não está habilitada nesta organização.',
};

// Erros de negócio do vínculo. Mensagens explicam a causa real; nada aqui
// contorna a guarda do servidor.
const LINK_ERROR: Record<string, string> = {
  PROVISION_PROVIDER_CONFLICT:
    'Este número já está cadastrado nesta organização com outro provedor (Meta ou Twilio). ' +
    'Um mesmo número não pode pertencer a dois provedores: conecte a sessão Evolution com um ' +
    'número diferente ou remova antes o endpoint existente desse número.',
  PROVISION_ENDPOINT_AMBIGUOUS:
    'Existe mais de um endpoint com este número nesta organização. Resolva a duplicidade antes de vincular.',
  PROVISION_EVOLUTION_ADDRESS_UNKNOWN:
    'O número real da sessão ainda não foi lido do provedor. Aguarde a sincronização e tente de novo.',
  PROVISION_EVOLUTION_NOT_CONNECTED: 'A sessão não está conectada. Leia o QR Code novamente.',
  INSTANCE_IDENTITY_UNKNOWN:
    'Número da sessão ainda desconhecido. Aguarde "Finalizando conexão…" concluir.',
  INSTANCE_NOT_CONNECTED: 'A sessão não está conectada. Leia o QR Code novamente.',
  INSTANCE_ALREADY_LINKED: 'Esta sessão já está vinculada.',
  SALES_ROUTE_NOT_FOUND: 'Nenhuma Route de WhatsApp Comercial encontrada nesta organização.',
  PROVISION_FORBIDDEN: 'Você não tem permissão para gerenciar integrações nesta organização.',
};

function linkErrorMessage(raw: string): string {
  const key = Object.keys(LINK_ERROR).find((k) => raw.includes(k));
  return key ? LINK_ERROR[key] : raw;
}



export function EvolutionProvisionPanel() {
  const { data, isLoading, error, refetch } = useEvolutionProvisionedInstances();
  const create = useCreateEvolutionInstance();
  const remove = useDeleteEvolutionInstance();
  const syncWebhook = useSyncEvolutionWebhook();
  const connect = useConnectInstance();
  const syncIdentity = useSyncPendingInstanceIdentity();
  const link = useLinkPendingInstance();

  const [qr, setQr] = useState<{ instanceName: string; base64: string | null } | null>(null);

  const instances = data?.instances ?? [];

  // Ao detectar `pending` + `open` sem identidade, pede ao servidor a leitura
  // explícita do número real (uma vez por instância nesta sessão de tela).
  const identityAsked = useRef<Set<string>>(new Set());
  useEffect(() => {
    instances.forEach((i) => {
      const needsIdentity = i.provisioningStatus === 'pending' && i.connected && !i.identityKnown;
      if (!needsIdentity || identityAsked.current.has(i.id)) return;
      identityAsked.current.add(i.id);
      syncIdentity.mutateAsync(i.id).catch(() => {
        // Permite nova tentativa manual/automática no próximo ciclo.
        identityAsked.current.delete(i.id);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances.map((i) => `${i.id}:${i.connected}:${i.identityKnown}`).join('|')]);

  const onLink = async (instanceId: string) => {
    try {
      await link.mutateAsync(instanceId);
      toast.success('Número vinculado ao WhatsApp Comercial', {
        description: 'O número não foi tornado ativo para envio.',
      });
    } catch (e) {
      toast.error('Não foi possível vincular esta sessão', {
        description: linkErrorMessage((e as Error).message),
        duration: 10000,
      });
    }
  };


  const onCreate = async () => {
    setQr(null);
    try {
      const r = await create.mutateAsync();
      setQr({ instanceName: r.instanceName, base64: r.qr?.base64 ?? null });
      toast.success('Sessão criada', {
        description: 'Leia o QR Code no WhatsApp para concluir a conexão.',
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onRegenerate = async (instanceName: string) => {
    try {
      const r = await connect.mutateAsync(instanceName);
      setQr({ instanceName, base64: r.base64 ?? null });
      if (!r.base64) toast.message('Já conectado', { description: 'Nenhum QR necessário.' });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const onDelete = async (instanceName: string) => {
    try {
      await remove.mutateAsync(instanceName);
      if (qr?.instanceName === instanceName) setQr(null);
      toast.success('Sessão removida');
    } catch (e) {
      const raw = (e as Error).message;
      const key = Object.keys(DELETE_ERROR).find((k) => raw.includes(k));
      toast.error(key ? DELETE_ERROR[key] : raw, { duration: 10000 });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">Números Evolution</div>
          <p className="text-xs text-muted-foreground">
            Crie uma sessão, conecte pelo QR Code e depois vincule o número em WhatsApp Comercial.
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Atualizar">
            <ArrowsClockwise className="h-4 w-4" />
          </Button>
          <Button size="sm" onClick={onCreate} disabled={create.isPending}>
            {create.isPending
              ? <SpinnerGap className="h-3.5 w-3.5 mr-1 animate-spin" />
              : <Plus className="h-3.5 w-3.5 mr-1" />}
            Conectar novo número
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <WarningCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SpinnerGap className="h-4 w-4 animate-spin" /> Carregando sessões…
        </div>
      )}

      {!isLoading && instances.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Nenhuma sessão criada</AlertTitle>
          <AlertDescription className="text-xs">
            Clique em <span className="font-medium">Conectar novo número</span> para criar a
            primeira sessão de WhatsApp desta organização.
          </AlertDescription>
        </Alert>
      )}

      {instances.length > 0 && (
        <ul className="space-y-1">
          {instances.map((i) => {
            const finishing = i.provisioningStatus === 'pending' && i.connected && !i.identityKnown;
            const linkable = i.provisioningStatus === 'pending' && i.connected && i.identityKnown;
            return (
              <li
                key={i.id}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <span className="font-data text-sm font-semibold shrink-0 w-[8rem]">
                  {i.identityKnown ? i.ownerMasked : finishing ? 'Finalizando…' : 'Aguardando QR'}
                </span>
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <Badge variant="outline" className="text-[10px]">
                    {STATE_LABEL[i.state] ?? i.state}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {i.provisioningStatus === 'linked' ? 'Vinculado' : 'Em provisionamento'}
                  </Badge>
                  {finishing && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      <SpinnerGap className="h-3 w-3 animate-spin" /> Finalizando conexão…
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-1.5 shrink-0">
                  {!i.connected && (
                    <Button
                      size="sm" variant="outline" className="h-6 px-2 text-[10px]"
                      disabled={connect.isPending}
                      onClick={() => onRegenerate(i.instanceName)}
                    >
                      <QrCode className="h-3 w-3 mr-1" /> Ver QR
                    </Button>
                  )}
                  {linkable && (
                    <Button
                      size="sm" className="h-6 px-2 text-[10px]"
                      disabled={link.isPending}
                      onClick={() => onLink(i.id)}
                    >
                      {link.isPending
                        ? <SpinnerGap className="h-3 w-3 mr-1 animate-spin" />
                        : <LinkIcon className="h-3 w-3 mr-1" />}
                      Vincular ao WhatsApp Comercial
                    </Button>
                  )}
                  <Button
                    size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
                    disabled={syncWebhook.isPending}
                    onClick={() =>
                      syncWebhook.mutateAsync(i.instanceName)
                        .then(() => toast.success('Webhook atualizado'))
                        .catch((e) => toast.error((e as Error).message))}
                  >
                    <Broadcast className="h-3 w-3 mr-1" /> Webhook
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-6 px-2 text-[10px] text-destructive"
                    disabled={remove.isPending}
                    onClick={() => onDelete(i.instanceName)}
                  >
                    <Trash className="h-3 w-3" />
                  </Button>
                </span>
              </li>
            );
          })}

        </ul>
      )}

      {qr && (
        <>
          <Separator />
          <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 p-6">
            <div className="text-xs text-muted-foreground text-center max-w-xs">
              No seu WhatsApp, abra{' '}
              <span className="font-medium">
                Configurações → Aparelhos conectados → Conectar um aparelho
              </span>{' '}
              e aponte a câmera para o QR abaixo.
            </div>
            {qr.base64 ? (
              <img
                src={qr.base64.startsWith('data:') ? qr.base64 : `data:image/png;base64,${qr.base64}`}
                alt="QR Code de conexão do WhatsApp"
                className="w-64 h-64 rounded-md bg-white p-2"
              />
            ) : (
              <div className="text-xs text-muted-foreground">
                QR ainda não disponível. Clique em <span className="font-medium">Ver QR</span>.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
