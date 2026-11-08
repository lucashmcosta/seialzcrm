import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle, PenNib, SpinnerGap, Key, ArrowSquareOut } from '@phosphor-icons/react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useOrganization } from '@/hooks/useOrganization';
import { callSignatureRequests, SignatureApiError } from '@/lib/signatureRequestsApi';
import { SuvSignV2TemplateTypesCard } from '@/components/settings/SuvSignV2TemplateTypesCard';

interface Status {
  configured: boolean;
  account_name: string | null;
  connected_at: string | null;
  legacy_v1: boolean;
  api_key_masked: string | null;
  last_test_ok: boolean | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  integration: { name?: string; logo_url?: string | null };
  /** Org ainda no envio antigo (V1): abre a configuração antiga. */
  onOpenLegacy?: () => void;
}

const SUVSIGN_KEYS_URL = 'https://suvsign.com/settings/api-integrations';

// SuvSign para o usuário final: conectar com uma chave, ver a conta conectada,
// escolher o tipo de documento de cada modelo. Nada de URL, segredo ou "V2".
export function SuvSignDialog({ open, onOpenChange, integration, onOpenLegacy }: Props) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [changingKey, setChangingKey] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  const statusKey = ['suvsign-v2-creds', orgId];
  const status = useQuery({
    queryKey: statusKey,
    enabled: open && !!orgId,
    queryFn: () => callSignatureRequests<Status>('get_credentials_status', { organization_id: orgId }),
    retry: false,
  });
  const s = status.data;
  const connected = !!s?.configured;
  const showForm = !connected || changingKey;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: statusKey });
    qc.invalidateQueries({ queryKey: ['organization-integrations', orgId] });
    qc.invalidateQueries({ queryKey: ['suvsign-v2-templates-admin', orgId] });
    qc.invalidateQueries({ queryKey: ['signature-capability'] });
  };

  const connect = async () => {
    if (!orgId || !apiKey.trim()) return;
    setBusy(true);
    try {
      const r = await callSignatureRequests<{ account_name: string | null; templates: number | null }>('connect', { organization_id: orgId, api_key: apiKey.trim() });
      setApiKey(''); setChangingKey(false);
      const conta = r.account_name ? ` à conta ${r.account_name}` : '';
      toast.success(`SuvSign conectada${conta}`, {
        description: r.templates != null ? `${r.templates} ${r.templates === 1 ? 'modelo disponível' : 'modelos disponíveis'} para envio.` : undefined,
      });
      refresh();
    } catch (e) {
      toast.error(e instanceof SignatureApiError ? e.message : 'Não foi possível conectar');
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!orgId) return;
    setBusy(true);
    try {
      await callSignatureRequests('disconnect', { organization_id: orgId });
      toast.success('SuvSign desconectada');
      refresh();
    } catch (e) {
      toast.error(e instanceof SignatureApiError ? e.message : 'Não foi possível desconectar');
    } finally { setBusy(false); setConfirmOff(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => { if (!v) { setApiKey(''); setChangingKey(false); } onOpenChange(v); }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-3">
              {integration?.logo_url ? (
                <img src={integration.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-muted p-1" />
              ) : (
                <div className="p-2 rounded-lg bg-muted"><PenNib className="h-6 w-6 text-muted-foreground" /></div>
              )}
              <div>
                <DialogTitle>{integration?.name ?? 'SuvSign'}</DialogTitle>
                <DialogDescription>Envie contratos para assinatura direto da oportunidade.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {status.isLoading && (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <SpinnerGap className="h-4 w-4 animate-spin" /> Carregando...
            </div>
          )}

          {status.error && (
            <Alert><AlertDescription>Só administradores da conta podem configurar a SuvSign.</AlertDescription></Alert>
          )}

          {s && (
            <div className="space-y-5 py-2">
              {connected && (
                <div className="rounded-lg border p-4 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" weight="fill" />
                    <div className="space-y-0.5">
                      <p className="font-medium">
                        Conectado{s.account_name ? <> à conta <span className="font-semibold">{s.account_name}</span></> : ''}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Os contratos são enviados e assinados pela SuvSign. Quando todos assinam, o documento volta sozinho para a oportunidade.
                      </p>
                      {s.connected_at && (
                        <p className="text-xs text-muted-foreground">
                          Desde {format(new Date(s.connected_at), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                  </div>
                  <Badge className="bg-green-600 shrink-0">Ativo</Badge>
                </div>
              )}

              {!connected && s.legacy_v1 && (
                <Alert>
                  <AlertDescription className="space-y-2">
                    <p>Esta conta ainda usa o envio antigo da SuvSign, que continua funcionando normalmente.</p>
                    <p>Para usar o novo envio (assinatura pelo celular, envio por WhatsApp e documento de volta na oportunidade), conecte abaixo.</p>
                    {onOpenLegacy && (
                      <Button variant="link" className="px-0 h-auto" onClick={onOpenLegacy}>Ver configuração do envio antigo</Button>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {showForm && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <p className="font-medium">{changingKey ? 'Trocar a chave' : 'Conectar sua conta SuvSign'}</p>
                    <ol className="text-sm text-muted-foreground list-decimal pl-5 space-y-0.5">
                      <li>
                        Na SuvSign, abra <span className="font-medium text-foreground">Configurações → API e Integrações</span> e clique em{' '}
                        <span className="font-medium text-foreground">Gerar Key</span>.{' '}
                        <a href={SUVSIGN_KEYS_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
                          Abrir <ArrowSquareOut className="h-3 w-3" />
                        </a>
                      </li>
                      <li>Copie a chave e cole aqui.</li>
                    </ol>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="suvsign-key">Chave da SuvSign</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="suvsign-key" type="password" autoComplete="off" className="pl-9"
                          placeholder="Cole a chave aqui" value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
                        />
                      </div>
                      <Button onClick={connect} disabled={busy || !apiKey.trim()}>
                        {busy && <SpinnerGap className="h-4 w-4 mr-2 animate-spin" />}
                        Conectar
                      </Button>
                    </div>
                  </div>
                  {changingKey && (
                    <Button variant="ghost" size="sm" onClick={() => { setChangingKey(false); setApiKey(''); }}>Cancelar</Button>
                  )}
                </div>
              )}

              {connected && !changingKey && orgId && (
                <SuvSignV2TemplateTypesCard organizationId={orgId} />
              )}

              {connected && !changingKey && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button variant="outline" className="flex-1" onClick={() => setChangingKey(true)} disabled={busy}>Trocar chave</Button>
                  <Button variant="destructive" className="flex-1" onClick={() => setConfirmOff(true)} disabled={busy}>Desconectar</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOff}
        onOpenChange={setConfirmOff}
        title="Desconectar a SuvSign?"
        description="Novos contratos não poderão ser enviados para assinatura. Os contratos já enviados continuam valendo e aparecem normalmente nas oportunidades."
        confirmText="Desconectar"
        variant="destructive"
        loading={busy}
        onConfirm={disconnect}
      />
    </>
  );
}
