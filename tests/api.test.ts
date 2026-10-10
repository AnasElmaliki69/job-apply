import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/analyze/route";

test("anonymous analysis request is rejected before any external calls", async () => {
  const response = await POST(new Request("http://localhost/api/analyze", { method: "POST" }));
  assert.equal(response.status, 401);
});

test("server validates user and loads their CV before calling AI", async () => {
  const originalFetch = globalThis.fetch;
  const names = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "OPENAI_API_KEY"] as const;
  const previous = names.map(name => process.env[name]);
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-public-key";
  process.env.OPENAI_API_KEY = "test-ai-key";
  const requests: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input); requests.push(url);
    if (url.includes("/auth/v1/user")) return Response.json({ id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
    if (url.includes("/rest/v1/profiles")) return Response.json([]);
    throw new Error("AI must not be called without a saved CV");
  };
  try {
    const response = await POST(new Request("http://localhost/api/analyze", {
      method: "POST", headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ jobTitle: "Developer", company: "Acme", jobOfferText: "React experience required." })
    }));
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /Save your CV/);
    assert.equal(requests.length, 2);
    assert.match(requests[1], /user_id=eq\.11111111/);
  } finally {
    globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; });
  }
});
