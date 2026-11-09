import { expect, test } from "vitest";
import { DEFAULT_CONFIG, normalizeConfig } from "./index";

test("optional entry buttons are disabled by default", () => {
  expect(DEFAULT_CONFIG.showTopBarButton).toBe(false);
  expect(DEFAULT_CONFIG.showBreadcrumbButton).toBe(false);
});

test("normalizes persisted entry button settings", () => {
  expect(
    normalizeConfig({
      enabled: false,
      detectOnPaste: false,
      showTopBarButton: true,
      showBreadcrumbButton: true,
    }),
  ).toEqual({
    enabled: false,
    detectOnPaste: false,
    showTopBarButton: true,
    showBreadcrumbButton: true,
  });
});
