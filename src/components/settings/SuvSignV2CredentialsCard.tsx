import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { callSignatureRequests, SignatureApiError } from '@/lib/signatureRequestsApi';

// Credenciais da SuvSign V2: gravadas criptografadas no servidor; o navegador só vê máscara.
export function SuvSignV2CredentialsCard({ organizationId }: { organizationId: string }) {
  const qc = useQueryClient();
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ['suvsign-v2-creds', organizationId],
    queryFn: () => callSignatureRequests('get_credentials_status', { organization_id: organizationId }),
    retry: false,
  });
  if (status.error) return null; // sem permissão: não mostra

  const save = async () => {
    setBusy(true);
    try {
      await callSignatureRequests('save_credentials', { organization_id: organizationId, api_key: apiKey || undefined, webhook_secret: secret || undefined });
      setApiKey(''); setSecret(''); toast.success('Credenciais salvas');
      qc.invalidateQueries({ queryKey: ['suvsign-v2-creds', organizationId] });
    } catch (e) { toast.error(e instanceof SignatureApiError ? e.message : 'Erro ao salvar'); } finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true);
    try {
      const r = await callSignatureRequests('test_connection', { organization_id: organizationId });
      r.ok ? toast.success(`Conexão OK · ${r.templates} modelos`) : toast.error(`Falha na conexão (${r.status})`);
      qc.invalidateQueries({ queryKey: ['suvsign-v2-creds', organizationId] });
    } catch (e) { toast.error(e instanceof SignatureApiError ? e.message : 'Erro ao testar'); } finally { setBusy(false); }
  };
  const s = status.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">SuvSign — novo fluxo de assinatura (V2)</CardTitle>
        <CardDescription>
          {s?.v2_enabled ? 'Liberado para esta conta.' : 'Ainda não liberado para esta conta — o envio atual continua funcionando.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm space-y-1">
          <p>Chave: <span className="font-mono">{s?.api_key_masked ?? 'não configurada'}</span></p>
          <p>Segredo do webhook: {s?.has_webhook_secret ? 'configurado' : 'não configurado'}</p>
          {s?.last_test_at && <p>Último teste: {s.last_test_ok ? 'OK' : 'falhou'} em {new Date(s.last_test_at).toLocaleString('pt-BR')}</p>}
          {s?.webhook_url && <p className="text-xs text-muted-foreground break-all">URL do webhook: <span className="font-mono">{s.webhook_url}</span></p>}
        </div>
        <div className="grid sm:grid-cols-2 gap-2">
          <div><Label className="text-xs">Nova chave de API</Label><Input type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} /></div>
          <div><Label className="text-xs">Novo segredo do webhook</Label><Input type="password" autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} /></div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={busy || (!apiKey && !secret)} onClick={save}>Salvar</Button>
          <Button size="sm" variant="outline" disabled={busy || !s?.configured} onClick={test}>Testar conexão</Button>
        </div>
      </CardContent>
    </Card>
  );
}
