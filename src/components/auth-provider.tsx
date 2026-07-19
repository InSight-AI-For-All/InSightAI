"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { signOutLocally } from "@/lib/auth/client";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export type AuthProfile = {
  id: string;
  email: string | null;
  phone: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  plan: string;
  role: "user" | "admin";
  authProvider: string;
  authProviders: string[];
};

type AuthContextValue = {
  user: User | null;
  profile: AuthProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AuthProfile | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(currentUser: User | null) {
    const supabase = createBrowserSupabaseClient();
    setUser(currentUser);
    if (!supabase || !currentUser) {
      setProfile(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, email, phone, full_name, avatar_url, plan, role, auth_provider, auth_providers")
      .eq("id", currentUser.id)
      .maybeSingle();
    setProfile(data ? {
      id: data.id,
      email: data.email,
      phone: data.phone,
      fullName: data.full_name,
      avatarUrl: data.avatar_url,
      plan: data.plan,
      role: data.role,
      authProvider: data.auth_provider,
      authProviders: data.auth_providers || [],
    } : null);
    setLoading(false);
  }

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    void supabase.auth.getUser().then((response: { data: { user: User | null } }) => loadProfile(response.data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      setTimeout(() => void loadProfile(session?.user || null), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function signOut() {
    const supabase = createBrowserSupabaseClient();
    if (supabase) await signOutLocally(supabase, window.sessionStorage);
    setUser(null);
    setProfile(null);
    window.location.assign("/");
  }

  async function refreshProfile() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    await loadProfile(data.user);
  }

  return <AuthContext.Provider value={{ user, profile, loading, signOut, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider.");
  return value;
}