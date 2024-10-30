import { app, BrowserWindow, shell, ipcMain, dialog } from "electron";
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { promisify } from "node:util";
import fs from "node:fs";
import { isText } from 'istextorbinary';

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
    width: 800,
    height: 800,
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

async function scanDirectory(dirPath: string, selectedNodes: Map<string, any>) {
  const entries = await readdir(dirPath);
  const tree = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    const entryStat = await stat(fullPath);

    const node: any = {
      id: fullPath,
      label: entry,
      checked: selectedNodes.has(fullPath),
    };

    // Include lineFrom and lineTo if they exist
    if (selectedNodes.has(fullPath)) {
      const selectedNodeData = selectedNodes.get(fullPath);
      node.lineFrom = selectedNodeData.lineFrom;
      node.lineTo = selectedNodeData.lineTo;
    }

    if (entryStat.isDirectory()) {
      const children = await scanDirectory(fullPath, selectedNodes);
      node.children = children;
    }
    tree.push(node);
  }

  return tree;
}

ipcMain.handle("scan-directory", async (_event, dirPath: string) => {
  try {
    const treedumpPath = path.join(dirPath, ".treedump");
    let selectedNodes = new Map<string, any>();

    if (fs.existsSync(treedumpPath)) {
      const data = await readFile(treedumpPath, "utf-8");
      const selectedNodesArray = JSON.parse(data);
      for (const node of selectedNodesArray) {
        const fullPath = path.join(dirPath, node.id);
        selectedNodes.set(fullPath, node);
      }
    }

    const treeData = await scanDirectory(dirPath, selectedNodes);
    const selectedIds = Array.from(selectedNodes.keys());
    return { treeData, selectedIds };
  } catch (error) {
    console.error("Error scanning directory:", error);
    return { treeData: [], selectedIds: [] };
  }
});


ipcMain.handle("save-treedump", async (_event, dirPath: string, data: any) => {
  const treedumpPath = path.join(dirPath, ".treedump");
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

ipcMain.handle("read-files", async (_event, dirPath: string, filePaths: string[]) => {
  const contents: { [key: string]: string } = {};

  for (const filePath of filePaths) {
    try {
      const fullFilePath = path.join(dirPath, filePath);
      const buffer = await readFile(fullFilePath);
      const isTextFile = isText(null, buffer);
      if (isTextFile) {
        contents[filePath] = buffer.toString('utf-8');
      } else {
        contents[filePath] = "<< Cannot show this file >>";
      }
    } catch (error) {
      contents[filePath] = "<< Cannot show this file >>";
    }
  }
  return contents;
});
