import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, SpinnerGap } from '@phosphor-icons/react';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { chamar } from './api';

interface Config { configurado: boolean; final: string | null; atualizadoEm: string | null }

/** /settings/widgets/plamev_quote: a org cola o próprio token da API da Plamev. O token nunca volta para o navegador. */
export default function PlamevQuoteSettings({ organizationId }: { organizationId: string }) {
  const { permissions, loading } = usePermissions();
  const qc = useQueryClient();
  const [token, setToken] = useState('');
  const [salvando, setSalvando] = useState(false);
  const pode = permissions.canManageSettings;

  const chave = ['plamev', organizationId, 'config'];
  const config = useQuery({
    queryKey: chave, enabled: pode,
    queryFn: () => chamar<Config>(organizationId, 'config_get'),
  });

  if (loading) return null;
  if (!pode) return <p className="text-sm text-muted-foreground">Você não tem permissão para configurar este widget.</p>;

  const executar = async (action: 'config_set' | 'config_delete') => {
    setSalvando(true);
    try {
      await chamar(organizationId, action, action === 'config_set' ? { token } : {});
      setToken('');
      await qc.invalidateQueries({ queryKey: ['plamev', organizationId] });
      toast({ title: action === 'config_set' ? 'Token da Plamev salvo' : 'Token da Plamev removido' });
    } catch (e) {
      toast({ title: 'Não foi possível salvar', description: (e as Error).message, variant: 'destructive' });
    } finally { setSalvando(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Token da API da Plamev</CardTitle>
        <CardDescription>
          Gere o token no portal da Plamev, em Token API → Acessar Tokens, e cole aqui. Antes de salvar, o Seialz testa o token na Plamev.
          Ele fica guardado criptografado e não aparece de novo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config.isLoading && <SpinnerGap className="h-5 w-5 animate-spin text-muted-foreground" />}
        {config.isError && <p className="text-sm text-destructive">{(config.error as Error).message}</p>}
        {config.data?.configurado && (
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" weight="fill" />
            Token configurado (termina em <span className="font-data">…{config.data.final}</span>)
            {config.data.atualizadoEm && (
              <span className="text-muted-foreground">· atualizado em {new Date(config.data.atualizadoEm).toLocaleString('pt-BR')}</span>
            )}
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="plamev-token">{config.data?.configurado ? 'Trocar token' : 'Token'}</Label>
          <Textarea id="plamev-token" rows={4} className="font-data text-xs" autoComplete="off" spellCheck={false}
            placeholder="Cole o token aqui" value={token} onChange={(e) => setToken(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button disabled={!token.trim() || salvando} onClick={() => executar('config_set')}>
            {salvando && <SpinnerGap className="mr-1 h-4 w-4 animate-spin" />} Testar e salvar
          </Button>
          {config.data?.configurado && (
            <Button variant="outline" disabled={salvando} onClick={() => executar('config_delete')}>Remover token</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
