import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BrowserWindow, Menu, app, dialog, ipcMain } from 'electron';
import { settings } from './setting-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      preload: path.join(__dirname, `preload.cjs`),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, `..`, `application`, `UI`, `index.html`));
}

function buildMenu() {
  const template = [
    {
      label: `File`,
      submenu: [
        {
          label: `Open`,
          accelerator: `CmdOrCtrl+O`,
          async click() {
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
              properties: [`openFile`],
              filters: [
                { name: `Markdown`, extensions: [`md`, `markdown`, `txt`] },
                { name: `All Files`, extensions: [`*`] },
              ],
            });
            if (canceled || filePaths.length === 0) return;
            const filePath = filePaths[0];
            const content = await readFile(filePath, `utf-8`);
            const fileDir = path.dirname(filePath);
            mainWindow.webContents.send(`file-opened`, content, fileDir);
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));

  mainWindow.webContents.on(`context-menu`, (_event, params) => {
    const menuItems = [];

    if (params.linkURL) {
      menuItems.push({
        label: `Copy Link Address`,
        click: () => {
          require(`electron`).clipboard.writeText(params.linkURL);
        },
      });
      menuItems.push({ type: `separator` });
    }

    if (params.mediaType === `image`) {
      menuItems.push({
        label: `Copy Image`,
        click: () => {
          mainWindow.webContents.copyImageAt(params.x, params.y);
        },
      });
      menuItems.push({
        label: `Copy Image Address`,
        click: () => {
          require(`electron`).clipboard.writeText(params.srcURL);
        },
      });
      menuItems.push({ type: `separator` });
    }

    if (params.isEditable) {
      menuItems.push({ role: `undo` });
      menuItems.push({ role: `redo` });
      menuItems.push({ type: `separator` });
    }

    if (params.isEditable || params.selectionText) {
      menuItems.push({ role: `cut`, enabled: params.isEditable });
      menuItems.push({ role: `copy` });
    }

    if (params.isEditable) {
      menuItems.push({ role: `paste` });
      menuItems.push({ role: `delete` });
    }

    if (menuItems.length > 0) {
      menuItems.push({ type: `separator` });
    }

    menuItems.push({ role: `selectAll` });
    menuItems.push({ type: `separator` });
    menuItems.push({
      label: `Inspect Element`,
      click: () => {
        mainWindow.webContents.inspectElement(params.x, params.y);
      },
    });

    const contextMenu = Menu.buildFromTemplate(menuItems);
    contextMenu.popup({ window: mainWindow });
  });
}

app.whenReady().then(() => {
  settings.initialize();

  ipcMain.handle(`settings:get`, (_event, key, defaultValue) => {
    return settings.get(key, defaultValue);
  });

  ipcMain.handle(`settings:set`, (_event, key, value) => {
    settings.set(key, value);
  });

  createWindow();
  buildMenu();
});

app.on(`window-all-closed`, () => {
  settings.close();
  app.quit();
});
