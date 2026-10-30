"use client";
import { clearDemoSession } from "./DemoStart";
export default function DemoRestart() {
  return (
    <form
      style={{ position: "fixed", top: 10, left: 158, zIndex: 100 }}
      action="/"
      method="get"
      onSubmit={clearDemoSession}
    >
      <button
        type="submit"
        style={{
          height: 32,
          padding: "0 12px",
          borderRadius: 30,
          border: "1px solid #d6d6d2",
          background: "white",
          color: "#55554f",
          fontSize: 12,
        }}
      >
        Restart demo
      </button>
    </form>
  );
}
