const STATE_KEY = "eleven59_state_v1";
const PREFERENCE_KEY = "eleven59_local_save_enabled_v1";
const LEGACY_KEYS = [
  "m10_deadline_aggregator_tasks_v1",
  "eleven59_class_tasks_v1",
  "m10_gemini_api_key_v1",
  "eleven59_profile_v1",
  "eleven59_theme_v1"
];

let localSaveEnabled = true;

export function initializeLocalSave(notify = () => {}) {
  try {
    localSaveEnabled = localStorage.getItem(PREFERENCE_KEY) !== "false";
  } catch (error) {
    localSaveEnabled = false;
    notify(`Browser storage is unavailable; Local Save is OFF for this session: ${error.message}`);
  }
  return localSaveEnabled;
}

export function isLocalSaveEnabled() {
  return localSaveEnabled;
}

export function setLocalSaveEnabled(enabled) {
  try {
    localStorage.setItem(PREFERENCE_KEY, String(Boolean(enabled)));
    localSaveEnabled = Boolean(enabled);
    return true;
  } catch {
    return false;
  }
}

export function readSharedState() {
  if (!localSaveEnabled) return {};
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return {};
    const state = JSON.parse(raw);
    return state && typeof state === "object" && !Array.isArray(state) ? state : {};
  } catch {
    return {};
  }
}

export function saveSharedState(update) {
  if (!localSaveEnabled) return true;
  try {
    const current = readSharedState();
    const next = {
      ...current,
      ...update,
      localSaveEnabled: true,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedBrowserData() {
  try {
    localStorage.removeItem(STATE_KEY);
    for (const key of LEGACY_KEYS) localStorage.removeItem(key);
    localStorage.setItem(PREFERENCE_KEY, "true");
    localSaveEnabled = true;
    return true;
  } catch {
    return false;
  }
}
