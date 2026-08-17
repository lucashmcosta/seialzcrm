import { SalesWhatsAppSettingsSection } from '@/components/settings/SalesWhatsAppSettingsSection';

/**
 * Ponto de entrada próprio do módulo WhatsApp Comercial em Configurações.
 * Reutiliza integralmente a tela existente (nenhuma regra de negócio alterada).
 */
export default function SalesWhatsAppPage() {
  return (
    <section id="whatsapp-comercial" className="w-full max-w-5xl space-y-5">
      <div>
        <h3 className="text-lg font-semibold tracking-tight">WhatsApp Comercial</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Gerencie números, provedores e o roteamento utilizado nas conversas comerciais.
        </p>
      </div>
      <SalesWhatsAppSettingsSection />
    </section>
  );
}
