import { z } from 'zod';

// Validate snake_case name
export const templateNameSchema = z.string()
  .min(1, 'Nome é obrigatório')
  .max(512, 'Máximo 512 caracteres')
  .regex(/^[a-z][a-z0-9_]*$/, 'Use apenas letras minúsculas, números e underscores');

// Validate sequential variables
function validateVariableSequence(body: string): boolean {
  const matches = body.match(/\{\{(\d+)\}\}/g);
  if (!matches) return true;
  
  const numbers = matches.map(m => parseInt(m.replace(/[{}]/g, ''))).sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) return false;
  }
  return true;
}

// Validate non-adjacent variables
function validateVariableSpacing(body: string): boolean {
  return !/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body);
}

export const templateBodySchema = z.string()
  .min(1, 'Corpo é obrigatório')
  .max(1024, 'Máximo 1024 caracteres')
  .refine(validateVariableSequence, 'Variáveis devem ser sequenciais: {{1}}, {{2}}, etc')
  .refine(validateVariableSpacing, 'Adicione texto entre as variáveis');

// Schema for Quick Reply buttons
export const quickReplyButtonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, 'Título é obrigatório').max(20, 'Título máximo 20 caracteres'),
});

// Schema for CTA actions
export const ctaActionSchema = z.object({
  type: z.enum(['url', 'phone', 'copy_code']),
  title: z.string().min(1, 'Título é obrigatório').max(25, 'Título máximo 25 caracteres'),
  value: z.string().optional(),
});

// Schema for List Picker items
export const listItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(24, 'Título máximo 24 caracteres'),
  description: z.string().max(72, 'Descrição máximo 72 caracteres').optional(),
});

// Complete template schema
export const templateSchema = z.object({
  friendly_name: templateNameSchema,
  language: z.enum(['pt_BR', 'en', 'es', 'pt-BR']),
  category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']),
  template_type: z.enum(['text', 'quick-reply', 'list-picker', 'call-to-action', 'media']),
  body: templateBodySchema,
  header: z.string().max(60, 'Header máximo 60 caracteres').optional(),
  footer: z.string().max(60, 'Footer máximo 60 caracteres').optional(),
  buttons: z.array(quickReplyButtonSchema).max(10, 'Máximo 10 botões').optional(),
  actions: z.array(ctaActionSchema).max(3, 'Máximo 3 ações').optional(),
  list_items: z.array(listItemSchema).max(10, 'Máximo 10 itens').optional(),
  media_url: z.string().url('URL inválida').optional(),
});

// Extract variables from body
export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  
  // Remove duplicatas e extrai apenas o número
  const unique = [...new Set(matches)];
  return unique
    .map(match => match.replace(/[{}]/g, ''))  // "{{1}}" vira "1"
    .sort((a, b) => parseInt(a) - parseInt(b));
}

// Validate specific template type
export function validateTemplateType(
  type: string,
  buttons?: { id: string; title: string }[],
  actions?: { type: string; title: string; value?: string }[],
  listItems?: { id: string; title: string; description?: string }[]
): { valid: boolean; error?: string } {
  switch (type) {
    case 'quick-reply':
      if (buttons && buttons.length > 10) {
        return { valid: false, error: 'Máximo de 10 botões permitido' };
      }
      break;
    case 'call-to-action':
      if (actions) {
        const urlCount = actions.filter(a => a.type === 'url').length;
        const phoneCount = actions.filter(a => a.type === 'phone').length;
        if (urlCount > 2) {
          return { valid: false, error: 'Máximo de 2 URLs permitido' };
        }
        if (phoneCount > 1) {
          return { valid: false, error: 'Máximo de 1 telefone permitido' };
        }
      }
      break;
    case 'list-picker':
      if (listItems && listItems.length > 10) {
        return { valid: false, error: 'Máximo de 10 itens permitido' };
      }
      break;
  }
  return { valid: true };
}

// Helper to validate name in real-time
export function isValidTemplateName(name: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

// Helper to get name validation error
export function getTemplateNameError(name: string): string | null {
  if (!name) return 'Nome é obrigatório';
  if (name.length > 512) return 'Máximo 512 caracteres';
  if (!/^[a-z]/.test(name)) return 'Deve começar com letra minúscula';
  if (!/^[a-z][a-z0-9_]*$/.test(name)) return 'Use apenas letras minúsculas, números e underscores';
  return null;
}
