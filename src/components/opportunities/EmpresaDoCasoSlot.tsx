import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Buildings, FileText, Trash, Warning } from '@phosphor-icons/react';
import { toast } from '@/hooks/use-toast';

/**
 * A empresa do caso, lida da CTPS.
 *
 * A CTPS é o histórico de empregos inteiro -- num teste real vieram ONZE
 * empregadores. O documento não diz qual é o caso, então aqui se PERGUNTA:
 * nada é vinculado sozinho e nada vem pré-marcado. Opção pronta vira clique
 * automático, e escolher a empresa errada é errar a petição.
 *
 * Só PDF com camada de texto. Carteira fotografada fica de fora -- OCR erra
 * dígito, e dígito errado de CNPJ é empresa errada sem ninguém perceber.
 */

interface Vinculo {
  id: string;
  role_code: string;
  companies: { id: string; name: string | null; cnpj: string | null; legal_name: string | null } | null;
}

interface Papel {
  code: string;
  name: string;
  is_counterparty: boolean;
  is_default: boolean;
  organization_id: string | null;
}

interface Achado {
  cnpj: string;
  empregador_no_documento: string | null;
  periodo: string | null;
  vinculo_aberto: boolean;
  prescreve_em: string | null;
  dentro_do_prazo: boolean;
  dias_para_prescrever: number | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  cidade: string | null;
  uf: string | null;
  dados: Record<string, unknown> | null;
}

const formatarCnpj = (c: string) =>
  c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

const dataBr = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR') : '';

export function EmpresaDoCasoSlot(
  { opportunityId, contactId }: { opportunityId: string; contactId: string | null },
) {
  const [vinculos, setVinculos] = useState<Vinculo[]>([]);
  const [papeis, setPapeis] = useState<Papel[]>([]);
  const [documentos, setDocumentos] = useState<{ id: string; name: string }[]>([]);
  const [achados, setAchados] = useState<Achado[] | null>(null);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [lendo, setLendo] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [docLido, setDocLido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const [{ data: v }, { data: p }] = await Promise.all([
      supabase
        .from('opportunity_companies')
        .select('id, role_code, companies(id, name, cnpj, legal_name)')
        .eq('opportunity_id', opportunityId),
      supabase
        .from('opportunity_company_roles')
        .select('code, name, is_counterparty, is_default, organization_id')
        .eq('is_active', true)
        .order('sort_order'),
    ]);
    setVinculos((v ?? []) as unknown as Vinculo[]);
    // Papel da organização ganha do global quando o código se repete.
    const porCodigo = new Map<string, Papel>();
    for (const papel of ((p ?? []) as Papel[])) {
      const atual = porCodigo.get(papel.code);
      if (!atual || (!atual.organization_id && papel.organization_id)) porCodigo.set(papel.code, papel);
    }
    setPapeis([...porCodigo.values()]);
  }, [opportunityId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Documentos do contato cujo TIPO diz que vale procurar CNPJ. Quem decide é
  // o dado (`document_types.scans_cnpj`), não um `if` com o código do tipo.
  useEffect(() => {
    if (!contactId) return;
    (async () => {
      const { data } = await supabase
        .from('documents')
        .select('id, file_name, document_types!inner(name, scans_cnpj)')
        .eq('entity_id', contactId)
        .eq('mime_type', 'application/pdf')
        .is('deleted_at', null)
        .eq('document_types.scans_cnpj', true)
        .order('created_at', { ascending: false });
      setDocumentos(
        ((data ?? []) as unknown as { id: string; file_name: string | null; document_types: { name: string } }[])
          .map((d) => ({ id: d.id, name: d.file_name || d.document_types?.name || 'documento' })),
      );
    })();
  }, [contactId]);

  const ler = async (documentId: string) => {
    setLendo(true);
    setAchados(null);
    setMotivo(null);
    const { data, error } = await supabase.functions.invoke('documento-cnpjs', {
      body: { document_id: documentId },
    });
    setLendo(false);
    if (error) {
      toast({ title: 'Não foi possível ler o documento', variant: 'destructive' });
      return;
    }
    const r = data as { cnpjs?: Achado[]; motivo?: string };
    setDocLido(documentId);
    setAchados(r.cnpjs ?? []);
    setMotivo(r.motivo ?? null);
  };

  const vincular = async (a: Achado) => {
    if (!papelPadrao) {
      toast({ title: 'Nenhum papel padrão configurado nesta organização', variant: 'destructive' });
      return;
    }
    const papel = papelPadrao.code;
    setSalvando(a.cnpj);
    const { error } = await supabase.rpc('oportunidade_vincular_empresa_v1', {
      _opportunity_id: opportunityId,
      _cnpj: a.cnpj,
      _role_code: papel,
      _dados: (a.dados ?? {}) as never,
      _source: 'ctps',
      _source_document_id: docLido,
    });
    setSalvando(null);
    if (error) {
      toast({ title: 'Não foi possível vincular', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Empresa vinculada ao caso' });
    carregar();
  };

  const desvincular = async (id: string) => {
    const { error } = await supabase.rpc('oportunidade_desvincular_empresa_v1', { _id: id });
    if (error) {
      toast({ title: 'Não foi possível remover', variant: 'destructive' });
      return;
    }
    carregar();
  };

  // Um clique: o papel vem do padrão da organização, a tela não pergunta.
  // Tomadora e grupo econômico continuam no catálogo para quando a distinção
  // importar -- é a ficha de entrevista que pergunta por elas.
  const papelPadrao = useMemo(
    () => papeis.find((p) => p.is_default) ?? papeis.find((p) => p.is_counterparty) ?? papeis[0],
    [papeis],
  );

  const jaVinculados = useMemo(
    () => new Set(vinculos.map((v) => (v.companies?.cnpj ?? '').replace(/\D/g, ''))),
    [vinculos],
  );
  const dentro = (achados ?? []).filter((a) => a.dentro_do_prazo);
  const fora = (achados ?? []).filter((a) => !a.dentro_do_prazo);

  if (!contactId) return null;
  if (documentos.length === 0 && vinculos.length === 0) return null;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Buildings className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Empresa do caso</h3>
        </div>

        {vinculos.length > 0 && (
          <div className="space-y-2">
            {vinculos.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-2 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {v.companies?.legal_name || v.companies?.name || '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.companies?.cnpj ? formatarCnpj(v.companies.cnpj.replace(/\D/g, '')) : ''}
                    {' · '}
                    {papeis.find((p) => p.code === v.role_code)?.name ?? v.role_code}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => desvincular(v.id)}>
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {documentos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {documentos.slice(0, 3).map((d) => (
              <Button key={d.id} size="sm" variant="outline" disabled={lendo} onClick={() => ler(d.id)}>
                <FileText className="h-4 w-4 mr-1.5" />
                {lendo ? 'Lendo…' : `Ler ${d.name.slice(0, 28)}`}
              </Button>
            ))}
          </div>
        )}

        {achados !== null && achados.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {motivo === 'sem_texto' || motivo === 'pdf_ilegivel'
              ? 'Este PDF não tem texto — é imagem escaneada. Não dá para ler o CNPJ com segurança; cadastre a empresa à mão.'
              : 'Nenhum CNPJ encontrado neste documento.'}
          </p>
        )}

        {dentro.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold">Dentro do prazo ({dentro.length})</p>
            {dentro.map((a) => (
              <ItemAchado
                key={a.cnpj}
                achado={a}
                papel={papelPadrao}
                jaVinculado={jaVinculados.has(a.cnpj)}
                onVincular={() => vincular(a)}
                salvando={salvando === a.cnpj}
              />
            ))}
          </div>
        )}

        {fora.length > 0 && (
          <details className="space-y-2">
            <summary className="text-xs font-semibold cursor-pointer text-muted-foreground">
              Fora do prazo de 2 anos ({fora.length})
            </summary>
            <p className="text-[11px] text-muted-foreground mt-1 flex items-start gap-1.5">
              <Warning className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              A prescrição bienal tem exceções — FGTS, doença ocupacional, menor de 18. Por isso
              estas continuam aqui e podem ser escolhidas.
            </p>
            <div className="space-y-2 mt-2">
              {fora.map((a) => (
                <ItemAchado
                  key={a.cnpj}
                  achado={a}
                  papel={papelPadrao}
                  jaVinculado={jaVinculados.has(a.cnpj)}
                  onVincular={() => vincular(a)}
                  salvando={salvando === a.cnpj}
                />
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

function ItemAchado(
  { achado, papel, jaVinculado, onVincular, salvando }: {
    achado: Achado;
    papel?: Papel;
    jaVinculado: boolean;
    onVincular: () => void;
    salvando: boolean;
  },
) {
  const nome = achado.razao_social || achado.empregador_no_documento || formatarCnpj(achado.cnpj);
  const prazo = achado.vinculo_aberto
    ? 'contrato em aberto'
    : achado.prescreve_em
    ? `prescreve ${dataBr(achado.prescreve_em)}${
      achado.dias_para_prescrever != null && achado.dentro_do_prazo
        ? ` · ${achado.dias_para_prescrever} dias`
        : ''
    }`
    : '';

  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium leading-snug">{nome}</p>
          <p className="text-xs text-muted-foreground">
            {formatarCnpj(achado.cnpj)}
            {achado.periodo ? ` · ${achado.periodo}` : ''}
          </p>
          <p className="text-xs text-muted-foreground">{prazo}</p>
        </div>
        {achado.vinculo_aberto && <Badge variant="secondary" className="shrink-0">atual</Badge>}
      </div>

      {jaVinculado
        ? <p className="text-xs text-muted-foreground">Já vinculada a este caso.</p>
        : (
          <Button size="sm" className="h-8" disabled={salvando} onClick={onVincular}>
            {salvando ? 'Vinculando…' : `Vincular como ${(papel?.name ?? 'parte contrária').toLowerCase()}`}
          </Button>
        )}
    </div>
  );
}
