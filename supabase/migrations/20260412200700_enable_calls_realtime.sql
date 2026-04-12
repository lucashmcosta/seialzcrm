-- ============================================================================
-- Migration: Enable Realtime on calls table
--
-- Required for dual-path call status sync. The frontend subscribes to
-- call record changes via Supabase Realtime to detect status updates
-- from the Twilio webhook, providing a reliable fallback when SDK
-- events don't fire (network drops, WebRTC failures).
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE calls;
