// Sayfaya "Windows uygulamasındasın" bilgisini ve güncelleme düğmelerini verir.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('gundemDesktop', {
  platform: 'windows',
  version: () => ipcRenderer.invoke('gundem-version'),
  updateStatus: () => ipcRenderer.invoke('gundem-upd-status'),
  checkUpdates: () => ipcRenderer.invoke('gundem-upd-check'),
  installUpdate: () => ipcRenderer.invoke('gundem-upd-install'),
  openUpdateLog: () => ipcRenderer.invoke('gundem-upd-log'),
  onUpdate: cb => ipcRenderer.on('gundem-upd', (_e, s) => cb(s)),
});
