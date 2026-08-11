import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

// Hook único de documentos por entidade (contato OU oportunidade), sobre a tabela `documents`.
// Uploader único, sem workflow de aprovação.
// "Necessário" é derivado (document_types × documents com aquele tipo) — não há tabela de slot.

export type DocEntityType = 'contact' | 'opportunity';

export interface EntityDoc {
  id: string;
  file_name: string;
  display_name: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  bucket: string;
  created_at: string;
  document_type_id: string | null;
}

// Nome de exibição/baixa: display_name gerado (2c) ⟶ original ⟶ file_name.
export const docDisplayName = (d: EntityDoc): string =>
  d.display_name || d.original_file_name || d.file_name;

// SHA-256 (hex) do conteúdo — content_hash / detecção de duplicata.
async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface DocType {
  id: string;
  code: string;
  name: string;
  is_required: boolean;
  sort_order: number;
  owner_type: 'contact' | 'opportunity';
  cardinality: 'single' | 'multiple';
  reference_kind: 'none' | 'date' | 'month' | 'period';
  validity_mode: 'none' | 'derived' | 'stated';
  validity_days: number | null;
  has_two_sides: boolean;
}

export function useEntityDocuments(entityType: DocEntityType, entityId?: string | null) {
  const { organization, userProfile } = useOrganization();
  const qc = useQueryClient();
  const orgId = organization?.id;
  const docsKey = ['entity-documents', entityType, entityId] as const;

  const { data: documents = [], isLoading, error } = useQuery({
    queryKey: docsKey,
    enabled: !!orgId && !!entityId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('id,file_name,display_name,original_file_name,mime_type,size_bytes,storage_path,bucket,created_at,document_type_id')
        .eq('organization_id', orgId!)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .is('deleted_at', null)
        .is('superseded_by_id', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EntityDoc[];
    },
  });

  // Tipos habilitados p/ a org: catálogo canônico (org_id NULL) filtrado pela
  // habilitação em organization_document_types. Ordena por sort_order da org
  // (fallback p/ o do tipo) e depois nome.
  const { data: types = [] } = useQuery({
    queryKey: ['document-types-enabled', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_document_types')
        .select(
          'sort_order, document_types!inner(id,code,name,is_required,sort_order,owner_type,cardinality,reference_kind,validity_mode,validity_days,has_two_sides)',
        )
        .eq('organization_id', orgId!)
        .eq('is_enabled', true)
        .eq('document_types.is_active', true)
        .is('document_types.deleted_at', null);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Array<{ sort_order: number | null; document_types: DocType }>;
      return rows
        .map((r) => ({ dt: r.document_types, ord: r.sort_order ?? r.document_types.sort_order }))
        .sort((a, b) => a.ord - b.ord || a.dt.name.localeCompare(b.dt.name))
        .map((r) => r.dt);
    },
  });

  // Realtime: reflete uploads/remoções de qualquer sessão.
  useEffect(() => {
    if (!orgId || !entityId) return;
    const ch = supabase
      .channel(`documents:${entityType}:${entityId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `entity_id=eq.${entityId}` },
        () => qc.invalidateQueries({ queryKey: docsKey }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, entityType, entityId]);

  // Upload único: livre (sem tipo) ou classificado. Storage ANTES do banco (path
  // opaco por org). Cardinalidade do tipo dirige a gravação: `single` substitui
  // versionando (RPC atômica), `multiple` acumula (cada arquivo é documento próprio).
  const upload = useMutation({
    mutationFn: async ({ file, documentTypeId }: { file: File; documentTypeId?: string | null }) => {
      if (!orgId || !entityId || !userProfile?.id) throw new Error('missing context');
      const hash = await sha256Hex(file);
      const path = `${orgId}/${crypto.randomUUID()}`; // opaco — nunca o hash
      const { error: upErr } = await supabase.storage
        .from('attachments')
        .upload(path, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;

      const type = documentTypeId ? types.find((t) => t.id === documentTypeId) : null;
      const isSingle = type?.cardinality === 'single';
      const existing = documentTypeId && isSingle ? documents.find((d) => d.document_type_id === documentTypeId) : null;

      if (existing) {
        // single ocupado ⟶ nova versão corrente + antigo preservado como substituído.
        const { error } = await supabase.rpc('replace_document_single_v1', {
          _old_id: existing.id,
          _content_hash: hash,
          _storage_path: path,
          _file_name: file.name,
          _original_file_name: file.name,
          _mime_type: file.type,
          _size_bytes: file.size,
          _uploaded_by: userProfile.id,
          _bucket: 'attachments',
        });
        if (error) throw error;
      } else {
        const id = crypto.randomUUID();
        const { error } = await supabase.from('documents').insert({
          id,
          organization_id: orgId,
          entity_type: entityType,
          entity_id: entityId,
          bucket: 'attachments',
          storage_path: path,
          file_name: file.name,
          original_file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by_user_id: userProfile.id,
          document_type_id: documentTypeId ?? null,
          is_single: !!isSingle,
          content_hash: hash,
          version: 1,
          root_document_id: id,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: docsKey }),
  });

  const remove = useMutation({
    mutationFn: async (doc: EntityDoc) => {
      // Remove o objeto físico e soft-deleta a linha (paridade com o comportamento antigo).
      await supabase.storage.from(doc.bucket).remove([doc.storage_path]);
      const { error } = await supabase.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: docsKey }),
  });

  const getSignedUrl = async (doc: EntityDoc) => {
    const { data, error } = await supabase.storage.from(doc.bucket).createSignedUrl(doc.storage_path, 600);
    if (error) throw error;
    return data.signedUrl;
  };

  const download = async (doc: EntityDoc) => {
    const { data, error } = await supabase.storage.from(doc.bucket).download(doc.storage_path);
    if (error) throw error;
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = docDisplayName(doc);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return { documents, types, isLoading, error, upload, remove, download, getSignedUrl };
}
