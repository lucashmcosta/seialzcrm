import { useState } from 'react';
import { FilePdf, PaperPlaneTilt, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from '@/hooks/use-toast';
import { useMateriais, type Material } from './api';
import { tamanhoLegivel } from './materiais';
import { enviarArquivoNaConversa, type Conversa } from './enviarNaConversa';
import { PreviewMaterial } from './PreviewMaterial';

/** Materiais de apoio da Plamev (PDF de coberturas, comparativos): o vendedor manda para o cliente com um clique. */
export function MateriaisPlamev({ organizationId: org, conversa }: { organizationId: string; conversa: Conversa | null }) {
  const { userProfile } = useOrganization();
  const materiais = useMateriais(org);
  const [legenda, setLegenda] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [vendo, setVendo] = useState<Material | null>(null);

  const enviar = async (m: Material) => {
    if (!conversa) return;
    setEnviando(m.id);
    try {
      await enviarArquivoNaConversa({
        organizationId: org, userId: userProfile?.id ?? null, conversa, url: m.url, tipo: m.tipo, legenda: legenda.trim(),
      });
      setLegenda('');
      setVendo(null);
      toast({ title: `${m.titulo} enviado na conversa` });
    } catch (e) {
      toast({ title: 'Não foi enviado', description: (e as Error).message, variant: 'destructive' });
    } finally { setEnviando(null); }
  };

  if (materiais.isLoading) return <SpinnerGap className="h-5 w-5 animate-spin text-muted-foreground" />;
  if (materiais.isError) {
    return (
      <p className="flex items-start gap-2 text-xs text-destructive">
        <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {(materiais.error as Error).message}
      </p>
    );
  }
  if (!materiais.data?.length) return <p className="text-xs text-muted-foreground">Nenhum material disponível ainda.</p>;

  return (
    <div className="space-y-3">
      {conversa ? (
        <Input className="h-8 text-xs" maxLength={1000} placeholder="Legenda (opcional), vai junto com o próximo envio"
          value={legenda} onChange={(e) => setLegenda(e.target.value)} />
      ) : (
        <p className="text-xs text-muted-foreground">Para enviar ao cliente, abra o widget dentro da conversa dele.</p>
      )}
      <ul className="max-h-96 space-y-1.5 overflow-auto">
        {materiais.data.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5 rounded-[6px] border border-border p-2">
            {/* Clique abre a prévia, sem sair da tela */}
            <button type="button" onClick={() => setVendo(m)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
              aria-label={`Ver ${m.titulo}`}>
              {m.tipo === 'image'
                ? <img src={m.url} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-[6px] border border-border object-cover" />
                : <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[6px] border border-border bg-muted"><FilePdf className="h-6 w-6 text-muted-foreground" /></div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium hover:underline">{m.titulo}</div>
                {m.descricao && <div className="line-clamp-2 text-xs text-muted-foreground">{m.descricao}</div>}
                <div className="text-[11px] text-muted-foreground">{m.tipo === 'image' ? 'Imagem' : 'PDF'} · {tamanhoLegivel(m.tamanho)}</div>
              </div>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              {conversa && (
                <Button type="button" size="sm" className="h-7 px-2 text-xs" disabled={enviando !== null} onClick={() => enviar(m)}>
                  {enviando === m.id ? <SpinnerGap className="mr-1 h-3.5 w-3.5 animate-spin" /> : <PaperPlaneTilt className="mr-1 h-3.5 w-3.5" />}
                  Enviar
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <PreviewMaterial material={vendo} onClose={() => setVendo(null)} acoes={vendo && conversa ? (
        <Button type="button" size="sm" disabled={enviando !== null} onClick={() => enviar(vendo)}>
          {enviando === vendo.id ? <SpinnerGap className="mr-1 h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="mr-1 h-4 w-4" />}
          Enviar na conversa{legenda.trim() ? ' com legenda' : ''}
        </Button>
      ) : null} />
    </div>
  );
}
