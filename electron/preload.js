// Sayfaya "Windows uygulamasındasın" bilgisini verir.
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('gundemDesktop', { platform: 'windows' });
