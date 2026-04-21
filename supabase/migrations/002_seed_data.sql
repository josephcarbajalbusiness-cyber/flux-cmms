-- ============================================================
-- SEED DATA — Datos de prueba realistas para CMMS
-- Ejecutar en SQL Editor de Supabase
-- IMPORTANTE: Reemplaza los UUIDs de tenant y usuario owner
--             con los reales de tu proyecto antes de correr.
-- ============================================================

-- 1. Obtener los UUIDs reales (corre esto primero para copiarlos)
-- SELECT id as tenant_id, name FROM tenants;
-- SELECT id as user_id, full_name FROM profiles;

-- ============================================================
-- VARIABLES — Reemplaza estos valores con los tuyos
-- ============================================================
DO $$
DECLARE
  v_tenant_id   UUID;
  v_owner_id    UUID;
  v_tech1_id    UUID := gen_random_uuid();
  v_tech2_id    UUID := gen_random_uuid();
  v_tech3_id    UUID := gen_random_uuid();

  -- Assets
  v_asset1  UUID := gen_random_uuid();
  v_asset2  UUID := gen_random_uuid();
  v_asset3  UUID := gen_random_uuid();
  v_asset4  UUID := gen_random_uuid();
  v_asset5  UUID := gen_random_uuid();
  v_asset6  UUID := gen_random_uuid();

  -- Reports
  v_r1 UUID := gen_random_uuid();
  v_r2 UUID := gen_random_uuid();
  v_r3 UUID := gen_random_uuid();
  v_r4 UUID := gen_random_uuid();
  v_r5 UUID := gen_random_uuid();
  v_r6 UUID := gen_random_uuid();
  v_r7 UUID := gen_random_uuid();
  v_r8 UUID := gen_random_uuid();
  v_r9 UUID := gen_random_uuid();
  v_r10 UUID := gen_random_uuid();

BEGIN

-- ── Obtener tenant y owner reales ───────────────────────────
SELECT id INTO v_tenant_id FROM tenants LIMIT 1;
SELECT id INTO v_owner_id  FROM profiles WHERE role = 'owner' LIMIT 1;

RAISE NOTICE 'Usando tenant_id: %', v_tenant_id;
RAISE NOTICE 'Usando owner_id: %',  v_owner_id;

-- ============================================================
-- TÉCNICOS (auth.users simulados — se insertan directo en profiles)
-- ============================================================
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  (v_tech1_id, 'carlos.mendoza@fluxinc.com', crypt('Tech2024!', gen_salt('bf')), NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   jsonb_build_object('tenant_id', v_tenant_id, 'full_name', 'Carlos Mendoza', 'role', 'technician')),
  (v_tech2_id, 'ana.lopez@fluxinc.com',      crypt('Tech2024!', gen_salt('bf')), NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   jsonb_build_object('tenant_id', v_tenant_id, 'full_name', 'Ana López',      'role', 'technician')),
  (v_tech3_id, 'roberto.silva@fluxinc.com',  crypt('Tech2024!', gen_salt('bf')), NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}'::jsonb,
   jsonb_build_object('tenant_id', v_tenant_id, 'full_name', 'Roberto Silva',  'role', 'technician'))
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, tenant_id, full_name, role, phone, is_active)
VALUES
  (v_tech1_id, v_tenant_id, 'Carlos Mendoza', 'technician', '+52 55 1234 0001', true),
  (v_tech2_id, v_tenant_id, 'Ana López',       'technician', '+52 55 1234 0002', true),
  (v_tech3_id, v_tenant_id, 'Roberto Silva',   'technician', '+52 55 1234 0003', true)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- ACTIVOS / EQUIPOS
-- ============================================================
INSERT INTO assets (id, tenant_id, name, description, location, latitude, longitude, qr_code, category, serial_number, manufacturer, model, install_date, last_service_at, status)
VALUES
  (v_asset1, v_tenant_id,
   'Compresor Industrial A1',
   'Compresor de tornillo rotativo para línea de producción principal',
   'Planta 1 — Área A, Sección Compresores',
   19.4284, -99.1277, 'COMP-A1-001',
   'Neumático', 'SN-2019-0421', 'Atlas Copco', 'GA 55+', '2019-03-15',
   NOW() - INTERVAL '15 days', 'operational'),

  (v_asset2, v_tenant_id,
   'Chiller de Agua Helada',
   'Enfriador de agua para sistema HVAC del edificio administrativo',
   'Azotea — Edificio Central',
   19.4291, -99.1265, 'CHIL-HVAC-002',
   'HVAC', 'SN-2020-0118', 'Carrier', '30XA-300', '2020-06-01',
   NOW() - INTERVAL '30 days', 'operational'),

  (v_asset3, v_tenant_id,
   'Transformador TR-400',
   'Transformador de distribución 400 KVA para subestación eléctrica',
   'Subestación Eléctrica — Patio Norte',
   19.4278, -99.1290, 'TRANS-400-003',
   'Eléctrico', 'SN-2018-1205', 'ABB', 'ONAN-400', '2018-11-20',
   NOW() - INTERVAL '45 days', 'operational'),

  (v_asset4, v_tenant_id,
   'Bomba Centrífuga BC-02',
   'Bomba para circuito de agua de proceso — línea secundaria',
   'Planta 2 — Cuarto de Bombas',
   19.4269, -99.1283, 'BOMB-BC-004',
   'Hidráulico', 'SN-2021-0730', 'Grundfos', 'CM 5-6', '2021-07-30',
   NOW() - INTERVAL '8 days', 'under_maintenance'),

  (v_asset5, v_tenant_id,
   'Banda Transportadora BT-1',
   'Banda transportadora principal para producto terminado',
   'Planta 1 — Línea de Empaque',
   19.4275, -99.1271, 'BAND-BT-005',
   'Mecánico', 'SN-2017-0310', 'Rexnord', 'TableTop 5700', '2017-03-10',
   NOW() - INTERVAL '60 days', 'operational'),

  (v_asset6, v_tenant_id,
   'UPS Central 80 KVA',
   'Sistema de alimentación ininterrumpida para centro de datos',
   'Centro de Datos — Piso 2',
   19.4288, -99.1258, 'UPS-CTR-006',
   'Eléctrico', 'SN-2022-0501', 'Eaton', '9395P-80', '2022-05-01',
   NULL, 'out_of_service');

-- ============================================================
-- REPORTES DE SERVICIO (10 reportes con distintos estados)
-- ============================================================
INSERT INTO service_reports (id, tenant_id, asset_id, technician_id, report_number, status, priority, service_type, created_at, updated_at)
VALUES
  -- Completados
  (v_r1,  v_tenant_id, v_asset1, v_tech1_id, 'SR-2026-00001', 'completed', 'normal',   'preventive',   NOW() - INTERVAL '45 days', NOW() - INTERVAL '45 days'),
  (v_r2,  v_tenant_id, v_asset2, v_tech2_id, 'SR-2026-00002', 'completed', 'high',     'corrective',   NOW() - INTERVAL '38 days', NOW() - INTERVAL '38 days'),
  (v_r3,  v_tenant_id, v_asset3, v_tech1_id, 'SR-2026-00003', 'completed', 'normal',   'preventive',   NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
  (v_r4,  v_tenant_id, v_asset5, v_tech3_id, 'SR-2026-00004', 'completed', 'low',      'preventive',   NOW() - INTERVAL '22 days', NOW() - INTERVAL '22 days'),
  (v_r5,  v_tenant_id, v_asset1, v_tech2_id, 'SR-2026-00005', 'completed', 'critical', 'corrective',   NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'),
  (v_r6,  v_tenant_id, v_asset2, v_tech1_id, 'SR-2026-00006', 'completed', 'normal',   'predictive',   NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days'),
  -- Pendiente firma
  (v_r7,  v_tenant_id, v_asset4, v_tech3_id, 'SR-2026-00007', 'pending_signature', 'high', 'corrective', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day'),
  -- En proceso
  (v_r8,  v_tenant_id, v_asset3, v_tech2_id, 'SR-2026-00008', 'in_progress', 'normal', 'preventive',  NOW() - INTERVAL '1 day',  NOW() - INTERVAL '2 hours'),
  -- Borradores
  (v_r9,  v_tenant_id, v_asset6, v_tech1_id, 'SR-2026-00009', 'draft',      'high',    'corrective',  NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  (v_r10, v_tenant_id, v_asset5, v_tech3_id, 'SR-2026-00010', 'draft',      'low',     'preventive',  NOW(),                     NOW());

-- ============================================================
-- DETALLES DE REPORTES
-- ============================================================
INSERT INTO report_details (
  report_id, tenant_id,
  started_at, finished_at,
  start_latitude, start_longitude,
  end_latitude, end_longitude,
  checklist, photos, supplies,
  observations, diagnosis, recommendations,
  client_name,
  device_info
) VALUES

-- R1: Preventivo compresor completado
(v_r1, v_tenant_id,
 NOW() - INTERVAL '45 days' + INTERVAL '8 hours',
 NOW() - INTERVAL '45 days' + INTERVAL '10 hours 30 minutes',
 19.4284, -99.1277, 19.4284, -99.1277,
 '{"items":[
   {"id":"1","label":"Limpieza general del equipo","checked":true,"notes":"Se limpió con sopleteado"},
   {"id":"2","label":"Revisión de componentes eléctricos","checked":true,"notes":"Sin anomalías"},
   {"id":"3","label":"Verificación de niveles de lubricación","checked":true,"notes":"Aceite al 80%, se completó"},
   {"id":"4","label":"Inspección de rodamientos y correas","checked":true,"notes":"Correa desgastada, se reemplazó"},
   {"id":"5","label":"Prueba de funcionamiento en vacío","checked":true},
   {"id":"6","label":"Prueba de funcionamiento con carga","checked":true,"notes":"Presión nominal 8 bar OK"}
 ]}'::jsonb,
 '{"before":["https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400"],
   "during":["https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400"],
   "after": ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400"],
   "extra": []}'::jsonb,
 '[{"sku":"ACE-001","name":"Aceite sintético ISO 46","qty":2,"unit":"lt","cost":180},
   {"sku":"COR-041","name":"Correa trapezoidal B-41","qty":1,"unit":"pza","cost":320}]'::jsonb,
 'Equipo operando con vibración leve en rodamiento frontal. Se detectó desgaste en correa principal.',
 'Desgaste normal por horas de operación. Correa con 85% de vida útil consumida. Rodamiento en límite de tolerancia.',
 'Programar reemplazo de rodamiento frontal en próxima parada de planta. Revisión en 30 días.',
 'Ing. Marco Reyes',
 '{"platform":"MacIntel","userAgent":"Mozilla/5.0 Chrome"}'::jsonb),

-- R2: Correctivo chiller completado
(v_r2, v_tenant_id,
 NOW() - INTERVAL '38 days' + INTERVAL '9 hours',
 NOW() - INTERVAL '38 days' + INTERVAL '14 hours',
 19.4291, -99.1265, 19.4291, -99.1265,
 '{"items":[
   {"id":"1","label":"Limpieza general del equipo","checked":true},
   {"id":"2","label":"Revisión de componentes eléctricos","checked":true,"notes":"Contactor quemado, reemplazado"},
   {"id":"3","label":"Verificación de niveles de lubricación","checked":true},
   {"id":"4","label":"Inspección de rodamientos y correas","checked":true},
   {"id":"5","label":"Prueba de funcionamiento en vacío","checked":true},
   {"id":"6","label":"Prueba de funcionamiento con carga","checked":true,"notes":"Temperatura salida 7°C OK"}
 ]}'::jsonb,
 '{"before":["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400"],
   "during":["https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400"],
   "after": ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400"],
   "extra": ["https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400"]}'::jsonb,
 '[{"sku":"CTR-3P","name":"Contactor tripolar 25A","qty":1,"unit":"pza","cost":850},
   {"sku":"REL-TER","name":"Relé térmico 20-25A","qty":1,"unit":"pza","cost":420},
   {"sku":"CAB-10","name":"Cable THW calibre 10","qty":3,"unit":"m","cost":45}]'::jsonb,
 'Equipo sin arranque. Contactor principal fundido por sobrecarga eléctrica. Temperatura ambiente 38°C en azotea.',
 'Falla por sobrecalentamiento del contactor debido a ventilación insuficiente en gabinete eléctrico. Protección térmica actuó correctamente.',
 'Instalar ventilador adicional en gabinete eléctrico. Revisar calibración de protección térmica. Monitoreo semanal.',
 'Lic. Patricia Vega',
 '{"platform":"iPhone","userAgent":"Mozilla/5.0 iPhone"}'::jsonb),

-- R3: Preventivo transformador
(v_r3, v_tenant_id,
 NOW() - INTERVAL '30 days' + INTERVAL '7 hours',
 NOW() - INTERVAL '30 days' + INTERVAL '9 hours 45 minutes',
 19.4278, -99.1290, 19.4278, -99.1290,
 '{"items":[
   {"id":"1","label":"Limpieza general del equipo","checked":true,"notes":"Limpieza con brocha seca"},
   {"id":"2","label":"Revisión de componentes eléctricos","checked":true,"notes":"Bornes apretados, sin oxidación"},
   {"id":"3","label":"Verificación de niveles de lubricación","checked":true,"notes":"Nivel de aceite dieléctrico OK"},
   {"id":"4","label":"Inspección de rodamientos y correas","checked":false,"notes":"N/A para transformador"},
   {"id":"5","label":"Prueba de funcionamiento en vacío","checked":true},
   {"id":"6","label":"Prueba de funcionamiento con carga","checked":true}
 ]}'::jsonb,
 '{"before":["https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=400"],
   "during":["https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400"],
   "after": ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400"],
   "extra": []}'::jsonb,
 '[{"sku":"PIN-INS","name":"Pintura aislante","qty":1,"unit":"lt","cost":280},
   {"sku":"LIM-CON","name":"Limpiador de contactos","qty":2,"unit":"pza","cost":95}]'::jsonb,
 'Transformador en condiciones generales buenas. Temperatura de operación 65°C dentro de parámetros.',
 'Mantenimiento preventivo rutinario. Sin fallas detectadas. Aceite dieléctrico en condiciones óptimas.',
 'Realizar prueba de rigidez dieléctrica en próximo año. Continuar programa de mantenimiento semestral.',
 'Ing. Luis Hernández',
 '{"platform":"Android","userAgent":"Mozilla/5.0 Android"}'::jsonb),

-- R4: Preventivo banda completado
(v_r4, v_tenant_id,
 NOW() - INTERVAL '22 days' + INTERVAL '6 hours',
 NOW() - INTERVAL '22 days' + INTERVAL '8 hours',
 19.4275, -99.1271, 19.4275, -99.1271,
 '{"items":[
   {"id":"1","label":"Limpieza general del equipo","checked":true},
   {"id":"2","label":"Revisión de componentes eléctricos","checked":true},
   {"id":"3","label":"Verificación de niveles de lubricación","checked":true,"notes":"Se lubricaron cadenas"},
   {"id":"4","label":"Inspección de rodamientos y correas","checked":true,"notes":"Tensión de banda ajustada"},
   {"id":"5","label":"Prueba de funcionamiento en vacío","checked":true},
   {"id":"6","label":"Prueba de funcionamiento con carga","checked":true}
 ]}'::jsonb,
 '{"before":["https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400"],
   "during":["https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400"],
   "after": ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400"],
   "extra": []}'::jsonb,
 '[{"sku":"GRS-001","name":"Grasa SKF LGMT 3","qty":0.5,"unit":"kg","cost":340}]'::jsonb,
 'Banda operando sin problemas. Pequeño desalineamiento corregido.',
 'Desgaste normal. Vida útil estimada 18 meses adicionales.',
 'Continuar lubricación mensual. Revisión de alineación en 6 meses.',
 'Mtro. Jorge Soto',
 '{"platform":"MacIntel","userAgent":"Mozilla/5.0 Chrome"}'::jsonb),

-- R5: Correctivo crítico compresor
(v_r5, v_tenant_id,
 NOW() - INTERVAL '15 days' + INTERVAL '10 hours',
 NOW() - INTERVAL '15 days' + INTERVAL '16 hours',
 19.4284, -99.1277, 19.4284, -99.1277,
 '{"items":[
   {"id":"1","label":"Limpieza general del equipo","checked":true},
   {"id":"2","label":"Revisión de componentes eléctricos","checked":true,"notes":"Sensor de presión defectuoso"},
   {"id":"3","label":"Verificación de niveles de lubricación","checked":true},
   {"id":"4","label":"Inspección de rodamientos y correas","checked":true},
   {"id":"5","label":"Prueba de funcionamiento en vacío","checked":true},
   {"id":"6","label":"Prueba de funcionamiento con carga","checked":true,"notes":"Presión estable a 8.2 bar"}
 ]}'::jsonb,
 '{"before":["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400"],
   "during":["https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400","https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=400"],
   "after": ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400"],
   "extra": []}'::jsonb,
 '[{"sku":"SEN-P04","name":"Sensor presión 0-10 bar IO-Link","qty":1,"unit":"pza","cost":1850},
   {"sku":"SEL-SIL","name":"Sellador de silicón alta temp","qty":1,"unit":"pza","cost":120},
   {"sku":"ACE-001","name":"Aceite sintético ISO 46","qty":1,"unit":"lt","cost":180}]'::jsonb,
 'Paro de emergencia por alarma de alta presión. Sensor de presión dando lecturas erróneas. Producción detenida 6 horas.',
 'Sensor de presión descalibrado y con fuga interna. Falla prematura posiblemente por golpe de ariete en línea.',
 'Instalar válvula amortiguadora de golpe de ariete en línea de descarga. Revisión de sensores similares en otras unidades.',
 'Ing. Marco Reyes',
 '{"platform":"iPhone","userAgent":"Mozilla/5.0 iPhone"}'::jsonb),

-- R6: Predictivo chiller completado
(v_r6, v_tenant_id,
 NOW() - INTERVAL '10 days' + INTERVAL '8 hours',
 NOW() - INTERVAL '10 days' + INTERVAL '10 hours',
 19.4291, -99.1265, 19.4291, -99.1265,
 '{"items":[
   {"id":"1","label":"Limpieza general del equipo","checked":true},
   {"id":"2","label":"Revisión de componentes eléctricos","checked":true},
   {"id":"3","label":"Verificación de niveles de lubricación","checked":true},
   {"id":"4","label":"Inspección de rodamientos y correas","checked":true,"notes":"Análisis de vibraciones realizado"},
   {"id":"5","label":"Prueba de funcionamiento en vacío","checked":true},
   {"id":"6","label":"Prueba de funcionamiento con carga","checked":true}
 ]}'::jsonb,
 '{"before":["https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=400"],
   "during":["https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400"],
   "after": ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400"],
   "extra": []}'::jsonb,
 '[]'::jsonb,
 'Análisis de vibraciones con analizador portátil. Niveles dentro de rango ISO 10816 zona B.',
 'Equipo en condición satisfactoria. Tendencia de vibración estable en últimas 3 mediciones.',
 'Continuar monitoreo cada 60 días. Programar limpieza de condensadores en próxima quincena.',
 'Lic. Patricia Vega',
 '{"platform":"Android","userAgent":"Mozilla/5.0 Android"}'::jsonb),

-- R7: Correctivo bomba — Pendiente firma
(v_r7, v_tenant_id,
 NOW() - INTERVAL '3 days' + INTERVAL '9 hours',
 NOW() - INTERVAL '3 days' + INTERVAL '13 hours',
 19.4269, -99.1283, 19.4269, -99.1283,
 '{"items":[
   {"id":"1","label":"Limpieza general del equipo","checked":true},
   {"id":"2","label":"Revisión de componentes eléctricos","checked":true},
   {"id":"3","label":"Verificación de niveles de lubricación","checked":true,"notes":"Sello mecánico con fuga"},
   {"id":"4","label":"Inspección de rodamientos y correas","checked":true},
   {"id":"5","label":"Prueba de funcionamiento en vacío","checked":true},
   {"id":"6","label":"Prueba de funcionamiento con carga","checked":false,"notes":"Pendiente verificación de caudal"}
 ]}'::jsonb,
 '{"before":["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400"],
   "during":["https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=400"],
   "after": ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?w=400"],
   "extra": []}'::jsonb,
 '[{"sku":"SEL-MEC","name":"Sello mecánico 28mm John Crane","qty":1,"unit":"pza","cost":2100},
   {"sku":"EMP-NBR","name":"Empaque NBR 3mm","qty":2,"unit":"pza","cost":85}]'::jsonb,
 'Fuga de agua por sello mecánico deteriorado. Humedad en área de bombas. Riesgo de cortocircuito.',
 'Sello mecánico con 4 años de operación, superó vida útil recomendada de 3 años.',
 'Reemplazar sello en bomba de respaldo BC-01 de forma preventiva. Programa de reemplazo cada 3 años.',
 NULL,
 '{"platform":"Android","userAgent":"Mozilla/5.0 Android"}'::jsonb),

-- R8: En proceso — transformador
(v_r8, v_tenant_id,
 NOW() - INTERVAL '1 day' + INTERVAL '8 hours',
 NULL,
 19.4278, -99.1290, NULL, NULL,
 '{"items":[
   {"id":"1","label":"Limpieza general del equipo","checked":true},
   {"id":"2","label":"Revisión de componentes eléctricos","checked":false},
   {"id":"3","label":"Verificación de niveles de lubricación","checked":false},
   {"id":"4","label":"Inspección de rodamientos y correas","checked":false},
   {"id":"5","label":"Prueba de funcionamiento en vacío","checked":false},
   {"id":"6","label":"Prueba de funcionamiento con carga","checked":false}
 ]}'::jsonb,
 '{"before":["https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=400"],
   "during":[], "after":[], "extra":[]}'::jsonb,
 '[]'::jsonb,
 NULL, NULL, NULL, NULL,
 '{"platform":"MacIntel","userAgent":"Mozilla/5.0 Chrome"}'::jsonb);

-- ============================================================
-- Actualizar last_service_at de los activos
-- ============================================================
UPDATE assets SET last_service_at = NOW() - INTERVAL '15 days' WHERE id = v_asset1;
UPDATE assets SET last_service_at = NOW() - INTERVAL '10 days' WHERE id = v_asset2;
UPDATE assets SET last_service_at = NOW() - INTERVAL '30 days' WHERE id = v_asset3;
UPDATE assets SET last_service_at = NOW() - INTERVAL '3 days'  WHERE id = v_asset4;
UPDATE assets SET last_service_at = NOW() - INTERVAL '22 days' WHERE id = v_asset5;

RAISE NOTICE '✅ Seed completado: 3 técnicos, 6 activos, 10 reportes insertados.';

END $$;
