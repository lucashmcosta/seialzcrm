import { Navigate } from 'react-router-dom';

// Redirect to Settings with WhatsApp Templates tab selected
export default function TemplatesList() {
  return <Navigate to="/settings/whatsapp-templates" replace />;
}
