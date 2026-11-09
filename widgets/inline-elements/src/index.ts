import "./index.scss";
import { initI18n } from "./i18n";
import { markWidgetDocument } from "./util";
import { createContext } from "./context/createContext";
import { loadSettings } from "./settings/load";
import { formatError, showError } from "./ui/message";
import { runNormalMode } from "./genList/normal";
import { genListPreview } from "./genList/preview";
import { genListExportImg } from "./genList/export-img";
import { genListExportPdf } from "./genList/export-pdf";

async function main(): Promise<void> {
  // 先写入挂件标识属性，注入主题样式后第三方主题即可据此适配本挂件
  markWidgetDocument();

  initI18n();

  const ctx = await createContext();
  if (!ctx) {
    return;
  }

  loadSettings(ctx);

  const handleError = (error: unknown): void => {
    console.error("inline-elements widget:", error);
    showError(ctx.elements.contentList, formatError(error));
  };

  try {
    switch (ctx.mode) {
      case "normal":
        await runNormalMode(ctx, handleError);
        break;
      case "preview":
        await genListPreview(ctx);
        break;
      case "export-img":
        await genListExportImg(ctx);
        break;
      case "export-pdf":
        await genListExportPdf(ctx);
        break;
    }
  } catch (error) {
    handleError(error);
  }
}

main();
