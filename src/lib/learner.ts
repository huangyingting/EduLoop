const PRACTICE_PREFERENCES_KEY = "eduloop-practice-preferences";
const LEGACY_DEVICE_KEY = "eduloop-device-key";

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
  try {
    window.localStorage.setItem(PRACTICE_PREFERENCES_KEY, JSON.stringify(normalizePracticePreferences(preferences)));
  } catch {
    // Learning remains usable when browser storage is blocked.
  }
}

export function clearGuestLearningStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PRACTICE_PREFERENCES_KEY);
    window.localStorage.removeItem(LEGACY_DEVICE_KEY);
  } catch {
    // Storage can be unavailable in privacy modes. Guest practice remains
    // stateless because it never reads from or writes to these keys.
  }
}

export function getTimeZone() {
  if (typeof Intl === "undefined") return "Asia/Shanghai";
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
}
