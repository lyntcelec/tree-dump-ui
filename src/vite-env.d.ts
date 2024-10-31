/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  api: {
    scanDirectory: (dirPath: string, ignorePatterns: string) => Promise<any>;
    saveTreedump: (dirPath: string, data: any, ignorePatterns: string) => Promise<{ success: boolean }>;
    openDirectory: () => Promise<string | null>;
    loadConfig: () => Promise<string>;
    saveConfig: (currentPath: string) => Promise<any>;
    readFiles: (dirPath: string, filePaths: string[]) => Promise<{ [key: string]: string }>;
    saveIgnorePatterns: (patterns: string) => Promise<{ success: boolean }>;
    loadIgnorePatterns: () => Promise<string|null>;
  };
}