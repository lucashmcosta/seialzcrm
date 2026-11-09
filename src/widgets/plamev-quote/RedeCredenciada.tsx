import { useEffect, useState } from 'react';
import { Copy, MagnifyingGlass, PaperPlaneTilt, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from '@/hooks/use-toast';
import { useContexto, useRede } from './api';
import { textoRede } from './resumo';
import { enviarTextoNaConversa, LIMITE_MENSAGEM, type Conversa } from './enviarNaConversa';

const RAIOS = [2, 5, 10, 20, 50].map((r) => ({ label: `${r} km`, value: String(r) }));
const MAX_ENVIO = 10;

/** Rede credenciada da Plamev perto do CEP do cliente; o vendedor escolhe as clínicas e manda na conversa. */
export function RedeCredenciada({ organizationId: org, opportunityId, contactId, conversa }: {
  organizationId: string; opportunityId: string | null; contactId: string | null; conversa: Conversa | null;
}) {
  const { userProfile } = useOrganization();
  const contexto = useContexto(org, opportunityId, contactId);
  const [cep, setCep] = useState('');
  const [raio, setRaio] = useState('5');
  const [busca, setBusca] = useState<{ cep: string; raioKm: number } | null>(null);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const rede = useRede(org, busca);

  // CEP do contato, uma vez.
  const cepContato = contexto.data?.cliente?.cep ?? '';
  useEffect(() => {
    if (cepContato && !cep) setCep(cepContato);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepContato]);

  // Resultado novo: já marca as 5 mais perto.
  useEffect(() => {
    if (rede.data) setMarcados(new Set(rede.data.slice(0, 5).map((c) => c.id)));
  }, [rede.data]);

  const digitos = cep.replace(/\D/g, '');
  const buscar = () => setBusca({ cep: digitos, raioKm: Number(raio) });
  const escolhidos = (rede.data ?? []).filter((c) => marcados.has(c.id));
  const texto = busca && escolhidos.length ? textoRede(escolhidos, busca.cep) : '';

  const alternar = (id: string, marcar: boolean) => setMarcados((atual) => {
    const novo = new Set(atual);
    if (marcar) novo.add(id); else novo.delete(id);
    return novo;
  });

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    toast({ title: 'Lista copiada' });
  };

  const enviar = async () => {
    if (!conversa) return;
    setEnviando(true);
    try {
      await enviarTextoNaConversa({ organizationId: org, userId: userProfile?.id ?? null, conversa, texto });
      toast({ title: 'Lista enviada na conversa' });
    } catch (e) {
      toast({ title: 'Não foi enviada', description: (e as Error).message, variant: 'destructive' });
    } finally { setEnviando(false); }
  };

  return (
    <div className="space-y-3">
      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (digitos.length === 8) buscar(); }}>
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="plamev-rede-cep" className="text-xs">CEP do cliente</Label>
          <Input id="plamev-rede-cep" className="h-8 font-data" inputMode="numeric" placeholder="00000-000" maxLength={9}
            value={cep} onChange={(e) => setCep(e.target.value)} />
        </div>
        <div className="w-24 space-y-1">
          <Label className="text-xs">Raio</Label>
          <NativeSelect className="h-8 py-1" options={RAIOS} value={raio} onChange={(e) => setRaio(e.target.value)} />
        </div>
        <Button type="submit" size="sm" className="h-8" disabled={digitos.length !== 8 || rede.isFetching}>
          {rede.isFetching ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <MagnifyingGlass className="h-4 w-4" />}
          <span className="ml-1">Buscar</span>
        </Button>
      </form>

      {rede.isError && (
        <p className="flex items-start gap-2 text-xs text-destructive">
          <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {(rede.error as Error).message}
        </p>
      )}
      {rede.data && rede.data.length === 0 && (
        <p className="text-xs text-muted-foreground">Nenhuma clínica credenciada em {busca?.raioKm} km desse CEP. Tente um raio maior.</p>
      )}

      {rede.data && rede.data.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{rede.data.length} clínica{rede.data.length > 1 ? 's' : ''} · {escolhidos.length} marcada{escolhidos.length === 1 ? '' : 's'}</span>
            {escolhidos.length > MAX_ENVIO && <span className="text-destructive">Marque até {MAX_ENVIO} para enviar</span>}
          </div>
          <ul className="max-h-80 space-y-1.5 overflow-auto">
            {rede.data.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer gap-2 rounded-[6px] border border-border p-2 text-xs hover:bg-muted/40">
                  <Checkbox className="mt-0.5" checked={marcados.has(c.id)} onCheckedChange={(v) => alternar(c.id, v === true)} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.nome}</span>
                      <span className="shrink-0 font-data text-muted-foreground">
                        {c.distanciaKm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {[c.endereco, c.bairro, [c.cidade, c.estado].filter(Boolean).join('/')].filter(Boolean).join(' · ')}
                    </div>
                    {(c.telefone || c.volante) && (
                      <div className="text-muted-foreground">
                        {[c.telefone, c.volante && 'Atendimento volante'].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </div>
                </label>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled={!texto} onClick={copiar}>
              <Copy className="mr-1 h-4 w-4" /> Copiar
            </Button>
            {conversa ? (
              <Button type="button" size="sm" onClick={enviar}
                disabled={!texto || enviando || escolhidos.length > MAX_ENVIO || texto.length > LIMITE_MENSAGEM}>
                {enviando ? <SpinnerGap className="mr-1 h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="mr-1 h-4 w-4" />}
                Enviar na conversa
              </Button>
            ) : null}
          </div>
          {!conversa && (
            <p className="text-right text-xs text-muted-foreground">Para enviar direto, abra o widget dentro da conversa do cliente.</p>
          )}
        </>
      )}
    </div>
  );
}
