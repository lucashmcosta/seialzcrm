ALTER TABLE public.whatsapp_templates DROP CONSTRAINT whatsapp_templates_template_type_check;
ALTER TABLE public.whatsapp_templates ADD CONSTRAINT whatsapp_templates_template_type_check
  CHECK (template_type = ANY (ARRAY['text','media','quick-reply','list-picker','call-to-action','interactive','authentication']));