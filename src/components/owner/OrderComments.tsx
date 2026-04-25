import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useAuthStore } from "@/store/authStore";

interface Comment {
  id: string;
  report_id: string;
  author_id: string;
  message: string;
  created_at: string;
  profiles?: { full_name: string; role: string } | null;
}

interface Props {
  reportId: string;
}

export default function OrderComments({ reportId }: Props) {
  const { user } = useAuthStore();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load initial comments
  useEffect(() => {
    if (!reportId || !user) return;

    supabase
      .from("report_comments")
      .select("*, profiles(full_name, role)")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        setComments(
          (data ?? []).map((c) => ({
            ...c,
            profiles: Array.isArray(c.profiles) ? c.profiles[0] : c.profiles,
          }))
        );
        setLoading(false);
      });

    // Real-time subscription
    const channel = supabase
      .channel(`comments:${reportId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "report_comments",
          filter: `report_id=eq.${reportId}`,
        },
        async (payload) => {
          // Fetch the new comment with author info
          const { data } = await supabase
            .from("report_comments")
            .select("*, profiles(full_name, role)")
            .eq("id", payload.new.id)
            .single();

          if (data) {
            const normalized = {
              ...data,
              profiles: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles,
            };
            setComments((prev) => [...prev, normalized as Comment]);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "report_comments",
          filter: `report_id=eq.${reportId}`,
        },
        (payload) => {
          setComments((prev) => prev.filter((c) => c.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [reportId, user]);

  // Auto-scroll to bottom when new comments arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || !user) return;
    setSending(true);
    const { error } = await supabase.from("report_comments").insert({
      report_id: reportId,
      tenant_id: user.tenant.id,
      author_id: user.profile.id,
      message: trimmed,
    });
    if (!error) setMessage("");
    setSending(false);
  };

  const handleDelete = async (commentId: string) => {
    await supabase.from("report_comments").delete().eq("id", commentId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const isToday =
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear();
    return isToday
      ? d.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const roleLabel: Record<string, string> = {
    owner: "Propietario",
    admin: "Admin",
    technician: "Técnico",
  };

  const roleColor: Record<string, string> = {
    owner: "bg-purple-100 text-purple-700",
    admin: "bg-blue-100 text-blue-700",
    technician: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
          💬 Comentarios y Seguimiento
        </h2>
        <span className="text-xs text-slate-400">{comments.length} comentario{comments.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Comment list */}
      <div className="max-h-80 overflow-y-auto space-y-3 pr-1">
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm">Sin comentarios aún. Sé el primero en agregar una nota.</p>
          </div>
        ) : (
          comments.map((c) => {
            const isOwn = c.author_id === user?.profile.id;
            const role = c.profiles?.role ?? "technician";
            const initials = (c.profiles?.full_name ?? "?")
              .split(" ")
              .slice(0, 2)
              .map((w) => w[0])
              .join("")
              .toUpperCase();

            return (
              <div key={c.id} className={`flex gap-3 group ${isOwn ? "flex-row-reverse" : ""}`}>
                {/* Avatar */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    isOwn ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {initials}
                </div>

                {/* Bubble */}
                <div className={`flex-1 max-w-[80%] ${isOwn ? "items-end" : "items-start"} flex flex-col gap-1`}>
                  <div className={`flex items-center gap-2 ${isOwn ? "flex-row-reverse" : ""}`}>
                    <span className="text-xs font-semibold text-slate-700">
                      {isOwn ? "Tú" : c.profiles?.full_name ?? "Desconocido"}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleColor[role] ?? roleColor.technician}`}>
                      {roleLabel[role] ?? role}
                    </span>
                    <span className="text-[10px] text-slate-400">{formatTime(c.created_at)}</span>
                  </div>
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      isOwn
                        ? "bg-blue-600 text-white rounded-tr-sm"
                        : "bg-slate-100 text-slate-700 rounded-tl-sm"
                    }`}
                  >
                    {c.message}
                  </div>
                </div>

                {/* Delete (own comments) */}
                {isOwn && (
                  <button
                    onClick={() => handleDelete(c.id)}
                    className="opacity-0 group-hover:opacity-100 self-center text-slate-300 hover:text-red-400 transition-all text-xs p-1"
                    title="Eliminar comentario"
                  >
                    🗑
                  </button>
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2 items-end border-t border-slate-100 pt-4">
        <div className="flex-1 relative">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Escribe un comentario… (Enter para enviar, Shift+Enter para nueva línea)"
            rows={2}
            className="input resize-none pr-12 text-sm"
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!message.trim() || sending}
          className="btn-primary px-4 py-2.5 disabled:opacity-40 flex-shrink-0"
        >
          {sending ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            "➤"
          )}
        </button>
      </div>
    </div>
  );
}
