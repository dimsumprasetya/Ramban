module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Pesan kosong.' });

    // ── Cari info dari Wikipedia dulu sebagai konteks ──
    let wikiContext = '';
    try {
      // Ekstrak keyword dari pesan (ambil 1-3 kata kunci)
      const keywords = message.replace(/[^a-zA-Z\s]/g, '').split(' ')
        .filter(w => w.length > 3).slice(0, 2).join(' ');

      if (keywords) {
        const wikiRes = await fetch(
          `https://id.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(keywords.replace(/ /g, '_'))}`,
          { headers: { 'User-Agent': 'RambanApp/1.0' } }
        );
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          if (wikiData.extract && wikiData.type !== 'disambiguation') {
            wikiContext = wikiData.extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
          }
        }
      }
    } catch (_) { /* Wikipedia gagal, lanjut tanpa konteks */ }

    // ── Build system prompt ──
    const systemPrompt = `Kamu adalah Ahli Botani AI dari aplikasi Ramban oleh Pijak Bumi Learning Indonesia.
Jawab pertanyaan tentang tanaman dalam bahasa Indonesia yang ramah, singkat (maks 3 paragraf), dan mudah dipahami masyarakat umum.
Fokus pada: identifikasi tanaman, cara perawatan, manfaat, toksisitas & keamanan, ekologi, dan fakta botani menarik.
Jika ada informasi dari Wikipedia berikut, gunakan sebagai referensi tambahan: "${wikiContext}"
Jika pertanyaan bukan tentang tanaman atau alam, jawab: "Maaf, saya hanya bisa membantu seputar tanaman dan botani. Ada yang ingin ditanyakan tentang tanaman? 🌿"
Akhiri jawaban dengan emoji tanaman yang relevan.`;

   export const chatWithGemini = async (req, res) => {
  try {
    // Asumsi variabel ini didapat dari request
    const { message, history = [], systemPrompt, wikiContext } = req.body;

    // ── 1. Build messages untuk Gemini ──
    const messages = [];
    
    // Tambah history (skip system message)
    history.filter(h => h.role !== 'system').forEach(h => {
      messages.push({ 
        role: h.role === 'assistant' ? 'model' : 'user', 
        parts: [{ text: h.text }] 
      });
    });

    // Pastikan pesan terakhir adalah user
    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      messages.push({ role: 'user', parts: [{ text: message }] });
    }

    // ── 2. Setup API Key & URL (Versi Hardcode untuk Testing) ──
    const geminiKey = "AIzaSyA5mMGixm8fUyg-g1nXEE0adb3bzqkbRW8"; 
    
    // Perbaikan: Menghapus tab yang nyelip di URL agar endpoint valid
    const modelName = "gemini-1.5-flash"; 
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

    // ── 3. Siapkan Payload ──
    const payload = {
      // Menggunakan camelCase sesuai dokumentasi API
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: messages,
      generationConfig: { 
        temperature: 0.6, 
        maxOutputTokens: 400 
      }
    };

    // ── 4. Eksekusi Request ──
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const geminiData = await geminiRes.json();

    // ── 5. Error Handling & Fallback ──
    if (!geminiRes.ok) {
      console.error("Gemini API Error:", geminiData); // Log error di console untuk bantu debugging
      
      // Fallback ke Wikipedia jika AI error
      if (wikiContext) {
        return res.status(200).json({
          reply: `Berdasarkan Wikipedia: ${wikiContext} 🌿\n\n(Catatan: Layanan AI sedang tidak tersedia, ini adalah informasi dasar dari Wikipedia.)`
        });
      }
      return res.status(200).json({ 
        reply: 'Maaf, layanan AI sedang tidak tersedia. Silakan coba lagi nanti. 🌿' 
      });
    }

    // ── 6. Parsing Respons ──
    const reply = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Maaf, tidak ada respons. Coba lagi ya! 🌿';
    
    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: err.message });
  }
};
