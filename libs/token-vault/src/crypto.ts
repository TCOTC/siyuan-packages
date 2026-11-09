/**
 * Token 加解密纯算法层（无宿主依赖）。
 *
 * 载荷：`v1.<saltB64Url>.<ivB64Url>.<cipherB64Url>`
 * 密钥：PBKDF2(SHA-256, 500000) 派生自「设备种子 + 随机 salt」，AES-GCM-256 认证加密。
 *
 * 兼容性：输出格式与 install-package 既有 tokenCrypto 逐字节一致。
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const CURRENT_VERSION = "v1";
export const KDF_ITERATIONS = 500000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const DEVICE_HASH_LEN = 20;

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]!);
  }
  return btoa(s);
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      out[i] = bin.charCodeAt(i);
    }
    return out;
  } catch {
    return null;
  }
}

function base64UrlToBytes(b64url: string): Uint8Array | null {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const normalized = pad === 0 ? padded : padded + "=".repeat(4 - pad);
  return base64ToBytes(normalized);
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i]!.toString(16).padStart(2, "0");
  }
  return out;
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function digestFromSeed(seed: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(seed));
  return new Uint8Array(digest);
}

async function deriveAesKey(deviceSeed: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey("raw", encoder.encode(deviceSeed), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bytesToArrayBuffer(salt),
      iterations: KDF_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function randomBytes(size: number): Uint8Array {
  const out = new Uint8Array(size);
  crypto.getRandomValues(out);
  return out;
}

/** 基于设备种子派生稳定的密文文件名。 */
export async function deriveTokenVaultFileName(seed: string): Promise<string> {
  const digest = await digestFromSeed(`token-vault:${seed}`);
  const short = bytesToHex(digest).slice(0, DEVICE_HASH_LEN);
  return `token_${short}.dat`;
}

/** 加密明文 Token；路径与字段顺序必须与既有实现保持一致。 */
export async function encryptToken(plain: string, seed: string): Promise<string> {
  if (!plain) {
    throw new Error("empty token");
  }
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveAesKey(seed, salt);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: bytesToArrayBuffer(iv) }, key, encoder.encode(plain));
  const cipher = new Uint8Array(encrypted);
  return `${CURRENT_VERSION}.${bytesToBase64Url(salt)}.${bytesToBase64Url(iv)}.${bytesToBase64Url(cipher)}`;
}

/** 解密版本化载荷；格式非法或认证失败时返回 null。 */
export async function decryptToken(payload: string, seed: string): Promise<string | null> {
  if (!payload) {
    return null;
  }
  const parts = payload.split(".");
  const [version, saltPart, ivPart, cipherPart] = parts;
  if (parts.length !== 4 || version !== CURRENT_VERSION || saltPart === undefined || ivPart === undefined || cipherPart === undefined) {
    return null;
  }
  const salt = base64UrlToBytes(saltPart);
  const iv = base64UrlToBytes(ivPart);
  const cipher = base64UrlToBytes(cipherPart);
  if (!salt || !iv || !cipher) {
    return null;
  }
  try {
    const key = await deriveAesKey(seed, salt);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytesToArrayBuffer(iv) }, key, bytesToArrayBuffer(cipher));
    return decoder.decode(new Uint8Array(plain));
  } catch {
    return null;
  }
}
