import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld("api", {
  scanDirectory: (dirPath: string, ignorePatterns: string) => ipcRenderer.invoke("scan-directory", dirPath, ignorePatterns),
  saveTreedump: (dirPath: string, data: any) => ipcRenderer.invoke("save-treedump", dirPath, data),
  openDirectory: () => ipcRenderer.invoke("open-directory-dialog"),
  loadConfig: () => ipcRenderer.invoke("load-config"),
  saveConfig: (currentPath: string) => ipcRenderer.invoke("save-config", currentPath),
  readFiles: (dirPath: string, filePaths: string[]) => ipcRenderer.invoke("read-files", dirPath, filePaths),
  saveIgnorePatterns: (patterns: string) => ipcRenderer.invoke("save-ignore-patterns", patterns),
  loadIgnorePatterns: () => ipcRenderer.invoke("load-ignore-patterns"),
});
