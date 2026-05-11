module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { message, history = [] } = req.body || {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Pesan kosong.' });
    }

    // ── Cari info Wikipedia sebagai konteks tambahan (opsional) ──
    let wikiContext = '';
    try {
      const keywords = String(message)
        .replace(/[^a-zA-Z\s]/g, '')
        .split(' ')
        .filter(w => w.length > 3)
        .slice(0, 2)
        .join(' ');

      if (keywords) {
        const wikiRes = await fetch(
          `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(keywords.replace(/ /g, '_'))}`,
          { headers: { 'User-Agent': 'RambanApp/1.0' } }
        );
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          if (wikiData.extract && wikiData.type !== 'disambiguation') {
            wikiContext = wikiData.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
          }
        }
      }
    } catch (_) { /* lanjut tanpa wiki context */ }

    const systemPrompt = `Kamu adalah Ahli Botani AI dari aplikasi Ramban oleh Pijak Bumi Learning Indonesia.
Jawab pertanyaan tentang tanaman dalam bahasa Indonesia yang ramah, singkat (maks 3 paragraf), dan mudah dipahami masyarakat umum.
Fokus pada: identifikasi tanaman, cara perawatan, manfaat, toksisitas & keamanan, ekologi, dan fakta botani menarik.
Jika ada informasi Wikipedia berikut, gunakan sebagai referensi tambahan: "${wikiContext || 'Tidak tersedia'}"
Jika pertanyaan bukan tentang tanaman atau alam, jawab: "Maaf, saya hanya bisa membantu seputar tanaman dan botani. Ada yang ingin ditanyakan tentang tanaman? 🌿"
Akhiri jawaban dengan emoji tanaman yang relevan.`;

    const trimmedHistory = Array.isArray(history) ? history.slice(-6) : [];


    async function askGPT55() {
      const openAIKey = process.env.OPENAI_API_KEY;
      if (!openAIKey) throw new Error('OPENAI_API_KEY belum diatur');

      const model = process.env.OPENAI_MODEL || 'gpt-5.5';
      const messages = [
        { role: 'system', content: systemPrompt },
        ...trimmedHistory
          .filter(h => h && (h.role === 'user' || h.role === 'assistant'))
          .map(h => ({ role: h.role, content: h.text })),
        { role: 'user', content: String(message) }
      ];

      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openAIKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 500,
          temperature: 0.7
        })
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error?.message || `GPT-5.5 error ${resp.status}`);
      }

      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('GPT-5.5 tidak mengembalikan konten');
      return text;
    }

    async function askCobuddy() {
      const openRouterKey = process.env.OPENROUTER_API_KEY;
      if (!openRouterKey) throw new Error('OPENROUTER_API_KEY belum diatur');

      const model = process.env.COBUDDY_MODEL || 'baidu/cobuddy:free';
      const messages = [
        { role: 'system', content: systemPrompt },
        ...trimmedHistory
          .filter(h => h && (h.role === 'user' || h.role === 'assistant'))
          .map(h => ({ role: h.role, content: h.text })),
        { role: 'user', content: String(message) }
      ];

      const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_ORIGIN || 'https://ramban.vercel.app',
          'X-Title': 'Ramban Botani App'
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: 500,
          temperature: 0.7
        })
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error?.message || `Cobuddy error ${resp.status}`);
      }

      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error('Cobuddy tidak mengembalikan konten');
      return text;
    }

    async function askGemini() {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) throw new Error('GEMINI_API_KEY belum diatur');

      const contents = trimmedHistory
        .filter(h => h && (h.role === 'user' || h.role === 'assistant'))
        .map(h => ({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.text }]
        }));

      contents.push({ role: 'user', parts: [{ text: String(message) }] });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
      const payload = {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { temperature: 0.6, maxOutputTokens: 400 }
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data?.error?.message || `Gemini error ${resp.status}`);
      }

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Gemini tidak mengembalikan konten');
      return text;
    }

    // ── Sistem saling mendukung: GPT-5.5 -> Cobuddy -> Gemini -> Wikipedia fallback ──
    const errors = [];

    try {
      const reply = await askGPT55();
      return res.status(200).json({ reply, source: 'gpt-5.5', wikiContext: wikiContext || null });
    } catch (e) {
      errors.push(`gpt-5.5: ${e.message}`);
    }

    try {
      const reply = await askCobuddy();
      return res.status(200).json({ reply, source: 'cobuddy', wikiContext: wikiContext || null });
    } catch (e) {
      errors.push(`cobuddy: ${e.message}`);
    }

    try {
      const reply = await askGemini();
      return res.status(200).json({ reply, source: 'gemini', wikiContext: wikiContext || null });
    } catch (e) {
      errors.push(`gemini: ${e.message}`);
    }

    if (wikiContext) {
      return res.status(200).json({
        reply: `Saya belum bisa menghubungi AI utama saat ini. Berdasarkan Wikipedia: ${wikiContext} 🌿`,
        source: 'wikipedia',
        warning: errors.join(' | ')
      });
    }

    return res.status(503).json({
      error: 'Semua layanan AI sedang tidak tersedia. Silakan coba lagi beberapa saat.',
      details: errors
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
