import { useState, useMemo } from 'react';
import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
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
import { SearchLg } from '@untitledui/icons';

interface TabConfig {
  id: string;
  label: string;
  permission?: keyof ReturnType<typeof usePermissions>['permissions'];
}

export default function Settings() {
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { permissions } = usePermissions();
  const { hasWhatsApp } = useWhatsAppIntegration();
  const [selectedTab, setSelectedTab] = useState('general');
  const [searchTerm, setSearchTerm] = useState('');

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
    // Only show WhatsApp Templates if user has WhatsApp connected
    ...(hasWhatsApp ? [
      { id: 'whatsappTemplates', label: 'WhatsApp Templates', permission: 'canManageIntegrations' as const },
      { id: 'aiAgent', label: 'Agente IA', permission: 'canManageIntegrations' as const },
    ] : []),
    { id: 'apiWebhooks', label: 'API & Webhooks', permission: 'canManageIntegrations' },
    { id: 'auditLogs', label: t('settings.auditLogs'), permission: 'canManageSettings' },
    { id: 'trash', label: t('settings.trash'), permission: 'canManageSettings' },
  ], [t, hasWhatsApp]);

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
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="px-6 py-4">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
              <div className="relative hidden sm:block">
                <SearchLg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('settings.searchPlaceholder') || 'Buscar...'}
                  className="w-64 pl-9 rounded-full"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
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
            <div className="hidden md:block border-b">
              <div className="px-6">
                <TabsList variant="underline" className="w-full justify-start overflow-x-auto">
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
