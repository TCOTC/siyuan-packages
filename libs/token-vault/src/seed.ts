/**
 * 设备特征种子：同设备同工作空间稳定复现，换环境后无法解密既有密文。
 *
 * 字段拼接顺序必须与 install-package 既有实现逐字节一致：
 * workspaceDir|platform|language|timeZone|memory|cores|deviceId|deviceName|devicePlatform
 */

/** 对应 window.siyuan.config.system 中参与种子派生的字段。 */
export interface SiyuanSystemInput {
  workspaceDir?: string;
  id?: string;
  name?: string;
  osPlatform?: string;
}

/** 可显式传入以覆盖自动探测。 */
export interface DeviceEnvInput {
  platform?: string;
  language?: string;
  timeZone?: string;
  deviceMemory?: number;
  hardwareConcurrency?: number;
}

/** 读取 navigator 与本地时区；非浏览器环境逐项降级为空值。 */
function readDeviceEnv(): DeviceEnvInput {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const navEx = nav as (Navigator & { deviceMemory?: number }) | undefined;
  const tz = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    } catch {
      return "";
    }
  })();
  return {
    platform: navEx?.platform ?? "",
    language: navEx?.language ?? "",
    timeZone: tz,
    deviceMemory: navEx?.deviceMemory,
    hardwareConcurrency: navEx?.hardwareConcurrency,
  };
}

/** 派生设备特征种子。 */
export function seedFromSiyuanSystem(system?: Partial<SiyuanSystemInput>, env: DeviceEnvInput = readDeviceEnv()): string {
  const workspaceDir = system?.workspaceDir ?? "";
  const deviceId = system?.id ?? "";
  const deviceName = system?.name ?? "";
  const devicePlatform = system?.osPlatform ?? "";
  const platform = env.platform ?? "";
  const language = env.language ?? "";
  const timeZone = env.timeZone ?? "";
  const memory = String(env.deviceMemory ?? "");
  const cores = String(env.hardwareConcurrency ?? "");
  return [workspaceDir, platform, language, timeZone, memory, cores, deviceId, deviceName, devicePlatform].join("|");
}
