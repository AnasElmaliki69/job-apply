import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import type { Analysis } from "./schemas";
import { confirmedSkillsFor } from "./cv";

// Match the master CV's A4 paper, navy typography and blue section rules.
const W = 595.28, H = 841.89, M = 39;
const navy = rgb(0.08, 0.17, 0.28), blue = rgb(0.08, 0.35, 0.72);
export function printableText(text: string, font: PDFFont) {
  const normalized = text.normalize("NFC").replace(/[\u00a0\u202f]/g, " ")
    .replace(/[\u2010-\u2015]/g, "-").replace(/→/g, "->").replace(/←/g, "<-");
  return Array.from(normalized).map(char => {
    if (char === "\n" || char === "\r") return char;
    try { font.encodeText(char); return char; } catch { return "?"; }
  }).join("");
}
function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of printableText(text, font).split(/\r?\n/)) {
    if (/^\s*[•·]\s*$/.test(paragraph)) continue;
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const char of word) {
        if (font.widthOfTextAtSize(line + char, size) > width && line) { lines.push(line); line = ""; }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
// Recover the hierarchy of the supplied Word CV without changing stored wording.
export function cvParagraphs(heading: string, text: string) {
  const entries = /expérience|experience|projet|formation|éducation/i.test(heading);
  let afterTitle = false;
  return text.split(/\r?\n/).filter(value => value.trim() && !/^\s*[•·]\s*$/.test(value)).map(value => {
    const bullet = /^\s*[•·*-]\s+/.test(value);
    let content = value.trim().replace(/^\s*[•·*-]\s+/, "");
    let date = "";
    if (entries && !bullet) {
      const split = content.match(/^(.*?)\t+([^\t]*(?:19|20)\d{2}[^\t]*)$/)
        ?? content.match(/^(.*?)\s*(?:\s+[–—|]\s+|\s{2,})((?:[A-Za-zÀ-ÿ]+\s+)?(?:19|20)\d{2}.*)$/)
        ?? content.match(/^(.*?)\s+((?:Janvier|Février|Mars|Avril|Mai|Juin|Juillet|Août|Septembre|Octobre|Novembre|Décembre)\s+[–—-]\s+[A-Za-zÀ-ÿ]+\s+(?:19|20)\d{2}.*)$/i)
        ?? content.match(/^(.*?)\s+((?:19|20)\d{2}(?:\s*[–—-]\s*(?:19|20)\d{2})?(?:\s*\(en cours\))?)$/);
      if (split && split[1].trim()) { content = split[1].trim(); date = split[2].trim(); }
    }
    const title = !!date;
    const italic = afterTitle && /expérience|experience/i.test(heading) && !bullet && !title && !/^[^:]{1,60}:/.test(content);
    afterTitle = title;
    const label = content.match(/^([^:]{1,65}\s*:\s*)/);
    return { text: content, date, title, italic, bullet: bullet || (!title && !italic && entries && !/formation|éducation/i.test(heading)) || /^certif/i.test(heading), label: label?.[1] ?? "" };
  });
}
export async function buildCvPdf(analysis: Analysis): Promise<Uint8Array> {
  if (!analysis.tailoredCv?.length) throw new Error("Analyze the offer again to generate a tailored PDF CV.");
  const doc = await PDFDocument.create();
  doc.setTitle("CV adapté à l’offre"); doc.setSubject("Curriculum vitae"); doc.setLanguage("fr-FR");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const blocks = analysis.tailoredCv.map(block => ({ ...block }));
  const skills = confirmedSkillsFor(analysis, analysis.confirmedSkills ?? []);
  if (skills.length) blocks.push({ heading: "Compétences complémentaires", revised: skills.join(" · "), original: "", reason: "" });
  let page = doc.addPage([W, H]), y = H - M;
  function ensure(height: number) {
    if (y - height < M + 12) { page = doc.addPage([W, H]); y = H - M; }
  }
  function line(text: string, size: number, font = regular, centered = false, color = navy) {
    ensure(size * 1.22);
    const safe = printableText(text, font);
    const width = font.widthOfTextAtSize(safe, size);
    page.drawText(safe, { x: centered ? (W - width) / 2 : M, y: y - size, size, font, color });
    y -= size * 1.22;
  }
  function body(heading: string, text: string, x: number, width: number, start: number, paginate: boolean) {
    let cursor = start;
    for (const item of cvParagraphs(heading, text)) {
      const size = item.title ? 9.5 : 8.8;
      const font = item.title ? bold : item.italic ? italic : regular;
      const indent = item.bullet ? 10 : 0;
      const date = printableText(item.date, regular);
      const dateWidth = date ? regular.widthOfTextAtSize(date, 8.5) + 14 : 0;
      // Reserve a date column only when it leaves enough space for a title.
      const separateDate = dateWidth > width * 0.48;
      const lines = wrap(item.text, item.label ? bold : font, size, width - indent - (separateDate ? 0 : dateWidth));
      for (const [index, value] of lines.entries()) {
        if (paginate) { y = cursor; ensure(size * 1.22 + (item.title && index === 0 ? 25 : 0)); cursor = y; }
        if (item.bullet && index === 0) page.drawText("•", { x, y: cursor - size, size, font: regular, color: blue });
        const label = !item.title && !item.italic && index === 0 && value.startsWith(item.label) ? item.label : "";
        if (label) {
          page.drawText(label, { x: x + indent, y: cursor - size, size, font: bold, color: navy });
          page.drawText(value.slice(label.length), { x: x + indent + bold.widthOfTextAtSize(label, size), y: cursor - size, size, font, color: navy });
        } else page.drawText(value, { x: x + indent, y: cursor - size, size, font, color: navy });
        if (date && index === 0 && !separateDate) page.drawText(date, { x: x + width - dateWidth + 14, y: cursor - size, size: 8.5, font: regular, color: rgb(.35, .39, .44) });
        cursor -= size * 1.22;
      }
      if (date && separateDate) {
        for (const value of wrap(date, regular, 8.5, width)) {
          if (paginate) { y = cursor; ensure(11); cursor = y; }
          page.drawText(value, { x, y: cursor - 8.5, size: 8.5, font: regular, color: navy }); cursor -= 11;
        }
      }
      cursor -= item.title ? 2 : 0;
    }
    return cursor;
  }
  const first = blocks[0];
  const identity = /identit|coordonn|contact|en.t.te/i.test(first.heading);
  if (identity) {
    const header = first.revised.split(/\r?\n/).filter(part => part.trim());
    for (let i = 0; i < header.length; i++) {
      const size = i === 0 ? 20 : i === 1 ? 10.5 : 9;
      const font = i < 2 ? bold : regular;
      for (const text of wrap(header[i], font, size, W - M * 2)) line(text, size, font, true, i === 1 ? blue : navy);
    }
    y -= 12; blocks.shift();
  }
  const footer = blocks.filter(block => /^(certifications?|langues?|centres? d.intérêt)$/i.test(block.heading.trim()));
  const columnWidth = (W - M * 2 - 16) / 2;
  const columnHeight = (group: typeof blocks) => group.reduce((height, block) => height + 28 + cvParagraphs(block.heading, block.revised).reduce((sum, item) => sum + wrap(item.text, bold, 8.8, columnWidth - 10).length * 8.8 * 1.22 + 3, 0), 0);
  const left = footer.filter(block => /^certif/i.test(block.heading));
  const right = footer.filter(block => !/^certif/i.test(block.heading));
  const footerHeight = Math.max(columnHeight(left), columnHeight(right));
  const columnsFit = footer.length > 1 && left.length > 0 && footerHeight < H - 2 * M - 12;
  // A long CV flows onto another page rather than clipping or deleting facts.
  for (const block of blocks) {
    if (columnsFit && footer.includes(block)) continue;
    const headings = wrap(block.heading.toLocaleUpperCase("fr"), bold, 10.5, W - M * 2);
    ensure(headings.length * 15 + 35);
    for (const heading of headings) line(heading, 10.5, bold);
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: W - M, y: y - 2 }, thickness: 1.25, color: blue });
    y -= 8;
    y = body(block.heading, block.revised, M, W - M * 2, y, true);
    y -= 5;
  }
  if (columnsFit) {
    ensure(footerHeight);
    const top = y;
    for (const [index, group] of [left, right].entries()) {
      let cursor = top;
      const x = M + index * (columnWidth + 16);
      for (const block of group) {
        page.drawText(printableText(block.heading.toLocaleUpperCase("fr"), bold), { x, y: cursor - 10.5, size: 10.5, font: bold, color: navy });
        cursor -= 16;
        page.drawLine({ start: { x, y: cursor }, end: { x: x + columnWidth, y: cursor }, thickness: 1.25, color: blue });
        cursor -= 6;
        cursor = body(block.heading, block.revised, x, columnWidth, cursor, false);
        cursor -= 6;
      }
    }
  }
  if (doc.getPageCount() > 1) for (const [index, item] of doc.getPages().entries()) {
    item.drawText(`${index + 1} / ${doc.getPageCount()}`, { x: W - M - 30, y: 20, size: 8, font: regular, color: navy });
  }
  return doc.save();
}
