import { ADMIN_KEYS, TOOL_KEYS, type LegacyPermissions, type PermissionsV2, type Scope } from './types';

// Mesma regra de public.fn_permissions_from_legacy / fn_permissions_to_legacy (SQL). Mude os dois juntos.
const b = (v: unknown) => v === true;

function recordFromLegacy(l: LegacyPermissions, viewAll: boolean, edit: boolean, del: boolean, privacyOn: boolean) {
  const ver: Scope = viewAll || !privacyOn ? 'todos' : 'meus';
  const editar: Scope = edit ? ver : 'nenhum';
  const ma = b(l.manage_assignments);
  return {
    ver,
    criar: edit,
    editar,
    excluir: del && edit ? editar : ('nenhum' as Scope),
    exportar: 'nenhum' as Scope,
    atribuir: ma ? ver : ('nenhum' as Scope),
    sem_responsavel: ver === 'todos' || ma,
  };
}

/** telephonyV2On: telefonia nova ativa na org. Sem ela, hoje todo membro vê todas as chamadas. */
export function fromLegacy(l: LegacyPermissions, privacyOn: boolean, telephonyV2On = true): PermissionsV2 {
  const threadsVer: Scope = b(l.view_all_threads) || !privacyOn ? 'todos' : 'meus';
  const csq = b(l.can_manage_cs_queue);
  const flag = threadsVer === 'todos' || csq;
  const ferramentas = Object.fromEntries(TOOL_KEYS.map((k) => [k, false])) as PermissionsV2['ferramentas'];
  Object.assign(ferramentas, {
    tel_realizar: b(l.can_make_calls), tel_receber: b(l.can_receive_calls), tel_transferir: b(l.can_transfer_calls),
    rodizio: b(l.round_robin_recipient), wa_enviar: true, wa_ativa: b(l.can_send_templates),
    importar: b(l.can_manage_settings), marketing: b(l.can_manage_settings), relatorios: b(l.can_manage_settings), ia: true,
  });
  const administracao = Object.fromEntries(ADMIN_KEYS.map((k) => [k, false])) as PermissionsV2['administracao'];
  Object.assign(administracao, {
    usuarios: b(l.can_manage_users), config: b(l.can_manage_settings), distribuicao: b(l.manage_assignments),
    config_atendimento: b(l.can_manage_support_settings), integracoes: b(l.can_manage_integrations),
    telefonia: b(l.can_manage_telephony), cobranca: b(l.can_manage_billing), auditoria: false,
  });
  return {
    dados: {
      contatos: recordFromLegacy(l, b(l.view_all_contacts), b(l.can_edit_contacts), b(l.can_delete_contacts), privacyOn),
      oportunidades: recordFromLegacy(l, b(l.view_all_opportunities), b(l.can_edit_opportunities), b(l.can_delete_opportunities), privacyOn),
      conversas_comerciais: {
        ver: threadsVer, editar: threadsVer, excluir: threadsVer,
        atribuir: b(l.manage_assignments) ? threadsVer : 'nenhum', sem_responsavel: flag,
      },
      atendimentos: {
        ver: threadsVer, editar: threadsVer,
        excluir: b(l.can_close_threads) ? threadsVer : 'nenhum',
        atribuir: b(l.can_takeover_thread) || b(l.can_escalate_thread) ? threadsVer : 'nenhum',
        sem_responsavel: flag,
      },
      chamadas: { ver: b(l.can_view_all_calls) || !telephonyV2On ? 'todos' : 'meus', exportar: 'nenhum' },
      tarefas: { ver: 'todos', criar: true, editar: 'todos', excluir: 'todos', atribuir: 'todos' },
    },
    ferramentas,
    administracao,
  };
}

export function toLegacy(p: PermissionsV2): Record<string, boolean> {
  const d = p.dados;
  const f = p.ferramentas;
  const a = p.administracao;
  return {
    can_view_contacts: d.contatos.ver !== 'nenhum',
    view_all_contacts: d.contatos.ver === 'todos',
    can_edit_contacts: d.contatos.editar !== 'nenhum',
    can_delete_contacts: d.contatos.excluir !== 'nenhum',
    can_view_opportunities: d.oportunidades.ver !== 'nenhum',
    view_all_opportunities: d.oportunidades.ver === 'todos',
    can_edit_opportunities: d.oportunidades.editar !== 'nenhum',
    can_delete_opportunities: d.oportunidades.excluir !== 'nenhum',
    view_all_threads: d.conversas_comerciais.ver === 'todos' && d.atendimentos.ver === 'todos',
    can_manage_cs_queue: d.atendimentos.sem_responsavel,
    can_takeover_thread: d.atendimentos.atribuir !== 'nenhum',
    can_escalate_thread: d.atendimentos.atribuir !== 'nenhum',
    can_close_threads: d.atendimentos.excluir !== 'nenhum',
    can_view_all_calls: d.chamadas.ver === 'todos',
    manage_assignments: a.distribuicao,
    round_robin_recipient: f.rodizio,
    can_make_calls: f.tel_realizar,
    can_receive_calls: f.tel_receber,
    can_transfer_calls: f.tel_transferir,
    can_send_templates: f.wa_ativa,
    can_manage_users: a.usuarios,
    can_manage_settings: a.config,
    can_manage_integrations: a.integracoes,
    can_manage_telephony: a.telefonia,
    can_manage_billing: a.cobranca,
    can_manage_support_settings: a.config_atendimento,
  };
}

export const LEGACY_KEYS = Object.keys(toLegacy(fromLegacy({}, true)));
