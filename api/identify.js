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

    // ── STEP 1: Identifikasi via PlantNet ──
    const plantNetKey = process.env.PLANTNET_API_KEY || "2b10STlXC1sQFsoh2vpH5KqZc";
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
      `https://my-api.plantnet.org/v2/identify/all?api-key=${plantNetKey}&lang=id&nb-results=5`,
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
      return res.status(200).json({
        text: "Tanaman tidak dapat diidentifikasi. Mohon unggah foto bagian daun, bunga, atau batang yang lebih jelas."
      });

    const best = top[0];
    const sp = best.species;
    const confidence = Math.round(best.score * 100);
    const scientificName = sp.scientificNameWithoutAuthor || sp.scientificName;
    const genus = sp.genus?.scientificNameWithoutAuthor || '-';
    const family = sp.family?.scientificNameWithoutAuthor || '-';
    const commonNamesID = sp.commonNames?.slice(0, 3).join(', ') || '-';
    const remaining = pnData.remainingIdentificationRequests ?? '-';

    const alternatives = top.slice(1).map((r, i) => {
      const pct = Math.round(r.score * 100);
      const cn = r.species.commonNames?.[0] || r.species.scientificNameWithoutAuthor;
      return `${i + 2}. ${cn} — *${r.species.scientificNameWithoutAuthor}* (${pct}%)`;
    }).join('\n');

    // ── STEP 2: Ambil deskripsi dari Wikipedia (gratis, tanpa API key) ──
    // Coba Wikipedia Bahasa Indonesia dulu, fallback ke English
    let wikiSummary = '';
    let wikiUrl = '';

    const fetchWiki = async (lang, title) => {
      const encoded = encodeURIComponent(title.replace(/ /g, '_'));
      const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encoded}`;
      try {
        const r = await fetch(url, { headers: { 'User-Agent': 'RambanApp/1.0' } });
        if (!r.ok) return null;
        const d = await r.json();
        if (d.type === 'disambiguation' || !d.extract) return null;
        return d;
      } catch { return null; }
    };

    // Cari di Wikipedia ID dulu, fallback ke EN
    let wikiData = await fetchWiki('id', scientificName)
                || await fetchWiki('en', scientificName)
                || await fetchWiki('id', commonNamesID.split(',')[0].trim())
                || null;

    if (wikiData) {
      // Ambil 3 ayat pertama
      const sentences = wikiData.extract
        .replace(/\n/g, ' ')
        .split(/(?<=[.!?])\s+/)
        .slice(0, 3)
        .join(' ');
      wikiSummary = sentences;
      wikiUrl = wikiData.content_urls?.desktop?.page || '';
    }

    // ── STEP 3: Susun output dengan format prompt Markdown ──
    let text = '';
    text += `**Nama Umum**: ${commonNamesID || scientificName}\n`;
    text += `**Nama Ilmiah**: *${scientificName}*\n`;
    text += `**Genus & Famili**: ${genus} — ${family}\n\n`;
    text += `---\n\n`;

    if (wikiSummary) {
      text += `**🌟 Fun Fact**:\n${wikiSummary}\n\n`;
    } else {
      text += `**🌟 Fun Fact**:\nInformasi tambahan tidak tersedia untuk tanaman ini.\n\n`;
    }

    // Manfaat & kegunaan dari common names dan family hints
    const familyUses = {
      'Lamiaceae': { manfaat: 'Banyak digunakan sebagai herbal dapur, teh herbal, dan aromaterapi.', lainnya: 'Bahan baku industri parfum, sabun, dan produk perawatan tubuh.' },
      'Fabaceae': { manfaat: 'Kaya protein, sering dijadikan bahan pangan dan pakan ternak.', lainnya: 'Tanaman pengikat nitrogen, menyuburkan tanah secara alami.' },
      'Poaceae': { manfaat: 'Sumber karbohidrat utama, biji-bijian banyak dikonsumsi sehari-hari.', lainnya: 'Digunakan untuk pakan ternak, bahan bangunan (bambu), dan bioenergi.' },
      'Asteraceae': { manfaat: 'Banyak digunakan sebagai tanaman hias dan obat tradisional.', lainnya: 'Beberapa spesies digunakan dalam industri minyak dan bahan pewarna.' },
      'Moraceae': { manfaat: 'Buah dan daun sering dikonsumsi, kaya vitamin dan mineral.', lainnya: 'Kayu digunakan untuk furnitur; getah untuk industri karet.' },
      'Araceae': { manfaat: 'Populer sebagai tanaman hias indoor karena menyerap polutan udara.', lainnya: 'Beberapa spesies digunakan dalam upacara adat dan dekorasi.' },
      'Euphorbiaceae': { manfaat: 'Getah beberapa spesies digunakan sebagai obat tradisional.', lainnya: 'Sumber karet alam dan bahan bakar nabati (jatropha).' },
      'Rutaceae': { manfaat: 'Buah kaya vitamin C, dikonsumsi segar atau diolah menjadi minuman.', lainnya: 'Minyak esensial dari kulit buah digunakan dalam industri aromaterapi.' },
      'Zingiberaceae': { manfaat: 'Rimpang digunakan sebagai bumbu masak dan minuman kesehatan tradisional.', lainnya: 'Bahan baku industri jamu, kosmetik, dan obat-obatan herbal.' },
      'Arecaceae': { manfaat: 'Buah, minyak, dan airnya bermanfaat untuk konsumsi dan kesehatan.', lainnya: 'Pelepah dan daun digunakan untuk kerajinan tangan dan bahan bangunan tradisional.' },
    };

    const uses = familyUses[family] || {
      manfaat: 'Dapat dimanfaatkan sebagai tanaman hias atau bahan pangan lokal.',
      lainnya: 'Berpotensi untuk dikembangkan dalam bidang etnobotani dan konservasi.'
    };

    text += `**🌿 Manfaat Sehari-hari**:\n
