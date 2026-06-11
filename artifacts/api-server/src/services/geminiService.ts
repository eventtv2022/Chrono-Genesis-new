import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../lib/logger";

// ── Gemini client (lazy-init, falls back gracefully if key missing) ───────────
let _genai: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI | null {
  if (_genai) return _genai;
  const key = process.env["GOOGLE_API_KEY"];
  if (!key) {
    logger.warn("GOOGLE_API_KEY not set — Gemini manifest generation disabled");
    return null;
  }
  _genai = new GoogleGenerativeAI(key);
  return _genai;
}

// ── System prompt for manifesto generation ────────────────────────────────────
const SYSTEM_PROMPT = `Ты — идеологический архитектор цифрового государства TimeNation.
Твоя задача: превратить зерно мысли гражданина в манифест-капсулу для минуты эфира.

ПРАВИЛА:
- Длина: 100–160 слов. Точно, ёмко, без лишних слов.
- Язык: возвышенный русский, стиль — киберпанк-суверенитет.
- Структура: открытие (2–3 предл.) → ядро (4–5 предл.) → печать (1–2 предл.)
- Никаких списков, заголовков, кавычек внутри текста. Только связный абзацный текст.
- Завершить словами о финальности: "Момент запечатан", "Сеть подтверждает", "Координата зафиксирована" или аналогом.
- НЕ упоминай деньги, не делай политических заявлений реального мира.
- Упоминай TimeNation, Дармины, таймлайн, координату — уместно и органично.`;

// ── Retry with exponential backoff ───────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  baseDelayMs = 1000
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const delay = baseDelayMs * 2 ** i;
      logger.warn({ err, attempt: i + 1, retries }, `Gemini retry in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

// ── Generate manifesto via Gemini ─────────────────────────────────────────────
export async function generateManifesto(
  seedText: string,
  slotDate: string,
  minuteIndex: number
): Promise<string | null> {
  const client = getClient();
  if (!client) return null;

  const hour = String(Math.floor(minuteIndex / 60)).padStart(2, "0");
  const min = String(minuteIndex % 60).padStart(2, "0");

  const userPrompt =
    `Дата эфира: ${slotDate} ${hour}:${min} UTC\n` +
    `Зерно мысли гражданина: «${seedText.trim().slice(0, 400)}»\n\n` +
    `Напиши манифест-капсулу для этой временной координаты.`;

  try {
    const manifesto = await withRetry(async () => {
      const model = client.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 0.85,
          topP: 0.92,
        },
      });

      const result = await model.generateContent(userPrompt);
      const text = result.response.text().trim();
      if (!text) throw new Error("Empty Gemini response");
      return text;
    });

    logger.info(
      { slotDate, minuteIndex, words: manifesto.split(/\s+/).length },
      "Gemini manifesto generated"
    );
    return manifesto;
  } catch (err) {
    logger.error({ err, seedText: seedText.slice(0, 80) }, "Gemini manifest generation failed");
    return null;
  }
}

// ── Check if Gemini is configured ─────────────────────────────────────────────
export function isGeminiConfigured(): boolean {
  return !!process.env["GOOGLE_API_KEY"];
}
