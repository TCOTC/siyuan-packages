declare module "*.scss" {
  const content: Record<string, string>;
  export default content;
}

interface Window {
  require?(moduleName: "electron"): {
    ipcRenderer?: {
      send: (channel: string, payload: unknown) => void;
    };
    shell?: {
      openPath: (filePath: string) => Promise<string>;
    };
  };
  require?(moduleName: string): unknown;
}
