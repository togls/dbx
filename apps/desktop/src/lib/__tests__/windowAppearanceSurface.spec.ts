import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("window appearance surface contract", () => {
  it("keeps the shell and major surfaces on semantic background classes", () => {
    expect(source("../../App.vue")).toContain("dbx-main-surface");
    expect(source("../../components/layout/AppToolbar.vue")).toContain("dbx-toolbar-surface");
    expect(source("../../components/layout/AppSidebar.vue")).toContain("dbx-sidebar-surface");
    expect(source("../../components/layout/WelcomeScreen.vue")).toContain("dbx-welcome-surface");
    expect(source("../../components/editor/EditorSettingsDialog.vue")).toContain("dbx-settings-surface");
  });

  it("keeps the Mica layer behind the content stacking layer", () => {
    const styles = source("../../styles/globals.css");

    expect(styles).toContain("--dbx-window-background-opacity-percent");
    expect(styles).toContain("position: absolute;");
    expect(styles).toContain(".dbx-app-content");
    expect(styles).toContain("z-index: 1;");
  });
});
