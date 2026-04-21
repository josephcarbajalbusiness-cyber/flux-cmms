// Auto-generado con: supabase gen types typescript --linked > src/types/database.ts
// Este archivo debe regenerarse cada vez que cambie el schema

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type ReportStatus = "draft" | "in_progress" | "pending_signature" | "completed" | "cancelled";
export type ServiceType = "preventive" | "corrective" | "predictive" | "installation";
export type Priority = "low" | "normal" | "high" | "critical";
export type UserRole = "owner" | "admin" | "technician";
export type AssetStatus = "operational" | "under_maintenance" | "out_of_service";

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
  notes?: string;
}

export interface Checklist {
  items: ChecklistItem[];
}

export interface Photos {
  before: string[];
  during: string[];
  after: string[];
  extra: string[];
}

export interface Supply {
  sku?: string;
  name: string;
  qty: number;
  unit: string;
  cost?: number;
}

export interface Tenant {
  id: string;
  name: string;
  logo_url: string | null;
  plan: "starter" | "professional" | "enterprise";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string;
  full_name: string;
  avatar_url: string | null;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  location: string;
  latitude: number | null;
  longitude: number | null;
  qr_code: string;
  category: string | null;
  serial_number: string | null;
  manufacturer: string | null;
  model: string | null;
  install_date: string | null;
  last_service_at: string | null;
  status: AssetStatus;
  created_at: string;
  updated_at: string;
}

export interface ServiceReport {
  id: string;
  tenant_id: string;
  asset_id: string;
  technician_id: string;
  report_number: string | null;
  status: ReportStatus;
  priority: Priority;
  service_type: ServiceType;
  created_at: string;
  updated_at: string;
  // Joins opcionales
  assets?: Asset;
  profiles?: Profile;
  report_details?: ReportDetail;
}

export interface ReportDetail {
  id: string;
  report_id: string;
  tenant_id: string;
  started_at: string | null;
  finished_at: string | null;
  start_latitude: number | null;
  start_longitude: number | null;
  end_latitude: number | null;
  end_longitude: number | null;
  checklist: Checklist;
  photos: Photos;
  supplies: Supply[];
  observations: string | null;
  diagnosis: string | null;
  recommendations: string | null;
  technician_signature: string | null;
  client_signature: string | null;
  client_name: string | null;
  device_info: Json;
  created_at: string;
  updated_at: string;
}

// ── Scheduling ────────────────────────────────────────────
export type FrequencyType = "daily" | "weekly" | "monthly" | "custom";
export type ScheduleStatus = "active" | "paused" | "completed";

export interface MaintenanceSchedule {
  id: string;
  tenant_id: string;
  asset_id: string;
  technician_id: string | null;
  title: string;
  description: string | null;
  service_type: ServiceType;
  priority: Priority;
  frequency_type: FrequencyType;
  frequency_value: number;          // cada N días/semanas/meses
  next_due_date: string;            // ISO date
  last_done_at: string | null;
  estimated_duration: number | null; // minutos
  status: ScheduleStatus;
  checklist_template: ChecklistItem[];
  created_at: string;
  updated_at: string;
  // joins
  assets?: Asset;
  profiles?: Profile;
}

// Tipo para el store de autenticación
export interface AuthUser {
  id: string;
  email: string;
  profile: Profile;
  tenant: Tenant;
}

// Pseudo-type para Database (simplificado)
export interface Database {
  public: {
    Tables: {
      tenants: { Row: Tenant; Insert: Partial<Tenant>; Update: Partial<Tenant> };
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      assets: { Row: Asset; Insert: Partial<Asset>; Update: Partial<Asset> };
      service_reports: { Row: ServiceReport; Insert: Partial<ServiceReport>; Update: Partial<ServiceReport> };
      report_details: { Row: ReportDetail; Insert: Partial<ReportDetail>; Update: Partial<ReportDetail> };
    };
  };
}
