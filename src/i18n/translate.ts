// A dependency-free message lookup. Catalogs are nested objects; keys are
// dot paths. The zh-CN catalog defines the key set and every other locale
// must provide the same shape, which TypeScript checks at compile time.

type Leaves<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends Record<string, unknown> ? Leaves<T[K], `${Prefix}${K}.`> : never;
}[keyof T & string];

export type MessageKey<Catalog> = Leaves<Catalog>;
export type MessageParams = Record<string, string | number>;

export function lookupMessage(catalog: unknown, key: string): string | null {
  let current: unknown = catalog;
  for (const part of key.split(".")) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : null;
}

// "{name}" inserts a parameter; "{count|one|other}" picks the singular or
// plural word by the numeric parameter, for languages that inflect.
export function formatMessage(template: string, params?: MessageParams) {
  if (!params) return template;
  return template.replace(/\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g, (match, name: string, one?: string, other?: string) => {
    if (!(name in params)) return match;
    if (one === undefined) return String(params[name]);
    return Number(params[name]) === 1 ? one : other ?? one;
  });
}

export type TranslatorFor<Catalog> = (key: MessageKey<Catalog>, params?: MessageParams) => string;

export function createTranslator<Catalog>(catalog: Catalog, fallback?: unknown): TranslatorFor<Catalog> {
  return (key, params) => {
    const template = lookupMessage(catalog, key) ?? lookupMessage(fallback, key) ?? key;
    return formatMessage(template, params);
  };
}
