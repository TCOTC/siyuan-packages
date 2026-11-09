/**
 * 样式文件由 vite 作为副作用导入处理，产物里会被抽成 index.css。
 * 本包不直接依赖 vite（打包器由 kit 提供），所以在这里给出最小的模块声明，
 * 让 tsc 能通过而不必为了类型把 vite 装进包内。
 */
declare module "*.scss";
declare module "*.css";
