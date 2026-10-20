import { Link } from 'react-router-dom';
import { WarningCircle } from '@phosphor-icons/react';
import { useWhatsAppIntegration } from '@/hooks/useWhatsAppIntegration';
import { usePermissions } from '@/hooks/usePermissions';

/** Aviso exibido no Comercial quando a conta não tem número de WhatsApp ativo. */
export function NoWhatsAppNumberBanner() {
  const { hasWhatsApp, anyLoading } = useWhatsAppIntegration();
  const { permissions } = usePermissions();
  if (anyLoading || hasWhatsApp) return null;
  return (
    <div className="flex items-start gap-2 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
      <WarningCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div>
        Nenhum número de WhatsApp ativo para o Comercial.{' '}
        {permissions?.canManageSettings ? (
          <Link to="/settings/whatsapp-comercial" className="font-semibold text-foreground underline">
            Conectar número
          </Link>
        ) : (
          'Peça a um administrador para conectar um número.'
        )}
      </div>
    </div>
  );
}
