ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS edited_by_user_id uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edit_count integer NOT NULL DEFAULT 0;

CREATE TABLE public.message_edit_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  thread_id uuid NULL,
  previous_content text NULL,
  new_content text NOT NULL,
  edited_by_user_id uuid NOT NULL,
  provider text NOT NULL,
  provider_edit_key_id text NULL,
  provider_status text NOT NULL DEFAULT 'submitted',
  provider_response jsonb NULL,
  edit_count_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.message_edit_history FROM anon, authenticated;
GRANT ALL ON public.message_edit_history TO service_role;
ALTER TABLE public.message_edit_history ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_message_edit_history_msg ON public.message_edit_history(message_id, created_at);

CREATE OR REPLACE FUNCTION public.rpc_apply_message_edit_v1(
  p_message_id uuid, p_expected_content text, p_expected_edit_count integer,
  p_new_content text, p_user_id uuid, p_provider text, p_edit_key_id text, p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m record; v_now timestamptz := now();
BEGIN
  SELECT id, organization_id, thread_id, content, edit_count, sender_user_id
    INTO m FROM public.messages WHERE id = p_message_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','not_found'); END IF;
  IF m.sender_user_id IS DISTINCT FROM p_user_id THEN RETURN jsonb_build_object('ok',false,'error','not_author'); END IF;
  IF m.content IS DISTINCT FROM p_expected_content OR m.edit_count IS DISTINCT FROM p_expected_edit_count THEN
    RETURN jsonb_build_object('ok',false,'error','concurrent_edit');
  END IF;
  INSERT INTO public.message_edit_history(message_id, organization_id, thread_id, previous_content, new_content,
    edited_by_user_id, provider, provider_edit_key_id, provider_status, provider_response, edit_count_after)
  VALUES (m.id, m.organization_id, m.thread_id, m.content, p_new_content, p_user_id, p_provider, p_edit_key_id,
    'submitted', p_response, m.edit_count + 1);
  UPDATE public.messages SET content = p_new_content, edited_at = v_now, edited_by_user_id = p_user_id,
    edit_count = m.edit_count + 1 WHERE id = m.id;
  RETURN jsonb_build_object('ok',true,'edited_at',v_now,'edit_count',m.edit_count + 1);
END $$;
REVOKE ALL ON FUNCTION public.rpc_apply_message_edit_v1(uuid,text,integer,text,uuid,text,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_apply_message_edit_v1(uuid,text,integer,text,uuid,text,text,jsonb) TO service_role;