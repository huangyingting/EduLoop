"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="zh-CN"><body><main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, fontFamily: "system-ui", textAlign: "center", background: "#f4f1e9", color: "#242136" }}><div><h1>EduLoop 暂时需要休息一下</h1><p>请重新加载，我们会保留已完成的学习记录。</p><button onClick={reset} style={{ marginTop: 16, minHeight: 44, padding: "0 20px", border: 0, borderRadius: 12, background: "#242136", color: "white", fontWeight: 800 }}>重新加载</button></div></main></body></html>;
}
