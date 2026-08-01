import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/backend/tauriRuntime";
import { normalizeWindowBackgroundOpacity } from "@/lib/windowAppearanceSettings";

const WINDOW_MATERIAL_ATTRIBUTE = "data-window-material";
const WINDOW_BACKGROUND_OPACITY_PROPERTY = "--dbx-window-background-opacity-percent";

export interface WindowTransparencyCapability {
  supported: boolean;
  effect: "mica" | "none";
  platform: string;
  windowsBuild?: number | null;
  reason?: string | null;
}

export interface WindowTransparencyRuntimeState {
  requested: boolean;
  /** The native API accepted the effect request; Windows still owns final compositing. */
  apiApplied: boolean;
  /** The CSS and native application chain is active, not a pixel-level visibility guarantee. */
  active: boolean;
  applying: boolean;
  capability: WindowTransparencyCapability | null;
  error: string | null;
}

export interface WindowAppearanceSettings {
  enabled: boolean;
  opacity: number;
}

interface WindowAppearanceDependencies {
  root: HTMLElement;
  loadCapability: () => Promise<WindowTransparencyCapability>;
  setMica: () => Promise<void>;
  clearEffects: () => Promise<void>;
  nextFrame: () => Promise<void>;
  log: (event: string, details: Record<string, unknown>) => void;
}

export interface WindowAppearanceController {
  runtimeState: WindowTransparencyRuntimeState;
  getCapability: () => Promise<WindowTransparencyCapability>;
  apply: (settings: WindowAppearanceSettings) => Promise<void>;
  previewBackgroundOpacity: (opacity: number) => void;
  forceOpaque: () => Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function opacityCssValue(opacity: number): string {
  return `${normalizeWindowBackgroundOpacity(opacity)}%`;
}

function opaqueCapability(reason: string): WindowTransparencyCapability {
  return {
    supported: false,
    effect: "none",
    platform: isTauriRuntime() ? "unknown" : "web",
    windowsBuild: null,
    reason,
  };
}

class DefaultWindowAppearanceController implements WindowAppearanceController {
  readonly runtimeState = reactive<WindowTransparencyRuntimeState>({
    requested: false,
    apiApplied: false,
    active: false,
    applying: false,
    capability: null,
    error: null,
  });
  private capabilityPromise: Promise<WindowTransparencyCapability> | null = null;
  private effectActive = false;
  private applyRevision = 0;
  private applyQueue = Promise.resolve();

  constructor(private readonly dependencies: WindowAppearanceDependencies) {
    this.setOpaqueBackground();
  }

  private setOpaqueBackground(removeMaterial = true) {
    this.dependencies.root.style.setProperty(WINDOW_BACKGROUND_OPACITY_PROPERTY, "100%");
    if (removeMaterial) this.dependencies.root.removeAttribute(WINDOW_MATERIAL_ATTRIBUTE);
  }

  private logState(event: string, settings: WindowAppearanceSettings, error: string | null = null) {
    this.dependencies.log(event, {
      requested: settings.enabled,
      supported: this.runtimeState.capability?.supported ?? false,
      effect: this.runtimeState.capability?.effect ?? "none",
      apiApplied: this.runtimeState.apiApplied,
      materialVisibility: this.runtimeState.apiApplied ? "os_managed_unknown" : "opaque",
      windowsBuild: this.runtimeState.capability?.windowsBuild ?? null,
      backgroundOpacity: normalizeWindowBackgroundOpacity(settings.opacity),
      error,
    });
  }

  async getCapability(): Promise<WindowTransparencyCapability> {
    this.capabilityPromise ??= this.dependencies
      .loadCapability()
      .catch((error) => {
        const message = errorMessage(error);
        this.runtimeState.error = message;
        this.dependencies.log("window_appearance.apply_failed", { stage: "capability", error: message });
        return opaqueCapability("capability_unavailable");
      })
      .then((capability) => {
        this.runtimeState.capability = capability;
        this.dependencies.log("window_appearance.capability_resolved", capability as unknown as Record<string, unknown>);
        return capability;
      });
    return this.capabilityPromise;
  }

  private async clearMica(settings: WindowAppearanceSettings, revision: number) {
    this.dependencies.root.style.setProperty(WINDOW_BACKGROUND_OPACITY_PROPERTY, "100%");
    await this.dependencies.nextFrame();
    this.dependencies.root.removeAttribute(WINDOW_MATERIAL_ATTRIBUTE);
    if (this.effectActive) {
      try {
        await this.dependencies.clearEffects();
        this.logState("window_appearance.mica_cleared", settings);
      } catch (error) {
        const message = errorMessage(error);
        this.logState("window_appearance.apply_failed", settings, message);
        if (revision === this.applyRevision) this.runtimeState.error = message;
      }
      this.effectActive = false;
      this.runtimeState.apiApplied = false;
    }
    if (revision === this.applyRevision) this.runtimeState.active = false;
  }

  private async applyMica(settings: WindowAppearanceSettings, revision: number) {
    if (this.effectActive && this.runtimeState.active) {
      this.dependencies.root.style.setProperty(WINDOW_BACKGROUND_OPACITY_PROPERTY, opacityCssValue(settings.opacity));
      this.logState("window_appearance.background_opacity_changed", settings);
      return;
    }
    this.setOpaqueBackground();
    if (!this.effectActive) {
      await this.dependencies.setMica();
      this.effectActive = true;
      this.runtimeState.apiApplied = true;
    }
    if (revision !== this.applyRevision) return;
    this.dependencies.root.setAttribute(WINDOW_MATERIAL_ATTRIBUTE, "mica");
    this.dependencies.root.style.setProperty(WINDOW_BACKGROUND_OPACITY_PROPERTY, opacityCssValue(settings.opacity));
    await this.dependencies.nextFrame();
    if (revision !== this.applyRevision) return;
    this.runtimeState.active = true;
    this.logState("window_appearance.mica_applied", settings);
  }

  private async fallbackAfterFailure(settings: WindowAppearanceSettings, revision: number, error: unknown) {
    const message = errorMessage(error);
    this.setOpaqueBackground();
    try {
      await this.dependencies.clearEffects();
    } catch (clearError) {
      this.dependencies.log("window_appearance.apply_failed", {
        stage: "fallback_clear",
        error: errorMessage(clearError),
      });
    }
    this.effectActive = false;
    this.runtimeState.apiApplied = false;
    this.logState("window_appearance.apply_failed", settings, message);
    this.logState("window_appearance.fallback_opaque", settings, message);
    if (revision === this.applyRevision) {
      this.runtimeState.active = false;
      this.runtimeState.error = message;
    }
  }

  private async runApply(settings: WindowAppearanceSettings, revision: number) {
    const capability = await this.getCapability();
    if (!settings.enabled || !capability.supported || capability.effect !== "mica") {
      await this.clearMica(settings, revision);
      if (!capability.supported) this.logState("window_appearance.fallback_opaque", settings);
      return;
    }
    try {
      await this.applyMica(settings, revision);
    } catch (error) {
      await this.fallbackAfterFailure(settings, revision, error);
    }
  }

  async apply(settings: WindowAppearanceSettings): Promise<void> {
    const normalizedSettings = {
      enabled: settings.enabled === true,
      opacity: normalizeWindowBackgroundOpacity(settings.opacity),
    };
    const revision = ++this.applyRevision;
    this.runtimeState.requested = normalizedSettings.enabled;
    this.runtimeState.applying = true;
    this.runtimeState.error = null;
    const task = this.applyQueue.then(() => this.runApply(normalizedSettings, revision)).catch((error) => this.fallbackAfterFailure(normalizedSettings, revision, error));
    this.applyQueue = task;
    await task;
    if (revision === this.applyRevision) this.runtimeState.applying = false;
  }

  previewBackgroundOpacity(opacity: number) {
    if (!this.runtimeState.active) return;
    this.dependencies.root.style.setProperty(WINDOW_BACKGROUND_OPACITY_PROPERTY, opacityCssValue(opacity));
  }

  async forceOpaque(): Promise<void> {
    const revision = ++this.applyRevision;
    const settings = { enabled: false, opacity: 100 };
    this.runtimeState.requested = false;
    this.runtimeState.applying = true;
    this.runtimeState.error = null;
    this.setOpaqueBackground();
    this.runtimeState.active = false;
    const task = this.applyQueue.then(async () => {
      await this.dependencies.nextFrame();
      try {
        await this.dependencies.clearEffects();
      } catch (error) {
        const message = errorMessage(error);
        this.logState("window_appearance.apply_failed", settings, message);
        if (revision === this.applyRevision) this.runtimeState.error = message;
      } finally {
        this.effectActive = false;
        this.runtimeState.apiApplied = false;
        if (revision === this.applyRevision) this.runtimeState.applying = false;
      }
    });
    this.applyQueue = task.catch((error) => {
      const message = errorMessage(error);
      this.logState("window_appearance.apply_failed", settings, message);
      this.effectActive = false;
      this.runtimeState.apiApplied = false;
      if (revision === this.applyRevision) {
        this.runtimeState.applying = false;
        this.runtimeState.error = message;
      }
    });
    await this.applyQueue;
  }
}

export function createWindowAppearanceController(dependencies: WindowAppearanceDependencies): WindowAppearanceController {
  return new DefaultWindowAppearanceController(dependencies);
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const fallbackTimer = window.setTimeout(resolve, 50);
    requestAnimationFrame(() => {
      window.clearTimeout(fallbackTimer);
      resolve();
    });
  });
}

function logWindowAppearance(event: string, details: Record<string, unknown>) {
  const message = `[window_appearance] ${event}`;
  if (event === "window_appearance.apply_failed") {
    console.error(message, details);
  } else {
    console.info(message, details);
  }
}

function createDefaultController(): WindowAppearanceController {
  return createWindowAppearanceController({
    root: document.documentElement,
    loadCapability: () => invoke<WindowTransparencyCapability>("get_window_transparency_capability"),
    setMica: async () => {
      const { Effect, getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().setEffects({ effects: [Effect.Mica] });
    },
    clearEffects: async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().clearEffects();
    },
    nextFrame,
    log: logWindowAppearance,
  });
}

let defaultController: WindowAppearanceController | null = null;

export function getWindowAppearanceController(): WindowAppearanceController {
  defaultController ??= createDefaultController();
  return defaultController;
}
