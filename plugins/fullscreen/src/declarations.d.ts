declare module "*.scss" {
  const content: Record<string, string>;
  export default content;
}

interface Window {
  require?: (moduleName: string) => any;
}
