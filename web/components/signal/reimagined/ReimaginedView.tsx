"use client";

// Supplied frontend render markup: layout and inline styling retained.
import React, { useRef } from "react";
import type { ViewModel } from "@/lib/reimagined/view-model";
import InsightDetails from "./InsightDetails";

export default function ReimaginedView({ v }: { v: ViewModel }) {
  const hovered = useRef<{ element: HTMLElement; style: string | null } | null>(
    null,
  );
  const hoverOut: React.MouseEventHandler = () => {
    if (hovered.current) {
      if (hovered.current.style === null)
        hovered.current.element.removeAttribute("style");
      else hovered.current.element.setAttribute("style", hovered.current.style);
      hovered.current = null;
    }
  };
  const hoverOver: React.MouseEventHandler = (event) => {
    const el =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-hv]")
        : null;
    if (el === hovered.current?.element) return;
    hoverOut(event);
    if (!el) return;
    hovered.current = { element: el, style: el.getAttribute("style") };
    try {
      const value: unknown = JSON.parse(el.dataset.hv || "{}");
      if (value && typeof value === "object")
        for (const [key, text] of Object.entries(value)) {
          if (
            typeof text === "string" &&
            [
              "background",
              "color",
              "transform",
              "boxShadow",
              "borderColor",
            ].includes(key)
          )
            el.style.setProperty(
              key.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase()),
              text,
            );
        }
    } catch {}
  };
  return (
    <div
      onMouseOver={hoverOver}
      onMouseLeave={hoverOut}
      style={{ display: "contents" }}
    >
      <div
        data-reimagined-root="true"
        style={{
          position: "fixed",
          inset: "0",
          overflow: "auto",
          background: "#f7f7f5",
          color: "#1d1d1f",
          fontFamily: "Geist,-apple-system,'Segoe UI',sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <div
          style={{
            height: "52px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            padding: "0 28px",
            borderBottom: "1px solid #d6d6d2",
            background: "#f3f3f1",
            position: "sticky",
            top: "0",
            zIndex: "30",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flex: "none",
            }}
          >
            <button
              aria-label="Overview"
              onClick={v.goHome}
              style={v.homeStyle}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: "block" }}
              >
                <path d="M2.5 7.2 8 2.5l5.5 4.7V13a.5.5 0 0 1-.5.5h-3V9.5h-4v4H3a.5.5 0 0 1-.5-.5z" />
              </svg>
            </button>
            {(v.nav || []).map((n, $index) => (
              <React.Fragment key={$index}>
                <button onClick={n.go} style={n.style}>
                  {n.label}
                </button>
              </React.Fragment>
            ))}
          </div>
          <div
            style={{
              position: "relative",
              flex: "1 1 140px",
              maxWidth: "420px",
            }}
          >
            <div
              style={{
                height: "34px",
                borderRadius: "999px",
                background: "#fff",
                border: "1px solid #d6d6d2",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "0 14px",
                boxShadow: "0 1px 2px rgba(29,29,31,.06)",
              }}
            >
              <span style={{ color: "#75756f", fontSize: "14px" }}>⌕</span>
              <input
                data-reimagined-search="true"
                value={v.search}
                onChange={v.onSearch}
                onFocus={v.onFocus}
                onBlur={v.onBlur}
                onKeyDown={v.onKey}
                placeholder="Search items"
                style={{
                  flex: "1",
                  minWidth: "0",
                  border: "0",
                  outline: "0",
                  background: "none",
                  fontSize: "14px",
                }}
              />
              <span
                style={{
                  fontSize: "11px",
                  color: "#75756f",
                  border: "1px solid #d6d6d2",
                  borderRadius: "6px",
                  padding: "1px 6px",
                }}
              >
                ⌘K
              </span>
            </div>
            {!!v.sOpen && (
              <>
                <div
                  style={{
                    position: "absolute",
                    top: "42px",
                    left: "0",
                    right: "0",
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow: "0 10px 30px rgba(29,29,31,.14)",
                    padding: "8px",
                    maxHeight: "380px",
                    overflow: "auto",
                  }}
                >
                  {!!v.hasRecents && (
                    <>
                      <div
                        style={{
                          display: "flex",
                          gap: "6px",
                          flexWrap: "wrap",
                          padding: "4px 6px 8px",
                        }}
                      >
                        {(v.recents || []).map((c, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              onMouseDown={c.open}
                              style={{
                                height: "26px",
                                padding: "0 11px",
                                borderRadius: "999px",
                                background: "#f0f0ee",
                                fontSize: "12px",
                                fontWeight: "600",
                              }}
                              data-hv={'{"background":"#e9e9e6"}'}
                            >
                              {c.name}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    </>
                  )}
                  {(v.results || []).map((r, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        onMouseDown={r.open}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0,1fr) 10px",
                          gap: "10px",
                          alignItems: "center",
                          padding: "8px 10px",
                          borderRadius: "10px",
                          cursor: "pointer",
                        }}
                        data-hv={'{"background":"#f0f0ee"}'}
                      >
                        <span style={{ minWidth: "0" }}>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {r.name}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontStyle: "italic",
                              color: "#75756f",
                            }}
                          >
                            {r.type}
                          </div>
                        </span>
                        <span style={r.dot}></span>
                      </div>
                    </React.Fragment>
                  ))}
                  {!!v.noResults && (
                    <>
                      <div
                        style={{
                          padding: "14px",
                          textAlign: "center",
                          color: "#75756f",
                        }}
                      >
                        —
                      </div>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              flex: "none",
            }}
          >
            <div style={{ fontSize: "13px", color: "#75756f" }}>{v.today}</div>
            <button
              aria-label="Case for expansion"
              onClick={v.openX}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "999px",
                background: "#fff",
                border: "1px solid #d6d6d2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#55554f",
                boxShadow: "0 1px 2px rgba(29,29,31,.06)",
              }}
              data-hv={'{"background":"#f0f0ee"}'}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: "block" }}
              >
                <path d="M2 11.5 6 7.5l2.6 2.6L14 4.8" />
                <path d="M10.2 4.5H14v3.8" />
              </svg>
            </button>
            <button
              aria-label="Map"
              onClick={v.openMap}
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "999px",
                background: "#fff",
                border: "1px solid #d6d6d2",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#55554f",
                boxShadow: "0 1px 2px rgba(29,29,31,.06)",
              }}
              data-hv={'{"background":"#f0f0ee"}'}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ display: "block" }}
              >
                <path d="M8 14.4s4.7-4.2 4.7-7.8a4.7 4.7 0 0 0-9.4 0c0 3.6 4.7 7.8 4.7 7.8z" />
                <circle cx="8" cy="6.6" r="1.7" />
              </svg>
            </button>
            <button
              aria-label="Weekly report"
              onClick={v.openRep}
              style={{
                position: "relative",
                width: "32px",
                height: "32px",
                borderRadius: "999px",
                background: "#fff",
                border: "1px solid #d6d6d2",
                display: "grid",
                placeItems: "center",
                fontSize: "15px",
                color: "#55554f",
                boxShadow: "0 1px 2px rgba(29,29,31,.06)",
              }}
              data-hv={'{"background":"#f0f0ee"}'}
            >
              ▤
              {!!v.repDot && (
                <>
                  <span
                    style={{
                      position: "absolute",
                      top: "-2px",
                      right: "-2px",
                      width: "9px",
                      height: "9px",
                      borderRadius: "50%",
                      background: "#0a7aff",
                      border: "2px solid #f3f3f1",
                    }}
                  ></span>
                </>
              )}
            </button>
          </div>
        </div>
        {!!v.home && (
          <>
            <div
              style={{
                maxWidth: "1180px",
                margin: "0 auto",
                padding: "28px 28px 64px",
                display: "flex",
                gap: "24px",
                alignItems: "flex-start",
                flexWrap: "wrap",
              }}
            >
              <div
                style={{
                  flex: "1 1 640px",
                  minWidth: "0",
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "20px 22px",
                    display: "flex",
                    gap: "14px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      color: "#0a7aff",
                      fontSize: "18px",
                      lineHeight: "30px",
                    }}
                  >
                    ✦
                  </span>
                  <div
                    style={{
                      fontSize: "21px",
                      lineHeight: "30px",
                      fontWeight: "500",
                      letterSpacing: "-.01em",
                      textWrap: "pretty",
                    }}
                  >
                    {v.brief}
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                    gap: "12px",
                  }}
                >
                  {(v.stats || []).map((s, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        onClick={s.go}
                        onMouseEnter={s.enter}
                        onMouseLeave={s.leave}
                        style={s.style}
                        data-hv={'{"transform":"translateY(-2px)"}'}
                      >
                        <div style={{ fontSize: "13px", color: "#55554f" }}>
                          {s.label}
                        </div>
                        <div
                          style={{
                            fontSize: "32px",
                            fontWeight: "700",
                            letterSpacing: "-.02em",
                            color: "#0a5cc7",
                            marginTop: "4px",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {s.val}
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "14px",
                  }}
                >
                  <div style={v.queueControls}>
                    {v.queueTypes.map((type) => (
                      <button
                        key={type.label}
                        onClick={type.go}
                        style={type.style}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                  <div
                    style={{
                      position: "relative",
                      height: v.queueHeight.height,
                      borderRadius: "10px",
                      overflow: "hidden",
                    }}
                  >
                    <div style={v.queuePlot}>
                      {(v.bands || []).map((b, $index) => (
                        <React.Fragment key={$index}>
                          <div style={b.style}>
                            <span
                              style={{
                                position: "absolute",
                                left: "10px",
                                bottom: "7px",
                                fontSize: "11px",
                                fontStyle: "italic",
                                color: "#75756f",
                              }}
                            >
                              {b.label}
                            </span>
                          </div>
                        </React.Fragment>
                      ))}
                      <div style={{ position: "absolute", inset: "0 18px" }}>
                        {(v.dots || []).map((d, $index) => (
                          <React.Fragment key={$index}>
                            <button
                              data-attention-dot={d.type}
                              aria-label={d.name}
                              onClick={d.open}
                              onMouseEnter={d.enter}
                              onMouseLeave={d.leave}
                              style={d.style}
                            ></button>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    {v.queueLanes.map((lane) => (
                      <div key={lane.label} style={lane.style}>
                        {lane.label}
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  onClick={v.hero.open}
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "22px 24px",
                    cursor: "pointer",
                    transition: "transform .15s",
                  }}
                  data-hv={'{"transform":"translateY(-2px)"}'}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "16px",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: "24px",
                          fontWeight: "700",
                          letterSpacing: "-.02em",
                        }}
                      >
                        {v.hero.name}
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontStyle: "italic",
                          color: "#75756f",
                          marginTop: "2px",
                        }}
                      >
                        {v.hero.type}
                      </div>
                    </div>
                    <div
                      onMouseEnter={v.hero.scoreEnter}
                      onMouseLeave={v.hero.leave}
                      style={{
                        height: "28px",
                        padding: "0 12px",
                        borderRadius: "999px",
                        background: "#f0f0ee",
                        display: "flex",
                        alignItems: "center",
                        fontSize: "13px",
                        fontWeight: "600",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {v.hero.score}
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: "14px",
                      fontSize: "16px",
                      lineHeight: "25px",
                      color: "#2b2b28",
                      maxWidth: "640px",
                      textWrap: "pretty",
                    }}
                  >
                    {(v.hero.story || []).map((g, $index) => (
                      <React.Fragment key={$index}>
                        <span style={g.style}>{g.t}</span>
                      </React.Fragment>
                    ))}
                  </div>
                  <div
                    style={{
                      marginTop: "18px",
                      display: "flex",
                      alignItems: "flex-end",
                      gap: "36px",
                    }}
                  >
                    <div
                      onMouseEnter={v.hero.usdEnter}
                      onMouseLeave={v.hero.leave}
                    >
                      <div
                        style={{
                          fontSize: "30px",
                          fontWeight: "700",
                          letterSpacing: "-.02em",
                          color: "#0a5cc7",
                          fontVariantNumeric: "tabular-nums",
                          lineHeight: "1.1",
                        }}
                      >
                        {v.hero.usd}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#75756f",
                          marginTop: "2px",
                        }}
                      >
                        {v.hero.usdLabel}
                      </div>
                    </div>
                    <div>
                      <div style={v.hero.daysStyle}>{v.hero.days}</div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#75756f",
                          marginTop: "2px",
                        }}
                      >
                        to evidence date
                      </div>
                    </div>
                    <div style={{ flex: "1" }}></div>
                    <div
                      style={{
                        width: "40px",
                        height: "40px",
                        borderRadius: "999px",
                        background: "#1d1d1f",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "18px",
                      }}
                    >
                      →
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    overflow: "hidden",
                  }}
                >
                  {(v.rows || []).map((r, $index) => (
                    <React.Fragment key={$index}>
                      {r.section && (
                        <div style={r.sectionStyle}>{r.section}</div>
                      )}
                      <div
                        onClick={r.open}
                        onMouseEnter={r.enter}
                        onMouseLeave={r.leave}
                        style={r.style}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#75756f",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {r.rank}
                        </span>
                        <span style={{ minWidth: "0" }}>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {r.name}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontStyle: "italic",
                              color: "#75756f",
                            }}
                          >
                            {r.type}
                          </div>
                        </span>
                        <span style={r.dotStyle}></span>
                        <span style={r.daysStyle}>{r.days}</span>
                        <span
                          style={{
                            fontSize: "14px",
                            fontWeight: "700",
                            color: "#0a5cc7",
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {r.usd}
                        </span>
                        <span style={{ color: "#75756f", fontSize: "14px" }}>
                          →
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div
                style={{
                  flex: "0 0 300px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  position: "sticky",
                  top: "76px",
                }}
              >
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "10px",
                  }}
                >
                  <div style={{ fontSize: "15px", fontWeight: "700" }}>
                    Tracking
                  </div>
                  {(v.tracked || []).map((t, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        onClick={t.open}
                        style={{
                          cursor: "pointer",
                          padding: "10px 12px",
                          borderRadius: "10px",
                          background: "#f0f0ee",
                          display: "flex",
                          flexDirection: "column",
                          gap: "2px",
                        }}
                        data-hv={'{"background":"#e9e9e6"}'}
                      >
                        <div style={{ fontSize: "14px", fontWeight: "600" }}>
                          {t.name}
                        </div>
                        <div
                          style={{
                            fontSize: "12px",
                            fontStyle: "italic",
                            color: "#55554f",
                          }}
                        >
                          {t.action}
                        </div>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "8px",
                            marginTop: "2px",
                          }}
                        >
                          <span style={{ fontSize: "12px", color: "#75756f" }}>
                            ◷ {t.check}
                          </span>
                          <button onClick={t.next} style={t.chip}>
                            {t.status}
                          </button>
                        </div>
                      </div>
                    </React.Fragment>
                  ))}
                  {!!v.noTracked && (
                    <>
                      <div
                        style={{
                          height: "44px",
                          borderRadius: "10px",
                          background: "#f0f0ee",
                          display: "grid",
                          placeItems: "center",
                          color: "#75756f",
                        }}
                      >
                        —
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
        {!!v.vExplore && (
          <>
            <div
              style={{
                maxWidth: "1000px",
                margin: "0 auto",
                padding: "28px 28px 64px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                {(v.xg || []).map((c, $index) => (
                  <React.Fragment key={$index}>
                    <button onClick={c.go} style={c.style}>
                      {c.label}
                    </button>
                  </React.Fragment>
                ))}
                <span
                  style={{
                    width: "1px",
                    height: "20px",
                    background: "#d6d6d2",
                    margin: "0 6px",
                  }}
                ></span>
                {(v.xf || []).map((c, $index) => (
                  <React.Fragment key={$index}>
                    <button onClick={c.go} style={c.style}>
                      {c.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #d6d6d2",
                  borderRadius: "14px",
                  boxShadow:
                    "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns:
                      "minmax(0,1.5fr) 64px 72px 72px 76px 124px",
                    gap: "12px",
                    padding: "12px 20px",
                    background: "#f3f3f1",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#55554f",
                  }}
                >
                  <span></span>
                  <span></span>
                  <span style={{ textAlign: "right" }}>In stock</span>
                  <span style={{ textAlign: "right" }}>Stocked</span>
                  <span style={{ textAlign: "right" }}>WoW</span>
                  <span></span>
                </div>
                {(v.xrows || []).map((r, $index) => (
                  <React.Fragment key={$index}>
                    <div style={{ borderTop: "1px solid #e9e9e6" }}>
                      <div
                        onClick={r.go}
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "minmax(0,1.5fr) 64px 72px 72px 76px 124px",
                          gap: "12px",
                          alignItems: "center",
                          padding: "11px 20px",
                          cursor: "pointer",
                          transition: "background .15s",
                        }}
                        data-hv={'{"background":"#f7f7f5"}'}
                      >
                        <span style={{ minWidth: "0" }}>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {r.name}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontStyle: "italic",
                              color: "#75756f",
                            }}
                          >
                            {r.sub}
                          </div>
                        </span>
                        <span style={r.spark}></span>
                        <span style={r.instStyle}>{r.inst}</span>
                        <span
                          style={{
                            textAlign: "right",
                            fontVariantNumeric: "tabular-nums",
                            color: "#2b2b28",
                          }}
                        >
                          {r.dist}
                        </span>
                        <span style={r.vfStyle}>{r.vf}</span>
                        <span
                          onMouseEnter={r.enter}
                          onMouseLeave={r.leave}
                          style={r.chip}
                        >
                          {r.status}
                        </span>
                      </div>
                      {!!r.isOpen && (
                        <>
                          <div
                            style={{
                              padding: "4px 20px 10px",
                              background: "#f7f7f5",
                            }}
                          >
                            {(r.items || []).map((x, $index) => (
                              <React.Fragment key={$index}>
                                <div
                                  onClick={x.open}
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "minmax(0,1fr) 50px 16px",
                                    gap: "12px",
                                    alignItems: "center",
                                    padding: "8px 0",
                                    cursor: "pointer",
                                  }}
                                >
                                  <span>
                                    <div
                                      style={{
                                        fontSize: "13px",
                                        fontWeight: "600",
                                      }}
                                    >
                                      {x.name}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontStyle: "italic",
                                        color: "#75756f",
                                      }}
                                    >
                                      {x.type}
                                    </div>
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "13px",
                                      fontWeight: "700",
                                      textAlign: "right",
                                    }}
                                  >
                                    {x.days}
                                  </span>
                                  <span style={{ color: "#75756f" }}>→</span>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </React.Fragment>
                ))}
                {!!v.noX && (
                  <>
                    <div
                      style={{
                        padding: "18px",
                        textAlign: "center",
                        color: "#75756f",
                      }}
                    >
                      —
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        {!!v.isCase && (
          <>
            <div
              style={{
                maxWidth: "1180px",
                margin: "0 auto",
                padding: "24px 28px 64px",
                display: "flex",
                flexDirection: "column",
                gap: "18px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <button
                  aria-label="Back"
                  onClick={v.back}
                  style={{
                    width: "38px",
                    height: "38px",
                    borderRadius: "999px",
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "17px",
                    boxShadow: "0 1px 2px rgba(29,29,31,.06)",
                  }}
                  data-hv={'{"background":"#f0f0ee"}'}
                >
                  ←
                </button>
                <div style={{ flex: "1 1 280px", minWidth: "0" }}>
                  <div
                    style={{
                      fontSize: "26px",
                      fontWeight: "700",
                      letterSpacing: "-.02em",
                      lineHeight: "1.15",
                    }}
                  >
                    {v.c.name}
                  </div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontStyle: "italic",
                      color: "#75756f",
                      marginTop: "2px",
                    }}
                  >
                    {v.c.type}
                  </div>
                </div>
                <div
                  onMouseEnter={v.c.scoreEnter}
                  onMouseLeave={v.c.leave}
                  style={{
                    height: "30px",
                    padding: "0 13px",
                    borderRadius: "999px",
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    display: "flex",
                    alignItems: "center",
                    fontSize: "13px",
                    fontWeight: "600",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {v.c.score}
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "2px",
                    padding: "3px",
                    borderRadius: "999px",
                    background: "#e9e9e6",
                  }}
                >
                  {(v.layers || []).map((l, $index) => (
                    <React.Fragment key={$index}>
                      <button onClick={l.go} style={l.style}>
                        {l.label}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    flex: "1 1 380px",
                    minWidth: "0",
                    display: "flex",
                    flexDirection: "column",
                    gap: "14px",
                  }}
                >
                  {!!v.showStoryCard && (
                    <>
                      <div
                        style={{
                          background: "#fff",
                          border: "1px solid #d6d6d2",
                          borderRadius: "14px",
                          boxShadow:
                            "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                          padding: "20px 22px",
                        }}
                      >
                        <div style={v.c.storyStyle}>
                          {(v.c.story || []).map((g, $index) => (
                            <React.Fragment key={$index}>
                              <span style={g.style}>{g.t}</span>
                            </React.Fragment>
                          ))}
                        </div>
                        {!!v.c.after && (
                          <>
                            <div
                              style={{
                                marginTop: "12px",
                                fontSize: "14px",
                                fontWeight: "600",
                                color: "#1f9d55",
                              }}
                            >
                              {v.c.after}
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                  {!!v.l1 && (
                    <>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(3,minmax(0,1fr))",
                          gap: "12px",
                        }}
                      >
                        {(v.metrics || []).map((m, $index) => (
                          <React.Fragment key={$index}>
                            <div
                              onMouseEnter={m.enter}
                              onMouseLeave={m.leave}
                              style={{
                                background: "#fff",
                                border: "1px solid #d6d6d2",
                                borderRadius: "14px",
                                boxShadow:
                                  "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                                padding: "16px 18px",
                                cursor: "default",
                                transition: "transform .15s",
                              }}
                              data-hv={'{"transform":"translateY(-2px)"}'}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: "8px",
                                  fontSize: "13px",
                                  color: "#55554f",
                                }}
                              >
                                <span>{m.label}</span>
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontStyle: "italic",
                                    color: "#75756f",
                                  }}
                                >
                                  {m.tag}
                                </span>
                              </div>
                              <div
                                style={{
                                  fontSize: "30px",
                                  fontWeight: "700",
                                  letterSpacing: "-.02em",
                                  color: "#0a5cc7",
                                  marginTop: "4px",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {m.val === "Unavailable" ? "—" : m.val}
                              </div>
                              {!!m.bar && (
                                <>
                                  <div
                                    style={{
                                      height: "5px",
                                      borderRadius: "999px",
                                      background: "#e9e9e6",
                                      marginTop: "8px",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <b style={m.bar}></b>
                                  </div>
                                </>
                              )}
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </>
                  )}
                  {!!v.l1 && (v.isA || v.isD || v.isI) && (
                    <>
                      <div
                        style={{
                          background: "#fff",
                          border: "1px solid #d6d6d2",
                          borderRadius: "14px",
                          boxShadow:
                            "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                          padding: "22px 22px 14px",
                        }}
                      >
                        {!!v.isA && (
                          <>
                            <div
                              style={{
                                position: "relative",
                                height: "150px",
                                margin: "0 8px",
                              }}
                            >
                              <div style={v.vis.lblStock}>Before shortfall</div>
                              <div style={v.vis.lblGap}>Unmet demand</div>
                              <div
                                style={{
                                  position: "absolute",
                                  left: "0",
                                  right: "0",
                                  top: "56px",
                                  height: "44px",
                                  borderRadius: "14px",
                                  background: "#e9e9e6",
                                  overflow: "hidden",
                                }}
                              >
                                <div style={v.vis.stock}></div>
                                <div style={v.vis.low}></div>
                                <div style={v.vis.gap}></div>
                                <div style={v.vis.saved}></div>
                                <div style={v.vis.restock}></div>
                                {(v.vis.weeks || []).map((w, $index) => (
                                  <React.Fragment key={$index}>
                                    <div style={w.style}></div>
                                  </React.Fragment>
                                ))}
                              </div>
                              {!!v.vis.hasMark && (
                                <>
                                  <div style={v.vis.mark}>
                                    <span
                                      style={{
                                        padding: "3px 9px",
                                        borderRadius: "999px",
                                        background: "#1d1d1f",
                                        color: "#fff",
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {v.vis.markLabel}
                                    </span>
                                    <span
                                      style={{
                                        fontSize: "10px",
                                        color: "#1d1d1f",
                                        lineHeight: "1",
                                      }}
                                    >
                                      ▼
                                    </span>
                                  </div>
                                </>
                              )}
                              {(v.vis.ticks || []).map((t, $index) => (
                                <React.Fragment key={$index}>
                                  <div style={t.style}>{t.l}</div>
                                </React.Fragment>
                              ))}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "16px",
                                flexWrap: "wrap",
                                marginTop: "6px",
                                fontSize: "12px",
                                color: "#55554f",
                              }}
                            >
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <i
                                  style={{
                                    width: "9px",
                                    height: "9px",
                                    borderRadius: "50%",
                                    background: "#0a7aff",
                                    display: "block",
                                  }}
                                ></i>
                                Before shortfall
                              </span>
                              {!!v.vis.low.width &&
                                v.vis.low.display !== "none" && (
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                    }}
                                  >
                                    <i
                                      style={{
                                        width: "9px",
                                        height: "9px",
                                        borderRadius: "50%",
                                        background: "#f2b45a",
                                        display: "block",
                                      }}
                                    ></i>
                                    no assumed buffer
                                  </span>
                                )}
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <i
                                  style={{
                                    width: "9px",
                                    height: "9px",
                                    borderRadius: "50%",
                                    background: "#f4b9b3",
                                    display: "block",
                                  }}
                                ></i>
                                Unmet demand
                              </span>
                              {!!v.vis.saved.width &&
                                v.vis.saved.display !== "none" && (
                                  <span
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "6px",
                                    }}
                                  >
                                    <i
                                      style={{
                                        width: "9px",
                                        height: "9px",
                                        borderRadius: "50%",
                                        background: "#2fb36b",
                                        display: "block",
                                      }}
                                    ></i>
                                    action effect not modeled
                                  </span>
                                )}
                            </div>
                            <div style={{ marginTop: "10px" }}>{v.vis.cap}</div>
                          </>
                        )}
                        {!!v.isD && (
                          <>
                            <div
                              style={{
                                position: "relative",
                                height: "196px",
                                paddingBottom: "26px",
                              }}
                            >
                              <div
                                style={{
                                  position: "relative",
                                  height: "100%",
                                  display: "flex",
                                  gap: "6px",
                                }}
                              >
                                {(v.vis.bars || []).map((b, $index) => (
                                  <React.Fragment key={$index}>
                                    <div
                                      style={{
                                        position: "relative",
                                        flex: "1",
                                      }}
                                    >
                                      <div style={b.bar}></div>
                                      {!!b.ov && (
                                        <>
                                          <div style={b.ov}></div>
                                        </>
                                      )}
                                    </div>
                                  </React.Fragment>
                                ))}
                                <div style={v.vis.line}></div>
                                <span style={v.vis.lineLbl}>forecast</span>
                              </div>
                              <div
                                style={{
                                  position: "absolute",
                                  left: "0",
                                  right: "0",
                                  bottom: "0",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  fontSize: "11px",
                                  fontStyle: "italic",
                                  color: "#75756f",
                                }}
                              >
                                <span>8 wks ago</span>
                                <span>now</span>
                                <span>+4 wks</span>
                              </div>
                            </div>
                          </>
                        )}
                        {!!v.isI && (
                          <>
                            <div
                              style={{
                                position: "relative",
                                height: "120px",
                                margin: "0 8px",
                              }}
                            >
                              <div style={v.vis.lblNeed}>Target stock</div>
                              <div style={v.vis.lblExcess}>Above target</div>
                              <div
                                style={{
                                  position: "absolute",
                                  left: "0",
                                  right: "0",
                                  top: "50px",
                                  height: "44px",
                                  borderRadius: "14px",
                                  background: "#e9e9e6",
                                  overflow: "hidden",
                                }}
                              >
                                <div style={v.vis.need}></div>
                                <div style={v.vis.excess}></div>
                                <div style={v.vis.freed}></div>
                              </div>
                              <div style={v.vis.tick}></div>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                  {!!v.l1 && (
                    <>
                      {!!v.isZ && (
                        <>
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              padding: "18px 20px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "12px",
                                fontStyle: "italic",
                                color: "#75756f",
                                marginBottom: "8px",
                              }}
                            >
                              {v.zbar.head}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                height: "34px",
                                borderRadius: "12px",
                                overflow: "hidden",
                                background: "#e9e9e6",
                              }}
                            >
                              <div style={v.zbar.a}></div>
                              <div style={v.zbar.b}></div>
                              <div style={v.zbar.c}></div>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "18px",
                                flexWrap: "wrap",
                                marginTop: "10px",
                                fontSize: "12px",
                                color: "#55554f",
                              }}
                            >
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <i
                                  style={{
                                    width: "9px",
                                    height: "9px",
                                    borderRadius: "50%",
                                    background: "#d92d20",
                                    display: "block",
                                  }}
                                ></i>
                                {v.zbar.la}
                              </span>
                              {!!v.zbar.lb && (
                                <span
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <i
                                    style={{
                                      width: "9px",
                                      height: "9px",
                                      borderRadius: "50%",
                                      background: "#f2b45a",
                                      display: "block",
                                    }}
                                  ></i>
                                  {v.zbar.lb}
                                </span>
                              )}
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                <i
                                  style={{
                                    width: "9px",
                                    height: "9px",
                                    borderRadius: "50%",
                                    background: "#0a7aff",
                                    display: "block",
                                  }}
                                ></i>
                                {v.zbar.lc}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                      {!!v.hasActions && (
                        <>
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              padding: "14px 18px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "15px",
                                fontWeight: "700",
                                paddingBottom: "6px",
                              }}
                            >
                              Why
                            </div>
                            {(v.why || []).map((w, $index) => (
                              <React.Fragment key={$index}>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "minmax(120px,170px) minmax(0,1fr)",
                                    gap: "12px",
                                    padding: "8px 0",
                                    borderTop: "1px solid #e9e9e6",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontStyle: "italic",
                                      color: "#75756f",
                                    }}
                                  >
                                    {w.l}
                                  </span>
                                  <span>
                                    <div
                                      style={{
                                        fontSize: "14px",
                                        fontWeight: "600",
                                      }}
                                    >
                                      {w.v}
                                    </div>
                                    {!!w.s && (
                                      <>
                                        <div
                                          style={{
                                            fontSize: "12px",
                                            color: "#75756f",
                                          }}
                                        >
                                          {w.s}
                                        </div>
                                      </>
                                    )}
                                  </span>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {!!v.l1 && (
                    <>
                      {!!v.hasActions && (
                        <>
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              padding: "16px 18px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "12px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "8px",
                                flexWrap: "wrap",
                                alignItems: "center",
                              }}
                            >
                              <span
                                style={{
                                  color: "#0a7aff",
                                  fontSize: "16px",
                                  marginRight: "2px",
                                }}
                              >
                                ✦
                              </span>
                              {(v.asks || []).map((q, $index) => (
                                <React.Fragment key={$index}>
                                  <button onClick={q.go} style={q.style}>
                                    {q.label}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>
                            {!!v.askText && (
                              <>
                                <div
                                  style={{
                                    padding: "12px 14px",
                                    borderRadius: "10px",
                                    background: "#f0f0ee",
                                    fontSize: "15px",
                                    lineHeight: "23px",
                                    color: "#2b2b28",
                                    textWrap: "pretty",
                                  }}
                                >
                                  {v.askText}
                                </div>
                              </>
                            )}
                          </div>
                        </>
                      )}
                      {!!v.hasActions && (
                        <>
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              padding: "14px 18px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                            }}
                          >
                            <div
                              style={{ fontSize: "15px", fontWeight: "700" }}
                            >
                              Evidence
                            </div>
                            {(v.evid || []).map((e, $index) => (
                              <React.Fragment key={$index}>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "110px minmax(0,1fr)",
                                    gap: "12px",
                                    padding: "6px 0",
                                    borderTop: "1px solid #e9e9e6",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "12px",
                                      fontStyle: "italic",
                                      color: "#75756f",
                                    }}
                                  >
                                    {e.l}
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "13px",
                                      color: "#2b2b28",
                                    }}
                                  >
                                    {e.v}
                                  </span>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </>
                      )}
                    </>
                  )}
                  {!!v.l3 && v.detailData && (
                    <InsightDetails
                      key={
                        v.detailData.finding.finding_id +
                        v.detailData.attention.metric_release_id
                      }
                      input={v.detailData}
                    />
                  )}
                  {!!v.l3 && !v.detailData && (
                    <>
                      {!!v.isZ && (
                        <>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                              gap: "12px",
                            }}
                          >
                            {(v.zex || []).map((m, $index) => (
                              <React.Fragment key={$index}>
                                <div
                                  onMouseEnter={m.enter}
                                  onMouseLeave={m.leave}
                                  style={{
                                    background: "#fff",
                                    border: "1px solid #d6d6d2",
                                    borderRadius: "14px",
                                    boxShadow:
                                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                                    padding: "16px 18px",
                                    cursor: "default",
                                  }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: "8px",
                                      fontSize: "13px",
                                      color: "#55554f",
                                    }}
                                  >
                                    <span>{m.label}</span>
                                    <span
                                      style={{
                                        fontSize: "11px",
                                        fontStyle: "italic",
                                        color: "#75756f",
                                      }}
                                    >
                                      {m.tag}
                                    </span>
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "30px",
                                      fontWeight: "700",
                                      letterSpacing: "-.02em",
                                      color: "#0a5cc7",
                                      marginTop: "4px",
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {m.val}
                                  </div>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              padding: "16px 20px 12px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "15px",
                                fontWeight: "700",
                                marginBottom: "10px",
                              }}
                            >
                              Stores at zero
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(8,minmax(0,1fr))",
                                gap: "8px",
                              }}
                            >
                              {(v.zhist || []).map((h, $index) => (
                                <React.Fragment key={$index}>
                                  <div
                                    style={{
                                      display: "flex",
                                      flexDirection: "column",
                                      gap: "6px",
                                    }}
                                  >
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontWeight: "600",
                                        textAlign: "center",
                                        fontVariantNumeric: "tabular-nums",
                                      }}
                                    >
                                      {h.v}
                                    </div>
                                    <div
                                      style={{
                                        position: "relative",
                                        height: "90px",
                                      }}
                                    >
                                      <div style={h.bar}></div>
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "11px",
                                        color: "#75756f",
                                        textAlign: "center",
                                      }}
                                    >
                                      {h.l}
                                    </div>
                                  </div>
                                </React.Fragment>
                              ))}
                            </div>
                          </div>
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "6px",
                                padding: "12px 14px",
                                borderBottom: "1px solid #e9e9e6",
                              }}
                            >
                              {(v.zfilter || []).map((c, $index) => (
                                <React.Fragment key={$index}>
                                  <button onClick={c.go} style={c.style}>
                                    {c.label}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "minmax(0,1.4fr) minmax(0,1fr) 80px 90px",
                                gap: "12px",
                                padding: "10px 20px",
                                background: "#f3f3f1",
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#55554f",
                              }}
                            >
                              <span>Store</span>
                              <span>Status</span>
                              <span style={{ textAlign: "right" }}>
                                At zero
                              </span>
                              <span style={{ textAlign: "right" }}>Demand</span>
                            </div>
                            {(v.zrows || []).map((r, $index) => (
                              <React.Fragment key={$index}>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "minmax(0,1.4fr) minmax(0,1fr) 80px 90px",
                                    gap: "12px",
                                    alignItems: "center",
                                    padding: "9px 20px",
                                    borderTop: "1px solid #e9e9e6",
                                    fontSize: "13px",
                                  }}
                                >
                                  <span>
                                    <div style={{ fontWeight: "600" }}>
                                      {r.name}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontStyle: "italic",
                                        color: "#75756f",
                                      }}
                                    >
                                      {r.region}
                                    </div>
                                  </span>
                                  <span style={r.sStyle}>{r.status}</span>
                                  <span style={r.dStyle}>{r.days}</span>
                                  <span
                                    style={{
                                      textAlign: "right",
                                      fontVariantNumeric: "tabular-nums",
                                      color: "#55554f",
                                    }}
                                  >
                                    {r.dem}
                                  </span>
                                </div>
                              </React.Fragment>
                            ))}
                            {!!v.zmore && (
                              <>
                                <div
                                  style={{
                                    padding: "10px 20px",
                                    borderTop: "1px solid #e9e9e6",
                                    fontSize: "12px",
                                    fontStyle: "italic",
                                    color: "#75756f",
                                  }}
                                >
                                  {v.zmore}
                                </div>
                              </>
                            )}
                          </div>
                        </>
                      )}
                      {!!v.isA && (
                        <>
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              padding: "16px 20px",
                              display: "flex",
                              flexDirection: "column",
                              gap: "12px",
                            }}
                          >
                            {(v.sup || []).map((r, $index) => (
                              <React.Fragment key={$index}>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "minmax(130px,190px) minmax(0,1fr) 70px",
                                    gap: "14px",
                                    alignItems: "center",
                                  }}
                                >
                                  <span>
                                    <div
                                      style={{
                                        fontSize: "14px",
                                        fontWeight: "600",
                                      }}
                                    >
                                      {r.l}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontStyle: "italic",
                                        color: "#75756f",
                                      }}
                                    >
                                      {r.s}
                                    </div>
                                  </span>
                                  <span
                                    style={{
                                      display: "block",
                                      height: "10px",
                                      borderRadius: "999px",
                                      background: "#e9e9e6",
                                      overflow: "hidden",
                                    }}
                                  >
                                    <b style={r.bar}></b>
                                  </span>
                                  <span
                                    style={{
                                      fontSize: "14px",
                                      fontWeight: "700",
                                      textAlign: "right",
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {r.v}
                                  </span>
                                </div>
                              </React.Fragment>
                            ))}
                            <div
                              style={{
                                fontSize: "13px",
                                fontStyle: "italic",
                                color: "#55554f",
                              }}
                            >
                              {v.supNote}
                            </div>
                          </div>
                        </>
                      )}
                      {!!v.isI && (
                        <>
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              padding: "6px 8px 8px",
                            }}
                          >
                            {(v.cmts || []).map((r, $index) => (
                              <React.Fragment key={$index}>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "minmax(0,1fr) auto",
                                    gap: "12px",
                                    alignItems: "center",
                                    padding: "10px 12px",
                                  }}
                                >
                                  <span>
                                    <div
                                      style={{
                                        fontSize: "14px",
                                        fontWeight: "600",
                                      }}
                                    >
                                      {r.name}
                                    </div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        fontStyle: "italic",
                                        color: "#75756f",
                                      }}
                                    >
                                      {r.sub}
                                    </div>
                                  </span>
                                  <span style={r.chipStyle}>{r.chip}</span>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </>
                      )}
                      {!!v.notZ && (
                        <>
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              padding: "18px 20px 12px",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "6px",
                                marginBottom: "14px",
                              }}
                            >
                              {(v.modes || []).map((m, $index) => (
                                <React.Fragment key={$index}>
                                  <button onClick={m.go} style={m.style}>
                                    {m.label}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>
                            {!!v.showChart && (
                              <>
                                <div style={{ paddingLeft: "44px" }}>
                                  <div
                                    onMouseMove={v.map.move}
                                    onMouseLeave={v.map.leave}
                                    style={{
                                      position: "relative",
                                      height: "290px",
                                      cursor: "crosshair",
                                    }}
                                  >
                                    {(v.map.bands || []).map((b, $index) => (
                                      <React.Fragment key={$index}>
                                        <div style={b.style}></div>
                                      </React.Fragment>
                                    ))}
                                    <div style={v.map.chartStyle}></div>
                                    <div style={v.map.nowStyle}></div>
                                    {(v.map.labels || []).map((l, $index) => (
                                      <React.Fragment key={$index}>
                                        <div style={l.style}>{l.t}</div>
                                      </React.Fragment>
                                    ))}
                                    {(v.map.dots || []).map((d, $index) => (
                                      <React.Fragment key={$index}>
                                        <div style={d.style}></div>
                                      </React.Fragment>
                                    ))}
                                    {(v.map.flags || []).map((f, $index) => (
                                      <React.Fragment key={$index}>
                                        <div
                                          onMouseEnter={f.enter}
                                          onMouseLeave={f.leave}
                                          style={f.style}
                                        >
                                          ◆
                                        </div>
                                      </React.Fragment>
                                    ))}
                                    {(v.map.marks || []).map((d, $index) => (
                                      <React.Fragment key={$index}>
                                        <div style={d.style}>✕</div>
                                      </React.Fragment>
                                    ))}
                                    {!!v.map.hasHover && (
                                      <>
                                        <div style={v.map.scrubStyle}></div>
                                        <div style={v.map.popStyle}>
                                          <div
                                            style={{
                                              fontSize: "12px",
                                              fontStyle: "italic",
                                              color: "#a6a6a0",
                                            }}
                                          >
                                            {v.map.popDate}
                                          </div>
                                          {(v.map.popRows || []).map(
                                            (r, $index) => (
                                              <React.Fragment key={$index}>
                                                <div
                                                  style={{
                                                    display: "flex",
                                                    justifyContent:
                                                      "space-between",
                                                    gap: "16px",
                                                    fontSize: "13px",
                                                    marginTop: "3px",
                                                  }}
                                                >
                                                  <span
                                                    style={{ color: "#c4c4bf" }}
                                                  >
                                                    {r.l}
                                                  </span>
                                                  <span
                                                    style={{
                                                      fontWeight: "600",
                                                      fontVariantNumeric:
                                                        "tabular-nums",
                                                    }}
                                                  >
                                                    {r.v}
                                                  </span>
                                                </div>
                                              </React.Fragment>
                                            ),
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </>
                            )}
                            {!!v.showStores && (
                              <>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "2px",
                                  }}
                                >
                                  <div
                                    style={{
                                      padding: "0 6px 8px",
                                      fontSize: "12px",
                                      fontStyle: "italic",
                                      color: "#75756f",
                                    }}
                                  >
                                    {v.storeHead}
                                  </div>
                                  {(v.storeRows || []).map((r, $index) => (
                                    <React.Fragment key={$index}>
                                      <div
                                        onMouseEnter={r.enter}
                                        onMouseLeave={r.leave}
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns:
                                            "minmax(110px,190px) minmax(0,1fr) 70px",
                                          gap: "14px",
                                          alignItems: "center",
                                          padding: "9px 6px",
                                          borderRadius: "10px",
                                          cursor: "default",
                                        }}
                                        data-hv={'{"background":"#f7f7f5"}'}
                                      >
                                        <span>
                                          <div
                                            style={{
                                              fontSize: "14px",
                                              fontWeight: "600",
                                            }}
                                          >
                                            {r.name}
                                          </div>
                                          <div
                                            style={{
                                              fontSize: "12px",
                                              fontStyle: "italic",
                                              color: "#75756f",
                                            }}
                                          >
                                            {r.region}
                                          </div>
                                        </span>
                                        <span
                                          style={{
                                            display: "block",
                                            height: "8px",
                                            borderRadius: "999px",
                                            background: "#e9e9e6",
                                            overflow: "hidden",
                                          }}
                                        >
                                          <b style={r.bar}></b>
                                        </span>
                                        <span style={r.numStyle}>
                                          {r.label}
                                        </span>
                                      </div>
                                    </React.Fragment>
                                  ))}
                                  {!!v.moreStores && (
                                    <>
                                      <div
                                        style={{
                                          padding: "8px 6px",
                                          fontSize: "12px",
                                          fontStyle: "italic",
                                          color: "#75756f",
                                        }}
                                      >
                                        {v.moreStores}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                          {!!v.isA && (
                            <>
                              <div
                                style={{
                                  background: "#fff",
                                  border: "1px solid #d6d6d2",
                                  borderRadius: "14px",
                                  boxShadow:
                                    "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                                  padding: "16px 20px",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "12px",
                                }}
                              >
                                {(v.arrivals || []).map((a, $index) => (
                                  <React.Fragment key={$index}>
                                    <div
                                      onMouseEnter={a.enter}
                                      onMouseLeave={a.leave}
                                      style={{
                                        display: "grid",
                                        gridTemplateColumns:
                                          "minmax(120px,200px) minmax(0,1fr)",
                                        gap: "14px",
                                        alignItems: "center",
                                        cursor: "default",
                                      }}
                                    >
                                      <div>
                                        <div
                                          style={{
                                            fontSize: "14px",
                                            fontWeight: "600",
                                          }}
                                        >
                                          {a.name}
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "12px",
                                            fontStyle: "italic",
                                            color: "#75756f",
                                          }}
                                        >
                                          {a.sub}
                                        </div>
                                      </div>
                                      <div
                                        style={{
                                          position: "relative",
                                          height: "26px",
                                          borderRadius: "999px",
                                          background: "#f0f0ee",
                                          overflow: "hidden",
                                        }}
                                      >
                                        <div
                                          style={{
                                            position: "absolute",
                                            top: "0",
                                            bottom: "0",
                                            left: "25%",
                                            width: "1px",
                                            background: "rgba(29,29,31,.1)",
                                          }}
                                        ></div>
                                        <div
                                          style={{
                                            position: "absolute",
                                            top: "0",
                                            bottom: "0",
                                            left: "50%",
                                            width: "1px",
                                            background: "rgba(29,29,31,.1)",
                                          }}
                                        ></div>
                                        <div
                                          style={{
                                            position: "absolute",
                                            top: "0",
                                            bottom: "0",
                                            left: "75%",
                                            width: "1px",
                                            background: "rgba(29,29,31,.1)",
                                          }}
                                        ></div>
                                        <div style={a.bar}></div>
                                        <div style={a.tick}></div>
                                      </div>
                                    </div>
                                  </React.Fragment>
                                ))}
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "minmax(120px,200px) minmax(0,1fr)",
                                    gap: "14px",
                                  }}
                                >
                                  <div></div>
                                  <div
                                    style={{
                                      position: "relative",
                                      height: "14px",
                                    }}
                                  >
                                    {(v.arrScale || []).map((s, $index) => (
                                      <React.Fragment key={$index}>
                                        <span style={s.style}>{s.l}</span>
                                      </React.Fragment>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </>
                          )}
                          {!!v.isI && (
                            <>
                              <div
                                style={{
                                  background: "#fff",
                                  border: "1px solid #d6d6d2",
                                  borderRadius: "14px",
                                  boxShadow:
                                    "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                                  padding: "16px 20px",
                                }}
                              >
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns:
                                      "repeat(4,minmax(0,1fr))",
                                    gap: "12px",
                                    alignItems: "end",
                                  }}
                                >
                                  {(v.carry || []).map((w, $index) => (
                                    <React.Fragment key={$index}>
                                      <div
                                        style={{
                                          display: "flex",
                                          flexDirection: "column",
                                          gap: "6px",
                                          alignItems: "stretch",
                                        }}
                                      >
                                        <div
                                          style={{
                                            fontSize: "15px",
                                            fontWeight: "700",
                                            color: "#0a5cc7",
                                            fontVariantNumeric: "tabular-nums",
                                          }}
                                        >
                                          {w.v}
                                        </div>
                                        <div
                                          style={{
                                            height: "56px",
                                            display: "flex",
                                            alignItems: "flex-end",
                                          }}
                                        >
                                          <div style={w.bar}></div>
                                        </div>
                                        <div
                                          style={{
                                            fontSize: "11px",
                                            color: "#75756f",
                                          }}
                                        >
                                          {w.l}
                                        </div>
                                      </div>
                                    </React.Fragment>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                          <div
                            style={{
                              background: "#fff",
                              border: "1px solid #d6d6d2",
                              borderRadius: "14px",
                              boxShadow:
                                "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                gap: "6px",
                                padding: "12px 14px",
                                borderBottom: "1px solid #e9e9e6",
                              }}
                            >
                              {(v.span || []).map((s, $index) => (
                                <React.Fragment key={$index}>
                                  <button onClick={s.go} style={s.style}>
                                    {s.label}
                                  </button>
                                </React.Fragment>
                              ))}
                            </div>
                            <div style={{ overflowX: "auto" }}>
                              <table
                                style={{
                                  width: "100%",
                                  borderCollapse: "collapse",
                                  fontSize: "13px",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                <thead>
                                  <tr>
                                    {(v.tbl.head || []).map((h, $index) => (
                                      <React.Fragment key={$index}>
                                        <th style={h.style}>{h.t}</th>
                                      </React.Fragment>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {(v.tbl.rows || []).map((r, $index) => (
                                    <React.Fragment key={$index}>
                                      <tr onClick={r.tog} style={r.style}>
                                        {(r.cells || []).map((x, $index) => (
                                          <React.Fragment key={$index}>
                                            <td style={x.style}>{x.t}</td>
                                          </React.Fragment>
                                        ))}
                                      </tr>
                                      {!!r.open && (
                                        <>
                                          <tr>
                                            <td
                                              colSpan={5}
                                              style={{
                                                padding: "10px 16px 14px 34px",
                                                background: "#f7f7f5",
                                                borderTop: "1px solid #e9e9e6",
                                              }}
                                            >
                                              {(r.detail || []).map(
                                                (d, $index) => (
                                                  <React.Fragment key={$index}>
                                                    <div
                                                      style={{
                                                        marginTop: "4px",
                                                      }}
                                                    >
                                                      <div
                                                        style={{
                                                          fontSize: "13px",
                                                          fontWeight: "600",
                                                        }}
                                                      >
                                                        {d.a}
                                                      </div>
                                                      <div
                                                        style={{
                                                          fontSize: "12px",
                                                          fontStyle: "italic",
                                                          color: "#75756f",
                                                        }}
                                                      >
                                                        {d.b}
                                                      </div>
                                                    </div>
                                                  </React.Fragment>
                                                ),
                                              )}
                                            </td>
                                          </tr>
                                        </>
                                      )}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  )}
                </div>
                {!!v.hasActions && (
                  <>
                    <div
                      style={{
                        flex: "0 0 300px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        position: "sticky",
                        top: "76px",
                      }}
                    >
                      <div
                        style={{
                          background: "#fff",
                          border: "1px solid #d6d6d2",
                          borderRadius: "14px",
                          boxShadow:
                            "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                          padding: "18px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "10px",
                        }}
                      >
                        <div style={{ fontSize: "15px", fontWeight: "700" }}>
                          Decide
                        </div>
                        {(v.actions || []).map((a, $index) => (
                          <React.Fragment key={$index}>
                            <button onClick={a.go} style={a.style}>
                              <span
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "2px",
                                  textAlign: "left",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: "600",
                                  }}
                                >
                                  {a.name}
                                </span>
                                <span style={a.subStyle}>{a.sub}</span>
                              </span>
                              <span style={a.effStyle}>{a.eff}</span>
                            </button>
                          </React.Fragment>
                        ))}
                        <button onClick={v.commit} style={v.commitStyle}>
                          {v.commitLabel}
                        </button>
                        {!!v.tracked1 && (
                          <>
                            <div
                              style={{
                                padding: "10px 12px",
                                borderRadius: "10px",
                                background: "#e8f5ec",
                                color: "#1f7a42",
                                fontSize: "13px",
                                fontWeight: "600",
                              }}
                            >
                              ✓ ◷ {v.tracked1}
                            </div>
                          </>
                        )}
                      </div>
                      <div
                        style={{
                          background: "#fff",
                          border: "1px solid #d6d6d2",
                          borderRadius: "14px",
                          boxShadow:
                            "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                          padding: "12px",
                        }}
                      >
                        <button
                          aria-label="Export to Excel"
                          onClick={v.exportXlsx}
                          style={{
                            width: "100%",
                            height: "40px",
                            borderRadius: "10px",
                            border: "1px solid #d6d6d2",
                            background: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            fontSize: "14px",
                            fontWeight: "600",
                            transition: "background .15s",
                          }}
                          data-hv={'{"background":"#f0f0ee"}'}
                        >
                          <span style={{ fontSize: "16px" }}>⤓</span>Excel (CSV)
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        {!!v.rep && (
          <>
            <div
              onClick={v.repClose}
              role="dialog"
              aria-modal="true"
              aria-label="Weekly review"
              data-reimagined-modal="true"
              style={{
                position: "fixed",
                inset: "0",
                zIndex: "35",
                background: "rgba(29,29,31,.38)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding: "56px 20px",
                overflow: "auto",
              }}
            >
              <div
                onClick={v.stop}
                style={{
                  width: "100%",
                  maxWidth: "780px",
                  background: "#f7f7f5",
                  border: "1px solid #d6d6d2",
                  borderRadius: "18px",
                  boxShadow: "0 24px 60px rgba(0,0,0,.25)",
                  padding: "22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "22px",
                        fontWeight: "700",
                        letterSpacing: "-.02em",
                      }}
                    >
                      Weekly review
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        fontStyle: "italic",
                        color: "#75756f",
                        marginTop: "2px",
                      }}
                    >
                      {v.rp.range}
                    </div>
                  </div>
                  <button
                    aria-label="Close"
                    onClick={v.repClose}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "999px",
                      background: "#fff",
                      border: "1px solid #d6d6d2",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "13px",
                    }}
                    data-hv={'{"background":"#f0f0ee"}'}
                  >
                    ✕
                  </button>
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "16px 18px",
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      color: "#0a7aff",
                      fontSize: "16px",
                      lineHeight: "26px",
                    }}
                  >
                    ✦
                  </span>
                  <div
                    style={{
                      fontSize: "18px",
                      lineHeight: "26px",
                      fontWeight: "500",
                      letterSpacing: "-.01em",
                      textWrap: "pretty",
                    }}
                  >
                    {v.rp.headline}
                  </div>
                </div>
                {(v.rp.secs || []).map((sec, $index) => (
                  <React.Fragment key={$index}>
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid #d6d6d2",
                        borderRadius: "14px",
                        boxShadow:
                          "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                        padding: "16px 18px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "10px",
                          marginBottom: "12px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "12px",
                            fontStyle: "italic",
                            color: "#75756f",
                          }}
                        >
                          {sec.n}
                        </span>
                        <span style={{ fontSize: "16px", fontWeight: "700" }}>
                          {sec.title}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit,minmax(150px,1fr))",
                          gap: "12px",
                        }}
                      >
                        {(sec.stats || []).map((m, $index) => (
                          <React.Fragment key={$index}>
                            <div
                              onMouseEnter={m.enter}
                              onMouseLeave={m.leave}
                              style={{
                                background: "#f7f7f5",
                                borderRadius: "12px",
                                padding: "12px 14px",
                                cursor: "default",
                                transition: "transform .15s",
                              }}
                              data-hv={'{"transform":"translateY(-2px)"}'}
                            >
                              <div
                                style={{ fontSize: "13px", color: "#55554f" }}
                              >
                                {m.label}
                              </div>
                              <div
                                style={{
                                  fontSize: "26px",
                                  fontWeight: "700",
                                  letterSpacing: "-.02em",
                                  color: "#0a5cc7",
                                  marginTop: "2px",
                                  fontVariantNumeric: "tabular-nums",
                                }}
                              >
                                {m.val}
                              </div>
                              <div style={m.deltaStyle}>{m.delta}</div>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </React.Fragment>
                ))}
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      padding: "14px 18px",
                      display: "flex",
                      alignItems: "baseline",
                      gap: "10px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "12px",
                        fontStyle: "italic",
                        color: "#75756f",
                      }}
                    >
                      04
                    </span>
                    <span style={{ fontSize: "16px", fontWeight: "700" }}>
                      Decisions and results
                    </span>
                  </div>
                  {(v.rp.decisions || []).map((d, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0,1fr) auto 28px",
                          gap: "14px",
                          alignItems: "center",
                          padding: "12px 18px",
                          borderTop: "1px solid #e9e9e6",
                        }}
                      >
                        <span style={{ minWidth: "0" }}>
                          <div style={{ fontSize: "14px", fontWeight: "600" }}>
                            {d.name}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontStyle: "italic",
                              color: "#75756f",
                            }}
                          >
                            {d.sub}
                          </div>
                        </span>
                        <span
                          style={{
                            fontSize: "14px",
                            fontVariantNumeric: "tabular-nums",
                            color: "#55554f",
                          }}
                        >
                          {d.result}
                        </span>
                        <span style={d.vStyle}>{d.mark}</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "12px",
                  }}
                >
                  <button
                    aria-label="Export to Excel"
                    onClick={v.exportRep}
                    style={{
                      width: "100%",
                      height: "40px",
                      borderRadius: "10px",
                      border: "1px solid #d6d6d2",
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      fontSize: "14px",
                      fontWeight: "600",
                      transition: "background .15s",
                    }}
                    data-hv={'{"background":"#f0f0ee"}'}
                  >
                    <span style={{ fontSize: "16px" }}>⤓</span>Excel (CSV)
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
        {!!v.xcOpen && (
          <>
            <div
              onClick={v.xcClose}
              role="dialog"
              aria-modal="true"
              aria-label="Case for expansion"
              data-reimagined-modal="true"
              style={{
                position: "fixed",
                inset: "0",
                zIndex: "35",
                background: "rgba(29,29,31,.38)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding: "56px 20px",
                overflow: "auto",
              }}
            >
              <div
                onClick={v.stop}
                style={{
                  width: "100%",
                  maxWidth: "780px",
                  background: "#f7f7f5",
                  border: "1px solid #d6d6d2",
                  borderRadius: "18px",
                  boxShadow: "0 24px 60px rgba(0,0,0,.25)",
                  padding: "22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "22px",
                        fontWeight: "700",
                        letterSpacing: "-.02em",
                      }}
                    >
                      Case for expansion
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        fontStyle: "italic",
                        color: "#75756f",
                        marginTop: "2px",
                      }}
                    >
                      {v.xcase.sub}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "5px",
                        width: "190px",
                      }}
                    >
                      <div style={{ display: "flex", gap: "3px" }}>
                        {(v.xcase.scale || []).map((c, $index) => (
                          <React.Fragment key={$index}>
                            <span style={c.bar}></span>
                          </React.Fragment>
                        ))}
                      </div>
                      <div style={{ display: "flex" }}>
                        {(v.xcase.scale || []).map((c, $index) => (
                          <React.Fragment key={$index}>
                            <span style={c.style}>{c.label}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                    <button
                      aria-label="Close"
                      onClick={v.xcClose}
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "999px",
                        background: "#fff",
                        border: "1px solid #d6d6d2",
                        display: "grid",
                        placeItems: "center",
                        fontSize: "13px",
                      }}
                      data-hv={'{"background":"#f0f0ee"}'}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "16px 18px",
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      color: "#0a7aff",
                      fontSize: "16px",
                      lineHeight: "26px",
                    }}
                  >
                    ✦
                  </span>
                  <div
                    style={{
                      fontSize: "17px",
                      lineHeight: "26px",
                      fontWeight: "500",
                      textWrap: "pretty",
                    }}
                  >
                    {v.xcase.story}
                  </div>
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "16px 20px 10px",
                  }}
                >
                  <div style={{ paddingLeft: "44px", paddingBottom: "22px" }}>
                    <div
                      onMouseMove={v.gmove}
                      onMouseLeave={v.gleave}
                      style={{
                        position: "relative",
                        height: "250px",
                        cursor: "crosshair",
                      }}
                    >
                      <div style={v.gc.bg}></div>
                      {(v.gc.labels || []).map((l, $index) => (
                        <React.Fragment key={$index}>
                          <div style={l.style}>{l.t}</div>
                        </React.Fragment>
                      ))}
                      {!!v.gc.hasHover && (
                        <>
                          <div style={v.gc.scrub}></div>
                          <div style={v.gc.pop}>
                            <div
                              style={{
                                fontSize: "12px",
                                fontStyle: "italic",
                                color: "#a6a6a0",
                              }}
                            >
                              {v.gc.popDate}
                            </div>
                            {(v.gc.popRows || []).map((r, $index) => (
                              <React.Fragment key={$index}>
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: "16px",
                                    fontSize: "13px",
                                    marginTop: "3px",
                                  }}
                                >
                                  <span style={{ color: "#c4c4bf" }}>
                                    {r.l}
                                  </span>
                                  <span
                                    style={{
                                      fontWeight: "600",
                                      fontVariantNumeric: "tabular-nums",
                                    }}
                                  >
                                    {r.v}
                                  </span>
                                </div>
                              </React.Fragment>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    overflow: "hidden",
                  }}
                >
                  {(v.xcase.skus || []).map((r, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        onClick={r.open}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "minmax(0,1fr) 110px 60px 110px",
                          gap: "12px",
                          alignItems: "center",
                          padding: "12px 18px",
                          borderTop: "1px solid #e9e9e6",
                          cursor: "pointer",
                        }}
                        data-hv={'{"background":"#f7f7f5"}'}
                      >
                        <span style={{ fontSize: "14px", fontWeight: "600" }}>
                          {r.name}
                        </span>
                        <span style={{ display: "flex", gap: "4px" }}>
                          {(r.dots || []).map((d, $index) => (
                            <React.Fragment key={$index}>
                              <i style={d.style}></i>
                            </React.Fragment>
                          ))}
                        </span>
                        <span style={r.vStyle}>{r.v}</span>
                        <span style={r.stStyle}>{r.st}</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "16px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "2px",
                  }}
                >
                  {(v.xcase.chapters || []).map((c, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "24px minmax(0,1fr)",
                          gap: "14px",
                          padding: "8px 0",
                        }}
                      >
                        <span style={c.markStyle}>{c.mark}</span>
                        <span>
                          <div
                            style={{
                              fontSize: "12px",
                              fontStyle: "italic",
                              color: "#75756f",
                            }}
                          >
                            {c.week}
                          </div>
                          <div
                            style={{
                              fontSize: "14px",
                              lineHeight: "21px",
                              fontWeight: "500",
                              marginTop: "1px",
                              textWrap: "pretty",
                            }}
                          >
                            {c.h}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "6px",
                              flexWrap: "wrap",
                              marginTop: "6px",
                            }}
                          >
                            {(c.chips || []).map((x, $index) => (
                              <React.Fragment key={$index}>
                                <span
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: "600",
                                    padding: "2px 9px",
                                    borderRadius: "999px",
                                    background: "#f0f0ee",
                                    color: "#55554f",
                                  }}
                                >
                                  {x.t}
                                </span>
                              </React.Fragment>
                            ))}
                          </div>
                        </span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "14px 18px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                  }}
                >
                  {(v.xcase.evidence || []).map((e, $index) => (
                    <React.Fragment key={$index}>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "20px minmax(0,1fr)",
                          gap: "10px",
                          fontSize: "13px",
                        }}
                      >
                        <span style={e.mStyle}>{e.m}</span>
                        <span style={{ color: "#2b2b28" }}>{e.t}</span>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                    padding: "12px",
                  }}
                >
                  <button
                    aria-label="Export to Excel"
                    onClick={v.exportG}
                    style={{
                      width: "100%",
                      height: "40px",
                      borderRadius: "10px",
                      border: "1px solid #d6d6d2",
                      background: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      fontSize: "14px",
                      fontWeight: "600",
                      transition: "background .15s",
                    }}
                    data-hv={'{"background":"#f0f0ee"}'}
                  >
                    <span style={{ fontSize: "16px" }}>⤓</span>Excel (CSV)
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
        {!!v.mapOpen && (
          <>
            <div
              onClick={v.mapClose}
              role="dialog"
              aria-modal="true"
              aria-label="Map"
              data-reimagined-modal="true"
              style={{
                position: "fixed",
                inset: "0",
                zIndex: "37",
                background: "rgba(29,29,31,.38)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
              }}
            >
              <div
                onClick={v.stop}
                style={{
                  position: "relative",
                  width: "100%",
                  height: "100%",
                  maxWidth: "1560px",
                  borderRadius: "18px",
                  overflow: "hidden",
                  border: "1px solid #d6d6d2",
                  boxShadow: "0 24px 60px rgba(0,0,0,.28)",
                  background: "#e9e9e6",
                }}
              >
                <iframe
                  sandbox=""
                  srcDoc={
                    '<!doctype html><html><body style="font-family:system-ui;background:#f7f7f5;color:#1d1d1f;display:grid;place-content:center;height:90vh;text-align:center"><h1>Map data unavailable</h1><p>Geographic metric histories are not exposed by this backend release.</p><p>No synthetic locations or map readings have been substituted.</p></body></html>'
                  }
                  title="Map"
                  style={{
                    position: "absolute",
                    inset: "0",
                    width: "100%",
                    height: "100%",
                    border: "0",
                  }}
                ></iframe>
                <button
                  aria-label="Close"
                  onClick={v.mapClose}
                  style={{
                    position: "absolute",
                    top: "16px",
                    right: "16px",
                    width: "36px",
                    height: "36px",
                    borderRadius: "999px",
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    display: "grid",
                    placeItems: "center",
                    fontSize: "13px",
                    boxShadow:
                      "0 1px 2px rgba(29,29,31,.06),0 2px 8px rgba(29,29,31,.04)",
                  }}
                  data-hv={'{"background":"#f0f0ee"}'}
                >
                  ✕
                </button>
              </div>
            </div>
          </>
        )}
        {!!v.sh && (
          <>
            <div
              onClick={v.shClose}
              role="dialog"
              aria-modal="true"
              aria-label="One-pager"
              data-reimagined-modal="true"
              style={{
                position: "fixed",
                inset: "0",
                zIndex: "36",
                background: "rgba(29,29,31,.38)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "center",
                padding: "40px 20px",
                overflow: "auto",
              }}
            >
              <div
                onClick={v.stop}
                style={{
                  width: "100%",
                  maxWidth: "820px",
                  background: "#f7f7f5",
                  border: "1px solid #d6d6d2",
                  borderRadius: "18px",
                  boxShadow: "0 24px 60px rgba(0,0,0,.25)",
                  padding: "22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "14px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "16px",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: "22px",
                        fontWeight: "700",
                        letterSpacing: "-.02em",
                      }}
                    >
                      {v.shName}
                    </div>
                    <div
                      style={{
                        fontSize: "13px",
                        fontStyle: "italic",
                        color: "#75756f",
                        marginTop: "2px",
                      }}
                    >
                      One-pager
                    </div>
                  </div>
                  <button
                    aria-label="Close"
                    onClick={v.shClose}
                    style={{
                      width: "32px",
                      height: "32px",
                      borderRadius: "999px",
                      background: "#fff",
                      border: "1px solid #d6d6d2",
                      display: "grid",
                      placeItems: "center",
                      fontSize: "13px",
                    }}
                    data-hv={'{"background":"#f0f0ee"}'}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {(v.shTo || []).map((c, $index) => (
                    <React.Fragment key={$index}>
                      <button onClick={c.go} style={c.style}>
                        {c.label}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow: "0 1px 2px rgba(29,29,31,.06)",
                    padding: "14px 16px",
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    style={{
                      color: "#0a7aff",
                      fontSize: "16px",
                      lineHeight: "26px",
                    }}
                  >
                    ✦
                  </span>
                  <textarea
                    value={v.shText}
                    onChange={v.shEdit}
                    placeholder="…"
                    rows={7}
                    style={{
                      flex: "1",
                      minWidth: "0",
                      border: "0",
                      outline: "0",
                      resize: "none",
                      background: "none",
                      font: "inherit",
                      fontSize: "16px",
                      lineHeight: "25px",
                      fontWeight: "500",
                      color: "#1d1d1f",
                    }}
                  ></textarea>
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow: "0 1px 2px rgba(29,29,31,.06)",
                    padding: "10px",
                  }}
                >
                  <div style={v.shPngStyle}></div>
                </div>
                <div
                  style={{
                    background: "#fff",
                    border: "1px solid #d6d6d2",
                    borderRadius: "14px",
                    boxShadow: "0 1px 2px rgba(29,29,31,.06)",
                    padding: "12px",
                  }}
                >
                  <button
                    aria-label="Download PNG"
                    onClick={v.shSave}
                    style={{
                      width: "100%",
                      height: "44px",
                      borderRadius: "12px",
                      background: "#1d1d1f",
                      color: "#fff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      fontSize: "15px",
                      fontWeight: "700",
                    }}
                  >
                    <span style={{ fontSize: "16px" }}>⤓</span>PNG
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
        {!!v.hasTip && (
          <>
            <div style={v.tipStyle}>
              <div
                style={{
                  fontSize: "12px",
                  fontStyle: "italic",
                  color: "#a6a6a0",
                  marginBottom: "4px",
                }}
              >
                {v.tipTitle}
              </div>
              {(v.tipRows || []).map((r, $index) => (
                <React.Fragment key={$index}>
                  <div style={{ padding: "6px 0" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        fontSize: "13px",
                      }}
                    >
                      <span style={{ fontWeight: "600" }}>{r.l}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums" }}>
                        {r.v}
                      </span>
                    </div>
                    {!!r.s && (
                      <>
                        <div style={{ fontSize: "12px", color: "#a6a6a0" }}>
                          {r.s}
                        </div>
                      </>
                    )}
                    {!!r.bar && (
                      <>
                        <div
                          style={{
                            height: "4px",
                            borderRadius: "999px",
                            background: "#3d3d39",
                            marginTop: "5px",
                            overflow: "hidden",
                          }}
                        >
                          <b style={r.bar}></b>
                        </div>
                      </>
                    )}
                  </div>
                </React.Fragment>
              ))}
              {!!v.tipFoot && (
                <>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "#a6a6a0",
                      marginTop: "2px",
                    }}
                  >
                    {v.tipFoot}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
