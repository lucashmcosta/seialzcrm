
-- Limpar button_options existentes para desabilitar botões de texto
UPDATE message_threads 
SET button_options = NULL, 
    awaiting_button_response = false 
WHERE button_options IS NOT NULL OR awaiting_button_response = true;
