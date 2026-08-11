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
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  bucket: string;
  created_at: string;
  document_type_id: string | null;
}

export interface DocType {
  id: string;
  code: string;
  name: string;
  is_required: boolean;
  sort_order: number;
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
        .select('id,file_name,mime_type,size_bytes,storage_path,bucket,created_at,document_type_id')
        .eq('organization_id', orgId!)
        .eq('entity_type', entityType)
        .eq('entity_id', entityId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as EntityDoc[];
    },
  });

  const { data: types = [] } = useQuery({
    queryKey: ['document-types', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('document_types')
        .select('id,code,name,is_required,sort_order')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DocType[];
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

  // Um único caminho de upload: livre (documentTypeId undefined) ou classificado (slot).
  const upload = useMutation({
    mutationFn: async ({ file, documentTypeId }: { file: File; documentTypeId?: string | null }) => {
      if (!orgId || !entityId || !userProfile?.id) throw new Error('missing context');
      const ext = file.name.split('.').pop();
      const path = `${orgId}/${entityType}/${entityId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('attachments').upload(path, file);
      if (upErr) throw upErr;
      // Slot ocupado: substitui (soft-delete o anterior; respeita o índice único parcial).
      if (documentTypeId) {
        const existing = documents.find((d) => d.document_type_id === documentTypeId);
        if (existing) {
          await supabase.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', existing.id);
        }
      }
      const { error: insErr } = await supabase.from('documents').insert({
        organization_id: orgId,
        entity_type: entityType,
        entity_id: entityId,
        bucket: 'attachments',
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by_user_id: userProfile.id,
        document_type_id: documentTypeId ?? null,
      });
      if (insErr) throw insErr;
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
    a.download = doc.file_name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return { documents, types, isLoading, error, upload, remove, download, getSignedUrl };
}
