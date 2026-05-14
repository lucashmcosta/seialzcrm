import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';

const VERSION = 'v1';
const PREFIX = 'seialz:filters';

function buildKey(userId: string, orgId: string, scope: string) {
  return `${PREFIX}:${VERSION}:${userId}:${orgId}:${scope}`;
}

/**
 * Persiste um pedaço de estado de filtros em localStorage, isolado por
 * usuário + organização + escopo (tela). Não persiste enquanto user/org
 * ainda não carregaram, evitando lixo na chave.
 *
 * - reviver: opcional, transforma o JSON.parse cru (ex: ISO -> Date).
 */
export function usePersistedFilters<T>(
  scope: string,
  defaultValue: T,
  reviver?: (raw: any) => T,
): [T, Dispatch<SetStateAction<T>>, () => void, boolean] {
  const { userProfile, organization } = useOrganization();
  const userId = userProfile?.id ?? '';
  const orgId = organization?.id ?? '';
  const ready = !!userId && !!orgId;
  const storageKey = ready ? buildKey(userId, orgId, scope) : '';

  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState<boolean>(false);
  const hydratedKeyRef = useRef<string>('');
  const skipNextSaveRef = useRef<boolean>(false);

  // Hidrata quando user/org ficam disponíveis (ou mudam).
  useEffect(() => {
    if (!ready) return;
    if (hydratedKeyRef.current === storageKey) return;
    hydratedKeyRef.current = storageKey;
    // Evita que o efeito de persistência (que roda no MESMO commit com o
    // value ainda no default) sobrescreva a chave salva no localStorage.
    skipNextSaveRef.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw == null) {
        setValue(defaultValue);
      } else {
        const parsed = JSON.parse(raw);
        setValue(reviver ? reviver(parsed) : (parsed as T));
      }
    } catch {
      setValue(defaultValue);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, ready]);

  // Persiste quando muda — só após hidratado.
  useEffect(() => {
    if (!ready) return;
    if (hydratedKeyRef.current !== storageKey) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      /* ignore quota/serialization errors */
    }
  }, [storageKey, ready, value]);

  const reset = useCallback(() => {
    setValue(defaultValue);
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  return [value, setValue, reset];
}

/**
 * Cria um setter para um campo específico de um objeto controlado por
 * usePersistedFilters. Aceita valor direto ou updater functional.
 */
export function fieldSetter<T, K extends keyof T>(
  setAll: Dispatch<SetStateAction<T>>,
  key: K,
) {
  return (v: T[K] | ((prev: T[K]) => T[K])) =>
    setAll((prev) => ({
      ...prev,
      [key]: typeof v === 'function' ? (v as any)(prev[key]) : v,
    }));
}
