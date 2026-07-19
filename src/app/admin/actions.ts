"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { recordAdminAudit } from "@/lib/telemetry/server";

export async function updateAlertRule(formData: FormData) {
  const adminUser = await requireAdmin();
  const input = z.object({ id: z.string().min(1).max(120), threshold: z.coerce.number().finite().min(0), enabled: z.enum(["true", "false"]) }).parse({ id: formData.get("id"), threshold: formData.get("threshold"), enabled: formData.get("enabled") || "false" });
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("alert_rules").update({ threshold: input.threshold, enabled: input.enabled === "true", updated_at: new Date().toISOString() }).eq("id", input.id);
  if (error) throw new Error("The alert rule could not be updated.");
  await recordAdminAudit({ adminUserId: adminUser.id, action: "admin_setting_changed", targetType: "alert_rule", targetId: input.id, metadata: { threshold: input.threshold, enabled: input.enabled === "true" } });
  revalidatePath("/admin/settings");
}

export async function updateUserRole(formData: FormData) {
  const adminUser = await requireAdmin();
  const input = z.object({ userId: z.string().uuid(), role: z.enum(["user", "admin"]) }).parse({ userId: formData.get("userId"), role: formData.get("role") });
  if (input.userId === adminUser.id) throw new Error("You cannot change your own admin role from this screen.");
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("profiles").update({ role: input.role, updated_at: new Date().toISOString() }).eq("id", input.userId);
  if (error) throw new Error("The user role could not be updated.");
  await recordAdminAudit({ adminUserId: adminUser.id, action: "admin_role_changed", targetType: "user", targetId: input.userId, metadata: { role: input.role } });
  revalidatePath(`/admin/users/${input.userId}`);
  revalidatePath("/admin/users");
}