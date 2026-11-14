import type { Plugin } from "siyuan";
import { Menu } from "siyuan";
import { openAlignedToButton } from "siyuan-topbar-menu";
import { CONFIG_MENU_GROUPS, CONFIG_MOBILE_MENU_GROUPS, PluginConfig } from "../config";
import { isMobile } from "../utils";
import { buildConfigMenu } from "./menu-builder";
import { ThemeManager } from "./theme-manager";

/**
 * 顶栏配置菜单：桌面端为按钮弹出的 popup 菜单（含顶栏融合开关），
 * 移动端渲染于全局菜单「扩展」分组并全屏底部弹出；菜单已打开时再次点击按钮关闭。
 * 打开方式与菜单项按设备类型（isMobile）自动选择。
 */
export class ConfigMenu {
  private topBarButton: HTMLElement | null = null;
  private menu: Menu | null = null;

  constructor(
    private readonly plugin: Plugin,
    private readonly config: PluginConfig,
    private readonly themeManager: ThemeManager,
  ) {}

  init(): void {
    // addTopBar 在挂载失败时返回 undefined，这里归一成 null 以保持字段语义
    this.topBarButton =
      this.plugin.addTopBar({
        icon: "iconWhisperFlower",
        title: (this.plugin.i18n.whisper_theme_menu as string | undefined) ?? "whisper_theme_menu",
        callback: (event) => this.openConfigMenu(event),
      }) ?? null;
  }

  destroy(): void {
    this.topBarButton?.remove();
    this.topBarButton = null;

    this.menu?.close();
    this.menu = null;
  }

  /**
   * 打开配置菜单（菜单已打开时再次点击按钮关闭）
   *
   * 开合交给宿主的 `Menu.toggle`（siyuan 仓库 `app/src/plugin/Menu.ts`）：它按 `menu.data === 锚点` 判断
   * 归属，同一按钮再次点击就收起，取代原先由插件自己记一份菜单实例的写法。
   * 但**定位不能交给它**：`IPosition` 只接受坐标，没有「按元素对齐」的参数，锚点仍要自己算
   */
  private openConfigMenu(event?: MouseEvent): void {
    // 触发元素优先取事件目标：从「更多」菜单触发时，被派发 click 的是已隐藏的按钮
    const anchor = (event?.currentTarget as HTMLElement | null) ?? this.topBarButton;

    // 移动端底部 sheet，桌面端 popup 菜单（顶栏融合仅桌面端有意义）
    const mobile = isMobile();
    Menu.toggle({
      target: anchor ?? undefined,
      id: "whisper-config-menu",
      closeCB: () => {
        this.menu = null;
      },
      build: (menu) => {
        buildConfigMenu(menu, {
          plugin: this.plugin,
          config: this.config,
          themeManager: this.themeManager,
          includeToolbarFusion: !mobile,
          groups: mobile ? CONFIG_MOBILE_MENU_GROUPS : CONFIG_MENU_GROUPS,
        });
        // 记下实例：插件卸载时要收起还开着的菜单
        this.menu = menu;
      },
      show: (menu) => {
        if (mobile) {
          menu.fullscreen("bottom");
          return;
        }
        // 顶栏按钮可被拖到任意位置，也可能被收进「更多」：贴按钮对齐由 lib 统一处理
        openAlignedToButton(menu, anchor);
      },
    });
  }
}
