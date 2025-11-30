import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GeneralSettings } from '@/components/settings/GeneralSettings';
import { UsersSettings } from '@/components/settings/UsersSettings';
import { PipelineSettings } from '@/components/settings/PipelineSettings';
import { DuplicatePreventionSettings } from '@/components/settings/DuplicatePreventionSettings';
import { CustomFieldsSettings } from '@/components/settings/CustomFieldsSettings';
import { TagsSettings } from '@/components/settings/TagsSettings';
import { PermissionProfilesSettings } from '@/components/settings/PermissionProfilesSettings';
import { BillingSettings } from '@/components/settings/BillingSettings';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { AuditLogs } from './settings/AuditLogs';
import { Trash } from './settings/Trash';

export default function Settings() {
  const { locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { permissions } = usePermissions();

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <Tabs defaultValue="general" className="w-full">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
              {permissions.canManageUsers && <TabsTrigger value="users">{t('settings.users')}</TabsTrigger>}
              {permissions.canManageSettings && <TabsTrigger value="permissionProfiles">{t('settings.permissionProfiles')}</TabsTrigger>}
              {permissions.canManageBilling && <TabsTrigger value="billing">{t('settings.billing')}</TabsTrigger>}
              {permissions.canManageSettings && <TabsTrigger value="pipeline">{t('settings.pipeline')}</TabsTrigger>}
              {permissions.canManageSettings && <TabsTrigger value="duplicates">{t('settings.duplicates')}</TabsTrigger>}
              {permissions.canManageSettings && <TabsTrigger value="customFields">{t('settings.customFields')}</TabsTrigger>}
              {permissions.canManageSettings && <TabsTrigger value="tags">{t('settings.tags')}</TabsTrigger>}
              {permissions.canManageIntegrations && <TabsTrigger value="integrations">{t('settings.integrations')}</TabsTrigger>}
              {permissions.canManageSettings && <TabsTrigger value="auditLogs">{t('settings.auditLogs')}</TabsTrigger>}
              {permissions.canManageSettings && <TabsTrigger value="trash">{t('settings.trash')}</TabsTrigger>}
            </TabsList>

            <TabsContent value="general">
              <GeneralSettings />
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

            <TabsContent value="auditLogs">
              <AuditLogs />
            </TabsContent>

            <TabsContent value="trash">
              <Trash />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
