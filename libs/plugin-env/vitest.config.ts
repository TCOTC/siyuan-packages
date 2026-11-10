import { defineConfig } from "vitest/config";

// 被测函数都是纯函数（前端取值由参数传入），不需要 DOM。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    restoreMocks: true,
  },
});
