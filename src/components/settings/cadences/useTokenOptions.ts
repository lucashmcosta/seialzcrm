// Campos que dá para inserir num texto (template, e-mail): os fixos e os campos personalizados da org,
// pelo nome que o usuário conhece. O código ({{...}}) fica por baixo.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { TOKENS } from './CadenceEditorDialog';

export function useTokenOptions(organizationId: string) {
  const { data } = useQuery({
    queryKey: ['token-custom-fields', organizationId],
    queryFn: async () => {
      const { data } = await supabase.from('custom_field_definitions').select('name, label, module')
        .eq('organization_id', organizationId).order('order_index');
      return (data ?? []) as Array<{ name: string; label: string | null; module: string }>;
    },
  });
  return [
    ...TOKENS,
    ...(data ?? []).map((f) => ({ token: `{{custom.${f.name}}}`, label: f.label || f.name })),
  ];
}
