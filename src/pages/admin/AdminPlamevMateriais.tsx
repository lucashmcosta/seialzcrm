import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowCounterClockwise, ArrowDown, ArrowUp, FilePdf, FloppyDisk, SpinnerGap, Trash, UploadSimple } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  ACEITA_MATERIAL, BUCKET_MATERIAIS, nomeArquivoMaterial, recusaMaterial, tamanhoLegivel, TIPOS_MATERIAL,
} from '@/widgets/plamev-quote/materiais';
import { PreviewMaterial, type MaterialPreview } from '@/widgets/plamev-quote/PreviewMaterial';
import { TestarModelos, TextoDoMaterial, type MaterialTexto } from './PlamevMaterialTexto';

// Admin — Materiais de apoio da Plamev (widget plamev_quote). São da Plamev, não de uma org: o que subir aqui aparece
// na aba Materiais do widget de toda org com ele ligado. Tabela plamev_materials + bucket público plamev-materiais.
// Remover (padrão) = soft delete: some daqui e do widget, o arquivo fica para as conversas que já receberam e dá para
// restaurar. Excluir de vez só para material nunca enviado (plamev_material_excluir recusa o que já foi).

interface Material extends MaterialTexto {
  id: string; titulo: string; descricao: string; tipo: 'image' | 'document'; mime_type: string;
  storage_path: string; tamanho_bytes: number; ordem: number; ativo: boolean; created_at: string; updated_at: string;
  removido_em: string | null;
}

const CHAVE = ['admin', 'plamev-materiais'];
// A tabela é nova e ainda não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = () => (supabase as any).from('plamev_materials');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (nome: string, args: object) => (supabase as any).rpc(nome, args) as Promise<{ data: unknown; error: { message: string } | null }>;
const urlPublica = (path: string) => supabase.storage.from(BUCKET_MATERIAIS).getPublicUrl(path).data.publicUrl;
const preview = (m: Material): MaterialPreview => ({ titulo: m.titulo, descricao: m.descricao, tipo: m.tipo, url: urlPublica(m.storage_path) });

function Miniatura({ m, tamanho, onVer }: { m: Material; tamanho: 'h-20 w-20' | 'h-12 w-12'; onVer: () => void }) {
  const url = urlPublica(m.storage_path);
  return (
    <button type="button" onClick={onVer} className="shrink-0" aria-label={`Ver ${m.titulo}`}>
      {m.tipo === 'image'
        ? <img src={url} alt="" className={`${tamanho} rounded-[6px] border border-border object-cover`} />
        : <div className={`flex ${tamanho} items-center justify-center rounded-[6px] border border-border bg-muted`}><FilePdf className="h-8 w-8 text-muted-foreground" /></div>}
    </button>
  );
}

function NovoMaterial({ proximaOrdem }: { proximaOrdem: number }) {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const escolher = (f: File | null) => {
    if (!f) return setArquivo(null);
    const motivo = recusaMaterial(f);
    if (motivo) {
      toast({ title: 'Arquivo não aceito', description: motivo, variant: 'destructive' });
      if (input.current) input.current.value = '';
      return setArquivo(null);
    }
    setArquivo(f);
    if (!titulo.trim()) setTitulo(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim());
  };

  const salvar = async () => {
    if (!arquivo || !titulo.trim()) return;
    setEnviando(true);
    const id = crypto.randomUUID();
    const t = TIPOS_MATERIAL[arquivo.type];
    const path = `${id}/${nomeArquivoMaterial(titulo, t.ext)}`;
    try {
      const { error: e1 } = await supabase.storage.from(BUCKET_MATERIAIS)
        .upload(path, arquivo, { contentType: arquivo.type, upsert: false });
      if (e1) throw e1;
      const { data: { user } } = await supabase.auth.getUser();
      const { error: e2 } = await tabela().insert({
        id, titulo: titulo.trim(), descricao: descricao.trim(), tipo: t.tipo, mime_type: arquivo.type,
        storage_path: path, tamanho_bytes: arquivo.size, ordem: proximaOrdem, created_by_auth_user_id: user?.id ?? null,
      });
      if (e2) {
        await supabase.storage.from(BUCKET_MATERIAIS).remove([path]);
        throw e2;
      }
      setTitulo(''); setDescricao(''); setArquivo(null);
      if (input.current) input.current.value = '';
      await qc.invalidateQueries({ queryKey: CHAVE });
      toast({ title: 'Material adicionado' });
    } catch (e) {
      toast({ title: 'Não foi possível subir', description: (e as Error).message, variant: 'destructive' });
    } finally { setEnviando(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Adicionar material</CardTitle>
        <CardDescription>PDF até 16 MB; PNG, JPG ou WEBP até 5 MB (limite do WhatsApp para imagem).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="mat-arquivo">Arquivo</Label>
          <Input id="mat-arquivo" ref={input} type="file" accept={ACEITA_MATERIAL}
            onChange={(e) => escolher(e.target.files?.[0] ?? null)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mat-titulo">Título</Label>
          <Input id="mat-titulo" maxLength={120} placeholder="Ex.: Coberturas ADVANCE" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          {arquivo && titulo.trim() && (
            <p className="text-xs text-muted-foreground">
              O cliente recebe como <span className="font-data">{nomeArquivoMaterial(titulo, TIPOS_MATERIAL[arquivo.type].ext)}</span>
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mat-desc">Descrição (para o vendedor e para a IA saberem o que tem no arquivo)</Label>
          <Textarea id="mat-desc" rows={2} maxLength={500} placeholder="Ex.: lista completa do que o plano cobre, carências e limites"
            value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <Button onClick={salvar} disabled={!arquivo || !titulo.trim() || enviando}>
          {enviando ? <SpinnerGap className="mr-2 h-4 w-4 animate-spin" /> : <UploadSimple className="mr-2 h-4 w-4" />}
          Subir material
        </Button>
      </CardContent>
    </Card>
  );
}

function LinhaMaterial({ m, podeSubir, podeDescer, mover, onVer, onExcluir }: {
  m: Material; podeSubir: boolean; podeDescer: boolean; mover: (passo: -1 | 1) => Promise<{ error: unknown }[]>;
  onVer: () => void; onExcluir: () => void;
}) {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState(m.titulo);
  const [descricao, setDescricao] = useState(m.descricao);
  const [salvando, setSalvando] = useState(false);
  const mudou = titulo.trim() !== m.titulo || descricao.trim() !== m.descricao;

  const executar = async (f: () => Promise<{ error: unknown }[]>, ok?: string) => {
    setSalvando(true);
    try {
      const erro = (await f()).find((r) => r.error)?.error;
      if (erro) throw erro;
      await qc.invalidateQueries({ queryKey: CHAVE });
      if (ok) toast({ title: ok });
    } catch (e) {
      toast({ title: 'Não foi possível salvar', description: (e as Error).message, variant: 'destructive' });
    } finally { setSalvando(false); }
  };

  return (
    <div className={`flex gap-3 rounded-[6px] border border-border p-3 ${m.ativo ? '' : 'opacity-60'}`}>
      <Miniatura m={m} tamanho="h-20 w-20" onVer={onVer} />
      <div className="min-w-0 flex-1 space-y-2">
        <Input value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} className="h-8" />
        <Textarea value={descricao} rows={2} maxLength={500} onChange={(e) => setDescricao(e.target.value)} className="text-sm" />
        <div className="text-xs text-muted-foreground">
          <span className="font-data">{m.storage_path.split('/').pop()}</span> · {tamanhoLegivel(m.tamanho_bytes)} ·{' '}
          {new Date(m.created_at).toLocaleDateString('pt-BR')}
        </div>
        <TextoDoMaterial key={`${m.md_status}-${m.conteudo_md?.length ?? 0}`} m={m} chave={CHAVE} />
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <label className="flex items-center gap-2 text-xs">
          {m.ativo ? 'Ativo' : 'Desativado'}
          <Switch checked={m.ativo} disabled={salvando}
            onCheckedChange={(v) => executar(async () => [await tabela().update({ ativo: v }).eq('id', m.id)], v ? 'Material ativado' : 'Material desativado')} />
        </label>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Subir" disabled={!podeSubir || salvando} onClick={() => executar(() => mover(-1))}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Descer" disabled={!podeDescer || salvando} onClick={() => executar(() => mover(1))}>
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={salvando}
            onClick={() => executar(async () => {
              const { data: { user } } = await supabase.auth.getUser();
              return [await tabela().update({ removido_em: new Date().toISOString(), removido_por_auth_user_id: user?.id ?? null }).eq('id', m.id)];
            }, 'Material removido')}>
            Remover
          </Button>
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" disabled={salvando} onClick={onExcluir}>
            <Trash className="mr-1 h-3.5 w-3.5" /> Excluir de vez
          </Button>
        </div>
        {mudou && (
          <Button size="sm" disabled={!titulo.trim() || salvando}
            onClick={() => executar(async () => [await tabela().update({ titulo: titulo.trim(), descricao: descricao.trim() }).eq('id', m.id)], 'Material salvo')}>
            <FloppyDisk className="mr-1 h-4 w-4" /> Salvar
          </Button>
        )}
      </div>
    </div>
  );
}

/** Excluir de vez: confere antes se já foi enviado; aí só dá para remover (os clientes perderiam o arquivo). */
function ExcluirDeVez({ m, onClose }: { m: Material | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<'verificando' | 'enviado' | 'livre' | 'erro'>('verificando');
  const [excluindo, setExcluindo] = useState(false);
  const id = m?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setEstado('verificando');
    void rpc('plamev_material_enviado', { p_id: id })
      .then(({ data, error }) => { if (vivo) setEstado(error ? 'erro' : data === true ? 'enviado' : 'livre'); });
    return () => { vivo = false; };
  }, [id]);

  const excluir = async () => {
    if (!m) return;
    setExcluindo(true);
    try {
      const { data: path, error } = await rpc('plamev_material_excluir', { p_id: m.id });
      if (error) throw new Error(error.message.includes('material_ja_enviado') ? 'Já foi enviado em conversas: use Remover.' : error.message);
      if (typeof path === 'string') await supabase.storage.from(BUCKET_MATERIAIS).remove([path]);
      await qc.invalidateQueries({ queryKey: CHAVE });
      toast({ title: 'Material excluído de vez' });
      onClose();
    } catch (e) {
      toast({ title: 'Não foi possível excluir', description: (e as Error).message, variant: 'destructive' });
    } finally { setExcluindo(false); }
  };

  return (
    <AlertDialog open={!!m} onOpenChange={(aberto) => { if (!aberto) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir de vez “{m?.titulo}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {estado === 'verificando' && 'Conferindo se este material já foi enviado em alguma conversa…'}
            {estado === 'enviado' && 'Este material já foi enviado em conversas. Excluir de vez faria o arquivo sumir para esses clientes, então não é permitido. Use Remover: ele some daqui e do widget, e as conversas continuam abrindo.'}
            {estado === 'livre' && 'Nunca foi enviado em nenhuma conversa. O arquivo e o registro são apagados e não dá para desfazer.'}
            {estado === 'erro' && 'Não deu para conferir se já foi enviado. Tente de novo, ou use Remover.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={excluindo}>{estado === 'livre' ? 'Cancelar' : 'Fechar'}</AlertDialogCancel>
          {estado === 'livre' && (
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={excluindo}
              onClick={(e) => { e.preventDefault(); void excluir(); }}>
              {excluindo && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />} Excluir de vez
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Removidos: escondidos por padrão; dá para ver, restaurar ou excluir de vez. */
function Removidos({ materiais, proximaOrdem, onVer, onExcluir }: {
  materiais: Material[]; proximaOrdem: number; onVer: (m: Material) => void; onExcluir: (m: Material) => void;
}) {
  const qc = useQueryClient();
  const [restaurando, setRestaurando] = useState<string | null>(null);
  if (!materiais.length) return null;
  const restaurar = async (m: Material) => {
    setRestaurando(m.id);
    // Volta no fim da lista, para não embaralhar a ordem atual.
    const { error } = await tabela().update({ removido_em: null, removido_por_auth_user_id: null, ordem: proximaOrdem }).eq('id', m.id);
    setRestaurando(null);
    if (error) return toast({ title: 'Não foi possível restaurar', description: error.message, variant: 'destructive' });
    await qc.invalidateQueries({ queryKey: CHAVE });
    toast({ title: 'Material restaurado' });
  };
  return (
    <details className="rounded-[6px] border border-border p-3">
      <summary className="cursor-pointer text-sm text-muted-foreground">Removidos ({materiais.length})</summary>
      <div className="mt-3 space-y-2">
        {materiais.map((m) => (
          <div key={m.id} className="flex items-center gap-3">
            <Miniatura m={m} tamanho="h-12 w-12" onVer={() => onVer(m)} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{m.titulo}</div>
              <div className="text-xs text-muted-foreground">Removido em {new Date(m.removido_em!).toLocaleDateString('pt-BR')}</div>
            </div>
            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={restaurando === m.id} onClick={() => restaurar(m)}>
              <ArrowCounterClockwise className="mr-1 h-3.5 w-3.5" /> Restaurar
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive hover:text-destructive" onClick={() => onExcluir(m)}>
              <Trash className="mr-1 h-3.5 w-3.5" /> Excluir de vez
            </Button>
          </div>
        ))}
      </div>
    </details>
  );
}

export default function AdminPlamevMateriais() {
  const [vendo, setVendo] = useState<Material | null>(null);
  const [excluindo, setExcluindo] = useState<Material | null>(null);
  const lista = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await tabela().select('*').order('ordem', { ascending: true }).order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Material[];
    },
    // Conversão roda em segundo plano: acompanha até terminar.
    refetchInterval: (q) => ((q.state.data as Material[] | undefined)?.some((m) => m.md_status === 'gerando') ? 5000 : false),
  });
  const todos = lista.data ?? [];
  const materiais = todos.filter((m) => !m.removido_em);
  const removidos = todos.filter((m) => m.removido_em);
  const proximaOrdem = todos.reduce((max, m) => Math.max(max, m.ordem), 0) + 1;

  // Troca com o vizinho e regrava a ordem pela posição (1, 2, 3...): só as linhas que mudaram.
  const mover = (i: number) => (passo: -1 | 1) => {
    const nova = [...materiais];
    [nova[i], nova[i + passo]] = [nova[i + passo], nova[i]];
    return Promise.all(nova.map((m, pos) => (m.ordem === pos + 1 ? Promise.resolve({ error: null })
      : tabela().update({ ordem: pos + 1 }).eq('id', m.id))));
  };

  return (
    <AdminLayout>
      <div className="max-w-3xl space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Materiais Plamev</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            PDFs de cobertura e comparativos que o vendedor envia ao cliente pela aba Materiais do widget Plamev. Valem para
            todas as organizações com o widget ligado. Desativar ou remover tira do widget, mas os arquivos já enviados
            continuam abrindo nas conversas. Excluir de vez só vale para o que nunca foi enviado.
          </p>
        </div>

        <NovoMaterial proximaOrdem={proximaOrdem} />

        <Card>
          <CardHeader>
            <CardTitle>Materiais ({materiais.length})</CardTitle>
            <CardDescription>A ordem aqui é a ordem no widget.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {lista.isLoading && <SpinnerGap className="h-5 w-5 animate-spin text-muted-foreground" />}
            {lista.isError && <p className="text-sm text-destructive">{(lista.error as Error).message}</p>}
            {!lista.isLoading && !materiais.length && <p className="text-sm text-muted-foreground">Nenhum material ainda.</p>}
            {materiais.map((m, i) => (
              <LinhaMaterial key={`${m.id}-${m.updated_at}`} m={m} podeSubir={i > 0} podeDescer={i < materiais.length - 1} mover={mover(i)}
                onVer={() => setVendo(m)} onExcluir={() => setExcluindo(m)} />
            ))}
            <Removidos materiais={removidos} proximaOrdem={proximaOrdem} onVer={setVendo} onExcluir={setExcluindo} />
          </CardContent>
        </Card>
        <TestarModelos />
        <PreviewMaterial material={vendo ? preview(vendo) : null} onClose={() => setVendo(null)} />
        <ExcluirDeVez m={excluindo} onClose={() => setExcluindo(null)} />
      </div>
    </AdminLayout>
  );
}
