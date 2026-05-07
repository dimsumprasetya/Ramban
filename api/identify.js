module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { images } = req.body;
    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'Tidak ada gambar yang dikirim.' });
    }

    // ── KONFIGURASI API DATABYTE ──
    // Sangat disarankan menyimpannya di Vercel Environment Variables
    const apiKey = process.env.DATABYTE_API_KEY || "sk-db-ceVnE7";
    
    // Ganti dengan nama model Vision yang tersedia di dashboard Databyte kamu.
    // Contoh model yang biasanya mendukung gambar: gpt-4o-mini, gpt-4o, atau claude-3-5-sonnet
    const modelName = process.env.DATABYTE_MODEL || "gpt-4o-mini";

    // ── STEP 1: Susun Prompt Instruksi ──
    const promptText = `Kamu adalah ahli botani profesional di Indonesia. 
    Identifikasi tanaman dari gambar berikut dengan detail namun tetap mudah dibaca.
    Berikan informasi dalam bahasa Indonesia dengan format Markdown sebagai berikut:

    **Nama Umum**: [Nama populer & lokal di Indonesia]
    **Nama Ilmiah**: *[Nama Ilmiah]*
    **Genus & Famili**: [Genus] - [Famili]

    ---
    **🌟 Fun Fact**: 
    [Berikan 1 fakta unik atau menarik tentang tanaman ini]

    **🌿 Manfaat Sehari-hari**: 
    [Sebutkan manfaat praktis, kesehatan, atau kegunaannya di lingkungan rumah]

    **🛠️ Kegunaan Lainnya**: 
    [Sebutkan kegunaan lain seperti untuk industri, hiasan, atau filosofi tertentu]

    Jika gambar bukan tanaman, jawab: 'Tanaman tidak dapat diidentifikasi. Mohon unggah foto bagian daun, bunga, atau batang yang lebih jelas.'`;

    // ── STEP 2: Format Payload Data ──
    const content = [
      { type: "text", text: promptText }
    ];

    images.forEach((img) => {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType};base64,${img.imageData}`
        }
      });
    });

    const payload = {
      model: modelName,
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      temperature: 0.3,
      max_tokens: 800
    };

    // ── STEP 3: Tembak ke Endpoint Databyte ──
    // Endpoint standar (OpenAI compatible)
    const url = 'https://ai.databyte.co.id/v1/chat/completions';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error?.message || `Databyte API error ${response.status}` 
      });
    }

    // ── STEP 4: Ambil Balasan ──
    const text = data.choices[0]?.message?.content || "Terjadi kesalahan saat memproses gambar.";

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
