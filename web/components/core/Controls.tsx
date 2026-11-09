"use client";
import css from "./Controls.module.css";

export function Segmented<T extends string>({
  label,
  caption,
  options,
  value,
  onChange,
}: {
  label: string;
  caption?: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={css.field}>
      {caption && <span className={css.caption}>{caption}</span>}
      <div className={css.segmented} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
