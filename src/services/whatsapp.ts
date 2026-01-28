const API_BASE = `${import.meta.env.VITE_RAILWAY_WHATSAPP_URL}/api/whatsapp`;

export interface WhatsAppTemplate {
  id: string;
  organization_id: string;
  twilio_content_sid: string;
  friendly_name: string;
  language: string;
  template_type: string;
  body: string;
  header?: string;
  footer?: string;
  variables?: { key: string; name: string; example: string }[];
  buttons?: { id: string; title: string }[];
  actions?: { type: string; title: string; value?: string; description?: string }[];
  status: string;
  rejection_reason?: string;
  category?: string;
  is_active: boolean;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  organization_id: string;
  friendly_name: string;
  language: string;
  template_type: string;
  category: string;
  body: string;
  header?: string;
  footer?: string;
  variables?: { key: string; name: string; example: string }[];
  buttons?: { id: string; title: string }[];
  actions?: { type: string; title: string; value?: string }[];
}

export interface SendTemplateInput {
  organization_id: string;
  to: string;
  template_id: string;
  variables?: Record<string, string>;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || error.error || 'Erro na requisição');
  }
  return response.json();
}

export const whatsappService = {
  // List templates
  listTemplates: async (orgId: string): Promise<WhatsAppTemplate[]> => {
    const response = await fetch(`${API_BASE}/templates?orgId=${orgId}`);
    return handleResponse<WhatsAppTemplate[]>(response);
  },

  // Get specific template
  getTemplate: async (orgId: string, templateId: string): Promise<WhatsAppTemplate> => {
    const response = await fetch(`${API_BASE}/templates/${templateId}?orgId=${orgId}`);
    return handleResponse<WhatsAppTemplate>(response);
  },

  // Create template
  createTemplate: async (data: CreateTemplateInput): Promise<WhatsAppTemplate> => {
    const response = await fetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<WhatsAppTemplate>(response);
  },

  // Update template
  updateTemplate: async (templateId: string, data: Partial<CreateTemplateInput>): Promise<WhatsAppTemplate> => {
    const response = await fetch(`${API_BASE}/templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<WhatsAppTemplate>(response);
  },

  // Delete template
  deleteTemplate: async (orgId: string, templateId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/templates/${templateId}?orgId=${orgId}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Erro ao deletar template');
    }
  },

  // Submit for approval
  submitForApproval: async (orgId: string, templateId: string, category: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/templates/${templateId}/approve?orgId=${orgId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || 'Erro ao submeter para aprovação');
    }
  },

  // Sync with Twilio
  syncWithTwilio: async (orgId: string): Promise<{ synced: number }> => {
    const response = await fetch(`${API_BASE}/templates/sync?orgId=${orgId}`, {
      method: 'POST',
    });
    return handleResponse<{ synced: number }>(response);
  },

  // Send message with template
  sendTemplate: async (data: SendTemplateInput): Promise<{ messageId: string }> => {
    const response = await fetch(`${API_BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ messageId: string }>(response);
  },
};
