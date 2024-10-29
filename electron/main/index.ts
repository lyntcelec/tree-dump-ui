import { app, BrowserWindow, shell, ipcMain, dialog } from "electron";
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { promisify } from "node:util";
import fs from "node:fs";

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    webPreferences: {
      preload,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    // win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})

// Helper functions
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const configFilePath = path.join(process.env.APP_ROOT, 'config.json');
// Modified scanDirectory function
async function scanDirectory(dirPath: string, selectedIds: Set<string>) {
  const entries = await readdir(dirPath);
  const tree = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const entryStat = await stat(fullPath);

    const node: any = {
      id: fullPath,
      label: entry,
      checked: selectedIds.has(fullPath),
    };

    if (entryStat.isDirectory()) {
      const children = await scanDirectory(fullPath, selectedIds);
      node.children = children;
    }
    tree.push(node);
  }

  return tree;
}

// IPC Handlers
ipcMain.handle("scan-directory", async (_event, dirPath: string) => {
  try {
    console.log("Scanning directory:", dirPath);
    const treedumpPath = path.join(dirPath, "treedump.json");
    let selectedIds = new Set<string>();

    if (fs.existsSync(treedumpPath)) {
      const data = await readFile(treedumpPath, "utf-8");
      const selectedNodes = JSON.parse(data);
      selectedIds = new Set(selectedNodes.map((node: any) => node.id));
    }

    const treeData = await scanDirectory(dirPath, selectedIds);
    return treeData;
  } catch (error) {
    console.error("Error scanning directory:", error);
    return [];
  }
});

ipcMain.handle("save-treedump", async (_event, dirPath: string, data: any) => {
  const treedumpPath = path.join(dirPath, "treedump.json");
  await writeFile(treedumpPath, JSON.stringify(data, null, 2), "utf-8");
  return { success: true };
});

ipcMain.handle("open-directory-dialog", async (_event) => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

ipcMain.handle("load-config", async () => {
  try {
    if (fs.existsSync(configFilePath)) {
      const data = await readFile(configFilePath, "utf-8");
      return JSON.parse(data).currentPath || "";
    }
  } catch (error) {
    console.error("Failed to load config:", error);
  }
  return "";
});

ipcMain.handle("save-config", async (_event, currentPath: string) => {
  try {
    const configData = { currentPath };
    await writeFile(configFilePath, JSON.stringify(configData, null, 2), "utf-8");
    return { success: true };
  } catch (error) {
    console.error("Failed to save config:", error);
    return { success: false };
  }
});