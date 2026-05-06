module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { imageData, mimeType } = req.body;
    const apiKey = "2b10STlXC1sQFsoh2vpH5KqZc";

    const imageBuffer = Buffer.from(imageData, 'base64');
    const boundary = '----RambanBoundary' + Date.now();
    const ext = mimeType.includes('png') ? 'plant.png' : 'plant.jpg';

    const bodyText = `--${boundary}\r\nContent-Disposition: form-data; name="organs"\r\n\r\nauto\r\n`;
    const headerPart = `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const fullBody = Buffer.concat([
      Buffer.from(bodyText + headerPart, 'utf8'),
      imageBuffer,
      Buffer.from(footer, 'utf8')
    ]);

    const response = await fetch(
      `https://my-api.plantnet.org/v2/identify/all?api-key=${apiKey}&lang=id&include-related-images=false`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length.toString(),
        },
        body: fullBody
      }
    );

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message || `Error ${response.status}` });

    const top = data.results?.slice(0, 3) || [];
    if (top.length === 0) {
      return res.status(200).json({ text: "Tanaman tidak dapat diidentifikasi. Coba foto lebih jelas." });
    }

    const best = top[0];
    const sp = best.species;
    const confidence = Math.round(best.score * 100);
    const commonNames = sp.commonNames?.length > 0 ? sp.commonNames.join(', ') : 'Tidak tersedia';

    let text = `**Nama Umum**: ${commonNames}\n`;
    text += `**Nama Ilmiah**: ${sp.scientificName || sp.scientificNameWithoutAuthor}\n`;
    text += `**Genus**: ${sp.genus?.scientificNameWithoutAuthor || '-'}\n`;
    text += `**Famili**: ${sp.family?.scientificNameWithoutAuthor || '-'}\n`;
    text += `**Tingkat Keyakinan**: ${confidence}%\n\n`;

    if (top.length > 1) {
      text += `**Kemungkinan Lainnya**:\n`;
      top.slice(1).forEach((r, i) => {
        const pct = Math.round(r.score * 100);
        const cn = r.species.commonNames?.[0] || r.species.scientificNameWithoutAuthor;
        text += `${i + 2}. ${cn} (${r.species.scientificNameWithoutAuthor}) — ${pct}%\n`;
      });
      text += '\n';
    }
    text += `**Sisa Kuota Hari Ini**: ${data.remainingIdentificationRequests ?? '-'} request`;

    return res.status(200).json({ text });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
