# Corrigir label "settings.language" no Meu Perfil

## Problema
Em `/profile`, a seção Preferências mostra a chave crua `settings.language` em vez de "Idioma". A chave `settings.language` não existe no dicionário (`src/lib/i18n.ts`); existem `profile.language` (pt: "Idioma", en: "Language") e `profile.timezone`.

## Correção (mínima, só apresentação)
- Em `src/pages/Profile.tsx`, trocar `t('settings.language')` por `t('profile.language')`.
- Alinhar o campo seguinte usando `t('profile.timezone')` em vez de `t('settings.timezone')` (mesmo texto nos dois idiomas, mantém consistência da seção).

Nenhuma mudança de dicionário, lógica ou backend.
