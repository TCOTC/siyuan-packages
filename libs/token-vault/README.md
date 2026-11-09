# siyuan-token-vault

思源插件共用的加密 Token 存储库，内部共享，不单独发布。

作用是让插件把 GitHub PAT 这类凭据加密后落盘，而不是写明文。密钥由设备与工作空间特征派生（PBKDF2 + AES-GCM），换设备或换工作空间后旧密文无法解密。

## 特性

- 纯前端实现：仅依赖 Web Crypto（`crypto.subtle`），无 Node/宿主运行时依赖
- 载荷版本化（`v1.salt.iv.cipher`），为后续算法升级预留兼容解码
- 加密带完整性校验（AES-GCM），密文被篡改或种子变化时解密返回 `null` 而非抛错
- 每次加密随机生成 salt/iv，同一明文密文不同
- 无运行时第三方依赖；消费方按源码引入，由构建工具直接打入插件 bundle

## 使用

本库以 `workspace:*` 被同仓插件依赖，`exports` 直接指向 `src/index.ts`（与 `kit` 一样不预编译），消费方构建时由 vite 一并编译打包：

```json
{
  "devDependencies": {
    "siyuan-token-vault": "workspace:*"
  }
}
```

```ts
import { createTokenVault, seedFromSiyuanSystem } from "siyuan-token-vault";
import type { TokenVaultStorage } from "siyuan-token-vault";

// 1. 派生设备特征种子（window.siyuan.config.system 由宿主提供）
const seed = seedFromSiyuanSystem(window.siyuan.config.system);

// 2. 把插件存储 API 适配为 TokenVaultStorage
const storage: TokenVaultStorage = {
  save: (name, content) => plugin.saveData(name, content),
  load: async (name) => {
    const data = await plugin.loadData(name);
    // 思源 loadData 在文件不存在时返回空串，归一为 null
    return typeof data === "string" && data.trim() ? data : null;
  },
  remove: (name) => plugin.removeData(name),
};

// 3. 创建 vault 并保存/加载/删除
const vault = createTokenVault({ seed, storage }); // 默认存于 secret/token_<hash>.dat
await vault.saveToken("ghp_..."); // 加密落盘并缓存明文
const token = await vault.loadToken(); // 解密并缓存明文，失败返回 null
await vault.removeToken(); // 删除密文并清缓存
vault.clear(); // 仅清内存明文缓存
```

### 与插件生命周期的配合

| 时机                          | 操作                                                |
| ----------------------------- | --------------------------------------------------- |
| 插件加载 / 设置数据跨端同步后 | `await vault.loadToken()` 恢复明文缓存              |
| 插件卸载                      | `vault.clear()`（仅清内存；是否删除密文由业务决定） |
| 设置面板保存 Token            | `await vault.saveToken(token)`                      |
| 设置面板删除 Token            | `await vault.removeToken()`                         |
| 调用需凭据的 API              | 读 `vault.cachedToken`（空串表示未配置）            |

## API

- `seedFromSiyuanSystem(system, env?)`：派生设备特征种子
- `encryptToken(plain, seed)` / `decryptToken(payload, seed)`：版本化密文加解密
- `deriveTokenVaultFileName(seed)`：派生稳定密文文件名（`token_<hash>.dat`）
- `createTokenVault(options)`：存储封装（见上文）

类型定义见 [`src/index.ts`](./src/index.ts)。

## 兼容性承诺

- 密文载荷 `v1.<saltB64Url>.<ivB64Url>.<cipherB64Url>` 与 0.1.x 逐字节一致
- 种子字段拼接顺序 `workspaceDir|platform|language|timeZone|memory|cores|deviceId|deviceName|devicePlatform` 不变
- 密文文件名 `token_<20 位 hex>.dat` 的派生算法不变

因此本包的密文与 0.1.x 完全兼容，**不需要重新配置任何存量 Token**。

## 安全说明

- 密钥绑定工作空间目录与设备特征：**不同设备 / 不同工作空间需分别配置 Token**
- 种子不含密码学意义上的随机秘密，加密强度取决于 PBKDF2 迭代次数与 AES-GCM；本方案目标是防「配置文件被直接复制阅读」，不替代系统级凭据管理
- 若浏览器界面语言（`navigator.language`）或时区等参与种子的环境特征变化，会导致既有密文无法解密，届时需重新配置 Token

## 使用本库的插件

- [install-package](https://github.com/TCOTC/install-package)（GitHub Release 安装集市包）
- [snippets](https://github.com/TCOTC/snippets)（代码片段，Gist 同步）

## 开发

在仓库根执行：

```bash
pnpm --filter siyuan-token-vault typecheck
pnpm --filter siyuan-token-vault test
```

## License

[MIT](./LICENSE)
