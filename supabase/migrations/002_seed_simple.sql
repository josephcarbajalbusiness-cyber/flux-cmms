-- ============================================================
-- SEED SIMPLIFICADO — Copia y pega directo en SQL Editor
-- No requiere configuración previa
-- ============================================================

-- Paso 1: Obtener IDs reales
-- (Corre esto primero para ver tus IDs)
SELECT
  t.id   AS "tenant_id  ← copia este",
  t.name AS tenant_name,
  p.id   AS "owner_id   ← copia este",
  p.full_name
FROM tenants t
JOIN profiles p ON p.tenant_id = t.id
WHERE p.role = 'owner';
