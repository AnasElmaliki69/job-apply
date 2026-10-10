"use client";
import { useState } from "react";
import { Download, Save } from "lucide-react";
import { useSession } from "./session";
import { Feedback } from "./ui";
import { message, type Application } from "@/lib/schemas";
import { confirmedSkillsFor } from "@/lib/cv";

export function TailoredCv({ app, onSaved }: { app: Application; onSaved: (app: Application) => void }) {
  const { client, session } = useSession();
  const a = app.ai_analysis;
  const [selected, setSelected] = useState(a.confirmedSkills ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [comparison, setComparison] = useState(true);
  if (!a.tailoredCv) return <section className="card"><h2 className="font-semibold">Tailored French CV</h2><p className="mt-3 text-sm text-slate-500">This application was created before CV tailoring was added. Analyze the offer again to create a French CV.</p></section>;
  const confirmed = confirmedSkillsFor(a, selected);
  const toDevelop = (a.suggestedSkills ?? []).filter(skill => !confirmed.includes(skill));
  const dirty = JSON.stringify(confirmed) !== JSON.stringify(a.confirmedSkills ?? []);
  async function save() {
    if (!client || !session || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const { data, error } = await client.from("applications").update({ ai_analysis: { ...a, confirmedSkills: confirmed } }).eq("id", app.id).eq("user_id", session.user.id).eq("updated_at", app.updated_at).select("*").maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("This application changed elsewhere. Reload before saving.");
      onSaved(data as Application); setNotice("Confirmed skills saved for this application.");
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  async function download() {
    if (!client || busy || dirty) return;
    setBusy(true); setError("");
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      if (!data.session) throw new Error("Sign in to download your CV.");
      const response = await fetch(`/api/applications/${app.id}/pdf`, { method: "POST", headers: { Authorization: `Bearer ${data.session.access_token}` } });
      if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Could not download your CV."); }
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement("a");
      link.href = url; link.download = `CV-fr-${app.company.replace(/[^a-zA-Z0-9_-]/g, "-")}.pdf`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  return <section className="card space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Your tailored French CV</h2><p className="mt-2 text-xs text-slate-500">Your master CV stays unchanged. Highlighted paragraphs were rewritten for this offer.</p></div><button className="secondary" onClick={download} disabled={dirty || busy}><Download size={15}/>{busy ? "Preparing..." : "Download CV (PDF)"}</button></div>
    <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={comparison} onChange={event => setComparison(event.target.checked)}/>Show original text and changes</label>
    {a.masterCvText && comparison && <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">Original master CV at analysis time</summary><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-500">{a.masterCvText}</p></details>}
    <div lang="fr" className="space-y-5">{a.tailoredCv.map((block, index) => {
      const changed = block.original !== block.revised;
      return <section key={index}><h3 className="mb-2 font-semibold">{block.heading}</h3><div className={comparison ? "grid gap-3 xl:grid-cols-2" : ""}>{comparison && <div className="rounded-xl bg-slate-50 p-4"><p className="mb-2 text-xs text-slate-400">Original</p><p className="whitespace-pre-wrap text-sm leading-6 text-slate-500">{block.comparisonUnavailable ? "Exact excerpt unavailable — compare with the original master CV above." : block.original || "Nouvelle synthèse de votre expérience existante."}</p></div>}<div className={`rounded-xl p-4 ${comparison && changed ? "border border-amber-200 bg-amber-50" : "bg-white"}`}><p className="whitespace-pre-wrap text-sm leading-6">{block.revised}</p>{comparison && changed && <p className="mt-3 border-t border-amber-200 pt-3 text-xs leading-5 text-amber-800">{block.reason}</p>}</div></div></section>;
    })}</div>
    {!!a.suggestedSkills?.length && <div className="border-t border-slate-100 pt-5"><h3 className="font-semibold">Suggested skills — confirm your experience</h3><p className="mt-2 text-xs leading-5 text-slate-500">Select only skills you already have. Unchecked suggestions stay under “Compétences à développer” and are excluded from your CV. Save before downloading.</p><div className="mt-4 space-y-3">{a.suggestedSkills.map(skill => <label key={skill} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={confirmed.includes(skill)} disabled={busy} onChange={event => { setSelected(event.target.checked ? [...confirmed, skill] : confirmed.filter(item => item !== skill)); setNotice(""); }}/><span lang="fr">{skill}</span></label>)}</div><button className="button mt-4" disabled={busy || !dirty} onClick={save}><Save size={15}/>{busy ? "Saving..." : "Save confirmed skills"}</button></div>}
    {!!confirmed.length && <div lang="fr"><h3 className="font-semibold">Compétences complémentaires confirmées</h3><p className="mt-2 text-sm">{confirmed.join(" · ")}</p></div>}
    {!!toDevelop.length && <div lang="fr" className="rounded-xl bg-slate-50 p-4"><h3 className="text-sm font-semibold">Compétences à développer</h3><p className="mt-2 text-sm text-slate-500">{toDevelop.join(" · ")}</p><p className="mt-2 text-xs text-slate-400">Ces suggestions ne figurent pas dans le CV exporté.</p></div>}
    <Feedback error={error} notice={notice}/>
  </section>;
}
