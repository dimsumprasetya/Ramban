module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request (CORS)
  if (req.method === 'OPTIONS') return res.status(200).end();
  
  // Pastikan hanya menerima POST request
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { images } = req.body; // Menerima array of { imageData, mimeType }
    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'Tidak ada gambar yang dikirim.' });
    }

    // API Key Google Gemini yang kamu berikan
    const apiKey = "AIzaSyAJ5XHkQXtaU9y6zD-h9k-LJcMpXg4NpqI";

    // Menyusun prompt instruksi khusus dengan penekanan pada konteks lokal Indonesia
    const promptText = "Kamu adalah ahli botani di Indonesia. Identifikasi tanaman dari gambar berikut. Berikan informasi dalam bahasa Indonesia menggunakan format persis seperti ini:\n\n**Nama Umum**: [Tuliskan nama umum dan nama lokal/daerah di Indonesia jika ada, pisahkan dengan koma jika banyak]\n**Nama Ilmiah**: *[Nama Ilmiah]*\n**Genus**: [Genus]\n**Famili**: [Famili]\n\nJika ada beberapa gambar, itu adalah bagian dari tanaman yang sama. Jika kamu yakin 100% itu bukan gambar tanaman atau gambar sangat tidak jelas, jawab: 'Tanaman tidak dapat diidentifikasi. Coba foto bagian daun atau bunga dengan lebih jelas.'";

    // Format data untuk Gemini API
    const parts = [
      { text: promptText }
    ];

    // Menambahkan semua gambar dari aplikasi ke dalam request AI
    images.forEach((img) => {
      // Pastikan mimeType sesuai standar (image/jpeg atau image/png)
      let mimeType = img.mimeType.includes('png') ? 'image/png' : 'image/jpeg';
      
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: img.imageData // Data base64 murni dari front-end
        }
      });
    });

    const payload = {
      contents: [{ parts: parts }],
      generationConfig: {
        temperature: 0.1, // Dibuat rendah agar jawaban akurat, konsisten, dan tidak mengarang
        maxOutputTokens: 300,
      }
    };

    // Tembak ke endpoint resmi Gemini 1.5 Flash
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      // Menangkap pesan error dari Google jika ada masalah
      return res.status(response.status).json({ 
        error: data.error?.message || `Gemini API error ${response.status}` 
      });
    }

    // Mengambil teks balasan dari struktur JSON Gemini
    const text = data.candidates[0]?.content?.parts[0]?.text || "Terjadi kesalahan saat memproses gambar.";

    // Mengirimkan hasil identifikasi kembali ke aplikasi
    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
