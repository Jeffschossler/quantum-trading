const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#0b0f19',
    title: 'Quantum Trading',
    autoHideMenuBar: true, // Esconde a barra de menu padrão (File, Edit, etc)
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Carrega a sua interface principal
  win.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});