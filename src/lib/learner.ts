const DEVICE_KEY = "eduloop-device-key";

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
