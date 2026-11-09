import { WIDGET_ATTR_PREFIX } from "../util";

export async function setBlockAttrs(blockId: string | null, attrs: Record<string, string>) {
  if (window.parent.siyuan.isPublish) {
    // 发布服务不写入数据
    return;
  }
  if (!blockId) {
    console.warn("inline-elements widget: Failed to setBlockAttrs, blockId is null");
    return;
  }

  // 为属性名添加前缀
  const prefixedAttrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    prefixedAttrs[`${WIDGET_ATTR_PREFIX}${key}`] = value;
  }

  try {
    const response = await fetch("/api/attr/setBlockAttrs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: blockId,
        attrs: prefixedAttrs,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.code !== 0) {
      throw new Error(result.msg || "setBlockAttrs failed");
    }
    return result;
  } catch (error) {
    console.warn("inline-elements widget: Failed to setBlockAttrs, error:", error);
    throw error;
  }
}

export async function querySQL(sql: string) {
  try {
    const response = await fetch("/api/query/sql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stmt: sql,
      }),
    });

    const result = await response.json();

    if (result.code === 0) {
      return result.data;
    } else {
      throw new Error(result.msg);
    }
  } catch (error) {
    console.warn("inline-elements widget: Failed to querySQL, error:", error);
    throw error;
  }
}

export async function getBlockDOM(blockId: string, withEmbed: boolean) {
  const api = withEmbed ? "/api/block/getBlockDOMWithEmbed" : "/api/block/getBlockDOM";
  try {
    const response = await fetch(api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: blockId,
      }),
    });
    const result = await response.json();
    if (result.code !== 0) {
      throw new Error(result.msg || "getBlockDOM failed");
    }
    return result;
  } catch (error) {
    console.warn("inline-elements widget: Failed to getBlockDOM, error:", error);
    throw error;
  }
}
