import { useState, useMemo } from 'react';
import {
  Settings,
  Palette,
  LayoutGrid,
  Tag,
  GitBranch,
  Users,
  Shield,
  Copy,
  Link,
  MessageSquare,
  Bot,
  Code,
  CreditCard,
  Package,
  BookOpen,
  FileEdit,
  Clock,
  Trash2,
  Search,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { useAIIntegration } from '@/hooks/useAIIntegration';
import { Input } from '@/components/ui/input';
import { SettingsCard } from './SettingsCard';
import type { LucideIcon } from 'lucide-react';

interface SettingsItem {
  icon: LucideIcon;
  label: string;
  description: string;
  to: string;
  badge?: string;
  badgeVariant?: 'default' | 'info' | 'warning';
  permission?: keyof ReturnType<typeof usePermissions>['permissions'];
  flag?: 'hasWhatsApp' | 'showAIFeatures';
}

interface SettingsGroup {
  title: string;
  description: string;
  items: SettingsItem[];
}

const settingsGroups: SettingsGroup[] = [
  {
    title: 'Geral',
    description: 'Configurações básicas da sua conta e aparência',
    items: [
      { icon: Settings, label: 'Geral', description: 'Nome da empresa, fuso horário e idioma', to: 'general' },
      { icon: Palette, label: 'Tema e Cores', description: 'Personalize a aparência do seu CRM', to: 'theme', permission: 'canManageSettings' },
      { icon: LayoutGrid, label: 'Campos Personalizados', description: 'Crie campos extras para contatos e oportunidades', to: 'custom-fields', permission: 'canManageSettings' },
      { icon: Tag, label: 'Etiquetas', description: 'Organize contatos e oportunidades com tags', to: 'tags', permission: 'canManageSettings' },
      { icon: GitBranch, label: 'Pipeline', description: 'Configure estágios do funil de vendas', to: 'pipeline', permission: 'canManageSettings' },
    ],
  },
  {
    title: 'Equipe & Permissões',
    description: 'Gerencie usuários e controle de acesso',
    items: [
      { icon: Users, label: 'Usuários & Permissões', description: 'Adicione membros e gerencie acessos', to: 'users', permission: 'canManageUsers' },
      { icon: Shield, label: 'Perfis de Permissão', description: 'Defina níveis de acesso personalizados', to: 'permissions', permission: 'canManageSettings' },
      { icon: Copy, label: 'Duplicatas', description: 'Regras para detecção de contatos duplicados', to: 'duplicates', permission: 'canManageSettings' },
    ],
  },
  {
    title: 'Integrações & Canais',
    description: 'Conecte ferramentas externas e canais de comunicação',
    items: [
      { icon: Link, label: 'Integrações', description: 'Conecte com ferramentas que você já usa', to: 'integrations', permission: 'canManageIntegrations' },
      { icon: MessageSquare, label: 'WhatsApp Templates', description: 'Gerencie modelos de mensagem do WhatsApp', to: 'whatsapp-templates', permission: 'canManageIntegrations', flag: 'hasWhatsApp' },
      { icon: Bot, label: 'Agente IA', description: 'Configure assistente virtual inteligente', to: 'ai-agent', badge: 'Beta', badgeVariant: 'warning', permission: 'canManageIntegrations', flag: 'showAIFeatures' },
      { icon: Code, label: 'API & Webhooks', description: 'Acesse a API e configure webhooks', to: 'api-webhooks', permission: 'canManageIntegrations' },
    ],
  },
  {
    title: 'Financeiro',
    description: 'Faturamento e produtos',
    items: [
      { icon: CreditCard, label: 'Faturamento', description: 'Plano atual, faturas e método de pagamento', to: 'billing', permission: 'canManageBilling' },
      { icon: Package, label: 'Produtos', description: 'Organize seu conhecimento por produto ou serviço', to: 'products', permission: 'canManageIntegrations', flag: 'showAIFeatures' },
    ],
  },
  {
    title: 'Conhecimento & Dados',
    description: 'Base de conhecimento e gerenciamento de dados',
    items: [
      { icon: BookOpen, label: 'Base de Conhecimento', description: 'Artigos e documentação para a equipe e IA', to: 'knowledge-base', permission: 'canManageIntegrations', flag: 'showAIFeatures' },
      { icon: FileEdit, label: 'Editar KB', description: 'Edite e organize o conteúdo da base', to: 'edit-kb', permission: 'canManageIntegrations', flag: 'showAIFeatures' },
      { icon: Clock, label: 'Histórico de Alterações', description: 'Veja todas as mudanças feitas no sistema', to: 'audit-logs', permission: 'canManageSettings' },
      { icon: Trash2, label: 'Lixeira', description: 'Itens deletados recentemente', to: 'trash', permission: 'canManageSettings' },
    ],
  },
];

// Export for use in SettingsLayout breadcrumbs
export function getSettingsLabelByPath(path: string): string | null {
  for (const group of settingsGroups) {
    for (const item of group.items) {
      if (item.to === path) return item.label;
    }
  }
  return null;
}

export function SettingsGrid() {
  const [search, setSearch] = useState('');
  const { permissions } = usePermissions();
  const { hasWhatsApp } = useWhatsAppIntegration();
  const { hasAI } = useAIIntegration();

  const showAIFeatures = hasWhatsApp || hasAI;

  const flags: Record<string, boolean> = {
    hasWhatsApp,
    showAIFeatures,
  };

  const filteredGroups = useMemo(() => {
    return settingsGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          // Permission check
          if (item.permission && !permissions[item.permission]) return false;
          // Flag check
          if (item.flag && !flags[item.flag]) return false;
          // Search check
          if (search) {
            const q = search.toLowerCase();
            return item.label.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
          }
          return true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [search, permissions, flags.hasWhatsApp, flags.showAIFeatures]);

  return (
    <div className="animate-in fade-in duration-200">
      {/* Search */}
      <div className="max-w-md mb-8">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Buscar configurações..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Groups */}
      <div className="space-y-10">
        {filteredGroups.map((group) => (
          <div key={group.title}>
            <div className="mb-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.title}</h2>
              <p className="text-xs text-muted-foreground/70 mt-0.5">{group.description}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {group.items.map((item) => (
                <SettingsCard
                  key={item.to}
                  icon={item.icon}
                  label={item.label}
                  description={item.description}
                  badge={item.badge}
                  badgeVariant={item.badgeVariant}
                  to={item.to}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Empty state */}
      {filteredGroups.length === 0 && (
        <div className="text-center py-16">
          <Search className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm">Nenhuma configuração encontrada para "{search}"</p>
        </div>
      )}
    </div>
  );
}
