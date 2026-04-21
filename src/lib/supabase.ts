import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Supabase env vars missing: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Storage helpers
export const STORAGE_BUCKETS = {
  REPORT_MEDIA: "report-media",
  SIGNATURES: "signatures",
  LOGOS: "logos",
} as const;

export function getStoragePath(
  tenantId: string,
  reportId: string,
  type: "before" | "during" | "after" | "extra" | "signature",
  filename: string
): string {
  return `${tenantId}/${reportId}/${type}/${filename}`;
}

export async function uploadFile(
  bucket: string,
  path: string,
  file: File | Blob,
  contentType?: string
): Promise<string> {
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType, upsert: true });

  if (uploadError) throw new Error(`Error al subir archivo: ${uploadError.message}`);

  // Para buckets públicos (logos) usar getPublicUrl
  if (bucket === STORAGE_BUCKETS.LOGOS) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  // Para buckets privados (report-media, signatures) usar signed URL de larga duración
  const { data, error: urlError } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 60 * 24 * 365); // 1 año

  if (urlError) throw new Error(`Error al generar URL: ${urlError.message}`);
  return data.signedUrl;
}

// Crear buckets si no existen (llamar una vez al iniciar)
export async function ensureStorageBuckets() {
  const buckets = [
    { id: STORAGE_BUCKETS.REPORT_MEDIA, public: false },
    { id: STORAGE_BUCKETS.SIGNATURES,   public: false },
    { id: STORAGE_BUCKETS.LOGOS,        public: true  },
  ];

  for (const bucket of buckets) {
    const { error } = await supabase.storage.createBucket(bucket.id, {
      public: bucket.public,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/svg+xml"],
      fileSizeLimit: 5 * 1024 * 1024, // 5MB
    });
    // Ignorar error "already exists"
    if (error && !error.message.includes("already exists")) {
      console.warn(`Bucket ${bucket.id}:`, error.message);
    }
  }
}
