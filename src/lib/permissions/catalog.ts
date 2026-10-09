import type { PermissionsV2, Scope, ToolKey, AdminKey } from './types';

export type DataObject = keyof PermissionsV2['dados'];

export interface ActionDef {
  key: string;
  label: string;
  kind: 'scope' | 'bool';
  cap?: string; // ação que limita esta
  hint?: string;
  hidden?: boolean; // mantido no catálogo, não exibido (recurso ainda não existe)
}

export interface ObjectDef {
  key: DataObject;
  label: string;
  subtitle: string;
  actions: ActionDef[];
  unassignedLabel?: string;
}

export const DATA_OBJECTS: ObjectDef[] = [
  {
    key: 'contatos', label: 'Contatos', subtitle: 'Pessoas e empresas', unassignedLabel: 'Inclui contatos sem responsável',
    actions: [
      { key: 'ver', label: 'Ver', kind: 'scope' },
      { key: 'criar', label: 'Criar', kind: 'bool' },
      { key: 'editar', label: 'Editar', kind: 'scope', cap: 'ver' },
      { key: 'excluir', label: 'Excluir', kind: 'scope', cap: 'editar', hint: 'Envia para a lixeira' },
      { key: 'exportar', label: 'Exportar', kind: 'scope', cap: 'ver', hidden: true },
      { key: 'atribuir', label: 'Atribuir', kind: 'scope', cap: 'ver', hint: 'Trocar o responsável' },
    ],
  },
  {
    key: 'oportunidades', label: 'Oportunidades', subtitle: 'Kanban e negócios', unassignedLabel: 'Inclui oportunidades sem responsável',
    actions: [
      { key: 'ver', label: 'Ver', kind: 'scope' },
      { key: 'criar', label: 'Criar', kind: 'bool' },
      { key: 'editar', label: 'Editar', kind: 'scope', cap: 'ver', hint: 'Inclui mover no Kanban' },
      { key: 'excluir', label: 'Excluir', kind: 'scope', cap: 'editar', hint: 'Envia para a lixeira' },
      { key: 'exportar', label: 'Exportar', kind: 'scope', cap: 'ver', hidden: true },
      { key: 'atribuir', label: 'Atribuir', kind: 'scope', cap: 'ver', hint: 'Trocar o responsável' },
    ],
  },
  {
    key: 'conversas_comerciais', label: 'Conversas comerciais', subtitle: 'Comercial', unassignedLabel: 'Inclui conversas sem responsável',
    actions: [
      { key: 'ver', label: 'Ver', kind: 'scope' },
      { key: 'editar', label: 'Responder', kind: 'scope', cap: 'ver' },
      { key: 'excluir', label: 'Encerrar', kind: 'scope', cap: 'editar' },
      { key: 'atribuir', label: 'Atribuir', kind: 'scope', cap: 'ver' },
    ],
  },
  {
    key: 'atendimentos', label: 'Atendimentos', subtitle: 'Atendimento', unassignedLabel: 'Vê e puxa da fila (sem responsável)',
    actions: [
      { key: 'ver', label: 'Ver', kind: 'scope' },
      { key: 'editar', label: 'Responder', kind: 'scope', cap: 'ver' },
      { key: 'excluir', label: 'Encerrar', kind: 'scope', cap: 'editar' },
      { key: 'atribuir', label: 'Atribuir, assumir e escalar', kind: 'scope', cap: 'ver' },
    ],
  },
  {
    key: 'chamadas', label: 'Chamadas', subtitle: 'Histórico e gravações',
    actions: [
      { key: 'ver', label: 'Ver', kind: 'scope' },
      { key: 'exportar', label: 'Exportar', kind: 'scope', cap: 'ver', hidden: true },
    ],
  },
  {
    key: 'tarefas', label: 'Tarefas', subtitle: 'Tarefas',
    actions: [
      { key: 'ver', label: 'Ver', kind: 'scope' },
      { key: 'criar', label: 'Criar', kind: 'bool' },
      { key: 'editar', label: 'Editar e concluir', kind: 'scope', cap: 'ver' },
      { key: 'excluir', label: 'Excluir', kind: 'scope', cap: 'editar' },
      { key: 'atribuir', label: 'Atribuir', kind: 'scope', cap: 'ver' },
    ],
  },
];

export const TOOLS: { key: ToolKey; label: string; hidden?: boolean }[] = [
  { key: 'tel_realizar', label: 'Realizar chamadas' },
  { key: 'tel_receber', label: 'Receber chamadas' },
  { key: 'tel_transferir', label: 'Transferir chamadas' },
  { key: 'rodizio', label: 'Participar do rodízio de leads' },
  { key: 'wa_enviar', label: 'Enviar mensagens' },
  { key: 'wa_ativa', label: 'Iniciar conversa com template' },
  { key: 'importar', label: 'Importar planilhas', hidden: true },
  { key: 'marketing', label: 'Marketing' },
  { key: 'relatorios', label: 'Relatórios' },
  { key: 'ia', label: 'Assistente de IA', hidden: true },
];

export const ADMIN_ITEMS: { key: AdminKey; label: string; hidden?: boolean }[] = [
  { key: 'usuarios', label: 'Usuários e equipes' },
  { key: 'config', label: 'Configurações' },
  { key: 'distribuicao', label: 'Distribuição de leads' },
  { key: 'config_atendimento', label: 'Configurações do Atendimento' },
  { key: 'integracoes', label: 'Integrações' },
  { key: 'telefonia', label: 'Telefonia' },
  { key: 'cobranca', label: 'Cobrança' },
  { key: 'auditoria', label: 'Auditoria', hidden: true },
];

export const SCOPE_LABEL: Record<Scope, string> = { nenhum: 'Nenhum', meus: 'Meus', equipe: 'Equipe', todos: 'Todos' };
export const SCOPE_RANK: Record<Scope, number> = { nenhum: 0, meus: 1, equipe: 2, todos: 3 };

/** Aplica regras automáticas: tetos, ver=nenhum zera criar/flag, ver=todos marca a flag. */
export function normalize(p: PermissionsV2): PermissionsV2 {
  const next: PermissionsV2 = JSON.parse(JSON.stringify(p));
  for (const obj of DATA_OBJECTS) {
    const o = next.dados[obj.key] as unknown as Record<string, Scope | boolean>;
    for (const a of obj.actions) {
      if (a.kind !== 'scope' || !a.cap) continue;
      const cap = o[a.cap] as Scope;
      if (SCOPE_RANK[o[a.key] as Scope] > SCOPE_RANK[cap]) o[a.key] = cap;
    }
    if (o.ver === 'nenhum') {
      if ('criar' in o) o.criar = false;
      if ('sem_responsavel' in o) o.sem_responsavel = false;
    }
    if (o.ver === 'todos' && 'sem_responsavel' in o) o.sem_responsavel = true;
  }
  return next;
}

const rec = (ver: Scope, criar: boolean, editar: Scope, excluir: Scope, exportar: Scope, atribuir: Scope, sem: boolean) =>
  ({ ver, criar, editar, excluir, exportar, atribuir, sem_responsavel: sem });
const thr = (ver: Scope, editar: Scope, excluir: Scope, atribuir: Scope, sem: boolean) =>
  ({ ver, editar, excluir, atribuir, sem_responsavel: sem });
const task = (ver: Scope, criar: boolean, editar: Scope, excluir: Scope, atribuir: Scope) => ({ ver, criar, editar, excluir, atribuir });
const NONE_THR = thr('nenhum', 'nenhum', 'nenhum', 'nenhum', false);
const tools = (except: ToolKey[]) =>
  Object.fromEntries(TOOLS.map((t) => [t.key, !except.includes(t.key)])) as PermissionsV2['ferramentas'];
const admin = (on: AdminKey[]) =>
  Object.fromEntries(ADMIN_ITEMS.map((a) => [a.key, on.includes(a.key)])) as PermissionsV2['administracao'];

export const TEMPLATES: { key: string; label: string; description: string; perms: PermissionsV2 }[] = [
  {
    key: 'vendedor', label: 'Vendedor', description: 'Trabalha os próprios leads e conversas comerciais.',
    perms: { dados: {
      contatos: rec('todos', true, 'meus', 'nenhum', 'nenhum', 'meus', true),
      oportunidades: rec('meus', true, 'meus', 'nenhum', 'nenhum', 'meus', true),
      conversas_comerciais: thr('meus', 'meus', 'meus', 'meus', true),
      atendimentos: NONE_THR,
      chamadas: { ver: 'meus', exportar: 'nenhum' },
      tarefas: task('meus', true, 'meus', 'meus', 'meus'),
    }, ferramentas: tools(['importar', 'marketing', 'relatorios']), administracao: admin([]) },
  },
  {
    key: 'lider', label: 'Líder de equipe', description: 'Acompanha e redistribui o trabalho das suas equipes.',
    perms: { dados: {
      contatos: rec('equipe', true, 'equipe', 'equipe', 'equipe', 'equipe', true),
      oportunidades: rec('equipe', true, 'equipe', 'equipe', 'equipe', 'equipe', true),
      conversas_comerciais: thr('equipe', 'equipe', 'equipe', 'equipe', true),
      atendimentos: NONE_THR,
      chamadas: { ver: 'equipe', exportar: 'equipe' },
      tarefas: task('equipe', true, 'equipe', 'equipe', 'equipe'),
    }, ferramentas: tools(['rodizio', 'importar']), administracao: admin([]) },
  },
  {
    key: 'gestor', label: 'Gestor comercial', description: 'Vê e gerencia todo o comercial.',
    perms: { dados: {
      contatos: rec('todos', true, 'todos', 'todos', 'todos', 'todos', true),
      oportunidades: rec('todos', true, 'todos', 'todos', 'todos', 'todos', true),
      conversas_comerciais: thr('todos', 'todos', 'todos', 'todos', true),
      atendimentos: NONE_THR,
      chamadas: { ver: 'todos', exportar: 'todos' },
      tarefas: task('todos', true, 'todos', 'todos', 'todos'),
    }, ferramentas: tools(['rodizio']), administracao: admin(['usuarios', 'distribuicao', 'auditoria']) },
  },
  {
    key: 'atendente', label: 'Atendente', description: 'Atende clientes na fila do Atendimento.',
    perms: { dados: {
      contatos: rec('todos', true, 'meus', 'nenhum', 'nenhum', 'nenhum', false),
      oportunidades: rec('todos', false, 'nenhum', 'nenhum', 'nenhum', 'nenhum', true),
      conversas_comerciais: thr('todos', 'nenhum', 'nenhum', 'nenhum', true),
      atendimentos: thr('todos', 'meus', 'meus', 'meus', true),
      chamadas: { ver: 'meus', exportar: 'nenhum' },
      tarefas: task('meus', true, 'meus', 'meus', 'meus'),
    }, ferramentas: tools(['rodizio', 'wa_ativa', 'importar', 'marketing', 'relatorios']), administracao: admin([]) },
  },
  {
    key: 'supervisor', label: 'Supervisor de atendimento', description: 'Coordena toda a fila do Atendimento.',
    perms: { dados: {
      contatos: rec('todos', true, 'todos', 'nenhum', 'todos', 'todos', true),
      oportunidades: rec('todos', false, 'nenhum', 'nenhum', 'nenhum', 'nenhum', true),
      conversas_comerciais: thr('todos', 'nenhum', 'nenhum', 'nenhum', true),
      atendimentos: thr('todos', 'todos', 'todos', 'todos', true),
      chamadas: { ver: 'todos', exportar: 'todos' },
      tarefas: task('todos', true, 'todos', 'todos', 'todos'),
    }, ferramentas: tools(['rodizio', 'marketing', 'importar']), administracao: admin(['config_atendimento']) },
  },
  {
    key: 'leitura', label: 'Somente leitura', description: 'Consulta tudo, sem alterar nada.',
    perms: { dados: {
      contatos: rec('todos', false, 'nenhum', 'nenhum', 'nenhum', 'nenhum', true),
      oportunidades: rec('todos', false, 'nenhum', 'nenhum', 'nenhum', 'nenhum', true),
      conversas_comerciais: thr('todos', 'nenhum', 'nenhum', 'nenhum', true),
      atendimentos: thr('todos', 'nenhum', 'nenhum', 'nenhum', true),
      chamadas: { ver: 'todos', exportar: 'nenhum' },
      tarefas: task('todos', false, 'nenhum', 'nenhum', 'nenhum'),
    }, ferramentas: Object.fromEntries(TOOLS.map((t) => [t.key, t.key === 'relatorios'])) as PermissionsV2['ferramentas'], administracao: admin([]) },
  },
];

export function blankPerms(): PermissionsV2 {
  const z = TEMPLATES[5].perms;
  const none = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'boolean' ? false : 'nenhum']));
  return {
    dados: Object.fromEntries(Object.entries(z.dados).map(([k, v]) => [k, none(v as Record<string, unknown>)])) as unknown as PermissionsV2['dados'],
    ferramentas: Object.fromEntries(TOOLS.map((t) => [t.key, false])) as PermissionsV2['ferramentas'],
    administracao: admin([]),
  };
}

export function summarize(obj: ObjectDef, p: PermissionsV2): string {
  const o = p.dados[obj.key] as unknown as Record<string, Scope | boolean>;
  if (o.ver === 'nenhum') return 'Sem acesso';
  const visible = obj.actions.filter((a) => !a.hidden && a.kind === 'scope' && o[a.key] !== 'nenhum');
  return visible.map((a) => `${a.label} ${SCOPE_LABEL[o[a.key] as Scope]}`).join(' · ');
}

const PHRASE: Record<Scope, string> = { nenhum: '', meus: 'os próprios', equipe: 'os da equipe', todos: 'todos' };
export function sentence(obj: ObjectDef, p: PermissionsV2): string {
  const o = p.dados[obj.key] as unknown as Record<string, Scope | boolean>;
  if (o.ver === 'nenhum') return `${obj.label}: sem acesso`;
  const parts: string[] = [`vê ${PHRASE[o.ver as Scope]}`];
  for (const a of obj.actions) {
    if (a.hidden || a.key === 'ver') continue;
    const v = o[a.key];
    const verb = a.label.toLowerCase();
    if (a.kind === 'bool') parts.push(v ? verb.replace(/r$/, '') + (verb.endsWith('r') ? '' : '') : `não ${verb}`);
    else parts.push(v === 'nenhum' ? `não ${verb}` : `${verb} ${PHRASE[v as Scope]}`);
  }
  return `${obj.label}: ${parts.join(', ')}`;
}

export function usesTeam(p: PermissionsV2): boolean {
  return Object.values(p.dados).some((o) => Object.values(o).includes('equipe'));
}
export function hasBroadAccess(p: PermissionsV2): boolean {
  return Object.values(p.dados).some((o) => (o as { ver: Scope }).ver === 'todos');
}
