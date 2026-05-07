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

    const apiKey = "AIzaSyAJ5XHkQXtaU9y6zD-h9k-LJcMpXg4NpqI";

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

    const parts = [{ text: promptText }];

    images.forEach((img) => {
      let mimeType = img.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: img.imageData 
        }
      });
    });

    const payload = {
      contents: [{ parts: parts }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 800, 
      }
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error?.message || `Gemini API error ${response.status}` 
      });
    }

    const text = data.candidates[0]?.content?.parts[0]?.text || "Maaf, terjadi kendala saat menganalisis gambar.";

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
