// Hook — resolve `getServiceWindow` para uma thread, buscando os campos
// CTWA do contato quando presentes. Faz refresh a cada 60s para atualizar
// o "expira em Xh Ym" no chip.

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getServiceWindow, type ServiceWindow, type ContactCtwaInputs } from '@/lib/serviceWindow';

interface Args {
  contactId?: string | null;
  lastInboundAt?: string | null;
  /** Se você já tem os campos CTWA em memória, passe direto e evite o fetch. */
  contact?: ContactCtwaInputs | null;
}

export function useServiceWindow({ contactId, lastInboundAt, contact: contactInline }: Args): ServiceWindow {
  const [contact, setContact] = useState<ContactCtwaInputs | null>(contactInline ?? null);
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (contactInline) {
      setContact(contactInline);
      return;
    }
    if (!contactId) {
      setContact(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('contacts')
      .select('source, ad_referral_ctwa_clid, utm_medium, ad_referral_captured_at, created_at')
      .eq('id', contactId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setContact((data as ContactCtwaInputs) ?? null);
      });
    return () => { cancelled = true; };
  }, [contactId, contactInline]);

  useEffect(() => {
    const id = setInterval(() => setTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  return getServiceWindow({ lastInboundAt, contact, now: tick });
}
