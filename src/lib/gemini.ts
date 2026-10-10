import { AnalysisError, analysisInstructions, outputSchema, parseAnalysis } from "./openai";
import type { Analysis } from "./schemas";
type GeminiResponse = {
  promptFeedback?: { blockReason?: string };
  candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
};
export function parseGeminiAnalysis(result: GeminiResponse): Analysis {
  if (result.promptFeedback?.blockReason) throw new AnalysisError("Gemini could not analyze this content. Review the CV and offer.", 422);
  const candidate = result.candidates?.[0];
  if (!candidate || candidate.finishReason !== "STOP") throw new AnalysisError("Gemini did not finish the analysis. Please try again with a shorter offer.", 502);
  const text = candidate.content?.parts?.filter(part => !part.thought).map(part => part.text ?? "").join("") ?? "";
  return parseAnalysis({ status: "completed", output: [{ content: [{ type: "output_text", text }] }] });
}
export async function analyzeWithGemini(input: { cvText: string; jobTitle: string; company: string; jobOfferText: string }, key: string): Promise<Analysis> {
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  if (!/^gemini-[a-zA-Z0-9.-]+$/.test(model)) throw new AnalysisError("Check GEMINI_MODEL in .env.local.", 503);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(90000),
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: analysisInstructions }] },
      contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: outputSchema, maxOutputTokens: 16000 }
    })
  });
  if (!response.ok) {
    if (response.status === 429) throw new AnalysisError("Gemini quota or rate limit reached. Check this model's limits in Google AI Studio; retry later or choose another available model.", 429);
    if (response.status === 400 || response.status === 401 || response.status === 403) throw new AnalysisError("Gemini rejected the request. Check GEMINI_API_KEY, model access, API key restrictions, and project availability in Google AI Studio.", 502);
    if (response.status === 404) throw new AnalysisError("This Gemini model is unavailable. Set GEMINI_MODEL to a model available to your project and restart the app.", 502);
    throw new AnalysisError("Gemini could not complete the analysis. Please try again later.", 502);
  }
  return parseGeminiAnalysis(await response.json() as GeminiResponse);
}
