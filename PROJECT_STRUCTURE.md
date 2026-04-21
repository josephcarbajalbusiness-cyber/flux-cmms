# CMMS SaaS — Estructura del Proyecto

```
Flux Inc/
├── vercel.json                        # Config de despliegue Vercel (SPA rewrites + CSP)
├── vite.config.ts                     # Vite + alias @/ + code-splitting
├── package.json
├── .env.example                       # Variables de entorno (copiar a .env.local)
│
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql     # ★ Schema completo + RLS + triggers
│   └── functions/
│       └── ai-maintenance-reader/
│           └── index.ts               # ★ Edge Function: chat con historial de mantenimiento
│
└── src/
    ├── types/
    │   └── database.ts                # Tipos TypeScript para todas las tablas
    │
    ├── lib/
    │   ├── supabase.ts                # Cliente Supabase + helpers de Storage
    │   └── pdfGenerator.ts            # ★ Generador PDF profesional (jsPDF + autotable)
    │
    ├── store/
    │   └── authStore.ts               # Zustand: sesión + profile + tenant
    │
    ├── hooks/
    │   └── useGeolocation.ts          # GPS con validación de radio (Haversine)
    │
    ├── pages/
    │   ├── App.tsx                    # Router + rutas protegidas por rol
    │   └── LoginPage.tsx              # Login con Supabase Auth
    │
    └── components/
        ├── technician/
        │   └── CreateReport.tsx       # ★ Wizard 7 pasos: QR→info→checklist→fotos→insumos→firmas→review
        │
        └── owner/
            └── OwnerDashboard.tsx     # ★ Dashboard: tabla, filtros, exportar PDF/CSV/JSON
```

## Flujo de datos

```
[Técnico Mobile]
  Escanea QR → /report/new?qr=ASSET-001
  → Wizard 7 pasos
  → Fotos suben a Storage (report-media/{tenant}/{report}/{tipo}/)
  → Firmas suben a Storage (signatures/{tenant}/{report}/)
  → report_details actualizado en cada paso (guardado progresivo)
  → Al finalizar: status → 'completed'

[Owner Dashboard]
  Carga reportes filtrados por fecha/estado
  → Exportar PDF: pdfGenerator.ts (jsPDF, logo del tenant, fotos, firmas)
  → Exportar CSV/JSON: métricas normalizadas
  → Chat IA: llama a Edge Function ai-maintenance-reader

[Edge Function IA]
  Recibe tenant_id + pregunta
  → Consulta últimos 50 reportes completados
  → Sanitiza (elimina URLs, metadatos de dispositivo)
  → Envía a Claude API con prompt caching
  → Retorna respuesta en lenguaje natural
```

## Comandos de despliegue

```bash
# 1. Aplicar schema en Supabase
supabase db push

# 2. Configurar secretos para Edge Function
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

# 3. Desplegar Edge Function
supabase functions deploy ai-maintenance-reader

# 4. Desplegar frontend en Vercel
vercel --prod

# 5. Regenerar tipos cuando cambie el schema
npm run supabase:types
```

## Storage Buckets a crear en Supabase Dashboard

| Bucket        | Público | Propósito                    |
|---------------|---------|------------------------------|
| report-media  | No      | Fotos de reportes            |
| signatures    | No      | Firmas técnico/cliente       |
| logos         | Sí      | Logos de tenants             |

## Políticas de Storage (ejecutar en SQL Editor)

```sql
-- report-media: solo el tenant puede acceder a sus archivos
CREATE POLICY "Tenant report media" ON storage.objects
  FOR ALL USING (
    bucket_id = 'report-media'
    AND (storage.foldername(name))[1] = auth.tenant_id()::TEXT
  );

-- signatures: mismo aislamiento por tenant
CREATE POLICY "Tenant signatures" ON storage.objects
  FOR ALL USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = auth.tenant_id()::TEXT
  );

-- logos: lectura pública, escritura solo owner
CREATE POLICY "Public logos read" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

CREATE POLICY "Owner logos write" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'logos'
    AND (storage.foldername(name))[1] = auth.tenant_id()::TEXT
    AND auth.user_role() = 'owner'
  );
```
