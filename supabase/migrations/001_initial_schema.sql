-- ============================================================
-- CMMS SaaS - Schema Inicial
-- Supabase / PostgreSQL
-- Autor: Principal Architect
-- ============================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis"; -- Para geolocalización avanzada (opcional)

-- ============================================================
-- TABLA: tenants
-- Empresa cliente del SaaS. Raíz del multi-tenant.
-- ============================================================
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  logo_url      TEXT,
  plan          TEXT NOT NULL DEFAULT 'starter'
                  CHECK (plan IN ('starter', 'professional', 'enterprise')),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: profiles
-- Extiende auth.users de Supabase con rol y tenant.
-- ============================================================
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  avatar_url    TEXT,
  role          TEXT NOT NULL DEFAULT 'technician'
                  CHECK (role IN ('owner', 'admin', 'technician')),
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: assets
-- Máquinas / equipos a mantener.
-- ============================================================
CREATE TABLE assets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  location        TEXT NOT NULL,
  latitude        DOUBLE PRECISION,    -- Coordenadas fijas del activo
  longitude       DOUBLE PRECISION,
  qr_code         TEXT UNIQUE NOT NULL, -- Slug único para URL de escaneo
  category        TEXT,                 -- Ej: 'Eléctrico', 'Mecánico', 'HVAC'
  serial_number   TEXT,
  manufacturer    TEXT,
  model           TEXT,
  install_date    DATE,
  last_service_at TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'operational'
                    CHECK (status IN ('operational', 'under_maintenance', 'out_of_service')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: service_reports
-- Cabecera del reporte de servicio.
-- ============================================================
CREATE TABLE service_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  asset_id        UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  technician_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  report_number   TEXT,                -- Folio generado: SR-2024-0001
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'in_progress', 'pending_signature', 'completed', 'cancelled')),
  priority        TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low', 'normal', 'high', 'critical')),
  service_type    TEXT NOT NULL DEFAULT 'preventive'
                    CHECK (service_type IN ('preventive', 'corrective', 'predictive', 'installation')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA: report_details
-- Cuerpo del reporte con toda la evidencia capturada.
-- ============================================================
CREATE TABLE report_details (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id             UUID NOT NULL UNIQUE REFERENCES service_reports(id) ON DELETE CASCADE,
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- Timestamps de ciclo de vida
  started_at            TIMESTAMPTZ,
  finished_at           TIMESTAMPTZ,

  -- Geolocalización de inicio y fin
  start_latitude        DOUBLE PRECISION,
  start_longitude       DOUBLE PRECISION,
  end_latitude          DOUBLE PRECISION,
  end_longitude         DOUBLE PRECISION,

  -- Checklist: JSON flexible por categoría de activo
  -- Ejemplo: { "items": [{ "id": "1", "label": "Presión nominal", "checked": true, "notes": "OK" }] }
  checklist             JSONB NOT NULL DEFAULT '{"items": []}'::JSONB,

  -- Multimedia: Mínimo 3 fotos (before, during, after)
  -- Ejemplo: { "before": ["url1"], "during": ["url1"], "after": ["url1"], "extra": [] }
  photos                JSONB NOT NULL DEFAULT '{"before": [], "during": [], "after": [], "extra": []}'::JSONB,

  -- Insumos / Refacciones utilizadas
  -- Ejemplo: [{ "sku": "FLT-001", "name": "Filtro de aire", "qty": 2, "unit": "pza", "cost": 150.00 }]
  supplies              JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Observaciones y diagnóstico
  observations          TEXT,
  diagnosis             TEXT,
  recommendations       TEXT,

  -- Firmas (URLs a imágenes en Storage)
  technician_signature  TEXT,
  client_signature      TEXT,
  client_name           TEXT,     -- Nombre de quien recibe el servicio

  -- Metadatos del dispositivo (para auditoría)
  device_info           JSONB DEFAULT '{}'::JSONB,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX idx_profiles_tenant         ON profiles(tenant_id);
CREATE INDEX idx_assets_tenant           ON assets(tenant_id);
CREATE INDEX idx_assets_qr_code          ON assets(qr_code);
CREATE INDEX idx_service_reports_tenant  ON service_reports(tenant_id);
CREATE INDEX idx_service_reports_asset   ON service_reports(asset_id);
CREATE INDEX idx_service_reports_tech    ON service_reports(technician_id);
CREATE INDEX idx_service_reports_status  ON service_reports(status);
CREATE INDEX idx_report_details_report   ON report_details(report_id);
CREATE INDEX idx_report_details_tenant   ON report_details(tenant_id);

-- GIN index para queries sobre JSONB
CREATE INDEX idx_report_details_checklist ON report_details USING GIN (checklist);
CREATE INDEX idx_report_details_photos    ON report_details USING GIN (photos);
CREATE INDEX idx_report_details_supplies  ON report_details USING GIN (supplies);

-- ============================================================
-- FUNCIÓN: updated_at automático
-- ============================================================
CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
  BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_service_reports_updated_at
  BEFORE UPDATE ON service_reports FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
CREATE TRIGGER trg_report_details_updated_at
  BEFORE UPDATE ON report_details FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ============================================================
-- FUNCIÓN: Nuevo usuario → crear profile automáticamente
-- Se invoca desde un trigger en auth.users (Supabase hook)
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, tenant_id, full_name, role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'tenant_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'role', 'technician')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- FUNCIÓN: Generar folio de reporte
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS report_number_seq START 1;

CREATE OR REPLACE FUNCTION generate_report_number(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_year TEXT := TO_CHAR(NOW(), 'YYYY');
  v_seq  TEXT;
BEGIN
  v_seq := LPAD(nextval('report_number_seq')::TEXT, 5, '0');
  RETURN 'SR-' || v_year || '-' || v_seq;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_report_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.report_number IS NULL THEN
    NEW.report_number := generate_report_number(NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_report_number
  BEFORE INSERT ON service_reports
  FOR EACH ROW EXECUTE FUNCTION set_report_number();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Aislamiento total por tenant_id
-- ============================================================

ALTER TABLE tenants        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_details ENABLE ROW LEVEL SECURITY;

-- Helper: obtener tenant_id del usuario autenticado
-- NOTA: van en public, no en auth (Supabase restringe el schema auth)
CREATE OR REPLACE FUNCTION public.get_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: obtener rol del usuario autenticado
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ---------- tenants ----------
CREATE POLICY "tenant_select" ON tenants FOR SELECT
  USING (id = public.get_tenant_id());

CREATE POLICY "tenant_update" ON tenants FOR UPDATE
  USING (id = public.get_tenant_id() AND public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (id = public.get_tenant_id());

-- ---------- profiles ----------
CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('owner', 'admin'));

CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (tenant_id = public.get_tenant_id() AND (id = auth.uid() OR public.get_user_role() IN ('owner', 'admin')))
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "profiles_delete" ON profiles FOR DELETE
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('owner', 'admin') AND id != auth.uid());

-- ---------- assets ----------
CREATE POLICY "assets_select" ON assets FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "assets_insert" ON assets FOR INSERT
  WITH CHECK (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('owner', 'admin'));

CREATE POLICY "assets_update" ON assets FOR UPDATE
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('owner', 'admin'))
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "assets_delete" ON assets FOR DELETE
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() = 'owner');

-- ---------- service_reports ----------
CREATE POLICY "reports_select" ON service_reports FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "reports_insert" ON service_reports FOR INSERT
  WITH CHECK (
    tenant_id = public.get_tenant_id()
    AND (public.get_user_role() IN ('owner', 'admin') OR technician_id = auth.uid())
  );

CREATE POLICY "reports_update" ON service_reports FOR UPDATE
  USING (
    tenant_id = public.get_tenant_id()
    AND (
      public.get_user_role() IN ('owner', 'admin')
      OR (technician_id = auth.uid() AND status NOT IN ('completed', 'cancelled'))
    )
  )
  WITH CHECK (tenant_id = public.get_tenant_id());

CREATE POLICY "reports_delete" ON service_reports FOR DELETE
  USING (tenant_id = public.get_tenant_id() AND public.get_user_role() IN ('owner', 'admin'));

-- ---------- report_details ----------
CREATE POLICY "details_select" ON report_details FOR SELECT
  USING (tenant_id = public.get_tenant_id());

CREATE POLICY "details_insert" ON report_details FOR INSERT
  WITH CHECK (
    tenant_id = public.get_tenant_id()
    AND EXISTS (
      SELECT 1 FROM service_reports sr
      WHERE sr.id = report_id
        AND sr.tenant_id = public.get_tenant_id()
        AND (public.get_user_role() IN ('owner', 'admin') OR sr.technician_id = auth.uid())
    )
  );

CREATE POLICY "details_update" ON report_details FOR UPDATE
  USING (
    tenant_id = public.get_tenant_id()
    AND EXISTS (
      SELECT 1 FROM service_reports sr
      WHERE sr.id = report_id
        AND sr.tenant_id = public.get_tenant_id()
        AND (public.get_user_role() IN ('owner', 'admin') OR sr.technician_id = auth.uid())
        AND sr.status NOT IN ('completed', 'cancelled')
    )
  )
  WITH CHECK (tenant_id = public.get_tenant_id());

-- ============================================================
-- STORAGE BUCKETS (ejecutar en Dashboard o via API)
-- ============================================================
-- Las políticas de Storage también requieren tenant_id en la ruta
-- Estructura: {bucket}/{tenant_id}/{report_id}/{tipo}/{filename}
--
-- INSERT INTO storage.buckets (id, name, public) VALUES
--   ('report-media', 'report-media', false),
--   ('signatures',   'signatures',   false),
--   ('logos',        'logos',        true);
--
-- Política de Storage (ejemplo para report-media):
-- CREATE POLICY "Tenant media access" ON storage.objects FOR ALL
--   USING (bucket_id = 'report-media' AND (storage.foldername(name))[1] = auth.tenant_id()::TEXT);

-- ============================================================
-- VISTA: dashboard_summary (para el owner)
-- ============================================================
CREATE OR REPLACE VIEW dashboard_summary AS
SELECT
  sr.tenant_id,
  COUNT(sr.id)                                          AS total_reports,
  COUNT(sr.id) FILTER (WHERE sr.status = 'completed')  AS completed_reports,
  COUNT(sr.id) FILTER (WHERE sr.status = 'draft')      AS draft_reports,
  COUNT(DISTINCT sr.asset_id)                           AS assets_serviced,
  COUNT(DISTINCT sr.technician_id)                      AS active_technicians,
  DATE_TRUNC('month', sr.created_at)                   AS month
FROM service_reports sr
GROUP BY sr.tenant_id, DATE_TRUNC('month', sr.created_at);

-- La vista hereda RLS de service_reports automáticamente
