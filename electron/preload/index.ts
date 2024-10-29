import { ipcRenderer, contextBridge } from 'electron'

contextBridge.exposeInMainWorld("api", {
  scanDirectory: (dirPath: string) => ipcRenderer.invoke("scan-directory", dirPath),
  saveTreedump: (dirPath: string, data: any) => ipcRenderer.invoke("save-treedump", dirPath, data),
  openDirectory: () => ipcRenderer.invoke("open-directory-dialog"),
});