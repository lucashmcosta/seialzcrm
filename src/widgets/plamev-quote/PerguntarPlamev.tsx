import { useState } from 'react';
import { Copy, PaperPlaneTilt, Sparkle, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from '@/hooks/use-toast';
import { chamar, useMateriais, type Material, type RespostaIa } from './api';
import { enviarArquivoNaConversa, enviarTextoNaConversa, LIMITE_MENSAGEM, type Conversa } from './enviarNaConversa';
import { PreviewMaterial } from './PreviewMaterial';

/**
 * "Perguntar": a IA (Claude, chave da org) lê os materiais da Plamev e, se marcado, as últimas mensagens da conversa,
 * e sugere a resposta. O vendedor revisa e decide: nada vai para o cliente sem o clique dele.
 */
export function PerguntarPlamev({ organizationId: org, conversa }: { organizationId: string; conversa: Conversa | null }) {
  const { userProfile } = useOrganization();
  const materiais = useMateriais(org);
  const [pergunta, setPergunta] = useState('');
  const [usarConversa, setUsarConversa] = useState(!!conversa);
  const [pensando, setPensando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<RespostaIa | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState<string | null>(null);
  const [vendo, setVendo] = useState<Material | null>(null);

  const comConversa = !!conversa && usarConversa;
  const pode = !pensando && (!!pergunta.trim() || comConversa);
  const fontes = (resultado?.fontes ?? []).map((id) => materiais.data?.find((m) => m.id === id)).filter((m): m is Material => !!m);

  const perguntar = async () => {
    setPensando(true);
    setErro(null);
    try {
      const r = await chamar<RespostaIa>(org, 'perguntar', {
        pergunta: pergunta.trim(), usar_conversa: comConversa, thread_id: comConversa ? conversa!.threadId : null,
      });
      setResultado(r);
      setTexto(r.resposta);
    } catch (e) {
      setErro((e as Error).message);
    } finally { setPensando(false); }
  };

  const copiar = async () => {
    await navigator.clipboard.writeText(texto);
    toast({ title: 'Resposta copiada' });
  };

  const enviarTexto = async () => {
    if (!conversa) return;
    setEnviando('texto');
    try {
      await enviarTextoNaConversa({ organizationId: org, userId: userProfile?.id ?? null, conversa, texto: texto.trim() });
      toast({ title: 'Resposta enviada na conversa' });
    } catch (e) {
      toast({ title: 'Não foi enviada', description: (e as Error).message, variant: 'destructive' });
    } finally { setEnviando(null); }
  };

  const enviarMaterial = async (m: Material) => {
    if (!conversa) return;
    setEnviando(m.id);
    try {
      await enviarArquivoNaConversa({ organizationId: org, userId: userProfile?.id ?? null, conversa, url: m.url, tipo: m.tipo, legenda: '' });
      setVendo(null);
      toast({ title: `${m.titulo} enviado na conversa` });
    } catch (e) {
      toast({ title: 'Não foi enviado', description: (e as Error).message, variant: 'destructive' });
    } finally { setEnviando(null); }
  };

  return (
    <div className="space-y-3">
      <Textarea rows={3} maxLength={2000} className="text-sm" value={pergunta} onChange={(e) => setPergunta(e.target.value)}
        placeholder={comConversa ? 'Pergunta (opcional): sem ela, a IA responde a última dúvida do cliente' : 'Ex.: o plano Advance cobre castração? Qual a carência?'}
        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && pode) { e.preventDefault(); void perguntar(); } }} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {conversa ? (
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <Checkbox checked={usarConversa} onCheckedChange={(v) => setUsarConversa(v === true)} />
            Considerar as últimas mensagens da conversa
          </label>
        ) : <span className="text-xs text-muted-foreground">Fora da conversa: só a pergunta.</span>}
        <Button type="button" size="sm" disabled={!pode} onClick={perguntar}>
          {pensando ? <SpinnerGap className="mr-1 h-4 w-4 animate-spin" /> : <Sparkle className="mr-1 h-4 w-4" />}
          Perguntar
        </Button>
      </div>

      {pensando && <p className="text-xs text-muted-foreground">Lendo os materiais da Plamev… pode levar uns 20 segundos.</p>}
      {erro && (
        <p className="flex items-start gap-2 text-xs text-destructive">
          <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {erro}
        </p>
      )}

      {resultado && !pensando && (
        <div className="space-y-2 rounded-[6px] border border-border p-2.5">
          <div className="text-xs text-muted-foreground">
            {resultado.encontrado ? 'Resposta sugerida (revise antes de enviar)' : 'Não encontrei isso nos materiais da Plamev'}
          </div>
          <Textarea rows={6} className="text-sm" value={texto} onChange={(e) => setTexto(e.target.value)} />
          {fontes.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Fonte</div>
              <div className="flex flex-wrap gap-1.5">
                {fontes.map((m) => (
                  <button key={m.id} type="button" onClick={() => setVendo(m)}
                    className="rounded-full border border-border px-2 py-0.5 text-xs hover:bg-muted">{m.titulo}</button>
                ))}
              </div>
            </div>
          )}
          {resultado.materiaisFora.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Ficaram de fora por tamanho: {resultado.materiaisFora.join(', ')}.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled={!texto.trim()} onClick={copiar}>
              <Copy className="mr-1 h-4 w-4" /> Copiar
            </Button>
            {conversa && (
              <Button type="button" size="sm" disabled={!texto.trim() || texto.length > LIMITE_MENSAGEM || enviando !== null} onClick={enviarTexto}>
                {enviando === 'texto' ? <SpinnerGap className="mr-1 h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="mr-1 h-4 w-4" />}
                Enviar na conversa
              </Button>
            )}
          </div>
        </div>
      )}

      <PreviewMaterial material={vendo} onClose={() => setVendo(null)} acoes={vendo && conversa ? (
        <Button type="button" size="sm" disabled={enviando !== null} onClick={() => enviarMaterial(vendo)}>
          {enviando === vendo.id ? <SpinnerGap className="mr-1 h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="mr-1 h-4 w-4" />}
          Enviar este material
        </Button>
      ) : null} />
    </div>
  );
}
