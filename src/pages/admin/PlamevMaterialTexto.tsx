import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle, SpinnerGap, Sparkle } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';

// Texto do material que a IA do "Perguntar" lê. Só vale depois de revisado por uma pessoa: até lá ela lê o arquivo.

export interface MaterialTexto {
  id: string;
  titulo: string;
  conteudo_md: string | null;
  md_status: 'sem' | 'gerando' | 'gerado' | 'revisado' | 'erro';
  md_erro: string | null;
}

const STATUS: Record<MaterialTexto['md_status'], { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  sem: { label: 'IA lê o arquivo', variant: 'outline' },
  gerando: { label: 'Gerando texto…', variant: 'secondary' },
  gerado: { label: 'Aguardando sua revisão', variant: 'secondary' },
  revisado: { label: 'IA lê este texto', variant: 'default' },
  erro: { label: 'Erro ao gerar', variant: 'destructive' },
};

// Mensagem da função, quando vier: invoke só traz um erro genérico em respostas que não são 2xx.
async function invocar(body: object) {
  const { data, error } = await supabase.functions.invoke('plamev-materiais-ia', { body });
  if (error) {
    const detalhe = await (error as { context?: Response }).context?.clone?.().json?.().catch(() => null);
    throw new Error(detalhe?.error === 'ia_sem_chave_claude'
      ? 'Nenhuma org com credencial Plamev tem chave Claude.'
      : detalhe?.error || error.message);
  }
  return data;
}

// A tabela é nova e ainda não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = () => (supabase as any).from('plamev_materials');

export function TextoDoMaterial({ m, chave }: { m: MaterialTexto; chave: unknown[] }) {
  const qc = useQueryClient();
  const [texto, setTexto] = useState(m.conteudo_md ?? '');
  const [ocupado, setOcupado] = useState(false);
  const status = STATUS[m.md_status] ?? STATUS.sem;
  const mudou = texto !== (m.conteudo_md ?? '');

  const executar = async (f: () => Promise<unknown>, ok: string) => {
    setOcupado(true);
    try {
      await f();
      await qc.invalidateQueries({ queryKey: chave });
      toast({ title: ok });
    } catch (e) {
      toast({ title: 'Não foi possível concluir', description: (e as Error).message, variant: 'destructive' });
    } finally { setOcupado(false); }
  };

  const gravar = async (patch: object) => {
    const { error } = await tabela().update({ conteudo_md: texto.trim() || null, ...patch }).eq('id', m.id);
    if (error) throw error;
  };

  const aprovar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    await gravar({ md_status: 'revisado', md_revisado_em: new Date().toISOString(), md_revisado_por_auth_user_id: user?.id ?? null });
  };

  const gerando = m.md_status === 'gerando';
  const temTexto = !!texto.trim();

  return (
    <details className="rounded-[6px] border border-border p-2" open={m.md_status === 'gerado' || m.md_status === 'erro'}>
      <summary className="flex cursor-pointer items-center gap-2 text-xs">
        <span className="font-medium">Texto para a IA</span>
        <Badge variant={status.variant} className="text-[10px]">
          {gerando && <SpinnerGap className="mr-1 h-3 w-3 animate-spin" />}
          {status.label}
        </Badge>
      </summary>
      <div className="mt-2 space-y-2">
        {m.md_status === 'erro' && m.md_erro && <p className="text-xs text-destructive">{m.md_erro}</p>}
        {temTexto && m.md_status !== 'revisado' && (
          <p className="text-xs text-muted-foreground">
            Confira carências, limites e valores com o arquivo original. A IA só passa a usar este texto depois de aprovado.
          </p>
        )}
        {(temTexto || m.md_status === 'gerado') && (
          <Textarea
            aria-label={`Texto de ${m.titulo}`}
            value={texto}
            rows={12}
            disabled={gerando || ocupado}
            className="font-mono text-xs"
            onChange={(e) => setTexto(e.target.value)}
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={gerando || ocupado}
            onClick={() => executar(() => invocar({ action: 'gerar_md', material_id: m.id }), 'Gerando o texto. Leva até alguns minutos.')}>
            <Sparkle className="mr-1 h-3.5 w-3.5" /> {temTexto ? 'Gerar de novo' : 'Gerar texto'}
          </Button>
          {temTexto && mudou && (
            // Texto mudou: precisa de nova aprovação, senão a IA leria algo que ninguém conferiu.
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={gerando || ocupado}
              onClick={() => executar(() => gravar({ md_status: 'gerado', md_revisado_em: null, md_revisado_por_auth_user_id: null }), 'Rascunho salvo')}>
              Salvar rascunho
            </Button>
          )}
          {temTexto && (mudou || m.md_status !== 'revisado') && (
            <Button size="sm" className="h-7 px-2 text-xs" disabled={gerando || ocupado} onClick={() => executar(aprovar, 'Texto aprovado')}>
              <CheckCircle className="mr-1 h-3.5 w-3.5" /> Conferi, usar este texto
            </Button>
          )}
          {m.md_status === 'revisado' && !mudou && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={ocupado}
              onClick={() => executar(() => gravar({ md_status: 'gerado', md_revisado_em: null, md_revisado_por_auth_user_id: null }), 'A IA volta a ler o arquivo')}>
              Voltar a usar o arquivo
            </Button>
          )}
        </div>
      </div>
    </details>
  );
}

type Resultado = { modelo: string; resposta?: string; encontrado?: boolean; custo?: number | null; segundos?: number; erro?: string };
const NOME_MODELO: Record<string, string> = {
  'claude-sonnet-5-5': 'Sonnet 5.5 (em uso)',
  'claude-haiku-5-5': 'Haiku 5.5',
  'claude-opus-5-5': 'Opus 5.5',
};

export function TestarModelos() {
  const [pergunta, setPergunta] = useState('');
  const [testando, setTestando] = useState(false);
  const [dados, setDados] = useState<{ resultados: Resultado[]; usandoTexto: number; usandoArquivo: number } | null>(null);

  const testar = async () => {
    setTestando(true);
    try {
      setDados(await invocar({ action: 'testar', pergunta: pergunta.trim() }));
    } catch (e) {
      toast({ title: 'Não foi possível testar', description: (e as Error).message, variant: 'destructive' });
    } finally { setTestando(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Testar perguntas</CardTitle>
        <CardDescription>
          Faz a mesma pergunta aos três modelos, para comparar a resposta e o custo. Confira a resposta com o material. Cada
          teste consome a chave da org com credencial Plamev.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          aria-label="Pergunta de teste"
          rows={2}
          maxLength={2000}
          placeholder="Ex.: Qual a carência do hemograma no plano Advance?"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
        />
        <Button onClick={testar} disabled={!pergunta.trim() || testando}>
          {testando && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />} Testar
        </Button>
        {dados && (
          <>
            <p className="text-xs text-muted-foreground">
              Lendo {dados.usandoTexto} {dados.usandoTexto === 1 ? 'texto revisado' : 'textos revisados'} e{' '}
              {dados.usandoArquivo} {dados.usandoArquivo === 1 ? 'arquivo' : 'arquivos'}.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {dados.resultados.map((r) => (
                <div key={r.modelo} className="space-y-1 rounded-[6px] border border-border p-3">
                  <div className="text-sm font-medium">{NOME_MODELO[r.modelo] ?? r.modelo}</div>
                  {r.erro ? <p className="text-sm text-destructive">{r.erro}</p> : (
                    <>
                      <p className="text-xs text-muted-foreground">
                        US$ {(r.custo ?? 0).toFixed(4)} · {r.segundos} s{r.encontrado === false ? ' · não encontrou nos materiais' : ''}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-sm">{r.resposta}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
