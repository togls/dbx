<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useWindowAppearance } from "@/composables/useWindowAppearance";
import { WINDOW_BACKGROUND_OPACITY_MAX, WINDOW_BACKGROUND_OPACITY_MIN, normalizeWindowBackgroundOpacity } from "@/lib/windowAppearanceSettings";

const props = defineProps<{
  enabled: boolean;
  opacity: number;
}>();

const emit = defineEmits<{
  "update:enabled": [value: boolean];
  "update:opacity": [value: number];
}>();

const { t } = useI18n();
const { capability, runtimeState, getCapability, applySavedWindowAppearance, previewBackgroundOpacity } = useWindowAppearance();
const supported = computed(() => capability.value?.supported === true && capability.value.effect === "mica");
const displayedEnabled = computed(() => supported.value && props.enabled);
const controlsDisabled = computed(() => !supported.value || runtimeState.applying);
const sliderDisabled = computed(() => controlsDisabled.value || !displayedEnabled.value || !runtimeState.active);
const normalizedOpacity = computed(() => normalizeWindowBackgroundOpacity(props.opacity));

async function updateEnabled(enabled: boolean) {
  emit("update:enabled", enabled);
  await applySavedWindowAppearance({ enabled, opacity: normalizedOpacity.value });
}

function updateOpacity(event: Event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const opacity = normalizeWindowBackgroundOpacity(Number(target.value));
  emit("update:opacity", opacity);
  previewBackgroundOpacity(opacity);
}

onMounted(() => {
  void getCapability();
});
</script>

<template>
  <section class="space-y-3 rounded-md border bg-muted/20 px-3 py-3" data-testid="window-appearance-settings">
    <div class="space-y-1">
      <h3 class="text-sm font-medium">{{ t("settings.windowAppearance.title") }}</h3>
      <p v-if="runtimeState.error" class="text-xs text-destructive">
        {{ t("settings.windowAppearance.applyFailed") }}
      </p>
      <p v-else-if="!supported && capability" class="text-xs text-muted-foreground">
        {{ t("settings.windowAppearance.windows11Only") }}
      </p>
      <p v-if="runtimeState.apiApplied && runtimeState.active" class="text-xs text-muted-foreground">
        {{ t("settings.windowAppearance.micaVisibilityHint") }}
      </p>
    </div>

    <div class="flex items-center justify-between gap-4">
      <div class="space-y-1">
        <Label for="window-transparency-enabled">{{ t("settings.windowAppearance.transparentBackground") }}</Label>
        <p class="text-xs text-muted-foreground">
          {{ t("settings.windowAppearance.transparentBackgroundDescription") }}
        </p>
      </div>
      <Switch id="window-transparency-enabled" :model-value="displayedEnabled" :disabled="controlsDisabled" @update:model-value="updateEnabled" />
    </div>

    <div class="space-y-2">
      <div class="flex items-center justify-between gap-4">
        <Label for="window-background-opacity">{{ t("settings.windowAppearance.backgroundOpacity") }}</Label>
        <span class="text-xs tabular-nums text-muted-foreground">{{ normalizedOpacity }}%</span>
      </div>
      <input
        id="window-background-opacity"
        class="dbx-window-opacity-slider w-full accent-primary disabled:cursor-not-allowed disabled:opacity-50"
        type="range"
        :min="WINDOW_BACKGROUND_OPACITY_MIN"
        :max="WINDOW_BACKGROUND_OPACITY_MAX"
        step="1"
        :value="normalizedOpacity"
        :disabled="sliderDisabled"
        @input="updateOpacity"
      />
      <p class="text-xs text-muted-foreground">
        {{ t("settings.windowAppearance.backgroundOpacityDescription") }}
      </p>
    </div>
  </section>
</template>
