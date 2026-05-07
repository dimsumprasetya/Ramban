module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { images } = req.body;
    if (!images || images.length === 0)
      return res.status(400).json({ error: 'Tidak ada gambar.' });

    const apiKey = "AIzaSyBZcMHV8X8cn-AEtPEvjM9OULUKm_-TpE0";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    // Build parts: text prompt + all images
    const parts = [
      {
        text: `Identifikasi tanaman dari ${images.length} foto berikut. Jawab dalam bahasa Indonesia dengan format:\n\n1. **Nama Umum**:\n2. **Nama Ilmiah**:\n3. **Famili**:\n4. **Deskripsi Singkat**: [2-3 kalimat]\n5. **Fun Fact**: [fakta unik]\n6. **Manfaat Sehari-hari**: [manfaat praktis]\n7. **Kegunaan Lainnya**: [industri, ekologi, pengobatan tradisional]\n\nJika bukan tanaman, sebutkan objek apa itu.`
      },
      // Add all images as inline data
      ...images.map(img => ({
        inlineData: {
          mimeType: img.mimeType,
          data: img.imageData
        }
      }))
    ];

    const payload = {
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: 1024,
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data.error?.message || `Gemini error ${response.status}`;
      return res.status(response.status).json({ error: errMsg });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(200).json({ error: 'Tidak ada respon dari AI.' });

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
