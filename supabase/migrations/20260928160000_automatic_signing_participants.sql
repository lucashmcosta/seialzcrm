ALTER TABLE public.signature_request_participants
 ADD COLUMN signing_mode text NOT NULL DEFAULT 'manual' CHECK(signing_mode IN ('manual','automatic')),
 ADD COLUMN auto_error text;
