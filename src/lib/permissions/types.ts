export type Scope = 'nenhum' | 'meus' | 'equipe' | 'todos';
export const SCOPE_ORDER: Scope[] = ['nenhum', 'meus', 'equipe', 'todos'];

export interface RecordPerms {
  ver: Scope;
  criar: boolean;
  editar: Scope;
  excluir: Scope;
  exportar: Scope;
  atribuir: Scope;
  sem_responsavel: boolean;
}
export interface ThreadPerms {
  ver: Scope;
  editar: Scope; // responder
  excluir: Scope; // encerrar
  atribuir: Scope;
  sem_responsavel: boolean;
}
export interface CallPerms { ver: Scope; exportar: Scope }
export interface TaskPerms { ver: Scope; criar: boolean; editar: Scope; excluir: Scope; atribuir: Scope }

export interface PermissionsV2 {
  dados: {
    contatos: RecordPerms;
    oportunidades: RecordPerms;
    conversas_comerciais: ThreadPerms;
    atendimentos: ThreadPerms;
    chamadas: CallPerms;
    tarefas: TaskPerms;
  };
  ferramentas: Record<ToolKey, boolean>;
  administracao: Record<AdminKey, boolean>;
}

export const TOOL_KEYS = ['tel_realizar', 'tel_receber', 'tel_transferir', 'rodizio', 'wa_enviar', 'wa_ativa', 'importar', 'marketing', 'relatorios', 'ia'] as const;
export type ToolKey = typeof TOOL_KEYS[number];
export const ADMIN_KEYS = ['usuarios', 'config', 'distribuicao', 'config_atendimento', 'integracoes', 'telefonia', 'cobranca', 'auditoria'] as const;
export type AdminKey = typeof ADMIN_KEYS[number];

export type LegacyPermissions = Record<string, boolean | undefined>;
