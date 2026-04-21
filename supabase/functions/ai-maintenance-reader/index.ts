// ============================================================
// Edge Function: ai-maintenance-reader
// Recibe datos de mantenimiento y los envía a un LLM para
// consultas tipo chat sobre el historial.
// Desplegado en: supabase functions deploy ai-maintenance-reader
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ChatRequest {
  asset_id?: string;
  tenant_id: string;
  question: string;
  date_from?: string;
  date_to?: string;
  conversation_history?: Array<{ role: "user" | "assistant"; content: string }>;
}

// Sanitiza los datos del reporte eliminando metadatos irrelevantes para el LLM
function sanitizeReportForLLM(report: Record<string, unknown>): Record<string, unknown> {
  const details = report.report_details as Record<string, unknown> | null;
  return {
    folio: report.report_number,
    fecha: report.created_at,
    activo: (report.assets as Record<string, unknown>)?.name,
    ubicacion: (report.assets as Record<string, unknown>)?.location,
    tecnico: (report.profiles as Record<string, unknown>)?.full_name,
    tipo_servicio: report.service_type,
    prioridad: report.priority,
    estado: report.status,
    inicio: details?.started_at,
    fin: details?.finished_at,
    duracion_minutos: details?.started_at && details?.finished_at
      ? Math.round(
          (new Date(details.finished_at as string).getTime() -
            new Date(details.started_at as string).getTime()) / 60000
        )
      : null,
    checklist: (details?.checklist as Record<string, unknown>)?.items,
    observaciones: details?.observations,
    diagnostico: details?.diagnosis,
    recomendaciones: details?.recommendations,
    insumos_usados: details?.supplies,
    fotos_count: {
      antes: ((details?.photos as Record<string, unknown[]>)?.before ?? []).length,
      durante: ((details?.photos as Record<string, unknown[]>)?.during ?? []).length,
      despues: ((details?.photos as Record<string, unknown[]>)?.after ?? []).length,
    },
    firmado_por_cliente: !!(details?.client_signature),
    nombre_cliente: details?.client_name,
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verificar autenticación
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Validar token del usuario
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ChatRequest = await req.json();

    // Validar que el usuario pertenece al tenant solicitado
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", user.id)
      .single();

    if (!profile || profile.tenant_id !== body.tenant_id) {
      return new Response(JSON.stringify({ error: "Acceso denegado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Construir query de reportes
    let query = supabase
      .from("service_reports")
      .select(`
        id, report_number, status, service_type, priority, created_at,
        assets (name, location, category),
        profiles (full_name),
        report_details (
          started_at, finished_at, checklist, photos, supplies,
          observations, diagnosis, recommendations, client_name,
          client_signature
        )
      `)
      .eq("tenant_id", body.tenant_id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(50);

    if (body.asset_id) query = query.eq("asset_id", body.asset_id);
    if (body.date_from) query = query.gte("created_at", body.date_from);
    if (body.date_to) query = query.lte("created_at", body.date_to);

    const { data: reports, error: dbError } = await query;
    if (dbError) throw dbError;

    // Sanitizar datos para el LLM
    const cleanedReports = (reports ?? []).map(sanitizeReportForLLM);

    const systemPrompt = `Eres un asistente experto en mantenimiento industrial para la plataforma CMMS.
Tienes acceso al historial de ${cleanedReports.length} reportes de servicio completados.
Responde en español, de forma concisa y técnica.
Si el usuario pregunta sobre patrones, tendencias o problemas frecuentes, analiza los datos disponibles.
Si no tienes suficiente información, indícalo claramente.

DATOS DE MANTENIMIENTO (JSON limpio):
${JSON.stringify(cleanedReports, null, 2)}`;

    // Llamar a Claude via Anthropic API
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" }, // Cache el contexto largo
          },
        ],
        messages: [
          ...(body.conversation_history ?? []),
          { role: "user", content: body.question },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const err = await anthropicResponse.text();
      throw new Error(`Anthropic API error: ${err}`);
    }

    const aiResult = await anthropicResponse.json();

    return new Response(
      JSON.stringify({
        answer: aiResult.content[0].text,
        reports_analyzed: cleanedReports.length,
        usage: aiResult.usage,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("ai-maintenance-reader error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
