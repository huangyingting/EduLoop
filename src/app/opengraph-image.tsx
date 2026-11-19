import { ImageResponse } from "next/og";

export const alt = "EduLoop — every question gives something back";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Latin-only text: the built-in OG font has no CJK glyphs, and bundling a CJK
// font would add several megabytes to the server image.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#f4f1e9", padding: 72, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", flex: 1, border: "6px solid #242136", borderRadius: 48, background: "#d9d3f5", padding: 64, boxShadow: "18px 18px 0 #242136" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ display: "flex", width: 96, height: 96, borderRadius: 28, background: "#6c5ce7", color: "#d9f99d", fontSize: 60, fontWeight: 900, alignItems: "center", justifyContent: "center" }}>e</div>
            <div style={{ display: "flex", fontSize: 72, fontWeight: 900, color: "#242136" }}>EduLoop</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 800, color: "#242136" }}>Every question gives something back.</div>
            <div style={{ display: "flex", fontSize: 32, color: "#4b4763" }}>Math · Physics · Chemistry · Biology · Chinese · AMC 8/10/12</div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
