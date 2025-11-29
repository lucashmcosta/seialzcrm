export const translations = {
  'pt-BR': {
    // Common
    'common.save': 'Salvar',
    'common.cancel': 'Cancelar',
    'common.delete': 'Excluir',
    'common.edit': 'Editar',
    'common.search': 'Pesquisar',
    'common.filter': 'Filtrar',
    'common.loading': 'Carregando...',
    'common.error': 'Erro',
    'common.success': 'Sucesso',
    'common.back': 'Voltar',
    'common.next': 'Próximo',
    'common.previous': 'Anterior',
    'common.finish': 'Concluir',
    
    // Auth
    'auth.signUp': 'Cadastrar',
    'auth.signIn': 'Entrar',
    'auth.signOut': 'Sair',
    'auth.email': 'E-mail',
    'auth.password': 'Senha',
    'auth.fullName': 'Nome completo',
    'auth.organizationName': 'Nome da organização',
    'auth.createAccount': 'Criar conta',
    'auth.alreadyHaveAccount': 'Já tem uma conta?',
    'auth.dontHaveAccount': 'Não tem uma conta?',
    
    // Dashboard
    'dashboard.title': 'Painel',
    'dashboard.welcome': 'Bem-vindo',
    'dashboard.openOpportunities': 'Oportunidades abertas',
    'dashboard.pipelineValue': 'Valor do pipeline',
    'dashboard.wonThisPeriod': 'Ganho no período',
    'dashboard.lostThisPeriod': 'Perdido no período',
    'dashboard.newContacts': 'Novos contatos',
    'dashboard.myTasksToday': 'Minhas tarefas hoje',
    'dashboard.recentActivity': 'Atividade recente',
    
    // Contacts
    'contacts.title': 'Contatos',
    'contacts.newContact': 'Novo contato',
    'contacts.fullName': 'Nome completo',
    'contacts.email': 'E-mail',
    'contacts.phone': 'Telefone',
    'contacts.company': 'Empresa',
    'contacts.owner': 'Responsável',
    'contacts.lifecycleStage': 'Estágio',
    'contacts.timeline': 'Linha do tempo',
    'contacts.details': 'Detalhes',
    
    // Opportunities
    'opportunities.title': 'Oportunidades',
    'opportunities.newOpportunity': 'Nova oportunidade',
    'opportunities.amount': 'Valor',
    'opportunities.stage': 'Estágio',
    'opportunities.status': 'Status',
    'opportunities.closeDate': 'Data de fechamento',
    'opportunities.kanban': 'Kanban',
    'opportunities.list': 'Lista',
    
    // Onboarding
    'onboarding.welcome': 'Bem-vindo ao Seialz!',
    'onboarding.letsGetStarted': 'Vamos começar',
    'onboarding.createFirstContact': 'Criar seu primeiro contato',
    'onboarding.createFirstOpportunity': 'Criar sua primeira oportunidade',
    
    // Settings
    'settings.title': 'Configurações',
    'settings.organization': 'Organização',
    'settings.profile': 'Meu perfil',
    'settings.language': 'Idioma',
    'settings.timezone': 'Fuso horário',
    
    // Lifecycle stages
    'lifecycle.lead': 'Lead',
    'lifecycle.customer': 'Cliente',
    'lifecycle.inactive': 'Inativo',
    
    // Opportunity status
    'status.open': 'Aberto',
    'status.won': 'Ganho',
    'status.lost': 'Perdido',
  },
  'en-US': {
    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.loading': 'Loading...',
    'common.error': 'Error',
    'common.success': 'Success',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.previous': 'Previous',
    'common.finish': 'Finish',
    
    // Auth
    'auth.signUp': 'Sign up',
    'auth.signIn': 'Sign in',
    'auth.signOut': 'Sign out',
    'auth.email': 'Email',
    'auth.password': 'Password',
    'auth.firstName': 'First name',
    'auth.lastName': 'Last name',
    'auth.organizationName': 'Organization name',
    'auth.createAccount': 'Create account',
    'auth.alreadyHaveAccount': 'Already have an account?',
    'auth.dontHaveAccount': "Don't have an account?",
    
    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.welcome': 'Welcome',
    'dashboard.openOpportunities': 'Open opportunities',
    'dashboard.pipelineValue': 'Pipeline value',
    'dashboard.wonThisPeriod': 'Won this period',
    'dashboard.lostThisPeriod': 'Lost this period',
    'dashboard.newContacts': 'New contacts',
    'dashboard.myTasksToday': 'My tasks today',
    'dashboard.recentActivity': 'Recent activity',
    
    // Contacts
    'contacts.title': 'Contacts',
    'contacts.newContact': 'New contact',
    'contacts.firstName': 'First name',
    'contacts.lastName': 'Last name',
    'contacts.email': 'Email',
    'contacts.phone': 'Phone',
    'contacts.company': 'Company',
    'contacts.owner': 'Owner',
    'contacts.lifecycleStage': 'Stage',
    'contacts.timeline': 'Timeline',
    'contacts.details': 'Details',
    
    // Opportunities
    'opportunities.title': 'Opportunities',
    'opportunities.newOpportunity': 'New opportunity',
    'opportunities.amount': 'Amount',
    'opportunities.stage': 'Stage',
    'opportunities.status': 'Status',
    'opportunities.closeDate': 'Close date',
    'opportunities.kanban': 'Kanban',
    'opportunities.list': 'List',
    
    // Onboarding
    'onboarding.welcome': 'Welcome to Seialz!',
    'onboarding.letsGetStarted': "Let's get started",
    'onboarding.createFirstContact': 'Create your first contact',
    'onboarding.createFirstOpportunity': 'Create your first opportunity',
    
    // Settings
    'settings.title': 'Settings',
    'settings.organization': 'Organization',
    'settings.profile': 'My profile',
    'settings.language': 'Language',
    'settings.timezone': 'Timezone',
    
    // Lifecycle stages
    'lifecycle.lead': 'Lead',
    'lifecycle.customer': 'Customer',
    'lifecycle.inactive': 'Inactive',
    
    // Opportunity status
    'status.open': 'Open',
    'status.won': 'Won',
    'status.lost': 'Lost',
  },
};

export type Locale = 'pt-BR' | 'en-US';

export function useTranslation(locale: Locale = 'pt-BR') {
  const t = (key: string): string => {
    return translations[locale][key as keyof typeof translations[typeof locale]] || key;
  };
  
  return { t, locale };
}