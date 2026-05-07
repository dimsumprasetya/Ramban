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
    const apiKey = process.env.DATABYTE_API_KEY || "sk-db-Tkd8uDYoISi8gy9QjrDImOgM3kCNWwjjJFKUhDqoMR06IqhA";
    const BASE_URL = "https://ai.databyte.co.id/v1";

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

    // ── STEP 2: Format Payload JSON sesuai standar API OpenAI/Databyte ──
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
      model: "databyte-m1", // Sesuai dengan nama model di kodemu
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      max_tokens: 1024,
      temperature: 0.3
    };

    // ── STEP 3: Tembak ke Endpoint Databyte Menggunakan Fetch (Bukan Requests) ──
    const url = `${BASE_URL}/chat/completions`;

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
        error: data.error?.message || data.message || `Databyte API error ${response.status}: Silakan cek kembali API Key atau limit model.` 
      });
    }

    // ── STEP 4: Ambil Balasan ──
    const text = data.choices?.[0]?.message?.content || "Terjadi kesalahan saat memproses balasan dari server Databyte.";

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
