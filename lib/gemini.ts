// 404 = model not found, 429 = rate limit, 503 = overloaded — all trigger fallback
const SWITCH_ON_STATUS = new Set([404, 429, 503]);
const SWITCH_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildModelList(primary: string): string[] {
  const fallbacks = ['gemini-2.5-flash-lite', 'gemini-2.0-flash'];
  return [primary, ...fallbacks.filter(m => m !== primary)];
}

export async function callGemini(prompt: string, jsonMode = false): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY не настроен в .env.local');
  }

  const models = buildModelList(primaryModel);

  for (let i = 0; i < models.length; i++) {
    const model = models[i];

    if (i > 0) {
      console.log(`[Gemini] переключение на ${model}…`);
      await sleep(SWITCH_DELAY_MS);
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: jsonMode ? { responseMimeType: 'application/json' } : {},
    });

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
    } catch (networkErr) {
      const msg = networkErr instanceof Error ? networkErr.message : String(networkErr);
      console.error(`[Gemini/${model}] сетевая ошибка: ${msg}`);
      if (i === models.length - 1) throw new Error(`Сетевая ошибка: ${msg}`);
      continue;
    }

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini вернул пустой ответ');
      if (i > 0) console.log(`[Gemini/${model}] успех после переключения`);
      return text;
    }

    const status = response.status;
    let errorDetail = '';
    try {
      const errData = await response.json();
      errorDetail = errData?.error?.message ?? '';
    } catch {
      errorDetail = await response.text().catch(() => '');
    }
    console.error(`[Gemini/${model}] HTTP ${status}: ${errorDetail.slice(0, 200)}`);

    if (SWITCH_ON_STATUS.has(status)) {
      if (i < models.length - 1) continue;
      throw new Error('Gemini перегружен. Попробуйте ещё раз через минуту.');
    }

    throw new Error(`Gemini API: ${errorDetail.slice(0, 150) || `ошибка ${status}`}`);
  }

  throw new Error('Gemini перегружен. Попробуйте ещё раз через минуту.');
}
