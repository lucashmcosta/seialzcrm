// O que a tela do Social precisa explicar: só o que depende de alguém resolver.
export type SocialSetup = {
  has_page: boolean;
  has_instagram: boolean;
  has_messenger_permission: boolean;
  /** false: não conseguimos ligar o recebimento. null: não verificado nesta resposta. */
  receiving: boolean | null;
};

/** As duas consultas da tela (Messenger e Instagram) trazem o mesmo retrato; falha em uma vale. */
export function mergeSetups(setups: Array<SocialSetup | null | undefined>): SocialSetup | null {
  const known = setups.filter((s): s is SocialSetup => !!s);
  if (!known.length) return null;
  return { ...known[0], receiving: known.some((s) => s.receiving === false) ? false : known[0].receiving };
}

export function socialSetupNotices(setup: SocialSetup | null): string[] {
  if (!setup?.has_page) return [];
  const notices: string[] = [];
  if (setup.receiving === false) notices.push('Não foi possível ligar o recebimento de mensagens. Reconecte a Meta.');
  if (!setup.has_instagram) notices.push('Nenhuma conta do Instagram selecionada na conexão Meta: as mensagens do Instagram não chegam aqui.');
  if (!setup.has_messenger_permission) notices.push('A conexão Meta não tem permissão para o Messenger. Reconecte a Meta para receber essas mensagens.');
  return notices;
}
