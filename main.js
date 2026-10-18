// main.js
// Electron: otwiera okno z interfejsem (web/index.html). Cała aplikacja, łącznie z silnikiem D-algorytmu, działa w oknie.
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

app.whenReady().then(() => {
    if (app.isPackaged) Menu.setApplicationMenu(null);  // w wydaniu bez domyślnego menu Electrona
    const win = new BrowserWindow({
        width: 1300, height: 850, title: 'DIANA', backgroundColor: '#121212',
        webPreferences: { devTools: !app.isPackaged },    // narzędzia deweloperskie tylko przy `npm start`
    });
    win.loadFile(path.join(__dirname, 'web', 'index.html'));
});

app.on('window-all-closed', () => app.quit());
