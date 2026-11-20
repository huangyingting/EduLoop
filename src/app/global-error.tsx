"use client";

import { fatalErrorText } from "@/i18n/fatal-error";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const text = fatalErrorText(typeof document === "undefined" ? null : document.cookie);
  return <html lang={text.locale}><body><main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui", textAlign: "center", background: "#f4f1e9", color: "#242136" }}><div><h1>{text.title}</h1><p>{text.body}</p><button onClick={reset} style={{ marginTop: 16, minHeight: 44, padding: "0 20px", border: 0, borderRadius: 12, background: "#242136", color: "white", fontWeight: 800 }}>{text.reload}</button></div></main></body></html>;
}
