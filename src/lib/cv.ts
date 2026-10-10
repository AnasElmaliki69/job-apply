import type { Analysis } from "./schemas";
// Ignore PDF line wrapping and typographic variants, preserving actual words,
// numbers and skill punctuation. Keep offsets so displayed originals are authentic.
function indexedText(text: string) {
  let normalized = "";
  const offsets: number[] = [];
  let offset = 0;
  for (const char of text) {
    const value = char.normalize("NFKC").toLowerCase()
      .replace(/[‘’]/g, "'").replace(/[\u2010-\u2015]/g, "-");
    for (const part of value) if (!/[\s•·]/u.test(part)) { normalized += part; offsets.push(offset); }
    offset += char.length;
  }
  return { normalized, offsets };
}
export function reconcileCvSources(analysis: Analysis, master: string): Analysis {
  const source = indexedText(master);
  return { ...analysis, tailoredCv: analysis.tailoredCv?.map(block => {
    if (!block.original) return { ...block };
    const excerpt = indexedText(block.original).normalized;
    const index = excerpt ? source.normalized.indexOf(excerpt) : -1;
    if (index < 0) return { ...block, original: "", comparisonUnavailable: true };
    const start = source.offsets[index];
    const last = source.offsets[index + excerpt.length - 1];
    const end = last + (master.codePointAt(last)! > 0xffff ? 2 : 1);
    return { ...block, original: master.slice(start, end), comparisonUnavailable: false };
  }) };
}
export function confirmedSkillsFor(analysis: Analysis, selected: string[]) {
  return [...new Set(selected)].filter(skill => analysis.suggestedSkills?.includes(skill));
}
export function cvText(analysis: Analysis, confirmed: string[] = analysis.confirmedSkills ?? []) {
  const sections = (analysis.tailoredCv ?? []).map(block => `${block.heading}\n${block.revised}`);
  const skills = confirmedSkillsFor(analysis, confirmed);
  if (skills.length) sections.push(`Compétences complémentaires confirmées\n${skills.join(" · ")}`);
  return sections.join("\n\n");
}
