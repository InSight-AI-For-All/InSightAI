import { beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserClient } = vi.hoisted(() => ({ createBrowserClient: vi.fn(() => ({ auth: {} })) }));
vi.mock("@supabase/ssr", () => ({ createBrowserClient }));
vi.mock("@/lib/env", () => ({ getPublicSupabaseEnvironment: () => ({ url: "https://project.supabase.co", anonKey: "sb_publishable_test" }) }));

describe("browser Supabase session", () => {
  beforeEach(() => createBrowserClient.mockClear());

  it("uses one persistent, auto-refreshing browser client", async () => {
    const { createBrowserSupabaseClient } = await import("./client");
    const first = createBrowserSupabaseClient();
    const second = createBrowserSupabaseClient();
    expect(first).toBe(second);
    expect(createBrowserClient).toHaveBeenCalledOnce();
    expect(createBrowserClient).toHaveBeenCalledWith("https://project.supabase.co", "sb_publishable_test", {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  });
});