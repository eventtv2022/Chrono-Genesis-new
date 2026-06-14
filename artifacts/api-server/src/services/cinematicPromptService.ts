import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../lib/logger";

// ── Cinematic Prompt System ────────────────────────────────────────────────────
// Converts citizen's Russian seed text into a detailed English text-to-video
// prompt suitable for HuggingFace / Pollinations AI generation.

let _genai: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (_genai) return _genai;
  const key = process.env["GOOGLE_API_KEY"];
  if (!key) return null;
  _genai = new GoogleGenerativeAI(key);
  return _genai;
}

export type VisualStyle = "space" | "cyberpunk" | "abstract" | "nature" | "minimal";

const STYLE_DESCRIPTORS: Record<VisualStyle, string> = {
  space:
    "deep space, cosmic nebula, star clusters, floating galaxies, dark void with luminous " +
    "gas clouds, cinematic astronomy, dramatic cosmic scale",
  cyberpunk:
    "neon-lit megacity, rain-soaked streets, holographic billboards, glowing circuit grids, " +
    "dystopian future, neon purple and cyan, electric atmosphere",
  abstract:
    "flowing abstract shapes, morphing geometric patterns, vibrant color gradients, " +
    "fluid motion, surreal digital art, kaleidoscopic motion",
  nature:
    "lush ancient forest, mist over mountains, flowing rivers, golden hour sunlight " +
    "through canopy, organic life, serene wilderness, epic natural landscape",
  minimal:
    "clean minimalist composition, subtle monochromatic palette, elegant negative space, " +
    "soft light gradients, modern geometric forms, calm and precise",
};

const SYSTEM_PROMPT = `You are a cinematic text-to-video prompt engineer for TimeNation TV.

TASK: Convert the citizen's Russian seed thought into a precise English text-to-video prompt 
suitable for AI video generation models (like text-to-video-ms-1.7b).

RULES:
- Output ONLY the prompt — no explanations, no quotes, no extra text.
- Length: 15–25 words maximum (models work best with concise prompts).
- Language: English only.
- Style: cinematic, atmospheric, photorealistic or high-quality digital art.
- Always end with cinematic quality tags: "cinematic, 4k, dramatic lighting, high quality".
- The prompt should visually evoke the emotion/theme of the seed text, not narrate it literally.
- Focus on visual imagery, motion, atmosphere, lighting — things a camera can capture.
- Do NOT include people's names, text overlays, or logos in the prompt.`;

/** Generate a cinematic English video prompt from Russian seed text */
export async function generateCinematicPrompt(
  seedText: string,
  visualStyle: VisualStyle = "space"
): Promise<string> {
  const styleDesc = STYLE_DESCRIPTORS[visualStyle];
  const fallback = buildFallbackPrompt(seedText, visualStyle, styleDesc);

  const client = getClient();
  if (!client) {
    logger.info({ visualStyle }, "Gemini not configured — using fallback cinematic prompt");
    return fallback;
  }

  const userPrompt =
    `Visual style context: ${styleDesc}\n` +
    `Citizen seed text (Russian): «${seedText.trim().slice(0, 400)}»\n\n` +
    `Generate the cinematic text-to-video prompt now.`;

  try {
    const model = client.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        maxOutputTokens: 80,
        temperature: 0.9,
        topP: 0.95,
      },
    });

    const result = await model.generateContent(userPrompt);
    const text = result.response.text().trim();

    if (!text || text.length < 10) {
      logger.warn({ seedText: seedText.slice(0, 60) }, "Gemini returned empty cinematic prompt, using fallback");
      return fallback;
    }

    logger.info(
      { visualStyle, promptLength: text.length, prompt: text.slice(0, 80) },
      "Cinematic prompt generated via Gemini"
    );
    return text;
  } catch (err) {
    logger.warn({ err, visualStyle }, "Gemini cinematic prompt failed — using fallback");
    return fallback;
  }
}

/** Deterministic fallback prompt without LLM */
function buildFallbackPrompt(
  seedText: string,
  visualStyle: VisualStyle,
  styleDesc: string
): string {
  const wordCount = seedText.trim().split(/\s+/).length;
  const intensity = wordCount > 20 ? "epic, sweeping motion" : "calm, atmospheric motion";
  return `${styleDesc}, ${intensity}, cinematic, 4k, dramatic lighting, high quality`;
}
