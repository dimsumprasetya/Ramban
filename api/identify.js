module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { images } = req.body;
    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'Tidak ada gambar yang dikirim.' });
    }

    // ── KONFIGURASI API DATABYTE ──
    const apiKey = process.env.DATABYTE_API_KEY || "sk-db-Tkd8uDYoISi8gy9QjrDImOgM3kCNWwjjJFKUhDqoMR06IqhA";
    
    // URL Endpoint sesuai dengan panduan troubleshooting (bisa disesuaikan jika berbeda)
    const BASE_URL = "https://ai.databyte.co.id/v1"

response = requests.post(
    f"{BASE_URL}/chat/completions",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    },
    json={
        "model": "databyte-m1",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "What is 2+2?"}
        ],
        "max_tokens": 1024
    }
); 

    // ── FORMAT MULTIPART/FORM-DATA ──
    const boundary = '----DatabyteBoundary' + Date.now();
    const parts = [];

    // Memasukkan gambar ke dalam form dengan field name "image" sesuai petunjuk curl
    images.forEach((img, i) => {
      const ext = img.mimeType.includes('png') ? 'png' : 'jpg';
      
      parts.push(Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="plant${i+1}.${ext}"\r\nContent-Type: ${img.mimeType}\r\n\r\n`, 'utf8'
      ));
      // Mengubah string base64 dari frontend kembali menjadi file binary (Buffer)
      parts.push(Buffer.from(img.imageData, 'base64'));
      parts.push(Buffer.from('\r\n', 'utf8'));
    });
    
    parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
    const fullBody = Buffer.concat(parts);

    // ── KIRIM REQUEST KE DATABYTE ──
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length.toString()
      },
      body: fullBody
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ 
        error: data.error?.message || data.message || `Databyte API error ${response.status}: Silakan cek kembali API Key atau Endpoint URL.` 
      });
    }

    // ── PARSING BALASAN DATABYTE ──
    // Karena kita belum melihat bentuk asli balasan JSON Databyte, 
    // kode ini akan mencoba menangkap teks dari field yang umum dipakai (text/result/message)
    let text = data.text || data.result || data.message || data.description;

    // Jika formatnya ternyata berbeda, kembalikan JSON mentah agar bisa dianalisis
    if (!text) {
      text = "Identifikasi berhasil, namun format respons Databyte berbeda. Berikut data mentahnya:\n\n
http://googleusercontent.com/immersive_entry_chip/0
