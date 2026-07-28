const DEVICE_KEY = "eduloop-device-key";
const PRACTICE_PREFERENCES_KEY = "eduloop-practice-preferences";

export type PracticePreferences = {
  subject: string;
  gradeBand: string;
  grade: string;
  difficulty: string;
  type: string;
  tags: string;
};

const emptyPracticePreferences: PracticePreferences = {
  subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
};

export function normalizePracticePreferences(value: unknown): PracticePreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptyPracticePreferences;
  const record = value as Record<string, unknown>;
  const safeSlug = (key: keyof PracticePreferences) => {
    const candidate = record[key];
    return typeof candidate === "string" && candidate.length <= 100 && /^[a-zA-Z0-9_-]*$/.test(candidate)
      ? candidate
      : "";
  };
  const safeTags = () => {
    if (typeof record.tags !== "string") return "";
    const values = [...new Set(record.tags.split(",").map((item) => item.trim()).filter(Boolean))];
    if (values.length > 8 || values.some((item) => !/^(?:[A-Z][A-Z0-9_]{0,39}:)?[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item))) return "";
    return values.join(",");
  };
  return {
    subject: safeSlug("subject"),
    gradeBand: safeSlug("gradeBand"),
    grade: safeSlug("grade"),
    difficulty: safeSlug("difficulty"),
    type: safeSlug("type"),
    tags: safeTags(),
  };
}

export function getPracticePreferences() {
  if (typeof window === "undefined") return emptyPracticePreferences;
  try {
    return normalizePracticePreferences(JSON.parse(window.localStorage.getItem(PRACTICE_PREFERENCES_KEY) ?? "{}"));
  } catch {
    return emptyPracticePreferences;
  }
}

export function savePracticePreferences(preferences: PracticePreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRACTICE_PREFERENCES_KEY, JSON.stringify(normalizePracticePreferences(preferences)));
}

export function getDeviceKey() {
  if (typeof window === "undefined") return "";
  let key = window.localStorage.getItem(DEVICE_KEY);
  if (!key) {
    key = `guest_${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_KEY, key);
  }
  return key;
}

export function getTimeZone() {
  if (typeof Intl === "undefined") return "Asia/Shanghai";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}

export function resetDeviceKey() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(DEVICE_KEY);
    window.localStorage.removeItem(PRACTICE_PREFERENCES_KEY);
  }
}

export function rotateDeviceKey() {
  if (typeof window !== "undefined") window.localStorage.removeItem(DEVICE_KEY);
}
