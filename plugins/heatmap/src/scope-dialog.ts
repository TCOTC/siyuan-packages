import { Dialog, fetchSyncPost } from "siyuan";
import { escapeHtml } from "siyuan-html-safety";
import { setDocIconContent } from "./icons";
import type { I18n } from "./locale";
import type { ScopeNotebook } from "./types";

export interface OpenScopeDialogOptions {
  i18n: I18n;
  /** 当前配置的白名单；null 表示全部勾选 */
  includedBoxIds: string[] | null;
  isMobile: boolean;
  onConfirm: (includedBoxIds: string[] | null) => void;
}

let openDialog: Dialog | undefined;

/** 打开「筛选笔记本」勾选 Dialog（取消不保存，确定后回调） */
export function openScopeDialog(options: OpenScopeDialogOptions): void {
  if (openDialog) {
    return;
  }

  const { i18n, includedBoxIds, isMobile, onConfirm } = options;
  let handled = false;

  const dialog = new Dialog({
    title: i18n.statScope,
    content: `<div class="b3-dialog__content jchm-scope"></div>
<div class="b3-dialog__action">
    <button class="b3-button b3-button--cancel" data-action="cancel">${escapeHtml(i18n.cancel)}</button><div class="fn__space"></div>
    <button class="b3-button b3-button--text" data-action="confirm">${escapeHtml(i18n.confirm)}</button>
</div>`,
    width: isMobile ? "92vw" : "420px",
    destroyCallback: () => {
      if (openDialog === dialog) {
        openDialog = undefined;
      }
    },
  });
  openDialog = dialog;

  const body = dialog.element.querySelector(".jchm-scope") as HTMLElement | null;
  const cancelBtn = dialog.element.querySelector('[data-action="cancel"]') as HTMLButtonElement | null;
  const confirmBtn = dialog.element.querySelector('[data-action="confirm"]') as HTMLButtonElement | null;
  if (!body || !cancelBtn || !confirmBtn) {
    dialog.destroy();
    return;
  }

  body.appendChild(createLoadingEl(i18n));
  confirmBtn.disabled = true;

  const finishCancel = () => {
    if (handled) {
      return;
    }
    handled = true;
    dialog.destroy();
  };

  cancelBtn.addEventListener("click", (event) => {
    event.preventDefault();
    finishCancel();
  });

  void listNotebooks()
    .then((notebooks) => {
      if (openDialog !== dialog) {
        return;
      }
      body.replaceChildren();
      confirmBtn.disabled = false;
      if (notebooks.length === 0) {
        const empty = document.createElement("div");
        empty.className = "jchm-scope__empty";
        empty.textContent = i18n.statScopeEmpty;
        body.appendChild(empty);
        confirmBtn.addEventListener("click", (event) => {
          event.preventDefault();
          if (handled) {
            return;
          }
          handled = true;
          onConfirm(null);
          dialog.destroy();
        });
        return;
      }

      const selected = new Set<string>(includedBoxIds == null ? notebooks.map((nb) => nb.id) : includedBoxIds);

      const masterRow = document.createElement("label");
      masterRow.className = "jchm-scope__row jchm-scope__row--master";
      const masterCb = document.createElement("input");
      masterCb.type = "checkbox";
      masterCb.className = "jchm-scope__check";
      const masterText = document.createElement("span");
      masterText.className = "jchm-scope__name";
      masterText.textContent = i18n.statScopeSelectAll;
      masterRow.append(masterCb, masterText);
      body.appendChild(masterRow);

      const list = document.createElement("div");
      list.className = "jchm-scope__list";
      body.appendChild(list);

      const itemChecks: HTMLInputElement[] = [];
      for (const nb of notebooks) {
        const row = document.createElement("label");
        row.className = "jchm-scope__row";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "jchm-scope__check";
        cb.dataset.boxId = nb.id;
        cb.checked = selected.has(nb.id);

        const icon = document.createElement("span");
        icon.className = "jchm-scope__icon";
        if (nb.encrypted && nb.closed) {
          icon.textContent = "🔒️";
        } else {
          setDocIconContent(icon, nb.icon || getDefaultNotebookIcon());
        }

        const name = document.createElement("span");
        name.className = "jchm-scope__name";
        name.textContent = nb.name || nb.id;

        row.append(cb, icon, name);
        list.appendChild(row);
        itemChecks.push(cb);
      }

      const syncMaster = () => {
        const total = itemChecks.length;
        const checkedCount = itemChecks.filter((el) => el.checked).length;
        masterCb.checked = checkedCount === total && total > 0;
        masterCb.indeterminate = checkedCount > 0 && checkedCount < total;
      };
      syncMaster();

      masterCb.addEventListener("change", () => {
        const next = masterCb.checked;
        for (const cb of itemChecks) {
          cb.checked = next;
        }
        masterCb.indeterminate = false;
      });

      for (const cb of itemChecks) {
        cb.addEventListener("change", () => {
          syncMaster();
        });
      }

      confirmBtn.addEventListener("click", (event) => {
        event.preventDefault();
        if (handled) {
          return;
        }
        handled = true;
        const checkedIds = itemChecks
          .filter((el) => el.checked)
          .map((el) => el.dataset.boxId || "")
          .filter(Boolean);
        // 全部勾选 → null（不限制，日后新建笔记本也会纳入）
        const next = checkedIds.length === notebooks.length ? null : checkedIds;
        onConfirm(next);
        dialog.destroy();
      });
    })
    .catch((e) => {
      console.error("heatmap: list notebooks failed", e);
      if (openDialog !== dialog) {
        return;
      }
      body.replaceChildren();
      const err = document.createElement("div");
      err.className = "jchm-scope__empty";
      err.textContent = i18n.statScopeLoadFailed;
      body.appendChild(err);
      confirmBtn.disabled = true;
    });
}

async function listNotebooks(): Promise<ScopeNotebook[]> {
  const response = await fetchSyncPost("/api/notebook/lsNotebooks", {});
  if (response.code !== 0 || !response.data || typeof response.data !== "object") {
    throw new Error(response.msg || "lsNotebooks failed");
  }
  const notebooks = (response.data as { notebooks?: unknown }).notebooks;
  const raw = Array.isArray(notebooks) ? notebooks : [];
  return raw.map(normalizeNotebook).filter((nb): nb is ScopeNotebook => nb != null);
}

function normalizeNotebook(item: unknown): ScopeNotebook | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const row = item as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id) {
    return null;
  }
  return {
    id,
    name: typeof row.name === "string" ? row.name : id,
    icon: typeof row.icon === "string" ? row.icon : "",
    closed: Boolean(row.closed),
    encrypted: Boolean(row.encrypted),
  };
}

function createLoadingEl(i18n: I18n): HTMLElement {
  const el = document.createElement("div");
  el.className = "jchm-scope__loading";
  el.setAttribute("aria-label", i18n.loading);
  el.innerHTML = '<img width="32" height="32" src="/stage/loading-pure.svg" alt="">';
  return el;
}

function getDefaultNotebookIcon(): string {
  const images = (window as any).siyuan?.storage?.["local-images"];
  return String(images?.note || "1f5c3");
}
