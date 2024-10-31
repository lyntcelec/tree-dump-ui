import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld("api", {
  scanDirectory: (dirPath: string) => ipcRenderer.invoke("scan-directory", dirPath),
  saveTreedump: (dirPath: string, data: any, ignorePatterns: string) => ipcRenderer.invoke("save-treedump", dirPath, data, ignorePatterns),
  openDirectory: () => ipcRenderer.invoke("open-directory-dialog"),
  loadConfig: () => ipcRenderer.invoke("load-config"),
  saveConfig: (currentPath: string) => ipcRenderer.invoke("save-config", currentPath),
  readFiles: (dirPath: string, filePaths: string[]) => ipcRenderer.invoke("read-files", dirPath, filePaths),
});
