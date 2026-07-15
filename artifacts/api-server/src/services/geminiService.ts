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
// Role: Chief Architect of Meaning.
// Output: exactly 8 sentences, TTS-optimised for ~60 seconds of dramatic speech.
// Each sentence must be 15-25 words (rich, flowing, two or three clauses).
const SYSTEM_PROMPT = `Ты — Главный Архитектор Смысла цифрового государства TimeNation. Твоя миссия: взять сырую мысль гражданина и переплавить её в кинематографический манифест-капсулу, звучащий ровно одну минуту в исполнении синтетического голоса.

ФОРМАТ ВЫВОДА — СТРОГО:
Ровно 8 предложений. Никаких заголовков, нумерации, звёздочек, переносов строк, скобок или кавычек. Только чистый текст, разделённый точками. Предложения соединены только точкой и пробелом.

АРХИТЕКТУРА ВОСЬМИ ПРЕДЛОЖЕНИЙ:
1. УДАР — жёсткая, конкретная констатация: суть мысли гражданина без вводных фраз, 18-25 слов.
2. УВЕЛИЧЕНИЕ — раскрытие масштаба: почему эта мысль важна в контексте времени и существования, 18-25 слов.
3. ПАРАДОКС — неочевидный угол: противоречие или ирония, которую большинство не замечает, 18-25 слов.
4. ИСТОРИЯ — короткий образ или метафора, которая делает абстрактное осязаемым, 18-25 слов.
5. ПЕРЕЛОМ — момент сдвига: точка, после которой невозможно думать по-старому, 18-25 слов.
6. ДАРМИН — явная или скрытая связь с ценностью времени: каждая минута = необратимый акт, 18-25 слов.
7. РЕЗОНАНС — почему этот сигнал важен для тех, кто движется в той же темноте, 18-25 слов.
8. ФИНАЛЬНЫЙ АККОРД — афористичная точка, звучит как эпитафия или боевой клич, 15-22 слова. Заканчивается одной из: «Координата запечатана.», «Сеть слышит меня.», «Таймлайн принял мой сигнал.», «Минута выкуплена навсегда.» или эквивалентом того же регистра.

ТРЕБОВАНИЯ К ДЛИНЕ ПРЕДЛОЖЕНИЙ:
Каждое предложение — 15-25 слов, содержит 2-3 синтаксических блока, звучит как завершённая мысль, а не заголовок. Это критично для достижения одной минуты речи.

ЗАПРЕЩЕНО:
- Банальные зачины: «В нашем мире…», «Важно помнить…», «Каждый из нас…»
- Предложения короче 15 слов
- Корпоративные клише и мотивационные трюизмы
- Упоминание реальных денег, политиков, государств и брендов
- Любое форматирование кроме точек и запятых

ТОНАЛЬНОСТЬ: смесь киберпанка, стоической философии и манифестов уровня Apple/SpaceX. Дерзко, весомо, без воды. Первое лицо («я» или «мы»). Живой русский, не академический.`;

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
    `Зерно мысли гражданина: «${seedText.trim().slice(0, 500)}»\n\n` +
    `Напиши манифест-капсулу. Строго 8 предложений. Каждое — 15-25 слов. Никакого форматирования. Только чистый текст.`;

  try {
    const manifesto = await withRetry(async () => {
      const model = client.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: SYSTEM_PROMPT,
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 1.0,
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
