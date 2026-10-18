import { lazy, Suspense, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from '@phosphor-icons/react';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/hooks/useOrganization';
import { getWidget } from '@/widgets/registry';

/** /settings/widgets/:key — página de configuração de um widget (definida no registry). */
export default function WidgetSettingsPage() {
  const { key = '' } = useParams<{ key: string }>();
  const { organization } = useOrganization();
  const def = getWidget(key);
  const Settings = useMemo(() => (def?.settings ? lazy(def.settings) : null), [def]);

  return (
    <div className="space-y-4">
      <Link to="/settings/widgets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Widgets
      </Link>
      {!def || !Settings ? (
        <p className="text-sm text-muted-foreground">Este widget não tem configurações.</p>
      ) : (
        <>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{def.name}</h2>
            <p className="text-sm text-muted-foreground">{def.description}</p>
          </div>
          {organization && (
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <Settings organizationId={organization.id} />
            </Suspense>
          )}
        </>
      )}
    </div>
  );
}
