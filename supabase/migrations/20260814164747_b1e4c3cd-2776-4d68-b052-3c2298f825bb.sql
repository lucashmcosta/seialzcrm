ALTER TABLE public.evolution_instances ALTER COLUMN endpoint_id DROP NOT NULL;

ALTER TABLE public.evolution_instances
  ADD COLUMN IF NOT EXISTS provisioning_status text NOT NULL DEFAULT 'pending';

-- Backfill seguro: instâncias históricas (já vinculadas) nascem como 'linked'.
UPDATE public.evolution_instances
   SET provisioning_status = 'linked'
 WHERE endpoint_id IS NOT NULL;

ALTER TABLE public.evolution_instances
  DROP CONSTRAINT IF EXISTS evolution_instances_provisioning_status_chk;
ALTER TABLE public.evolution_instances
  ADD CONSTRAINT evolution_instances_provisioning_status_chk
  CHECK (provisioning_status IN ('pending', 'linked'));

-- Coerência: 'linked' exige endpoint_id; 'pending' exige endpoint_id nulo.
ALTER TABLE public.evolution_instances
  DROP CONSTRAINT IF EXISTS evolution_instances_provisioning_coherence_chk;
ALTER TABLE public.evolution_instances
  ADD CONSTRAINT evolution_instances_provisioning_coherence_chk
  CHECK (
    (provisioning_status = 'linked' AND endpoint_id IS NOT NULL)
    OR (provisioning_status = 'pending' AND endpoint_id IS NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS evolution_instances_org_instance_name_uidx
  ON public.evolution_instances (organization_id, instance_name);