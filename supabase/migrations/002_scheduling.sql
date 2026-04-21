-- ═══════════════════════════════════════════════════════════
-- FLUX PRO — Módulo de Scheduling (Mantenimiento Preventivo)
-- Ejecutar en: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════

-- Tabla principal de programaciones
CREATE TABLE IF NOT EXISTS public.maintenance_schedules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  asset_id            UUID NOT NULL REFERENCES public.assets(id)  ON DELETE CASCADE,
  technician_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  title               TEXT NOT NULL,
  description         TEXT,
  service_type        TEXT NOT NULL DEFAULT 'preventive'
                        CHECK (service_type IN ('preventive','corrective','predictive','installation')),
  priority            TEXT NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low','normal','high','critical')),

  -- Recurrencia
  frequency_type      TEXT NOT NULL DEFAULT 'monthly'
                        CHECK (frequency_type IN ('daily','weekly','monthly','custom')),
  frequency_value     INTEGER NOT NULL DEFAULT 30 CHECK (frequency_value > 0),

  -- Fechas
  next_due_date       DATE NOT NULL,
  last_done_at        TIMESTAMPTZ,
  estimated_duration  INTEGER,   -- minutos

  -- Estado
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','completed')),

  -- Checklist plantilla (JSON array de items)
  checklist_template  JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_schedules_tenant   ON public.maintenance_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedules_asset    ON public.maintenance_schedules(asset_id);
CREATE INDEX IF NOT EXISTS idx_schedules_due_date ON public.maintenance_schedules(next_due_date);
CREATE INDEX IF NOT EXISTS idx_schedules_status   ON public.maintenance_schedules(status);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.handle_schedule_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS on_schedule_updated ON public.maintenance_schedules;
CREATE TRIGGER on_schedule_updated
  BEFORE UPDATE ON public.maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION public.handle_schedule_updated_at();

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE public.maintenance_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedules_tenant_isolation" ON public.maintenance_schedules;
CREATE POLICY "schedules_tenant_isolation"
  ON public.maintenance_schedules
  FOR ALL
  USING  (tenant_id = public.get_tenant_id())
  WITH CHECK (tenant_id = public.get_tenant_id());

-- ── Función: avanzar next_due_date cuando se completa ──────
-- Llamar manualmente desde el app cuando se crea la OT
CREATE OR REPLACE FUNCTION public.advance_schedule(schedule_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  s public.maintenance_schedules%ROWTYPE;
  days_to_add INTEGER;
BEGIN
  SELECT * INTO s FROM public.maintenance_schedules WHERE id = schedule_id;
  IF NOT FOUND THEN RETURN; END IF;

  days_to_add := CASE s.frequency_type
    WHEN 'daily'   THEN s.frequency_value
    WHEN 'weekly'  THEN s.frequency_value * 7
    WHEN 'monthly' THEN s.frequency_value * 30
    ELSE                s.frequency_value
  END;

  UPDATE public.maintenance_schedules SET
    last_done_at  = now(),
    next_due_date = (CURRENT_DATE + days_to_add * INTERVAL '1 day')::DATE,
    updated_at    = now()
  WHERE id = schedule_id;
END;
$$;
