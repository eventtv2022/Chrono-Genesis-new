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

// ── Render tier types ─────────────────────────────────────────────────────────
export type RenderTier = "citizen" | "quarter" | "half" | "apex";

// Quality tags escalate with slot prestige
const TIER_QUALITY_TAGS: Record<RenderTier, string> = {
  citizen: "cinematic, 4k, dramatic lighting, high quality",
  quarter: "cinematic, 8k, photorealistic, atmospheric, depth of field, film grain, ultra high quality",
  half:    "cinematic, 8k, photorealistic, volumetric lighting, bokeh, award-winning cinematography, epic scale, ultra high quality",
  apex:    "cinematic, 8k, photorealistic, hyper-detailed, volumetric light shafts, perfect composition, IMAX quality",
};

/** Tier-aware cinematic prompt — higher tiers get richer quality instructions */
export async function generateCinematicPromptTiered(
  seedText: string,
  visualStyle: VisualStyle = "space",
  tier: RenderTier = "citizen"
): Promise<string> {
  const qualityTags = TIER_QUALITY_TAGS[tier];
  const styleDesc = STYLE_DESCRIPTORS[visualStyle];
  const fallback = `${styleDesc}, ${tier === "citizen" ? "calm, atmospheric motion" : "epic, sweeping motion"}, ${qualityTags}`;

  const client = getClient();
  if (!client) {
    logger.info({ visualStyle, tier }, "Gemini not configured — using fallback tiered prompt");
    return fallback;
  }

  const tierNote =
    tier === "apex" ? " Be extremely detailed: elaborate camera movement, rich atmosphere, epic scale." :
    tier === "half" ? " Be highly detailed: describe lighting, mood, and depth carefully." :
    tier === "quarter" ? " Be precise and evocative with atmosphere and lighting." : "";

  const systemInstruction = SYSTEM_PROMPT
    .replace(
      `Always end with cinematic quality tags: "cinematic, 4k, dramatic lighting, high quality".`,
      `Always end with these exact quality tags: "${qualityTags}".${tierNote}`
    );

  try {
    const model = client.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction,
      generationConfig: {
        maxOutputTokens: tier === "apex" ? 120 : tier === "half" ? 100 : 80,
        temperature: tier === "apex" ? 1.0 : tier === "half" ? 0.95 : 0.9,
        topP: 0.95,
      },
    });

    const userPrompt =
      `Visual style: ${styleDesc}\n` +
      `Render tier: ${tier.toUpperCase()}\n` +
      `Citizen seed (Russian): «${seedText.trim().slice(0, 400)}»\n\n` +
      `Generate the cinematic prompt now.`;

    const result = await model.generateContent(userPrompt);
    const text = result.response.text().trim();

    if (!text || text.length < 10) {
      logger.warn({ tier }, "Gemini returned empty tiered prompt, using fallback");
      return fallback;
    }

    logger.info({ visualStyle, tier, promptLength: text.length }, "Tiered cinematic prompt generated");
    return text;
  } catch (err) {
    logger.warn({ err, visualStyle, tier }, "Gemini tiered prompt failed — using fallback");
    return fallback;
  }
}

// ── Multi-Scene Prompts for Prime Time (:00) ─────────────────────────────────

export interface MultiScenePrompts {
  scene1: string;
  scene2: string;
  scene3: string;
}

const MULTI_SCENE_SYSTEM_PROMPT = `You are a cinematic director for TimeNation TV Prime Time broadcast.

TASK: Analyze the citizen's text and split it into 3 distinct visual scenes with a clear narrative arc.
For each scene, write a separate English text-to-video visual prompt.

RULES:
- Output ONLY valid JSON: {"scene1": "...", "scene2": "...", "scene3": "..."}
- Each prompt: 15-25 words, English only, no nested quotes
- Narrative arc: scene1=wide establishing shot, scene2=dynamic movement/development, scene3=peak/transcendent resolution
- Each prompt ends with: "cinematic, 8k, dramatic lighting, ultra quality"
- Scenes should feel VISUALLY DISTINCT (different composition, color palette, or mood)
- Do NOT include text overlays, names, logos, or human faces
- Output ONLY the JSON object — no markdown, no explanations`;

/** Generate 3 scene visual prompts for Prime Time multi-scene montage */
export async function generateMultiScenePrompts(
  seedText: string,
  manifestoText: string,
  visualStyle: VisualStyle = "space"
): Promise<MultiScenePrompts> {
  const styleDesc = STYLE_DESCRIPTORS[visualStyle];
  const qualityTag = TIER_QUALITY_TAGS["apex"];

  const buildFallback = (): MultiScenePrompts => ({
    scene1: `${styleDesc}, wide majestic establishing shot, calm and infinite, ${qualityTag}`,
    scene2: `${styleDesc}, dynamic motion, energy building, dramatic tension, sweeping camera, ${qualityTag}`,
    scene3: `${styleDesc}, epic peak moment, brilliant light burst, transcendent resolution, ${qualityTag}`,
  });

  const client = getClient();
  if (!client) {
    logger.info({ visualStyle }, "Gemini not configured — using fallback multi-scene prompts");
    return buildFallback();
  }

  const contextText = (manifestoText.trim() || seedText.trim()).slice(0, 600);

  const userPrompt =
    `Visual style context: ${styleDesc}\n` +
    `Citizen text (Russian): «${contextText}»\n\n` +
    `Split into 3 scenes. Return ONLY the JSON object.`;

  try {
    const model = client.getGenerativeModel({
      model: "gemini-2.0-flash",
      systemInstruction: MULTI_SCENE_SYSTEM_PROMPT,
      generationConfig: { maxOutputTokens: 300, temperature: 0.95, topP: 0.95 },
    });

    const result = await model.generateContent(userPrompt);
    let raw = result.response.text().trim();
    // Strip markdown code fences if present
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

    const parsed = JSON.parse(raw) as Partial<MultiScenePrompts>;
    if (!parsed.scene1 || !parsed.scene2 || !parsed.scene3) {
      throw new Error("Incomplete JSON from Gemini");
    }

    logger.info(
      { visualStyle, s1: parsed.scene1.slice(0, 50), s2: parsed.scene2.slice(0, 50) },
      "Multi-scene prompts generated via Gemini"
    );
    return { scene1: parsed.scene1, scene2: parsed.scene2, scene3: parsed.scene3 };
  } catch (err) {
    logger.warn({ err }, "Gemini multi-scene failed — using fallback prompts");
    return buildFallback();
  }
}
