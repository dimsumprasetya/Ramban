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

    // ── STEP 1: PlantNet ──
    const plantNetKey = "2b10bzCZ1eKEQBQFjMV5kWnTB";
    const boundary = '----RambanBoundary' + Date.now();
    const parts = [];
    images.forEach((img, i) => {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="organs"\r\n\r\nauto\r\n`, 'utf8'));
      const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="images"; filename="plant${i+1}.${ext}"\r\nContent-Type: ${img.mimeType}\r\n\r\n`, 'utf8'));
      parts.push(Buffer.from(img.imageData, 'base64'));
      parts.push(Buffer.from('\r\n', 'utf8'));
    });
    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    const fullBody = Buffer.concat(parts);

    const pnRes = await fetch(
      `https://my-api.plantnet.org/v2/identify/all?api-key=${plantNetKey}&lang=id&nb-results=5`,
      { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': fullBody.length.toString() }, body: fullBody }
    );
    const pnData = await pnRes.json();
    if (!pnRes.ok) return res.status(pnRes.status).json({ error: pnData.message || `PlantNet error ${pnRes.status}` });

    const top = pnData.results?.slice(0, 3) || [];
    if (top.length === 0)
      return res.status(200).json({ text: "Tanaman tidak dapat diidentifikasi. Mohon unggah foto bagian daun, bunga, atau batang yang lebih jelas.", toxic: false });

    const best = top[0];
    const sp = best.species;
    const confidence = Math.round(best.score * 100);
    const scientificName = sp.scientificNameWithoutAuthor || sp.scientificName;
    const genus = sp.genus?.scientificNameWithoutAuthor || '-';
    const family = sp.family?.scientificNameWithoutAuthor || '-';
    const commonNamesID = sp.commonNames?.slice(0, 3).join(', ') || scientificName;
    const remaining = pnData.remainingIdentificationRequests ?? '-';

    const alternatives = top.slice(1).map((r, i) => {
      const pct = Math.round(r.score * 100);
      const cn = r.species.commonNames?.[0] || r.species.scientificNameWithoutAuthor;
      return `${i + 2}. ${cn} — *${r.species.scientificNameWithoutAuthor}* (${pct}%)`;
    }).join('\n');

    // ── STEP 2: Wikipedia ──
    const fetchWiki = async (lang, title) => {
      try {
        const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { headers: { 'User-Agent': 'RambanApp/1.0' } });
        if (!r.ok) return null;
        const d = await r.json();
        if (d.type === 'disambiguation' || !d.extract || d.extract.length < 30) return null;
        return d;
      } catch { return null; }
    };
    const wikiData = await fetchWiki('id', scientificName) || await fetchWiki('en', scientificName) || await fetchWiki('id', commonNamesID.split(',')[0].trim()) || null;
    const wikiSummary = wikiData ? wikiData.extract.replace(/\n/g, ' ').split(/(?<=[.!?])\s+/).slice(0, 3).join(' ') : null;
    const wikiUrl = wikiData?.content_urls?.desktop?.page || null;

    // ── STEP 3: Database famili ──
    const familyDB = {
      'Lamiaceae':     { manfaat: 'Banyak digunakan sebagai herbal dapur, teh herbal, dan aromaterapi.', lainnya: 'Bahan baku industri parfum, sabun, dan produk perawatan tubuh.', cahaya: '☀️ Terang', air: '💧 Sedang', konsumsi: '🍃 Bisa dimakan', toxic: false },
      'Fabaceae':      { manfaat: 'Kaya protein, sering dijadikan bahan pangan dan pakan ternak.', lainnya: 'Tanaman pengikat nitrogen, menyuburkan tanah secara alami.', cahaya: '☀️ Matahari Langsung', air: '💧 Sedang', konsumsi: '🍃 Bisa dimakan', toxic: false },
      'Poaceae':       { manfaat: 'Sumber karbohidrat utama, biji-bijian banyak dikonsumsi sehari-hari.', lainnya: 'Pakan ternak, bahan bangunan (bambu), dan bioenergi.', cahaya: '☀️ Matahari Langsung', air: '💧 Sering', konsumsi: '🍃 Bisa dimakan', toxic: false },
      'Asteraceae':    { manfaat: 'Digunakan sebagai tanaman hias dan obat tradisional.', lainnya: 'Beberapa spesies digunakan dalam industri minyak dan pewarna alami.', cahaya: '🌤️ Terang', air: '💧 Sedang', konsumsi: '⚠️ Tergantung spesies', toxic: false },
      'Moraceae':      { manfaat: 'Buah dan daun sering dikonsumsi, kaya vitamin dan mineral.', lainnya: 'Kayu untuk furnitur; getah untuk industri karet.', cahaya: '☀️ Matahari Langsung', air: '💧 Sedang', konsumsi: '🍃 Bisa dimakan', toxic: false },
      'Araceae':       { manfaat: 'Populer sebagai tanaman hias indoor karena menyerap polutan udara.', lainnya: 'Beberapa spesies digunakan dalam upacara adat dan dekorasi.', cahaya: '🌥️ Teduh–Terang', air: '💧 Sedang', konsumsi: '☠️ Beracun', toxic: true },
      'Euphorbiaceae': { manfaat: 'Getah beberapa spesies digunakan sebagai obat tradisional.', lainnya: 'Sumber karet alam dan bahan bakar nabati (jatropha).', cahaya: '☀️ Terang', air: '💧 Jarang', konsumsi: '☠️ Getah beracun/iritan', toxic: true },
      'Rutaceae':      { manfaat: 'Buah kaya vitamin C, dikonsumsi segar atau diolah menjadi minuman.', lainnya: 'Minyak esensial dari kulit buah untuk industri aromaterapi.', cahaya: '☀️ Matahari Langsung', air: '💧 Sedang', konsumsi: '🍃 Bisa dimakan', toxic: false },
      'Zingiberaceae': { manfaat: 'Rimpang digunakan sebagai bumbu masak dan minuman kesehatan.', lainnya: 'Bahan baku industri jamu, kosmetik, dan obat-obatan herbal.', cahaya: '🌤️ Teduh–Terang', air: '💧 Sering', konsumsi: '🍃 Bisa dimakan', toxic: false },
      'Arecaceae':     { manfaat: 'Buah, minyak, dan airnya bermanfaat untuk konsumsi dan kesehatan.', lainnya: 'Daun dan pelepah untuk kerajinan tangan dan bahan bangunan.', cahaya: '☀️ Matahari Langsung', air: '💧 Sedang', konsumsi: '🍃 Bisa dimakan', toxic: false },
      'Solanaceae':    { manfaat: 'Buah banyak dikonsumsi sebagai sayuran dan bumbu masak.', lainnya: 'Beberapa spesies mengandung alkaloid untuk keperluan farmasi.', cahaya: '☀️ Matahari Langsung', air: '💧 Sedang', konsumsi: '⚠️ Tergantung spesies (ada yang beracun)', toxic: true },
      'Malvaceae':     { manfaat: 'Bunga dan daun digunakan sebagai herbal, teh, dan pewarna alami.', lainnya: 'Serat batang digunakan dalam industri tekstil dan kerajinan.', cahaya: '☀️ Terang', air: '💧 Sedang', konsumsi: '🍃 Bisa dimakan', toxic: false },
      'Begoniaceae':   { manfaat: 'Populer sebagai tanaman hias indoor karena toleran cahaya rendah.', lainnya: 'Digunakan dalam industri hortikultura sebagai tanaman hias komersial.', cahaya: '🌥️ Teduh–Terang', air: '💧 Sedang', konsumsi: '⚠️ Tidak untuk dikonsumsi', toxic: false },
      'Asphodelaceae': { manfaat: 'Gel dari daun digunakan untuk perawatan kulit dan meredakan luka bakar.', lainnya: 'Bahan baku industri kosmetik, minuman kesehatan, dan farmasi.', cahaya: '☀️ Matahari Langsung', air: '💧 Jarang', konsumsi: '🍃 Gel bisa digunakan (tidak dimakan langsung)', toxic: false },
      'Musaceae':      { manfaat: 'Buah kaya kalium dan energi, dikonsumsi segar maupun diolah.', lainnya: 'Daun digunakan sebagai pembungkus makanan tradisional dan kerajinan.', cahaya: '☀️ Matahari Langsung', air: '💧 Sering', konsumsi: '🍃 Bisa dimakan', toxic: false },
    };

    const uses = familyDB[family] || { manfaat: 'Dapat dimanfaatkan sebagai tanaman hias atau bahan pangan lokal.', lainnya: 'Berpotensi dikembangkan dalam bidang etnobotani dan konservasi.', cahaya: '🌤️ Bervariasi', air: '💧 Sedang', konsumsi: '⚠️ Belum terverifikasi', toxic: false };

    // ── STEP 4: Susun output ──
    const isToxic = uses.toxic;
    let text = '';

    if (isToxic) text += `[PERINGATAN_BERACUN]\n`;

    text += `**Nama Umum**: ${commonNamesID}\n`;
    text += `**Nama Ilmiah**: *${scientificName}*\n`;
    text += `**Genus & Famili**: ${genus} — ${family}\n\n`;
    text += `---\n\n`;
    text += `**🌟 Fun Fact**:\n${wikiSummary || 'Informasi tambahan tidak tersedia untuk tanaman ini.'}\n\n`;
    text += `**🌿 Manfaat Sehari-hari**:\n${uses.manfaat}\n\n`;
    text += `**🛠️ Kegunaan Lainnya**:\n${uses.lainnya}\n\n`;
    text += `---\n\n`;
    text += `**⚡ Panduan Perawatan**:\n`;
    text += `• Cahaya: ${uses.cahaya}\n`;
    text += `• Air: ${uses.air}\n`;
    text += `• Konsumsi: ${uses.konsumsi}\n\n`;
    text += `---\n`;
    text += `**📊 Tingkat Keyakinan**: ${confidence}% (dari ${images.length} foto)\n`;
    if (alternatives) text += `\n**🔍 Kemungkinan Lainnya**:\n${alternatives}\n`;

    return res.status(200).json({ text, toxic: isToxic, confidence, scientificName, commonNames: commonNamesID, family });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
