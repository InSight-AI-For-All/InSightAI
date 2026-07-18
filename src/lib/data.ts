import { categories, factCheckResultSchema, verdicts, type FactCheckResult, type InputType } from "@/lib/fact-check/schema";
import { getPlan } from "@/lib/plans";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type FactCheckRow = {
  id: string;
  input_type: InputType;
  raw_text: string | null;
  submitted_url: string | null;
  screenshot_path: string | null;
  verdict: string;
  truth_score: number;
  confidence_score: number;
  category: string;
  claim_type: string;
  summary: string;
  analysis_json: unknown;
  created_at: string;
};

export type FactCheckRecord = {
  id: string;
  inputType: InputType;
  rawText: string | null;
  submittedUrl: string | null;
  screenshotPath: string | null;
  verdict: FactCheckResult["verdict"];
  truthScore: number;
  confidenceScore: number;
  category: FactCheckResult["category"];
  claimType: FactCheckResult["claimType"];
  summary: string;
  result: FactCheckResult;
  createdAt: string;
};

function mapFactCheck(row: FactCheckRow): FactCheckRecord | null {
  const result = factCheckResultSchema.safeParse(row.analysis_json);
  if (!result.success) return null;

  return {
    id: row.id,
    inputType: row.input_type,
    rawText: row.raw_text,
    submittedUrl: row.submitted_url,
    screenshotPath: row.screenshot_path,
    verdict: result.data.verdict,
    truthScore: result.data.truthScore,
    confidenceScore: result.data.confidenceScore,
    category: result.data.category,
    claimType: result.data.claimType,
    summary: result.data.summary,
    result: result.data,
    createdAt: row.created_at,
  };
}

export async function getFactChecks(
  userId: string,
  filters: { query?: string; verdict?: string; category?: string; from?: string } = {},
) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("fact_checks")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (verdicts.includes(filters.verdict as (typeof verdicts)[number])) {
    query = query.eq("verdict", filters.verdict as string);
  }
  if (categories.includes(filters.category as (typeof categories)[number])) {
    query = query.eq("category", filters.category as string);
  }
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    query = query.gte("created_at", `${filters.from}T00:00:00.000Z`);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const records = (data as FactCheckRow[])
    .map(mapFactCheck)
    .filter((record): record is FactCheckRecord => record !== null);
  const search = filters.query?.trim().toLocaleLowerCase();
  if (!search) return records;

  return records.filter((record) =>
    [record.summary, record.rawText, record.submittedUrl, ...record.result.keyClaims]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase().includes(search)),
  );
}

export async function getFactCheck(userId: string, id: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("fact_checks")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapFactCheck(data as FactCheckRow);
}

export async function getDashboardOverview(userId: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;

  const [profileResponse, usageResponse, checks] = await Promise.all([
    supabase.from("profiles").select("full_name, plan").eq("id", userId).maybeSingle(),
    supabase
      .from("usage_counters")
      .select("free_used, monthly_used, reset_at")
      .eq("user_id", userId)
      .maybeSingle(),
    getFactChecks(userId),
  ]);
  if (profileResponse.error || usageResponse.error || !profileResponse.data || !usageResponse.data) {
    return null;
  }

  const plan = getPlan(profileResponse.data.plan);
  const monthlyUsageExpired = new Date(usageResponse.data.reset_at).getTime() <= Date.now();
  const used = plan.id === "starter" && !monthlyUsageExpired
    ? usageResponse.data.monthly_used
    : plan.id === "free"
      ? usageResponse.data.free_used
      : 0;

  return {
    fullName: profileResponse.data.full_name as string | null,
    plan,
    used,
    remaining: Math.max(0, plan.limit - used),
    totalChecks: checks.length,
    averageTruth: checks.length
      ? Math.round(checks.reduce((total, check) => total + check.truthScore, 0) / checks.length)
      : null,
    needsReview: checks.filter((check) => check.truthScore < 50).length,
    topCategory: Object.entries(
      checks.reduce<Record<string, number>>((totals, check) => {
        totals[check.category] = (totals[check.category] || 0) + 1;
        return totals;
      }, {}),
    ).sort(([, left], [, right]) => right - left)[0]?.[0] || null,
    recentChecks: checks.slice(0, 5),
  };
}