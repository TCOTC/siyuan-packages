/**
 * 内核 HTTP 封装的单元测试
 *
 * 关键契约只有一条：**「没拿到内核应答」必须与「内核说失败」区分开**。
 * 混为一谈会让调用方把确定性失败当成网络抖动去重试（或反之，丢掉该重试的机会）。
 */

import * as assert from "node:assert/strict";
import { afterEach, test, vi } from "vitest";
import { getFileBlob, getFileText, kernelPost, kernelPostForm } from "./index.ts";

function stubFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): void {
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => handler(url, init));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("内核业务失败原样透传", async () => {
  stubFetch(async () => Response.json({ code: 400, msg: "bad", data: null }));
  const response = await kernelPost("/api/foo", { a: 1 });
  // 顺序有讲究：assert.deepEqual 是类型断言签名，会把 response 收窄成字面量类型
  assert.equal(response.transportFailed, undefined);
  assert.deepEqual(response, { code: 400, msg: "bad", data: null });
});

test("非 2xx 但响应体是内核包络时按业务失败处理", async () => {
  stubFetch(async () => Response.json({ code: 403, msg: "denied", data: null }, { status: 403, statusText: "Forbidden" }));
  const response = await kernelPost("/api/foo");
  assert.equal(response.code, 403);
  assert.equal(response.msg, "denied");
  assert.equal(response.transportFailed, undefined);
});

test("非 2xx 且响应体不是内核包络时标记传输失败", async () => {
  stubFetch(async () => new Response("<html>502 Bad Gateway</html>", { status: 502, statusText: "Bad Gateway" }));
  const response = await kernelPost("/api/foo");
  assert.equal(response.code, -1);
  assert.equal(response.msg, "HTTP error: 502 Bad Gateway");
  assert.equal(response.transportFailed, true);
});

test("网络异常换算成传输失败而不是抛出", async () => {
  stubFetch(async () => {
    throw new TypeError("Failed to fetch");
  });
  const response = await kernelPost("/api/foo");
  assert.equal(response.code, -1);
  assert.equal(response.msg, "Failed to fetch");
  assert.equal(response.transportFailed, true);
});

test("multipart 与 JSON 走同一套包络归一", async () => {
  let seen: RequestInit | undefined;
  stubFetch(async (_url, init) => {
    seen = init;
    return Response.json({ code: 0, msg: "", data: { ok: true } });
  });
  const form = new FormData();
  form.append("file", new Blob(["x"]), "x.txt");
  const response = await kernelPostForm<{ ok: boolean }>("/api/upload", form);
  assert.deepEqual(response.data, { ok: true });
  assert.equal(seen?.method, "POST");
  assert.equal(seen?.body, form);
});

test("getFileText：200 为正文，202 为错误体", async () => {
  stubFetch(async () => new Response("hello", { status: 200 }));
  assert.deepEqual(await getFileText("/data/a.md"), { ok: true, content: "hello" });

  stubFetch(async () => Response.json({ code: 404, msg: "not found", data: null }, { status: 202, statusText: "Accepted" }));
  assert.deepEqual(await getFileText("/data/b.md"), { ok: false, code: 404, msg: "not found" });
});

test("getFileBlob：200 为二进制，其它状态为失败", async () => {
  stubFetch(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
  const blob = await getFileBlob("/data/a.png");
  assert.equal(blob.ok, true);
  if (blob.ok) {
    assert.deepEqual(new Uint8Array(await blob.blob.arrayBuffer()), new Uint8Array([1, 2, 3]));
  }

  stubFetch(async () => new Response("", { status: 500, statusText: "Internal Server Error" }));
  const failed = await getFileBlob("/data/b.png");
  assert.equal(failed.ok, false);
  if (!failed.ok) {
    assert.equal(failed.msg, "HTTP error: 500 Internal Server Error");
  }
});
