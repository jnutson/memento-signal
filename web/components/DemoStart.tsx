"use client";
export function clearDemoSession() {
  for (const key of Object.keys(sessionStorage))
    if (
      key.startsWith("memento-original-ui-v1:") ||
      key === "memento-demo-publication"
    )
      sessionStorage.removeItem(key);
}
export default function DemoStart() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f7f5",
        padding: "60px 28px",
        color: "#1d1d1f",
      }}
    >
      <div
        style={{
          maxWidth: 850,
          margin: "40px auto",
          padding: 40,
          background: "white",
          border: "1px solid #d6d6d2",
          borderRadius: 20,
          boxShadow: "0 2px 6px #0000000a",
        }}
      >
        <p style={{ color: "#75756f", marginBottom: 16 }}>
          Memento Loop · Demo 1 · Synthetic data
        </p>
        <h1 style={{ fontSize: 36, marginBottom: 18 }}>
          Monday inventory review
        </h1>
        <p style={{ fontSize: 18, lineHeight: 1.6, marginBottom: 28 }}>
          Explore the attention queue, open the weekly report, and follow each
          finding into its evidence.
        </p>
        <form action="/signal" method="get" onSubmit={clearDemoSession}>
          <button
            type="submit"
            style={{
              background: "#0a7aff",
              color: "white",
              borderRadius: 30,
              padding: "13px 24px",
              fontSize: 17,
            }}
          >
            Start demo →
          </button>
        </form>
      </div>
    </main>
  );
}
