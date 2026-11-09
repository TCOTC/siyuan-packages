/**
 * 加密落盘 + 明文会话缓存。
 * 以「设备种子 + 版本化密文」为单一事实源，宿主存储经 TokenVaultStorage 注入。
 */
import { decryptToken, deriveTokenVaultFileName, encryptToken } from "./crypto";

/**
 * 思源插件用 plugin.saveData/loadData/removeData 实现；
 * load 在文件不存在时应返回 null（思源 loadData 无文件时返回空串，由适配层归一）。
 */
export interface TokenVaultStorage {
  save(name: string, content: string): Promise<unknown>;
  load(name: string): Promise<string | null>;
  remove(name: string): Promise<unknown>;
}

export interface TokenVaultOptions {
  seed: string;
  storage: TokenVaultStorage;
  /** 密文存储目录，默认 "secret"（为空串则直接存于存储根） */
  dir?: string;
}

export interface TokenVault {
  /** 密文存储名（默认 secret/token_<hash>.dat），首次调用后缓存。 */
  fileName(): Promise<string>;

  /** 加密并保存，成功后写入会话缓存。 */
  saveToken(plain: string): Promise<string>;

  /** 加载并解密，成功后写入会话缓存；失败返回 null。 */
  loadToken(): Promise<string | null>;

  /**
   * 探测存储中是否存在非空密文（不解密、不改缓存）。
   * 用于区分 loadToken 返回 null 的两种情形：从未保存（false）与解密失败（true）。
   */
  hasStoredToken(): Promise<boolean>;

  /** 删除密文并清空会话缓存。 */
  removeToken(): Promise<void>;

  /** 只清空内存缓存，不删除存储。 */
  clear(): void;

  readonly cachedToken: string;
}

/** 创建 Token Vault。 */
export function createTokenVault(options: TokenVaultOptions): TokenVault {
  const dir = (options.dir ?? "secret").replace(/\/+$/, "");
  let cachedToken = "";
  let cachedFileName: string | undefined;

  const fileName = async (): Promise<string> => {
    if (!cachedFileName) {
      const name = await deriveTokenVaultFileName(options.seed);
      cachedFileName = dir ? `${dir}/${name}` : name;
    }
    return cachedFileName;
  };

  return {
    async fileName() {
      return fileName();
    },

    async saveToken(plain: string): Promise<string> {
      const payload = await encryptToken(plain, options.seed);
      await options.storage.save(await fileName(), payload);
      cachedToken = plain;
      return payload;
    },

    async loadToken(): Promise<string | null> {
      const data = await options.storage.load(await fileName());
      // loadData 无文件时返回空串，适配层也可能归一为 null。
      if (typeof data !== "string" || !data.trim()) {
        cachedToken = "";
        return null;
      }
      const token = await decryptToken(data.trim(), options.seed);
      cachedToken = token ?? "";
      return token;
    },

    async hasStoredToken(): Promise<boolean> {
      const data = await options.storage.load(await fileName());
      return typeof data === "string" && data.trim().length > 0;
    },

    async removeToken(): Promise<void> {
      await options.storage.remove(await fileName());
      cachedToken = "";
    },

    clear() {
      cachedToken = "";
    },

    get cachedToken() {
      return cachedToken;
    },
  };
}
