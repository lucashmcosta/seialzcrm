import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

export interface DocumentType {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DocumentTypeInput {
  code: string;
  name: string;
  is_required: boolean;
  sort_order: number;
  is_active?: boolean;
}

export function useDocumentTypes(opts: { activeOnly?: boolean } = {}) {
  const { organization, userProfile } = useOrganization();
  const [types, setTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTypes = useCallback(async () => {
    if (!organization?.id) return;
    let q = supabase
      .from('document_types')
      .select('*')
      .eq('organization_id', organization.id)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (opts.activeOnly) q = q.eq('is_active', true);
    const { data, error } = await q;
    if (!error) setTypes((data as DocumentType[]) || []);
    setLoading(false);
  }, [organization?.id, opts.activeOnly]);

  useEffect(() => {
    fetchTypes();
  }, [fetchTypes]);

  useEffect(() => {
    if (!organization?.id) return;
    const ch = supabase
      .channel(`document_types:${organization.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'document_types', filter: `organization_id=eq.${organization.id}` },
        () => fetchTypes()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [organization?.id, fetchTypes]);

  const create = async (input: DocumentTypeInput) => {
    if (!organization?.id || !userProfile?.id) throw new Error('no org');
    const { error } = await supabase.from('document_types').insert({
      organization_id: organization.id,
      code: input.code,
      name: input.name,
      is_required: input.is_required,
      sort_order: input.sort_order,
      is_active: input.is_active ?? true,
      created_by: userProfile.id,
      updated_by: userProfile.id,
    });
    if (error) throw error;
  };

  const update = async (id: string, input: Partial<DocumentTypeInput>) => {
    if (!userProfile?.id) throw new Error('no user');
    const { error } = await supabase
      .from('document_types')
      .update({ ...input, updated_by: userProfile.id })
      .eq('id', id);
    if (error) throw error;
  };

  const softDelete = async (id: string) => {
    if (!userProfile?.id) throw new Error('no user');
    const { error } = await supabase
      .from('document_types')
      .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: userProfile.id })
      .eq('id', id);
    if (error) throw error;
  };

  return { types, loading, refetch: fetchTypes, create, update, softDelete };
}
