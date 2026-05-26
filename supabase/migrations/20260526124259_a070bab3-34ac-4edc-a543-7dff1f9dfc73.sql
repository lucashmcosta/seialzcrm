
update public.intelligence_jobs
set status='pending', attempts=0, last_error=null, next_run_at=now(), completed_at=null
where status in ('permanent_failure','failed')
  and last_error in ('message_not_found','no_media_url')
  and exists(select 1 from public.messages m where m.id = (payload->>'message_id')::uuid);
