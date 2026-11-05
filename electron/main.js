// Gündem — Windows uygulaması
const { app, BrowserWindow, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');

if (!app.requestSingleInstanceLock()) app.quit();

// Tarayıcı kimliğinde (User-Agent) "Gündem" adındaki ü harfi bozuk gidiyor ve
// Supabase girişte "Database error granting user" hatası veriyor. Kimliği sadece ASCII harflerle gönder.
app.userAgentFallback = app.userAgentFallback.replace(/G\S*ndem\//g, 'Gundem/').replace(/[^\x20-\x7E]/g, '');
let win;

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

app.on('second-instance', () => { if (win){ if (win.isMinimized()) win.restore(); win.focus(); } });
app.whenReady().then(() => {
  createWindow();
  let feed = null;
  try { feed = JSON.parse(fs.readFileSync(path.join(__dirname, 'update.json'), 'utf8')); } catch(e){}
  if (app.isPackaged && feed && feed.owner){
    // Depo açıksa anahtarsız, özelse sadece okuma yetkili anahtarla güncelleme okunur.
    autoUpdater.setFeedURL(feed.token
      ? { provider: 'github', owner: feed.owner, repo: feed.repo, private: true, token: feed.token }
      : { provider: 'github', owner: feed.owner, repo: feed.repo });
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-downloaded', info => {
      dialog.showMessageBox(win, {
        type: 'info', buttons: ['Şimdi yeniden başlat', 'Sonra'], defaultId: 0, cancelId: 1,
        title: 'Gündem güncellendi', message: 'Yeni sürüm hazır (' + info.version + ')',
        detail: 'Şimdi yeniden başlatabilirsin. "Sonra" dersen uygulamayı kapattığında kendiliğinden kurulur.'
      }).then(r => { if (r.response === 0) autoUpdater.quitAndInstall(); });
    });
    autoUpdater.on('error', () => {});
    autoUpdater.checkForUpdates().catch(() => {});
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 3600e3);
  }
});
app.on('window-all-closed', () => app.quit());
