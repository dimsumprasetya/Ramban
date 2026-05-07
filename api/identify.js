module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { images } = req.body; // array of { imageData, mimeType }
    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'Tidak ada gambar yang dikirim.' });
    }

    // API Key DeepSeek
    const apiKey = "sk-1c0d9aa64a224af3bb54f56cb64c08bf";

    // Menyusun prompt instruksi untuk AI
    const content = [
      {
        type: "text",
        text: "Kamu adalah ahli botani. Identifikasi tanaman dari gambar berikut. Berikan informasi dalam bahasa Indonesia menggunakan format persis seperti ini:\n\n**Nama Umum**: [Nama umum]\n**Nama Ilmiah**: *[Nama Ilmiah]*\n**Genus**: [Genus]\n**Famili**: [Famili]\n\nJika ada beberapa gambar, itu adalah bagian dari 1 tanaman yang sama. Jika kamu tidak bisa mengidentifikasinya, jawab: 'Tanaman tidak dapat diidentifikasi. Coba foto bagian daun atau bunga dengan lebih jelas.'"
      }
    ];

    // Memasukkan setiap gambar ke dalam payload JSON sebagai Base64
    images.forEach((img) => {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType};base64,${img.imageData}`
        }
      });
    });

    // Menggunakan model DeepSeek terbaru yang mendukung vision
    const payload = {
      model: "deepseek-v4-flash",
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      max_tokens: 300,
      temperature: 0.2 // Temperature rendah agar faktual
    };

    // Endpoint standar API DeepSeek untuk chat completion
    const url = 'https://api.deepseek.com/chat/completions';

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
        error: data.error?.message || `DeepSeek error ${response.status}` 
      });
    }

    // Mengambil teks balasan dari AI
    let text = data.choices[0]?.message?.content || "Terjadi kesalahan saat memproses gambar.";

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
