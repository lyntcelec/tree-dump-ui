/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  api: {
    scanDirectory: (dirPath: string) => Promise<any>;
    saveTreedump: (dirPath: string, data: any) => Promise<any>;
    openDirectory: () => Promise<string | null>;
  };
}