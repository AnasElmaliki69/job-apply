"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Save, FileText } from "lucide-react";
import { useSession } from "@/components/session";
import { Feedback, Heading, Loading } from "@/components/ui";
import { cvSchema, message } from "@/lib/schemas";
export default function Profile() {
  const { client, session } = useSession(); const userId = session?.user.id;
  const [cv, setCv] = useState(""); const [loading, setLoading] = useState(true); const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [attempt, setAttempt] = useState(0);
  useEffect(() => { if (!client || !userId) return; let active = true; setLoading(true); setError(""); void (async () => { try { const { data, error } = await client.from("profiles").select("cv_text").eq("user_id", userId).maybeSingle(); if (error) throw error; if (active) { setCv(data?.cv_text ?? ""); setLoaded(true); } } catch (error) { if (active) setError(message(error)); } finally { if (active) setLoading(false); } })(); return () => { active = false; }; }, [client, userId, attempt]);
  async function importMaster() {
    if (!client || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data.session) throw new Error("Sign in first.");
      const response = await fetch("/api/profile/import", { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCv(result.cvText); setNotice("Your provided PDF was imported and saved as your master CV.");
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!client || !userId || busy) return; setBusy(true); setError(""); setNotice(""); try { const parsed = cvSchema.safeParse(cv); if (!parsed.success) throw new Error(parsed.error.issues[0].message); const { error } = await client.from("profiles").upsert({ user_id: userId, cv_text: parsed.data }, { onConflict: "user_id" }); if (error) throw error; setCv(parsed.data); setNotice("CV saved. You’re ready to analyze an offer."); } catch (error) { setError(message(error)); } finally { setBusy(false); } }
  return <><Heading title="Your profile & CV" subtitle="Your master CV stays saved. Each offer gets its own tailored French version."/><Feedback error={error} notice={notice}/>{loading ? <Loading>Loading your CV...</Loading> : !loaded ? <button className="secondary" onClick={() => setAttempt(attempt + 1)}>Retry</button> : <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]"><form className="card" onSubmit={save}><h2 className="mb-5 flex items-center gap-2 font-semibold"><FileText size={18} className="text-indigo-600"/>Your master CV</h2>{!cv.trim() && <button type="button" className="secondary mb-5" disabled={busy} onClick={importMaster}>Use my provided CV</button>}<label className="label">CV text<textarea className="field min-h-96" value={cv} maxLength={30000} required disabled={busy} onChange={event => { setCv(event.target.value); setNotice(""); }} placeholder="Professional summary\n\nWork experience\n\nEducation\n\nSkills"/></label><div className="mt-5 flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-400">{cv.length.toLocaleString()} / 30,000 characters</span><button className="button" disabled={busy}><Save size={16}/>{busy ? "Saving..." : "Save CV"}</button></div></form><aside className="card"><h2 className="font-semibold">A few useful pointers</h2><ul className="mt-4 list-disc space-y-3 pl-4 text-sm leading-6 text-slate-500"><li>Include your recent experience, education, and skills.</li><li>Keep achievements specific and factual.</li><li>Plain text is all you need for now.</li></ul><p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-5 text-slate-400">When you analyze an offer, your saved CV and the offer text are sent to your configured AI provider (Gemini or OpenAI). Review suggestions before using them.</p></aside></div>}</>;
}
