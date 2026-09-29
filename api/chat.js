const SYSTEM_PROMPT = `Kamu adalah Ahli Botani AI dari aplikasi Ramban oleh Pijak Bumi Learning Indonesia.
Jawab pertanyaan tentang tanaman dalam bahasa Indonesia yang ramah, singkat (maks 3 paragraf), dan mudah dipahami.
Fokus pada: identifikasi tanaman, perawatan, manfaat, toksisitas, ekologi, dan fakta botani menarik.
Jika pertanyaan bukan tentang tanaman, jawab: "Maaf, saya hanya bisa membantu seputar tanaman dan botani. Ada yang ingin ditanyakan tentang tanaman? 🌿"
Akhiri jawaban dengan emoji tanaman yang relevan.`;

// ── API keys dibaca dari Environment Variables Vercel (JANGAN di-hardcode di repo publik) ──
const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || '';

// Provider 1 — Google Gemini (kuota gratis paling besar, dicoba lebih dulu).
// Catatan: gemini-2.0-flash & gemini-2.5-flash-lite sudah dihapus Google (404),
// jadi jangan dipakai lagi. Terverifikasi aktif per deploy ini.
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-flash-lite-latest',
  'gemini-3.5-flash',
  'gemini-flash-latest',
];

// Provider 2 — OpenRouter (cadangan; hanya model :free yang benar-benar aktif)
const OPENROUTER_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'dots-studio/dots-3-note-preview:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
];

const TIMEOUT_MS = 25000;

// Kalau key Gemini invalid/expired, jangan dicoba lagi di request berikutnya
let geminiDisabled = false;

function fromGemini(data) {
  const cand = data && data.candidates && data.candidates[0];
  if (!cand) return null;
  const parts = (cand.content && cand.content.parts) || [];
  const text = parts.map(p => p.text || '').join('').trim();
  return text || null;
}

async function callGemini(messages, model) {
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = ((data.error && data.error.message) || '').slice(0, 120);
    const err = new Error(`gemini ${model} ${res.status}: ${msg}`);
    err.status = res.status;
    err.isAuthError = res.status === 401 || res.status === 403 ||
      (res.status === 400 && /api[\s_-]?key/i.test(msg));
    throw err;
  }
  return fromGemini(data);
}

async function callOpenRouter(messages, model) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ramban.vercel.app',
      'X-Title': 'Ramban Botani App'
    },
    body: JSON.stringify({ model, messages, max_tokens: 800, temperature: 0.7 }),
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || JSON.stringify(data.error) || 'Unknown error';
    const err = new Error(`${model} ${res.status}: ${String(msg).slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  const text = String((data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '').trim();
  return text || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const body = req.body || {};
    const message = body.message;
    const history = Array.isArray(body.history) ? body.history : [];

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Pesan kosong.' });
    }

    const safeMessage = message.slice(0, 500);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
        .filter(h => h && (h.role === 'user' || h.role === 'assistant'))
        .slice(-6)
        .map(h => ({ role: h.role, content: String(h.text || '').slice(0, 500) })),
      { role: 'user', content: safeMessage }
    ];

    let reply = null;
    let usedModel = null;
    const errors = [];

    // ── STEP 1: Gemini ──
    if (GEMINI_KEY && !geminiDisabled) {
      for (const model of GEMINI_MODELS) {
        try {
          reply = await callGemini(messages, model);
          if (reply) { usedModel = 'gemini:' + model; break; }
          errors.push(model + ': empty');
        } catch (err) {
          errors.push(err.message);
          // Hanya matikan Gemini kalau memang key-nya salah/expired,
          // bukan karena model tidak ada (404) atau server ramai (503).
          if (err.isAuthError) {
            geminiDisabled = true;
            break;
          }
        }
      }
    }

    // ── STEP 2: OpenRouter (kalau Gemini belum menjawab) ──
    if (!reply && OPENROUTER_KEY) {
      for (const model of OPENROUTER_MODELS) {
        try {
          reply = await callOpenRouter(messages, model);
          if (reply) { usedModel = 'openrouter:' + model; break; }
          errors.push(model + ': empty');
        } catch (err) {
          errors.push(err.message);
        }
      }
    }

    if (reply) {
      console.log('Ramban chat OK via ' + usedModel);
      return res.status(200).json({ reply: reply, model: usedModel });
    }

    // ── STEP 3: Wikipedia (jalan terakhir, tanpa AI) ──
    console.error('Semua provider AI gagal:', errors.join(' | '));
    const wikiReply = await wikiSearch(safeMessage);
    if (wikiReply) return res.status(200).json({ reply: wikiReply, model: 'wikipedia' });

    return res.status(200).json({
      reply: 'Maaf, layanan AI sedang sibuk. Coba tanya lagi sebentar lagi ya! 🌿',
      model: null
    });

  } catch (err) {
    console.error('Unhandled error:', err.message);
    return res.status(200).json({ reply: 'Terjadi kesalahan server. Coba lagi sebentar ya! 🌿' });
  }
};

async function wikiSearch(query) {
  try {
    const kw = query.replace(/[^a-zA-Z\s]/g, '').split(' ')
      .filter(w => w.length > 3).slice(0, 2).join('_');
    if (!kw) return null;
    const r = await fetch(
      `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(kw)}`,
      { headers: { 'User-Agent': 'RambanApp/1.0' }, signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.extract || d.type === 'disambiguation') return null;
    return `🌿 ${d.title}\n\n${d.extract.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ')}\n\n(Sumber: Wikipedia)`;
  } catch (e) { return null; }
}
