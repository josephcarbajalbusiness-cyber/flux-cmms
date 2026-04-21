import { create } from "zustand";
import { supabase } from "@/lib/supabase";
import type { AuthUser, Profile, Tenant } from "@/types/database";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

async function fetchUserProfile(userId: string): Promise<AuthUser | null> {
  const { data: sessionUser } = await supabase.auth.getUser();
  if (!sessionUser.user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*, tenants(*)")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    console.error("Error cargando profile:", error?.message);
    return null;
  }

  return {
    id: sessionUser.user.id,
    email: sessionUser.user.email!,
    profile: profile as Profile,
    tenant: (profile as Profile & { tenants: Tenant }).tenants,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,

  initialize: async () => {
    // 1. Verificar sesión existente al cargar la app
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      const authUser = await fetchUserProfile(session.user.id);
      set({ user: authUser, loading: false });
    } else {
      set({ user: null, loading: false });
    }

    // 2. Escuchar cambios futuros de sesión
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        set({ user: null });
        return;
      }
      if (event === "SIGNED_IN" && session.user) {
        const authUser = await fetchUserProfile(session.user.id);
        set({ user: authUser });
      }
    });
  },

  // signIn: hace login Y espera a tener el perfil antes de resolver
  signIn: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const authUser = await fetchUserProfile(data.user.id);
    if (!authUser) throw new Error("No se encontró el perfil del usuario. Contacta al administrador.");

    set({ user: authUser });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null });
  },
}));
