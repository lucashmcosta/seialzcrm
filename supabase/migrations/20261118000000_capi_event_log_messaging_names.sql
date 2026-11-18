-- Nomes de evento do canal de mensagens (Conversions API for Business Messaging) no log da CAPI.
ALTER TABLE public.capi_event_log DROP CONSTRAINT IF EXISTS capi_event_log_event_name_check;
ALTER TABLE public.capi_event_log ADD CONSTRAINT capi_event_log_event_name_check CHECK (event_name = ANY (ARRAY[
  'Lead','Purchase','CompleteRegistration','InitiateCheckout','Contact','Schedule','CustomEvent','PageView',
  'LeadSubmitted','MessagingFirstReply','MessageReceived','Subscribe','OpportunityCreated','OpportunityClosed',
  'MessagingPostPurchaseUpdate',
  'QualifiedLead','AddToCart','ViewContent','OrderCreated','OrderShipped','OrderDelivered','OrderCanceled',
  'OrderReturned','CartAbandoned','RatingProvided','ReviewProvided'
]::text[]));
