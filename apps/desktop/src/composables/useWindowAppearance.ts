import { computed, readonly } from "vue";
import { getWindowAppearanceController, type WindowAppearanceSettings } from "@/lib/windowAppearance";

export function useWindowAppearance() {
  const controller = getWindowAppearanceController();
  const capability = computed(() => controller.runtimeState.capability);

  return {
    capability,
    runtimeState: readonly(controller.runtimeState),
    getCapability: () => controller.getCapability(),
    applySavedWindowAppearance: (settings: WindowAppearanceSettings) => controller.apply(settings),
    previewBackgroundOpacity: (opacity: number) => controller.previewBackgroundOpacity(opacity),
    restoreSavedWindowAppearance: (settings: WindowAppearanceSettings) => controller.apply(settings),
    forceOpaqueWindowAppearance: () => controller.forceOpaque(),
  };
}
