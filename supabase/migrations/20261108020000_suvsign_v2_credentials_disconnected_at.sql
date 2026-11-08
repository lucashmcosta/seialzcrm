-- SuvSign V2 como padrão: "Desconectar" só bloqueia novos envios.
-- A credencial fica guardada (com disconnected_at) para que operações já enviadas
-- continuem recebendo eventos (webhook valida com o segredo) e aceitem cancelar/baixar.
ALTER TABLE public.suvsign_v2_credentials ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;
