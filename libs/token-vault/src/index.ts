/** 思源插件共用的加密 Token 存储库。 */
export { CURRENT_VERSION, KDF_ITERATIONS, decryptToken, deriveTokenVaultFileName, encryptToken } from "./crypto";
export { seedFromSiyuanSystem } from "./seed";
export type { DeviceEnvInput, SiyuanSystemInput } from "./seed";
export { createTokenVault } from "./vault";
export type { TokenVault, TokenVaultOptions, TokenVaultStorage } from "./vault";
