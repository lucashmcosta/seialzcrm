import { Outlet, Navigate, useSearchParams, useLocation, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Breadcrumbs } from '@/components/application/breadcrumbs/breadcrumbs';
import { ArrowLeft } from 'lucide-react';
import { getSettingsLabelByPath } from './SettingsGrid';
import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { useAIIntegration } from '@/hooks/useAIIntegration';

// Map old tab IDs to new route slugs
const tabToRoute: Record<string, string> = {
  whatsappTemplates: 'whatsapp-templates',
  permissionProfiles: 'permissions',
  customFields: 'custom-fields',
  aiAgent: 'ai-agent',
  knowledgeBase: 'knowledge-base',
  knowledgeEdit: 'edit-kb',
  apiWebhooks: 'api-webhooks',
  auditLogs: 'audit-logs',
  general: 'general',
  theme: 'theme',
  users: 'users',
  billing: 'billing',
  pipeline: 'pipeline',
  duplicates: 'duplicates',
  tags: 'tags',
  integrations: 'integrations',
  products: 'products',
  trash: 'trash',
};

// Routes that require feature flags
const flagProtectedRoutes: Record<string, 'hasWhatsApp' | 'showAIFeatures'> = {
  'whatsapp-templates': 'hasWhatsApp',
  'ai-agent': 'showAIFeatures',
  'products': 'showAIFeatures',
  'knowledge-base': 'showAIFeatures',
  'edit-kb': 'showAIFeatures',
};

export function SettingsLayout() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasWhatsApp } = useWhatsAppIntegration();
  const { hasAI } = useAIIntegration();

  const showAIFeatures = hasWhatsApp || hasAI;

  // Backward compatibility: redirect ?tab= to new routes
  const tab = searchParams.get('tab');
  if (tab) {
    const route = tabToRoute[tab] || tab;
    return <Navigate to={`/settings/${route}`} replace />;
  }

  // Get current child route slug
  const pathParts = location.pathname.split('/');
  const childSlug = pathParts.length > 2 ? pathParts.slice(2).join('/') : null;
  const isIndex = !childSlug;

  // Flag protection for child routes
  if (childSlug) {
    const requiredFlag = flagProtectedRoutes[childSlug];
    if (requiredFlag) {
      const flags: Record<string, boolean> = { hasWhatsApp, showAIFeatures };
      if (!flags[requiredFlag]) {
        return <Navigate to="/settings" replace />;
      }
    }
  }

  const sectionLabel = childSlug ? getSettingsLabelByPath(childSlug) : null;

  return (
    <Layout>
      <div className="flex flex-col h-full max-w-full overflow-x-hidden">
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="p-6 max-w-5xl mx-auto">
            {isIndex ? (
              <>
                {/* Index header */}
                <div className="mb-6">
                  <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </button>
                  <h1 className="text-2xl font-bold text-foreground tracking-tight">Configurações</h1>
                  <p className="text-sm text-muted-foreground mt-1">Gerencie sua conta, equipe, integrações e preferências</p>
                </div>
              </>
            ) : (
              <>
                {/* Detail header with breadcrumb */}
                <div className="mb-6">
                  <Breadcrumbs
                    items={[
                      { label: 'Configurações', href: '/settings' },
                      { label: sectionLabel || childSlug || '' },
                    ]}
                    className="mb-4"
                  />
                </div>
              </>
            )}

            <div className="animate-in fade-in duration-200">
              <Outlet />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
