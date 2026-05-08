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

    const apiKey = "2b10bzCZ1eKEQBQFjMV5kWnTB";
    const boundary = '----RambanBoundary' + Date.now();
    const parts = [];

    // PlantNet requires ONE organs field per image — must be equal length
    images.forEach((img, i) => {
      // organs field for each image
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="organs"\r\n\r\nauto\r\n`,
        'utf8'
      ));
      // image part
      const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="plant${i+1}.${ext}"\r\nContent-Type: ${img.mimeType}\r\n\r\n`,
        'utf8'
      ));
      parts.push(Buffer.from(img.imageData, 'base64'));
      parts.push(Buffer.from('\r\n', 'utf8'));
    });

    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    const fullBody = Buffer.concat(parts);

    const url = `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&lang=id&include-related-images=false&nb-results=5`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length.toString(),
      },
      body: fullBody
    });

    const data = await response.json();
    if (!response.ok)
      return res.status(response.status).json({ error: data.message || `PlantNet error ${response.status}` });

    const top = data.results?.slice(0, 3) || [];
    if (top.length === 0)
      return res.status(200).json({ text: "Tanaman tidak dapat diidentifikasi. Coba foto bagian daun atau bunga lebih jelas." });

    const best = top[0];
    const sp = best.species;
    const confidence = Math.round(best.score * 100);
    const commonNames = sp.commonNames?.length > 0 ? sp.commonNames.join(', ') : 'Tidak tersedia';

    let text = `**Nama Umum**: ${commonNames}\n`;
    text += `**Nama Ilmiah**: ${sp.scientificName || sp.scientificNameWithoutAuthor}\n`;
    text += `**Genus**: ${sp.genus?.scientificNameWithoutAuthor || '-'}\n`;
    text += `**Famili**: ${sp.family?.scientificNameWithoutAuthor || '-'}\n`;
    text += `**Tingkat Keyakinan**: ${confidence}% (dari ${images.length} foto)\n\n`;

    if (top.length > 1) {
      text += `**Kemungkinan Lainnya**:\n`;
      top.slice(1).forEach((r, i) => {
        const pct = Math.round(r.score * 100);
        const cn = r.species.commonNames?.[0] || r.species.scientificNameWithoutAuthor;
        text += `${i+2}. ${cn} — ${r.species.scientificNameWithoutAuthor} (${pct}%)\n`;
      });
      text += '\n';
    }
    text += `**Sisa Kuota**: ${data.remainingIdentificationRequests ?? '-'} request/hari`;

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
