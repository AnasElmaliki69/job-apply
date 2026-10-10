import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../src/app/api/profile/import/route";
test("private master CV cannot be imported anonymously", async () => {
  const response = await POST(new Request("http://localhost/api/profile/import", { method: "POST" }));
  assert.equal(response.status, 401);
});
test("private master CV rejects another account before reading the file", async () => {
  const names = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "MASTER_CV_OWNER_EMAIL"] as const;
  const previous = names.map(name => process.env[name]); const fetch = globalThis.fetch;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-key";
  process.env.MASTER_CV_OWNER_EMAIL = "owner@example.com";
  globalThis.fetch = async () => Response.json({ id: "other", email: "other@example.com", email_confirmed_at: new Date().toISOString() });
  try {
    const response = await POST(new Request("http://localhost/api/profile/import", { method: "POST", headers: { Authorization: "Bearer token" } }));
    assert.equal(response.status, 403);
  } finally { globalThis.fetch = fetch; names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }); }
});
