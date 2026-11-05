// GitHub derlerken sürüm numarasını ve depo adını uygulamaya yazar.
const fs = require('fs'), path = require('path');
const build = +process.env.BUILD_NUMBER || 0, repo = process.env.GITHUB_REPOSITORY || '', token = process.env.UPDATE_TOKEN || '';
if (repo && !token) console.log('UPDATE_TOKEN yok: depo açık (public) kabul ediliyor.');
const txt = `// GitHub tarafından otomatik yazıldı.\nwindow.GUNDEM_BUILD = { build: ${build}, repo: ${JSON.stringify(repo)}, token: ${JSON.stringify(token)} };\n`;
fs.writeFileSync(path.join(__dirname, '..', 'build-info.js'), txt);
console.log('build-info:', build, repo);

// package.json'a sürümü ve güncellemelerin geleceği depoyu yaz (Windows otomatik güncellemesi için)
if (repo){
  const pj = path.join(__dirname, '..', 'package.json'), p = JSON.parse(fs.readFileSync(pj, 'utf8'));
  const [owner, name] = repo.split('/');
  p.version = '1.0.' + build;
  p.build.publish = [{ provider: 'github', owner, repo: name, private: !!token, releaseType: 'release' }];
  fs.writeFileSync(pj, JSON.stringify(p, null, 2));
  // Windows uygulaması özel depodan güncelleme okuyabilsin diye (sadece okuma yetkili anahtar)
  fs.writeFileSync(path.join(__dirname, '..', 'electron', 'update.json'), JSON.stringify({ owner, repo: name, token }));
}
