import "server-only";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export async function evaluateAdminAlerts() {
  const admin = createAdminSupabaseClient();
  const changes: Array<{ action: "opened" | "resolved"; ruleId: string; ruleName: string; severity: string; observedValue: number }> = [];
  const [{ data: rules }, { data: openIncidents }] = await Promise.all([
    admin.from("alert_rules").select("id, name, metric, comparison, threshold, window_minutes, severity").eq("enabled", true),
    admin.from("alert_incidents").select("id, rule_id").in("status", ["open", "acknowledged"]),
  ]);
  const openByRule = new Map((openIncidents || []).map((incident) => [incident.rule_id, incident.id]));

  for (const rule of rules || []) {
    const { data, error } = await admin.rpc("get_alert_metric", { p_metric: rule.metric, p_window_minutes: rule.window_minutes });
    if (error || data === null) continue;
    const observed = Number(data);
    const breached = rule.comparison === "above" ? observed > Number(rule.threshold) : observed < Number(rule.threshold);
    const incidentId = openByRule.get(rule.id);
    if (breached && !incidentId) {
      const { error: insertError } = await admin.from("alert_incidents").insert({
        rule_id: rule.id,
        observed_value: Number(observed.toFixed(4)),
        message: `${rule.name} is ${rule.comparison} its configured threshold (${observed.toFixed(2)} vs ${rule.threshold}).`,
      });
      if (!insertError) changes.push({ action: "opened", ruleId: rule.id, ruleName: rule.name, severity: rule.severity, observedValue: observed });
    } else if (!breached && incidentId) {
      const { error: updateError } = await admin.from("alert_incidents").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", incidentId);
      if (!updateError) changes.push({ action: "resolved", ruleId: rule.id, ruleName: rule.name, severity: rule.severity, observedValue: observed });
    }
  }
  return changes;
}