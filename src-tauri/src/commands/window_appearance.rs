use serde::Serialize;

const WINDOWS_11_MIN_BUILD: u32 = 22_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum WindowEffectKind {
    Mica,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowTransparencyCapability {
    pub supported: bool,
    pub effect: WindowEffectKind,
    pub platform: String,
    pub windows_build: Option<u32>,
    pub reason: Option<String>,
}

fn resolve_window_transparency_capability(target_os: &str, windows_build: Option<u32>) -> WindowTransparencyCapability {
    let supported = target_os == "windows" && windows_build.is_some_and(|build| build >= WINDOWS_11_MIN_BUILD);
    let reason = if supported {
        None
    } else if target_os == "windows" && windows_build.is_none() {
        Some("windows_version_unavailable".to_string())
    } else {
        Some("windows_11_required".to_string())
    };

    WindowTransparencyCapability {
        supported,
        effect: if supported { WindowEffectKind::Mica } else { WindowEffectKind::None },
        platform: target_os.to_string(),
        windows_build,
        reason,
    }
}

#[cfg(target_os = "windows")]
fn current_windows_build() -> Option<u32> {
    Some(windows_version::OsVersion::current().build)
}

#[cfg(not(target_os = "windows"))]
fn current_windows_build() -> Option<u32> {
    None
}

#[tauri::command]
pub fn get_window_transparency_capability() -> WindowTransparencyCapability {
    let capability = resolve_window_transparency_capability(std::env::consts::OS, current_windows_build());
    log::info!(
        target: "window_appearance",
        "window_appearance.capability_resolved supported={} effect={:?} platform={} windows_build={:?} reason={:?}",
        capability.supported,
        capability.effect,
        capability.platform,
        capability.windows_build,
        capability.reason
    );
    capability
}

#[cfg(test)]
mod tests {
    use super::{resolve_window_transparency_capability, WindowEffectKind};

    #[test]
    fn resolves_windows_11_builds_to_mica() {
        for build in [22_000, 22_621, 26_100] {
            let capability = resolve_window_transparency_capability("windows", Some(build));
            assert!(capability.supported);
            assert_eq!(capability.effect, WindowEffectKind::Mica);
            assert_eq!(capability.windows_build, Some(build));
            assert_eq!(capability.reason, None);
        }
    }

    #[test]
    fn rejects_older_or_unknown_windows_builds() {
        let old_windows = resolve_window_transparency_capability("windows", Some(21_999));
        assert!(!old_windows.supported);
        assert_eq!(old_windows.effect, WindowEffectKind::None);
        assert_eq!(old_windows.reason.as_deref(), Some("windows_11_required"));

        let unknown_windows = resolve_window_transparency_capability("windows", None);
        assert!(!unknown_windows.supported);
        assert_eq!(unknown_windows.reason.as_deref(), Some("windows_version_unavailable"));
    }

    #[test]
    fn rejects_non_windows_platforms() {
        for platform in ["linux", "macos"] {
            let capability = resolve_window_transparency_capability(platform, None);
            assert!(!capability.supported);
            assert_eq!(capability.effect, WindowEffectKind::None);
            assert_eq!(capability.reason.as_deref(), Some("windows_11_required"));
        }
    }
}
