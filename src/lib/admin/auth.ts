import "server-only";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type AdminUser = { id: string; email: string | null; phone: string | null; fullName: string | null };

export async function getAdminUser(): Promise<AdminUser | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin
      .from("profiles")
      .select("id, email, phone, full_name, role")
      .eq("id", user.id)
      .maybeSingle();
    if (error || data?.role !== "admin") return null;
    return { id: data.id as string, email: data.email as string | null, phone: data.phone as string | null, fullName: data.full_name as string | null };
  } catch {
    return null;
  }
}

export async function requireAdmin() {
  const admin = await getAdminUser();
  if (!admin) redirect("/dashboard");
  return admin;
}