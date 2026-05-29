// ── Module-level constants (created once per cold start) ──
const SYSTEM_PROMPT = `Kamu adalah Ahli Botani AI dari aplikasi Ramban oleh Pijak Bumi Learning Indonesia.
Jawab pertanyaan tentang tanaman dalam bahasa Indonesia yang ramah, singkat (maks 3 paragraf), dan mudah dipahami.
Fokus pada: identifikasi tanaman, perawatan, manfaat, toksisitas, ekologi, dan fakta botani menarik.
Jika pertanyaan bukan tentang tanaman, jawab: "Maaf, saya hanya bisa membantu seputar tanaman dan botani. Ada yang ingin ditanyakan tentang tanaman? 🌿"
Akhiri jawaban dengan emoji tanaman yang relevan.`;

const OPENROUTER_KEY = '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';
const MODEL = 'google/gemini-2.5-flash-preview';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { message, history = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Pesan kosong atau tidak valid.' });
    }

    const safeMessage = message.slice(0, 500);

    // Build messages: system + last 6 history + current question
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
        .filter(h => h.role === 'user' || h.role === 'assistant')
        .slice(-6)
        .map(h => ({ role: h.role, content: String(h.text || '').slice(0, 500) })),
      { role: 'user', content: safeMessage }
    ];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://ramban.vercel.app',
        'X-Title': 'Ramban Botani App'
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: 500,
        temperature: 0.7
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('OpenRouter error:', data?.error?.message || response.status);
      // Fallback to Wikipedia if AI unavailable
      const fallback = await wikiSearch(safeMessage);
      if (fallback) return res.status(200).json({ reply: fallback });
      return res.status(200).json({
        reply: 'Maaf, layanan AI sedang sibuk. Coba lagi dalam beberapa saat. 🌿'
      });
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) {
      return res.status(200).json({ reply: 'Maaf, tidak ada respons. Coba lagi ya! 🌿' });
    }

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('chat.js error:', err.message);
    return res.status(500).json({ reply: 'Terjadi kesalahan server. Coba lagi nanti. 🌿' });
  }
};

// Wikipedia fallback — no API key needed
async function wikiSearch(query) {
  try {
    const kw = query.replace(/[^a-zA-Z\s]/g, '').split(' ')
      .filter(w => w.length > 3).slice(0, 2).join('_');
    if (!kw) return null;
    const r = await fetch(
      `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(kw)}`,
      { headers: { 'User-Agent': 'RambanApp/1.0' } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.extract || d.type === 'disambiguation') return null;
    return `🌿 ${d.title}\n\n${d.extract.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ')}\n\n(Sumber: Wikipedia — layanan AI sedang tidak tersedia)`;
  } catch { return null; }
}
