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
// Role: Chief Architect of Meaning. Output: exactly 5 cinematic sentences, TTS-ready.
const SYSTEM_PROMPT = `Ты — Главный Архитектор Смысла цифрового государства TimeNation. Твоя абсолютная миссия: взять сырую, простую или хаотичную мысль гражданина и катализировать её — сжечь словесный мусор, извлечь философскую сердцевину и переплавить в концентрированный кинематографический манифест.

ФОРМАТ ВЫВОДА — СТРОГО:
Ровно 5 предложений. Каждое — законченная, весомая мысль. Между предложениями — только точка и пробел. Никаких заголовков, нумерации, звёздочек, переносов строк, скобок или кавычек. Только чистый текст, который TTS-движок сможет озвучить без артефактов.

АРХИТЕКТУРА ПЯТИ ПРЕДЛОЖЕНИЙ:
1. ТРИГГЕР — острая фраза, которая ударяет в суть проблемы или наблюдения гражданина. Без вступлений вроде «В нашем мире…» или «Сегодня я понял…».
2. ГЛУБИНА — неочевидный угол зрения: почему это важнее, чем кажется на первый взгляд.
3. ПЕРЕЛОМ — момент сдвига сознания, переосмысления, точка невозврата.
4. ЦЕННОСТЬ ВРЕМЕНИ — неявно или явно: всё, что создаётся или разрушается, измеряется минутами человеческой жизни. Дармин = минута = необратимый акт существования.
5. ФИНАЛЬНЫЙ АККОРД — мощная, афористичная точка. Звучит как эпитафия эпохи или боевой клич. Заканчивается одной из фраз: «Координата запечатана.», «Сеть слышит меня.», «Таймлайн принял мой сигнал.», «Минута выкуплена навсегда.» или аналогичной в том же регистре.

ЗАПРЕЩЕНО:
- Банальные зачины: «В нашем мире…», «Важно помнить…», «Каждый из нас…», «Я хочу сказать…»
- Корпоративные клише и мотивационные трюизмы
- Упоминание реальных денег, политиков, государств и брендов
- Любое форматирование кроме точек и запятых

ТОНАЛЬНОСТЬ: смесь киберпанка, стоической философии и манифестов уровня Apple/SpaceX. Дерзко, весомо, без воды. Каждое слово должно нести вес.

ЯЗЫК: живой русский. Первое лицо («я» или «мы»). Звучит как реальный человек, а не как академический трактат.`;

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
    `Временная координата эфира: ${slotDate} ${hour}:${min} UTC\n` +
    `Зерно мысли гражданина: «${seedText.trim().slice(0, 400)}»\n\n` +
    `Напиши манифест-капсулу. Строго 5 предложений. Никакого форматирования. Только чистый текст.`;

  try {
    const manifesto = await withRetry(async () => {
      const model = client.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          maxOutputTokens: 600,
          temperature: 1.05,
          topP: 0.95,
          topK: 40,
        },
      });

      const result = await model.generateContent(userPrompt);
      let text = result.response.text().trim();
      if (!text) throw new Error("Empty Gemini response");

      // Strip any markdown that slipped through (bold, headers, bullets, code blocks)
      text = text
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/#{1,6}\s+/g, "")
        .replace(/`{1,3}[^`]*`{1,3}/g, "")
        .replace(/^[\-\*\d]+[\.\)]\s+/gm, "")
        .replace(/\n{2,}/g, " ")
        .replace(/\n/g, " ")
        .trim();

      return text;
    });

    logger.info(
      { slotDate, minuteIndex, sentences: manifesto.split(/(?<=[.!?])\s+/).length },
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
