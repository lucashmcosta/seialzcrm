import { SalesWhatsAppSettingsSection } from '@/components/settings/SalesWhatsAppSettingsSection';

/**
 * Ponto de entrada próprio do módulo WhatsApp Comercial em Configurações.
 * Reutiliza integralmente a tela existente (nenhuma regra de negócio alterada).
 */
export default function SalesWhatsAppPage() {
  return (
    <section id="whatsapp-comercial" className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">WhatsApp Comercial</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Route Comercial usada nas conversas de vendas e mapeamento de números.
        </p>
      </div>
      <SalesWhatsAppSettingsSection />
    </section>
  );
}
