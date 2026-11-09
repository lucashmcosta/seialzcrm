import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, FilePdf, FloppyDisk, SpinnerGap, UploadSimple } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  ACEITA_MATERIAL, BUCKET_MATERIAIS, nomeArquivoMaterial, recusaMaterial, tamanhoLegivel, TIPOS_MATERIAL,
} from '@/widgets/plamev-quote/materiais';

// Admin — Materiais de apoio da Plamev (widget plamev_quote). São da Plamev, não de uma org: o que subir aqui aparece
// na aba Materiais do widget de toda org com ele ligado. Tabela plamev_materials + bucket público plamev-materiais.

interface Material {
  id: string; titulo: string; descricao: string; tipo: 'image' | 'document'; mime_type: string;
  storage_path: string; tamanho_bytes: number; ordem: number; ativo: boolean; created_at: string; updated_at: string;
}

const CHAVE = ['admin', 'plamev-materiais'];
// A tabela é nova e ainda não está nos tipos gerados do Supabase.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const tabela = () => (supabase as any).from('plamev_materials');
const urlPublica = (path: string) => supabase.storage.from(BUCKET_MATERIAIS).getPublicUrl(path).data.publicUrl;

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

function LinhaMaterial({ m, podeSubir, podeDescer, mover }: {
  m: Material; podeSubir: boolean; podeDescer: boolean; mover: (passo: -1 | 1) => Promise<{ error: unknown }[]>;
}) {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState(m.titulo);
  const [descricao, setDescricao] = useState(m.descricao);
  const [salvando, setSalvando] = useState(false);
  const mudou = titulo.trim() !== m.titulo || descricao.trim() !== m.descricao;
  const url = urlPublica(m.storage_path);

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
      <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
        {m.tipo === 'image'
          ? <img src={url} alt="" className="h-20 w-20 rounded-[6px] border border-border object-cover" />
          : <div className="flex h-20 w-20 items-center justify-center rounded-[6px] border border-border bg-muted"><FilePdf className="h-8 w-8 text-muted-foreground" /></div>}
      </a>
      <div className="min-w-0 flex-1 space-y-2">
        <Input value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} className="h-8" />
        <Textarea value={descricao} rows={2} maxLength={500} onChange={(e) => setDescricao(e.target.value)} className="text-sm" />
        <div className="text-xs text-muted-foreground">
          <span className="font-data">{m.storage_path.split('/').pop()}</span> · {tamanhoLegivel(m.tamanho_bytes)} ·{' '}
          {new Date(m.created_at).toLocaleDateString('pt-BR')}
        </div>
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

export default function AdminPlamevMateriais() {
  const lista = useQuery({
    queryKey: CHAVE,
    queryFn: async () => {
      const { data, error } = await tabela().select('*').order('ordem', { ascending: true }).order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Material[];
    },
  });
  const materiais = lista.data ?? [];

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
            todas as organizações com o widget ligado. Desativar tira do widget, mas os arquivos já enviados continuam abrindo.
          </p>
        </div>

        <NovoMaterial proximaOrdem={materiais.reduce((max, m) => Math.max(max, m.ordem), 0) + 1} />

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
              <LinhaMaterial key={`${m.id}-${m.updated_at}`} m={m} podeSubir={i > 0} podeDescer={i < materiais.length - 1} mover={mover(i)} />
            ))}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
