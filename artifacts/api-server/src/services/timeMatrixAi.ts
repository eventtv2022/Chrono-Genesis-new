import { GoogleGenAI } from "@google/genai";

export type TimeMatrixTitleCheck = { valid: true } | { valid: false; reason: string };

export async function checkQuadrantBTitle(title: string, lang = "ru"): Promise<TimeMatrixTitleCheck> {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  if (!apiKey || !baseUrl) throw new Error("Gemini AI integration is not configured");

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: "", baseUrl },
  });
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Determine whether this Quadrant B task title is a meaningful, specific, actionable task that is both important and urgent. Reject vague placeholders, spam, repeated characters, non-task phrases, and titles that do not describe an action. Do not judge the user's worth or infer sensitive traits. Return only JSON: {"valid": boolean, "reason": string}. Keep reason brief and in ${lang === "ru" ? "Russian" : "English"}.\nTitle: ${JSON.stringify(title)}`,
    config: { responseMimeType: "application/json" },
  });
  const raw = result.text?.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "") ?? "";
  const parsed = JSON.parse(raw) as { valid?: unknown; reason?: unknown };
  if (typeof parsed.valid !== "boolean") throw new Error("Gemini returned an invalid title-check result");
  return parsed.valid
    ? { valid: true }
    : { valid: false, reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 240) : "" };
}
