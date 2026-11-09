"use client";
import type { ButtonHTMLAttributes } from "react";
import css from "./IconButton.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  icon: "document" | "spreadsheet" | "arrow" | "close";
  size?: 40 | 44 | 56;
};
export function IconButton({
  label,
  icon,
  size = 44,
  className = "",
  ...props
}: Props) {
  return (
    <button
      {...props}
      type="button"
      aria-label={label}
      title={label}
      data-icon-button={size}
      className={`${css.button} ${className}`}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {icon === "document" && (
          <>
            <path d="M6 3h8l4 4v14H6z" />
            <path d="M14 3v5h4M9 12h6M9 16h6" />
          </>
        )}
        {icon === "spreadsheet" && (
          <>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
          </>
        )}
        {icon === "arrow" && <path d="M4 12h16M13 5l7 7-7 7" />}
        {icon === "close" && <path d="m6 6 12 12M18 6 6 18" />}
      </svg>
    </button>
  );
}
