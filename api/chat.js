const SYSTEM_PROMPT = `Kamu adalah Ahli Botani AI dari aplikasi Ramban oleh Pijak Bumi Learning Indonesia.
Jawab pertanyaan tentang tanaman dalam bahasa Indonesia yang ramah, singkat (maks 3 paragraf), dan mudah dipahami.
Fokus pada: identifikasi tanaman, perawatan, manfaat, toksisitas, ekologi, dan fakta botani menarik.
Jika pertanyaan bukan tentang tanaman, jawab: "Maaf, saya hanya bisa membantu seputar tanaman dan botani. Ada yang ingin ditanyakan tentang tanaman? 🌿"
Akhiri jawaban dengan emoji tanaman yang relevan.`;

const OPENROUTER_KEY = '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';

// Model fallback chain — try in order until one works
const MODELS = [
  'nex-agi/nex-n2-pro:free',                      // free tier, primary
  'nvidia/llama-nemotron-rerank-vl-1b-v2:free',   // free tier, fallback 1
  'google/gemini-2.5-flash-preview',               // fallback 2
  'google/gemini-2.0-flash-001',                   // fallback 3
  'google/gemini-flash-1.5',                       // fallback 4
  'meta-llama/llama-3.1-8b-instruct:free',         // fallback 5
];

async function callOpenRouter(messages, model) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ramban.vercel.app',
      'X-Title': 'Ramban Botani App'
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 500,
      temperature: 0.7
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`${res.status}: ${data?.error?.message || JSON.stringify(data?.error) || 'Unknown error'}`);
  }
  return data?.choices?.[0]?.message?.content || null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { message, history = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Pesan kosong.' });
    }

    const safeMessage = message.slice(0, 500);
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
        .filter(h => h.role === 'user' || h.role === 'assistant')
        .slice(-6)
        .map(h => ({ role: h.role, content: String(h.text || '').slice(0, 500) })),
      { role: 'user', content: safeMessage }
    ];

    // Try each model in fallback chain
    let reply = null;
    let lastError = '';

    for (const model of MODELS) {
      try {
        reply = await callOpenRouter(messages, model);
        if (reply) {
          console.log(`✓ Used model: ${model}`);
          break;
        }
      } catch (err) {
        lastError = `${model} failed: ${err.message}`;
        console.error(lastError);
      }
    }

    if (reply) {
      return res.status(200).json({ reply });
    }

    // All models failed — try Wikipedia
    console.error('All models failed. Last error:', lastError);
    const wikiReply = await wikiSearch(safeMessage);
    if (wikiReply) return res.status(200).json({ reply: wikiReply });

    return res.status(200).json({
      reply: `Layanan AI sedang tidak tersedia. ${lastError ? 'Error: ' + lastError.slice(0, 100) : ''} 🌿`
    });

  } catch (err) {
    console.error('Unhandled error:', err.message);
    return res.status(500).json({ reply: 'Terjadi kesalahan server: ' + err.message });
  }
};

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
    return `🌿 ${d.title}\n\n${d.extract.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ')}\n\n(Sumber: Wikipedia)`;
  } catch { return null; }
}
