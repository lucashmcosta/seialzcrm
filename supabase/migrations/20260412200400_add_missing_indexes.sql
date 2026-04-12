-- ============================================================================
-- Migration: Add missing indexes identified in DBA review
--
-- These indexes target columns used in WHERE, JOIN, and ORDER BY clauses
-- that currently lack index coverage, causing unnecessary seq scans.
-- ============================================================================

-- Opportunities: status filter (dashboard KPIs, kanban filtering)
CREATE INDEX IF NOT EXISTS idx_opportunities_org_status
  ON opportunities(organization_id, status)
  WHERE deleted_at IS NULL;

-- Opportunities: close_date for forecasting queries
CREATE INDEX IF NOT EXISTS idx_opportunities_org_close_date
  ON opportunities(organization_id, close_date)
  WHERE deleted_at IS NULL;

-- Companies: domain lookup (dedup, enrichment)
CREATE INDEX IF NOT EXISTS idx_companies_domain
  ON companies(organization_id, domain)
  WHERE domain IS NOT NULL AND deleted_at IS NULL;

-- Activities: org + created_at for time-range aggregations (7d/30d metrics)
CREATE INDEX IF NOT EXISTS idx_activities_org_created
  ON activities(organization_id, created_at DESC);

-- Tag assignments: entity lookup (generic polymorphic pattern)
CREATE INDEX IF NOT EXISTS idx_tag_assignments_entity
  ON tag_assignments(entity_type, entity_id);

-- Tasks: open tasks with due date (dashboard "my tasks today")
CREATE INDEX IF NOT EXISTS idx_tasks_open_due
  ON tasks(organization_id, assigned_user_id, due_at)
  WHERE deleted_at IS NULL AND status = 'open';

-- Pipeline stages: ordering queries
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_org_order
  ON pipeline_stages(organization_id, order_index);

-- Message thread reads: JOIN in rpc_list_message_threads
CREATE INDEX IF NOT EXISTS idx_thread_reads_thread_user
  ON message_thread_reads(thread_id, user_id);

-- Contact memories: org + contact composite
CREATE INDEX IF NOT EXISTS idx_contact_memories_org_contact
  ON contact_memories(organization_id, contact_id);

-- AI agent logs: contact and thread lookups
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_contact
  ON ai_agent_logs(contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_thread
  ON ai_agent_logs(thread_id)
  WHERE thread_id IS NOT NULL;
