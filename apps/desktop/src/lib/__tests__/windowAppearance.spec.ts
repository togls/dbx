// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWindowAppearanceController, type WindowTransparencyCapability } from "@/lib/windowAppearance";

const MICA_CAPABILITY: WindowTransparencyCapability = {
  supported: true,
  effect: "mica",
  platform: "windows",
  windowsBuild: 26100,
  reason: null,
};

const UNSUPPORTED_CAPABILITY: WindowTransparencyCapability = {
  supported: false,
  effect: "none",
  platform: "linux",
  windowsBuild: null,
  reason: "windows_11_required",
};

function createController(capability = MICA_CAPABILITY) {
  const setMica = vi.fn(async () => {});
  const clearEffects = vi.fn(async () => {});
  const controller = createWindowAppearanceController({
    root: document.documentElement,
    loadCapability: vi.fn(async () => capability),
    setMica,
    clearEffects,
    nextFrame: vi.fn(async () => {}),
    log: vi.fn(),
  });
  return { controller, setMica, clearEffects };
}

afterEach(() => {
  document.documentElement.removeAttribute("data-window-material");
  document.documentElement.style.removeProperty("--dbx-window-background-opacity");
});

describe("window appearance controller", () => {
  it("applies Mica once and previews opacity without reapplying the effect", async () => {
    const { controller, setMica } = createController();

    await controller.apply({ enabled: true, opacity: 85 });
    controller.previewBackgroundOpacity(72);

    expect(setMica).toHaveBeenCalledTimes(1);
    expect(controller.runtimeState.active).toBe(true);
    expect(document.documentElement.dataset.windowMaterial).toBe("mica");
    expect(document.documentElement.style.getPropertyValue("--dbx-window-background-opacity")).toBe("0.72");
  });

  it("restores an opaque background before clearing Mica", async () => {
    const { controller, clearEffects } = createController();
    await controller.apply({ enabled: true, opacity: 70 });

    await controller.apply({ enabled: false, opacity: 70 });

    expect(clearEffects).toHaveBeenCalledTimes(1);
    expect(controller.runtimeState.active).toBe(false);
    expect(document.documentElement.dataset.windowMaterial).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--dbx-window-background-opacity")).toBe("1");
  });

  it("does not call Mica on unsupported platforms", async () => {
    const { controller, setMica } = createController(UNSUPPORTED_CAPABILITY);

    await controller.apply({ enabled: true, opacity: 85 });

    expect(setMica).not.toHaveBeenCalled();
    expect(controller.runtimeState.active).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--dbx-window-background-opacity")).toBe("1");
  });

  it("falls back to opaque when applying Mica fails", async () => {
    const { controller, setMica, clearEffects } = createController();
    setMica.mockRejectedValueOnce(new Error("mica unavailable"));

    await controller.apply({ enabled: true, opacity: 85 });

    expect(clearEffects).toHaveBeenCalledTimes(1);
    expect(controller.runtimeState.active).toBe(false);
    expect(controller.runtimeState.error).toBe("mica unavailable");
    expect(document.documentElement.style.getPropertyValue("--dbx-window-background-opacity")).toBe("1");
  });

  it("keeps the page opaque when clearing effects fails", async () => {
    const { controller, clearEffects } = createController();
    await controller.apply({ enabled: true, opacity: 85 });
    clearEffects.mockRejectedValueOnce(new Error("clear failed"));

    await controller.apply({ enabled: false, opacity: 85 });

    expect(controller.runtimeState.active).toBe(false);
    expect(controller.runtimeState.error).toBe("clear failed");
    expect(document.documentElement.dataset.windowMaterial).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--dbx-window-background-opacity")).toBe("1");
  });

  it("prevents an older async enable from overwriting a newer disable", async () => {
    let resolveMica: (() => void) | undefined;
    const setMica = vi.fn(() => new Promise<void>((resolve) => (resolveMica = resolve)));
    const clearEffects = vi.fn(async () => {});
    const controller = createWindowAppearanceController({
      root: document.documentElement,
      loadCapability: vi.fn(async () => MICA_CAPABILITY),
      setMica,
      clearEffects,
      nextFrame: vi.fn(async () => {}),
      log: vi.fn(),
    });

    const enable = controller.apply({ enabled: true, opacity: 85 });
    await vi.waitFor(() => expect(setMica).toHaveBeenCalledTimes(1));
    const disable = controller.apply({ enabled: false, opacity: 85 });
    resolveMica?.();
    await Promise.all([enable, disable]);

    expect(setMica).toHaveBeenCalledTimes(1);
    expect(clearEffects).toHaveBeenCalledTimes(1);
    expect(controller.runtimeState.active).toBe(false);
    expect(document.documentElement.dataset.windowMaterial).toBeUndefined();
  });
});
