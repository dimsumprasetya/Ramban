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

    // ── STEP 1: Identifikasi via PlantNet (pakai gambar) ──
    const plantNetKey = "2b10STlXC1sQFsoh2vpH5KqZc";
    const boundary = '----RambanBoundary' + Date.now();
    const parts = [];

    images.forEach((img, i) => {
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="organs"\r\n\r\nauto\r\n`, 'utf8'
      ));
      const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="plant${i+1}.${ext}"\r\nContent-Type: ${img.mimeType}\r\n\r\n`, 'utf8'
      ));
      parts.push(Buffer.from(img.imageData, 'base64'));
      parts.push(Buffer.from('\r\n', 'utf8'));
    });
    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    const fullBody = Buffer.concat(parts);

    const pnRes = await fetch(
      `https://my-api.plantnet.org/v2/identify/all?api-key=${plantNetKey}&lang=id&nb-results=3`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': fullBody.length.toString(),
        },
        body: fullBody
      }
    );

    const pnData = await pnRes.json();

    if (!pnRes.ok)
      return res.status(pnRes.status).json({ error: pnData.message || `PlantNet error ${pnRes.status}` });

    const top = pnData.results?.slice(0, 3) || [];
    if (top.length === 0)
      return res.status(200).json({ text: "Tanaman tidak dapat diidentifikasi. Mohon unggah foto bagian daun, bunga, atau batang yang lebih jelas." });

    const best = top[0];
    const sp = best.species;
    const confidence = Math.round(best.score * 100);
    const scientificName = sp.scientificNameWithoutAuthor || sp.scientificName;
    const genus = sp.genus?.scientificNameWithoutAuthor || '-';
    const family = sp.family?.scientificNameWithoutAuthor || '-';
    const commonNamesRaw = sp.commonNames?.slice(0, 3).join(', ') || scientificName;
    const remaining = pnData.remainingIdentificationRequests ?? '-';

    // Alternatif identifikasi
    const alternatives = top.slice(1).map((r, i) => {
      const pct = Math.round(r.score * 100);
      const cn = r.species.commonNames?.[0] || r.species.scientificNameWithoutAuthor;
      return `${i+2}. ${cn} — *${r.species.scientificNameWithoutAuthor}* (${pct}%)`;
    }).join('\n');

    // ── STEP 2: Deskripsi via Gemini (teks saja, hemat token) ──
    const geminiKey = "AIzaSyBZcMHV8X8cn-AEtPEvjM9OULUKm_-TpE0";
    const prompt = `Kamu adalah ahli botani profesional di Indonesia. Berikan informasi tentang tanaman bernama ilmiah "${scientificName}" (famili ${family}) dalam bahasa Indonesia dengan format Markdown berikut PERSIS (hanya isi bagian dalam kurung kotak, jangan ubah format):

**Nama Umum**: [Nama populer & lokal di Indonesia]
**Nama Ilmiah**: *${scientificName}*
**Genus & Famili**: ${genus} - ${family}

---

**🌟 Fun Fact**: [1 fakta unik atau menarik tentang tanaman ini]

**🌿 Manfaat Sehari-hari**: [Manfaat praktis, kesehatan, atau kegunaannya di rumah]

**🛠️ Kegunaan Lainnya**: [Kegunaan lain seperti industri, hiasan, atau filosofi]

Balas HANYA dengan format di atas, tanpa kalimat pembuka atau penutup.`;

    let descText = '';

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 600 }
          })
        }
      );
      const geminiData = await geminiRes.json();
      descText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } catch (_) {
      // Gemini gagal — fallback ke info PlantNet saja
      descText = `**Nama Umum**: ${commonNamesRaw}\n**Nama Ilmiah**: *${scientificName}*\n**Genus & Famili**: ${genus} - ${family}`;
    }

    // ── Gabungkan hasil ──
    let finalText = descText.trim();
    finalText += `\n\n---\n**📊 Tingkat Keyakinan**: ${confidence}% (dari ${images.length} foto)`;
    if (alternatives) finalText += `\n\n**🔍 Kemungkinan Lainnya**:\n${alternatives}`;
    finalText += `\n\n**⏳ Sisa Kuota PlantNet**: ${remaining} request/hari`;

    return res.status(200).json({ text: finalText });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
