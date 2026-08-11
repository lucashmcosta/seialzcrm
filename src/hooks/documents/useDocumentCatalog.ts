import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

export type OwnerType = 'contact' | 'opportunity';
export type Cardinality = 'single' | 'multiple';
export type ReferenceKind = 'none' | 'date' | 'month' | 'period';
export type ValidityMode = 'none' | 'derived' | 'stated';

export interface CatalogType {
  id: string;
  code: string;
  name: string;
  category_code: string | null;
  owner_type: OwnerType;
  cardinality: Cardinality;
  reference_kind: ReferenceKind;
  validity_mode: ValidityMode;
  validity_days: number | null;
  has_two_sides: boolean;
  is_local: boolean; // criado pela org (não é canônico global)
  is_enabled: boolean; // habilitado para a org (organization_document_types)
}

export interface LocalTypeInput {
  name: string;
  code: string;
  category_code: string;
  owner_type: OwnerType;
  cardinality: Cardinality;
  reference_kind: ReferenceKind;
  validity_mode: ValidityMode;
  validity_days: number | null;
  has_two_sides: boolean;
}

export function useDocumentCatalog() {
  const { organization, userProfile } = useOrganization();
  const qc = useQueryClient();
  const orgId = organization?.id;
  const key = ['document-catalog', orgId] as const;

  const query = useQuery({
    queryKey: key,
    enabled: !!orgId,
    queryFn: async (): Promise<CatalogType[]> => {
      // Tipos: catálogo global (org null) + tipos locais da org — ativos e não deletados.
      const { data: typesData, error: te } = await supabase
        .from('document_types')
        .select('id,code,name,category_code,owner_type,cardinality,reference_kind,validity_mode,validity_days,has_two_sides,organization_id')
        .or(`organization_id.is.null,organization_id.eq.${orgId}`)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (te) throw te;

      const { data: enData, error: ee } = await supabase
        .from('organization_document_types')
        .select('document_type_id, is_enabled')
        .eq('organization_id', orgId!);
      if (ee) throw ee;
      const enabled = new Map((enData ?? []).map((r) => [r.document_type_id as string, r.is_enabled as boolean]));

      return (typesData ?? []).map((t): CatalogType => ({
        id: t.id,
        code: t.code,
        name: t.name,
        category_code: t.category_code,
        owner_type: t.owner_type,
        cardinality: t.cardinality,
        reference_kind: t.reference_kind,
        validity_mode: t.validity_mode,
        validity_days: t.validity_days,
        has_two_sides: t.has_two_sides,
        is_local: t.organization_id === orgId,
        is_enabled: enabled.get(t.id) === true,
      }));
    },
  });

  const setEnabled = useMutation({
    mutationFn: async ({ typeId, enabled }: { typeId: string; enabled: boolean }) => {
      if (!orgId) throw new Error('no org');
      const { error } = await supabase
        .from('organization_document_types')
        .upsert(
          { organization_id: orgId, document_type_id: typeId, is_enabled: enabled, updated_at: new Date().toISOString() },
          { onConflict: 'organization_id,document_type_id' },
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  // Tipo local (custom da org) — criado já habilitado.
  const createLocal = useMutation({
    mutationFn: async (input: LocalTypeInput) => {
      if (!orgId || !userProfile?.id) throw new Error('no org');
      const { data, error } = await supabase
        .from('document_types')
        .insert({
          organization_id: orgId,
          code: input.code,
          name: input.name,
          category_code: input.category_code,
          owner_type: input.owner_type,
          cardinality: input.cardinality,
          reference_kind: input.reference_kind,
          validity_mode: input.validity_mode,
          validity_days: input.validity_days,
          has_two_sides: input.has_two_sides,
          created_by: userProfile.id,
          updated_by: userProfile.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      const { error: enErr } = await supabase
        .from('organization_document_types')
        .upsert({ organization_id: orgId, document_type_id: data!.id, is_enabled: true }, { onConflict: 'organization_id,document_type_id' });
      if (enErr) throw enErr;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const updateLocal = useMutation({
    mutationFn: async ({ id, input }: { id: string; input: LocalTypeInput }) => {
      if (!userProfile?.id) throw new Error('no user');
      const { error } = await supabase
        .from('document_types')
        .update({ ...input, updated_by: userProfile.id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  const deleteLocal = useMutation({
    mutationFn: async (id: string) => {
      if (!userProfile?.id) throw new Error('no user');
      const { error } = await supabase
        .from('document_types')
        .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: userProfile.id })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { catalog: query.data ?? [], loading: query.isLoading, setEnabled, createLocal, updateLocal, deleteLocal };
}
