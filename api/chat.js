// ── Module-level system prompt (created once) ──
const SYSTEM_PROMPT = `Kamu adalah Ahli Botani AI dari aplikasi Ramban oleh Pijak Bumi Learning Indonesia.
Jawab pertanyaan tentang tanaman dalam bahasa Indonesia yang ramah, singkat (maks 3 paragraf), dan mudah dipahami.
Fokus pada: identifikasi tanaman, perawatan, manfaat, toksisitas, ekologi, dan fakta botani menarik.
Jika pertanyaan bukan tentang tanaman, jawab: "Maaf, saya hanya bisa membantu seputar tanaman dan botani. Ada yang ingin ditanyakan tentang tanaman? 🌿"
Akhiri jawaban dengan emoji tanaman yang relevan.`;

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

    // Sanitize message length
    const safeMessage = message.slice(0, 500);

    // Build OpenRouter messages — system + last 6 history + current
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history
        .filter(h => h.role === 'user' || h.role === 'assistant')
        .slice(-6)
        .map(h => ({ role: h.role, content: String(h.text || '').slice(0, 500) })),
      { role: 'user', content: safeMessage }
    ];

const openrouter = new OpenRouter({
  apiKey: "<OPENROUTER_API_KEY>"
});

// Stream the response to get reasoning tokens in usage
const stream = await openrouter.chat.send({
  model: "google/gemini-3.5-flash",
  messages: [
    {
      role: "user",
      content: "How many r's are in the word 'strawberry'?"
    }
  ],
  stream: true
});

let response = "";
for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    response += content;
    process.stdout.write(content);
  }

  // Usage information comes in the final chunk
  if (chunk.usage) {
    console.log("\nReasoning tokens:", chunk.usage.reasoningTokens);
  }
}

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || `OpenRouter error ${response.status}`;
      console.error('OpenRouter error:', errMsg);
      // Fallback: Wikipedia quick search
      const wikiReply = await wikiSearch(safeMessage);
      if (wikiReply) return res.status(200).json({ reply: wikiReply, source: 'wikipedia' });
      return res.status(200).json({ reply: 'Maaf, layanan AI sedang sibuk. Coba lagi dalam beberapa saat. 🌿' });
    }

    const reply = data?.choices?.[0]?.message?.content;
    if (!reply) return res.status(200).json({ reply: 'Maaf, tidak ada respons. Coba lagi ya! 🌿' });

    return res.status(200).json({ reply });

  } catch (err) {
    console.error('chat.js error:', err.message);
    return res.status(500).json({ reply: 'Terjadi kesalahan server. Coba lagi nanti. 🌿' });
  }
};

// Wikipedia fallback helper
async function wikiSearch(query) {
  try {
    const keywords = query.replace(/[^a-zA-Z\s]/g, '').split(' ')
      .filter(w => w.length > 3).slice(0, 2).join('_');
    if (!keywords) return null;
    const r = await fetch(
      `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(keywords)}`,
      { headers: { 'User-Agent': 'RambanApp/1.0' } }
    );
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.extract || d.type === 'disambiguation') return null;
    const extract = d.extract.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
    return `🌿 ${d.title}\n\n${extract}\n\n(Sumber: Wikipedia — layanan AI utama sedang tidak tersedia)`;
  } catch { return null; }
}
