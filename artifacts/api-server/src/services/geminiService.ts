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
// Designed for 60-second voiced broadcast (≈120–140 words at natural Russian speech pace)
const SYSTEM_PROMPT = `Ты — TimeNation Thought Expander, нейронный усилитель голоса гражданина цифрового государства.

ЦЕЛЬ: Взять короткую мысль гражданина и развернуть её в точный 60-секундный манифест о синхронизированном глобальном вещании и суверенитете времени — в точном голосе самого гражданина.

ПРАВИЛА:
- Длина: 120–140 слов. Это ровно 60 секунд звучания при естественном темпе речи.
- Язык: живой русский, первое лицо («я», «мы»). Звучит как живой человек — не как академический манифест.
- Стиль: личный, убеждённый, кинематографически точный. Без пафоса ради пафоса.
- Структура: вступление (2 предл.) → ядро мысли (3–4 предл.) → контекст TimeNation (2 предл.) → финал с зафиксированной координатой (1 предл.).
- Только связный текст, пригодный для озвучки. Никаких заголовков, списков, кавычек, скобок.
- Упомяни: 1440 минут в сутках, глобальное вещание как акт суверенитета.
- НЕ упоминай реальные деньги, реальную политику или конкретные страны.
- Завершить словом о зафиксированном моменте: "Координата запечатана", "Сеть слышит меня", "Таймлайн принял мой сигнал" или аналогичным.`;

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
        model: "gemini-2.0-flash-lite",
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 0.88,
          topP: 0.93,
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
