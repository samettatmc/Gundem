// Uygulama ekranlarını (web dosyalarını) www klasörüne kopyalar. Android ve Windows bu klasörü paketler.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'www');
const items = ['index.html', 'app.js', 'styles.css', 'config.js', 'build-info.js', 'manifest.webmanifest', 'sw.js', 'aktar.json', 'vendor', 'icons'];
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
for (const it of items) fs.cpSync(path.join(root, it), path.join(out, it), { recursive: true });
console.log('www hazır');
