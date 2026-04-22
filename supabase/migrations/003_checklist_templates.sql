-- ═══════════════════════════════════════════════════════════
-- FLUX PRO — Plantillas de Checklist
-- Ejecutar en: Supabase → SQL Editor
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.checklist_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL DEFAULT 'General',
  icon        TEXT NOT NULL DEFAULT '🔧',
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_global   BOOLEAN NOT NULL DEFAULT false, -- true = plantilla del sistema
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_checklist_templates_tenant ON public.checklist_templates(tenant_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.handle_checklist_template_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS on_checklist_template_updated ON public.checklist_templates;
CREATE TRIGGER on_checklist_template_updated
  BEFORE UPDATE ON public.checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_checklist_template_updated_at();

-- RLS
ALTER TABLE public.checklist_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates_tenant_isolation" ON public.checklist_templates;
CREATE POLICY "templates_tenant_isolation"
  ON public.checklist_templates FOR ALL
  USING  (tenant_id = public.get_tenant_id())
  WITH CHECK (tenant_id = public.get_tenant_id());

-- ── Plantillas predefinidas del sistema ────────────────────
-- Se insertan con un tenant_id ficticio; el app las filtra por is_global
-- O mejor: insertarlas directamente en el tenant del usuario al registrarse.
-- En este caso usamos una función que crea las plantillas base para un tenant.

CREATE OR REPLACE FUNCTION public.seed_checklist_templates(p_tenant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.checklist_templates (tenant_id, name, description, category, icon, items, is_global) VALUES

  -- Compresor
  (p_tenant_id, 'Revisión de Compresor', 'Mantenimiento preventivo estándar para compresores de aire industrial', 'Eléctrico', '🔩',
  '[
    {"id":"c1","label":"Verificar nivel de aceite del compresor","checked":false},
    {"id":"c2","label":"Inspeccionar filtro de aire (limpiar o reemplazar)","checked":false},
    {"id":"c3","label":"Revisar correas de transmisión (tensión y desgaste)","checked":false},
    {"id":"c4","label":"Verificar válvula de seguridad (prueba de disparo)","checked":false},
    {"id":"c5","label":"Drenar condensados del depósito","checked":false},
    {"id":"c6","label":"Inspeccionar conexiones eléctricas y terminar","checked":false},
    {"id":"c7","label":"Medir presión de trabajo (debe ser nominal ±5%)","checked":false},
    {"id":"c8","label":"Verificar temperatura de operación","checked":false},
    {"id":"c9","label":"Lubricar rodamientos si aplica","checked":false},
    {"id":"c10","label":"Prueba de funcionamiento en carga (15 min)","checked":false}
  ]'::jsonb, true),

  -- HVAC
  (p_tenant_id, 'Mantenimiento HVAC', 'Revisión completa de sistemas de climatización y ventilación', 'HVAC', '❄️',
  '[
    {"id":"h1","label":"Limpiar filtros de aire (lavado o reemplazo)","checked":false},
    {"id":"h2","label":"Revisar y limpiar serpentín evaporador","checked":false},
    {"id":"h3","label":"Revisar y limpiar serpentín condensador","checked":false},
    {"id":"h4","label":"Verificar nivel de refrigerante (manómetros)","checked":false},
    {"id":"h5","label":"Inspeccionar y limpiar bandeja de drenaje","checked":false},
    {"id":"h6","label":"Revisar estado y funcionamiento del ventilador","checked":false},
    {"id":"h7","label":"Verificar compresor (amperaje y presiones)","checked":false},
    {"id":"h8","label":"Medir temperatura de suministro y retorno","checked":false},
    {"id":"h9","label":"Revisar termostato y controles","checked":false},
    {"id":"h10","label":"Prueba de ciclo completo frío/calor","checked":false}
  ]'::jsonb, true),

  -- Panel Eléctrico
  (p_tenant_id, 'Inspección Panel Eléctrico', 'Revisión de tableros y sistemas eléctricos industriales', 'Eléctrico', '⚡',
  '[
    {"id":"e1","label":"Inspección visual de tablero (sin signos de quemado)","checked":false},
    {"id":"e2","label":"Verificar apriete de bornes y conexiones","checked":false},
    {"id":"e3","label":"Medir voltaje en líneas principales (L1-L2-L3)","checked":false},
    {"id":"e4","label":"Medir amperaje en carga nominal","checked":false},
    {"id":"e5","label":"Revisar fusibles y breakers (estado y calibración)","checked":false},
    {"id":"e6","label":"Verificar tierra física (resistencia < 5 ohms)","checked":false},
    {"id":"e7","label":"Inspeccionar cableado (aislamiento sin daños)","checked":false},
    {"id":"e8","label":"Verificar protecciones térmicas y de sobrecarga","checked":false},
    {"id":"e9","label":"Limpiar interior del tablero (polvo y suciedad)","checked":false},
    {"id":"e10","label":"Registrar lecturas en bitácora","checked":false}
  ]'::jsonb, true),

  -- Bomba Hidráulica
  (p_tenant_id, 'Revisión de Bomba Hidráulica', 'Mantenimiento preventivo de sistemas hidráulicos y bombas', 'Hidráulico', '💧',
  '[
    {"id":"b1","label":"Verificar nivel de aceite hidráulico","checked":false},
    {"id":"b2","label":"Tomar muestra de aceite para análisis","checked":false},
    {"id":"b3","label":"Inspeccionar mangueras y conexiones (fugas)","checked":false},
    {"id":"b4","label":"Revisar filtro hidráulico (cambiar si necesario)","checked":false},
    {"id":"b5","label":"Verificar presión del sistema (manómetro)","checked":false},
    {"id":"b6","label":"Inspeccionar sellos y retenes","checked":false},
    {"id":"b7","label":"Verificar alineación bomba-motor","checked":false},
    {"id":"b8","label":"Revisar válvulas de control","checked":false},
    {"id":"b9","label":"Medir temperatura del aceite en operación","checked":false},
    {"id":"b10","label":"Prueba de presión máxima y alivio","checked":false}
  ]'::jsonb, true),

  -- Motor Eléctrico
  (p_tenant_id, 'Revisión de Motor Eléctrico', 'Inspección y mantenimiento de motores eléctricos trifásicos', 'Mecánico', '⚙️',
  '[
    {"id":"m1","label":"Verificar temperatura de bobinados (termómetro)","checked":false},
    {"id":"m2","label":"Medir aislamiento de bobinados (megóhmetro)","checked":false},
    {"id":"m3","label":"Inspeccionar y lubricar rodamientos","checked":false},
    {"id":"m4","label":"Revisar ventilación y limpieza de aspas","checked":false},
    {"id":"m5","label":"Medir amperaje por fase (balanceo de cargas)","checked":false},
    {"id":"m6","label":"Verificar acoplamiento o transmisión","checked":false},
    {"id":"m7","label":"Inspeccionar carcasa (fisuras, vibraciones)","checked":false},
    {"id":"m8","label":"Verificar protección térmica del motor","checked":false},
    {"id":"m9","label":"Prueba de marcha en vacío (5 min)","checked":false},
    {"id":"m10","label":"Registrar RPM, amperaje y temperatura en bitácora","checked":false}
  ]'::jsonb, true),

  -- General
  (p_tenant_id, 'Inspección General', 'Checklist básico para cualquier tipo de equipo', 'General', '📋',
  '[
    {"id":"g1","label":"Limpieza general del equipo","checked":false},
    {"id":"g2","label":"Inspección visual de componentes principales","checked":false},
    {"id":"g3","label":"Verificar niveles de fluidos (si aplica)","checked":false},
    {"id":"g4","label":"Revisar conexiones eléctricas","checked":false},
    {"id":"g5","label":"Verificar sujeción y anclajes","checked":false},
    {"id":"g6","label":"Prueba de funcionamiento","checked":false},
    {"id":"g7","label":"Documentar anomalías encontradas","checked":false}
  ]'::jsonb, true)

  ON CONFLICT DO NOTHING;
END;
$$;
