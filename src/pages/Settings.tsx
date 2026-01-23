import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { useAIIntegration } from '@/hooks/useAIIntegration';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft } from 'lucide-react';
import { NativeSelect } from '@/components/ui/native-select';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { UsersSettings } from '@/components/settings/UsersSettings';
import { PipelineSettings } from '@/components/settings/PipelineSettings';
import { DuplicatePreventionSettings } from '@/components/settings/DuplicatePreventionSettings';
import { CustomFieldsSettings } from '@/components/settings/CustomFieldsSettings';
import { TagsSettings } from '@/components/settings/TagsSettings';
import { PermissionProfilesSettings } from '@/components/settings/PermissionProfilesSettings';
import { BillingSettings } from '@/components/settings/BillingSettings';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { ApiWebhooksSettings } from '@/components/settings/ApiWebhooksSettings';
import { ThemeSettings } from '@/components/settings/ThemeSettings';
import { AuditLogs } from './settings/AuditLogs';
import { Trash } from './settings/Trash';
import WhatsAppTemplates from './settings/WhatsAppTemplates';
import { AIAgentSettings } from '@/components/settings/AIAgentSettings';
import { KnowledgeBaseSettings } from '@/components/settings/KnowledgeBaseSettings';

interface TabConfig {
  id: string;
  label: string;
  permission?: keyof ReturnType<typeof usePermissions>['permissions'];
}

export default function Settings() {
  const navigate = useNavigate();
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { permissions } = usePermissions();
  const { hasWhatsApp } = useWhatsAppIntegration();
  const { hasAI } = useAIIntegration();
  const [selectedTab, setSelectedTab] = useState('general');
  const [searchTerm, setSearchTerm] = useState('');

  // Show AI features if either WhatsApp OR any AI integration is enabled
  const showAIFeatures = hasWhatsApp || hasAI;

  const allTabs: TabConfig[] = useMemo(() => [
    { id: 'general', label: t('settings.general') },
    { id: 'theme', label: t('settings.theme'), permission: 'canManageSettings' },
    { id: 'users', label: t('settings.users'), permission: 'canManageUsers' },
    { id: 'permissionProfiles', label: t('settings.permissionProfiles'), permission: 'canManageSettings' },
    { id: 'billing', label: t('settings.billing'), permission: 'canManageBilling' },
    { id: 'pipeline', label: t('settings.pipeline'), permission: 'canManageSettings' },
    { id: 'duplicates', label: t('settings.duplicates'), permission: 'canManageSettings' },
    { id: 'customFields', label: t('settings.customFields'), permission: 'canManageSettings' },
    { id: 'tags', label: t('settings.tags'), permission: 'canManageSettings' },
    { id: 'integrations', label: t('settings.integrations'), permission: 'canManageIntegrations' },
    // Show WhatsApp Templates only if WhatsApp is connected
    ...(hasWhatsApp ? [
      { id: 'whatsappTemplates', label: 'WhatsApp Templates', permission: 'canManageIntegrations' as const },
    ] : []),
    // Show AI Agent and Knowledge Base if ANY AI integration is enabled (WhatsApp, OpenAI, Claude, etc.)
    ...(showAIFeatures ? [
      { id: 'aiAgent', label: 'Agente IA', permission: 'canManageIntegrations' as const },
      { id: 'knowledgeBase', label: 'Base de Conhecimento', permission: 'canManageIntegrations' as const },
    ] : []),
    { id: 'apiWebhooks', label: 'API & Webhooks', permission: 'canManageIntegrations' },
    { id: 'auditLogs', label: t('settings.auditLogs'), permission: 'canManageSettings' },
    { id: 'trash', label: t('settings.trash'), permission: 'canManageSettings' },
  ], [t, hasWhatsApp, showAIFeatures]);

  // Filter tabs based on permissions
  const filteredTabs = useMemo(() => {
    return allTabs.filter(tab => {
      if (!tab.permission) return true;
      return permissions[tab.permission];
    });
  }, [permissions, allTabs]);

  // Filter tabs based on search
  const searchFilteredTabs = useMemo(() => {
    if (!searchTerm) return filteredTabs;
    return filteredTabs.filter(tab => 
      tab.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [filteredTabs, searchTerm]);

  return (
    <Layout>
      <div className="flex flex-col h-full max-w-full overflow-x-hidden">
        {/* Back Button */}
        <div className="px-6 pt-4 pb-2">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
            {/* Mobile: Native Select */}
            <div className="md:hidden px-6 py-4 border-b">
              <NativeSelect
                value={selectedTab}
                onChange={(e) => setSelectedTab(e.target.value)}
                options={searchFilteredTabs.map(tab => ({ label: tab.label, value: tab.id }))}
              />
            </div>

            {/* Desktop: Horizontal Tabs with underline */}
            <div className="hidden md:block border-b overflow-hidden">
              <div 
                className="px-6 overflow-x-auto scrollbar-hide touch-pan-x overscroll-x-contain"
                style={{ WebkitOverflowScrolling: 'touch' }}
              >
                <TabsList variant="underline" className="inline-flex flex-nowrap justify-start min-w-max">
                  {searchFilteredTabs.map(tab => (
                    <TabsTrigger 
                      key={tab.id} 
                      value={tab.id} 
                      variant="underline"
                      className="shrink-0"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <TabsContent value="general">
                <GeneralSettings />
              </TabsContent>

              <TabsContent value="theme">
                <ThemeSettings />
              </TabsContent>

              <TabsContent value="users">
                <UsersSettings />
              </TabsContent>

              <TabsContent value="pipeline">
                <PipelineSettings />
              </TabsContent>

              <TabsContent value="duplicates">
                <DuplicatePreventionSettings />
              </TabsContent>

              <TabsContent value="customFields">
                <CustomFieldsSettings />
              </TabsContent>

              <TabsContent value="tags">
                <TagsSettings />
              </TabsContent>

              <TabsContent value="permissionProfiles">
                <PermissionProfilesSettings />
              </TabsContent>

              <TabsContent value="billing">
                <BillingSettings />
              </TabsContent>

              <TabsContent value="integrations">
                <IntegrationsSettings />
              </TabsContent>

              <TabsContent value="whatsappTemplates">
                <WhatsAppTemplates />
              </TabsContent>

              <TabsContent value="aiAgent">
                <AIAgentSettings />
              </TabsContent>

              <TabsContent value="knowledgeBase">
                <KnowledgeBaseSettings />
              </TabsContent>

              <TabsContent value="apiWebhooks">
                <ApiWebhooksSettings />
              </TabsContent>

              <TabsContent value="auditLogs">
                <AuditLogs />
              </TabsContent>

              <TabsContent value="trash">
                <Trash />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
