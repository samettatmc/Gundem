// Gündem — Windows uygulaması
const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) app.quit();

// Tarayıcı kimliğinde (User-Agent) "Gündem" adındaki ü harfi bozuk gidiyor ve
// Supabase girişte "Database error granting user" hatası veriyor. Kimliği sadece ASCII harflerle gönder.
app.userAgentFallback = app.userAgentFallback.replace(/G\S*ndem\//g, 'Gundem/').replace(/[^\x20-\x7E]/g, '');
let win;

// Güncelleme günlüğü: %APPDATA%\Gündem\guncelleme.log
function log(msg){
  try { fs.appendFileSync(path.join(app.getPath('userData'), 'guncelleme.log'), new Date().toISOString() + ' ' + msg + '\n'); } catch(e){}
}
let lastStatus = { state: 'idle' };
function status(state, extra){
  lastStatus = { state, ...(extra || {}) };
  log(state + (extra ? ' ' + JSON.stringify(extra) : ''));
  if (win && !win.isDestroyed()) win.webContents.send('gundem-upd', lastStatus);
}

function createWindow(){
  win = new BrowserWindow({
    width: 1100, height: 820, minWidth: 380, minHeight: 560,
    title: 'Gündem', backgroundColor: '#0E131B', autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, spellcheck: false }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // dış bağlantılar tarayıcıda açılsın
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); } });
}

let feed = null, updaterReady = false;
function setupUpdater(){
  try { feed = JSON.parse(fs.readFileSync(path.join(__dirname, 'update.json'), 'utf8')); } catch(e){ feed = null; }
  log('başlangıç: sürüm ' + app.getVersion() + ', paketli=' + app.isPackaged + ', depo=' + (feed ? feed.owner + '/' + feed.repo : 'yok'));
  if (!app.isPackaged){ status('dev'); return; }
  if (!feed || !feed.owner){ status('nofeed'); return; }
  // Depo açıksa anahtarsız, özelse sadece okuma yetkili anahtarla güncelleme okunur.
  autoUpdater.setFeedURL(feed.token
    ? { provider: 'github', owner: feed.owner, repo: feed.repo, private: true, token: feed.token }
    : { provider: 'github', owner: feed.owner, repo: feed.repo });
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: m => log('i ' + m), warn: m => log('w ' + m), error: m => log('e ' + m), debug: () => {} };
  autoUpdater.on('checking-for-update', () => status('checking'));
  autoUpdater.on('update-not-available', i => status('latest', { version: i && i.version }));
  autoUpdater.on('update-available', i => status('available', { version: i && i.version }));
  autoUpdater.on('download-progress', p => status('downloading', { percent: Math.round(p.percent || 0) }));
  autoUpdater.on('update-downloaded', info => {
    status('ready', { version: info.version });
    dialog.showMessageBox(win, {
      type: 'info', buttons: ['Şimdi yeniden başlat', 'Sonra'], defaultId: 0, cancelId: 1,
      title: 'Gündem güncellendi', message: 'Yeni sürüm hazır (' + info.version + ')',
      detail: 'Şimdi yeniden başlatabilirsin. "Sonra" dersen uygulamayı kapattığında kendiliğinden kurulur.'
    }).then(r => { if (r.response === 0) autoUpdater.quitAndInstall(); });
  });
  autoUpdater.on('error', err => status('error', { message: String((err && err.message) || err).split('\n')[0].slice(0, 300) }));
  updaterReady = true;
  check();
  setInterval(check, 2 * 3600e3);
}
function check(){
  if (!updaterReady) return lastStatus;
  autoUpdater.checkForUpdates().catch(err => status('error', { message: String((err && err.message) || err).split('\n')[0].slice(0, 300) }));
  return lastStatus;
}

ipcMain.handle('gundem-version', () => app.getVersion());
ipcMain.handle('gundem-upd-status', () => lastStatus);
ipcMain.handle('gundem-upd-check', () => { check(); return lastStatus; });
ipcMain.handle('gundem-upd-install', () => { if (lastStatus.state === 'ready') autoUpdater.quitAndInstall(); });
ipcMain.handle('gundem-upd-log', () => { shell.openPath(path.join(app.getPath('userData'), 'guncelleme.log')); });

app.on('second-instance', () => { if (win){ if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  createWindow();
  // pencere yüklendikten sonra başlat ki durum ekrana gelebilsin
  win.webContents.once('did-finish-load', () => setTimeout(setupUpdater, 1500));
});
app.on('window-all-closed', () => app.quit());
