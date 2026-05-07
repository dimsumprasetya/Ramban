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

    // API Key Plant.id kamu
    const apiKey = "iUUQGTPmSSPJQh6pVpXD5X6f9TwbotskFF34Jfry5FxUkSpWsw";

    // Plant.id menerima array berisi Base64 string. 
    // Kita gabungkan mimeType dan imageData menjadi format Data URI standar.
    const base64Images = images.map(img => `data:${img.mimeType};base64,${img.imageData}`);

    // Konfigurasi payload untuk Plant.id
    const payload = {
      images: base64Images,
      // Meminta API untuk mengembalikan detail tambahan seperti nama umum dan taksonomi
      plant_details: ["common_names", "taxonomy"] 
    };

    // Menggunakan endpoint v2 dari Plant.id
    const response = await fetch('https://api.plant.id/v2/identify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error || `Plant.id error ${response.status}` 
      });
    }

    const suggestions = data.suggestions || [];
    if (suggestions.length === 0) {
      return res.status(200).json({ 
        text: "Tanaman tidak dapat diidentifikasi. Coba foto bagian daun atau bunga dengan lebih jelas." 
      });
    }

    // Mengambil hasil dengan tingkat keyakinan tertinggi (urutan pertama)
    const best = suggestions[0];
    const details = best.plant_details || {};
    const confidence = Math.round(best.probability * 100);

    // Mengambil nama umum (jika ada)
    let commonNames = 'Tidak tersedia';
    if (details.common_names && details.common_names.length > 0) {
      commonNames = details.common_names.join(', ');
    }

    // Mengambil data taksonomi
    const taxonomy = details.taxonomy || {};
    const genus = taxonomy.genus || '-';
    const family = taxonomy.family || '-';

    // Menyusun teks balasan sesuai format Markdown yang diinginkan
    let text = `**Nama Umum**: ${commonNames}\n`;
    text += `**Nama Ilmiah**: *${best.plant_name}*\n`;
    text += `**Genus**: ${genus}\n`;
    text += `**Famili**: ${family}\n`;
    text += `**Tingkat Keyakinan**: ${confidence}% (dari ${images.length} foto)\n\n`;

    // Menambahkan kemungkinan tanaman lain jika ada (opsional)
    if (suggestions.length > 1) {
      text += `**Kemungkinan Lainnya**:\n`;
      // Mengambil maksimal 3 kemungkinan lainnya
      suggestions.slice(1, 4).forEach((r, i) => {
        const pct = Math.round(r.probability * 100);
        const cn = (r.plant_details && r.plant_details.common_names && r.plant_details.common_names.length > 0) 
          ? r.plant_details.common_names[0] 
          : r.plant_name;
        text += `${i + 2}. ${cn} — *${r.plant_name}* (${pct}%)\n`;
      });
    }

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
