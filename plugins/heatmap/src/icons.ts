const DYNAMIC_ICON_PREFIX = "api/icon/getDynamicIcon";
const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:/;

type IconValueKind = "unicode" | "custom" | "dynamic" | "network" | "invalid";

/** 对齐思源 getIconValueKind / unicode2Emoji，避免动态图标等被误判后回退 SVG */
export function setDocIconContent(el: HTMLElement, icon: string, docId = ""): void {
  const raw = (icon || getDefaultFileIcon() || "1f4c4").trim();
  const value = decodeIconAmp(raw);
  const kind = getIconValueKind(value);

  if (kind === "dynamic" || kind === "network" || kind === "custom") {
    const img = document.createElement("img");
    if (kind === "custom") {
      img.src = `/emojis/${value}`;
    } else if (kind === "network") {
      img.src = normalizeNetworkIconURL(value) || value;
      img.referrerPolicy = "no-referrer";
    } else {
      img.src = bindDynamicIconTarget(value, docId);
    }
    el.replaceChildren(img);
    return;
  }

  if (kind === "unicode") {
    const emoji = unicodeToEmoji(value);
    if (emoji) {
      el.textContent = emoji;
      return;
    }
  }

  // invalid / 解析失败：回退默认文件 emoji（与文档树一致，不用 #iconFile）
  if (value !== "1f4c4") {
    const fallback = getDefaultFileIcon() || "1f4c4";
    if (fallback !== value) {
      setDocIconContent(el, fallback);
      return;
    }
  }
  el.textContent = unicodeToEmoji("1f4c4");
}

function getIconValueKind(value: string): IconValueKind {
  if (value.startsWith(DYNAMIC_ICON_PREFIX)) {
    return "dynamic";
  }
  if (normalizeNetworkIconURL(value)) {
    return "network";
  }
  if (URL_SCHEME_PATTERN.test(value) || value.startsWith("//")) {
    return "invalid";
  }
  if (value.includes(".")) {
    return "custom";
  }
  return "unicode";
}

function normalizeNetworkIconURL(value: string): string | undefined {
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== "http:" && url.protocol !== "https:") || !url.host) {
      return;
    }
    return url.href;
  } catch {
    return;
  }
}

/** type=8 文本动态图标需绑定文档 id，否则服务端无法生成 */
function bindDynamicIconTarget(value: string, targetID: string): string {
  if (getIconValueKind(value) !== "dynamic") {
    return value;
  }
  const [path, query = ""] = value.split("?", 2);
  const params = new URLSearchParams(query);
  if (params.get("type") === "8" && targetID) {
    params.set("id", targetID);
  } else {
    params.delete("id");
  }
  params.sort();
  const boundQuery = params.toString();
  return boundQuery ? `${path}?${boundQuery}` : path;
}

function decodeIconAmp(value: string): string {
  return value.replace(/&amp;/g, "&");
}

function getDefaultFileIcon(): string {
  const images = (window as any).siyuan?.storage?.["local-images"];
  return String(images?.file || "");
}

function unicodeToEmoji(unicode: string): string {
  try {
    let emoji = "";
    unicode.split("-").forEach((item) => {
      if (item.length < 5) {
        emoji += String.fromCodePoint(parseInt("0" + item, 16));
      } else {
        emoji += String.fromCodePoint(parseInt(item, 16));
      }
    });
    return emoji;
  } catch {
    return "";
  }
}
