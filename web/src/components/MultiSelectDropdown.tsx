import { useEffect, useRef, useState } from "react";

interface Option {
  value: string;
  label: string;
}

// A native <select multiple> doesn't behave like a dropdown at all — most browsers render
// it as a permanently-expanded, several-rows-tall listbox, which looks broken next to the
// single-line filters around it. This is a small popover instead: a closed button showing
// a summary, opening a checkbox list on click.
export default function MultiSelectDropdown({
  options,
  selected,
  onChange,
  placeholder,
  selectedPrefix,
  disabled
}: {
  options: Option[];
  selected: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  selectedPrefix?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  function toggleValue(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }

  const summary =
    selected.length === 0
      ? placeholder
      : `${selectedPrefix ? `${selectedPrefix}: ` : ""}${selected
          .map((v) => options.find((o) => o.value === v)?.label || v)
          .join(", ")}`;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        style={{
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          fontFamily: "inherit",
          fontSize: 15,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.6 : 1,
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        }}
      >
        {summary}
      </button>
      {open && !disabled && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: 8,
            zIndex: 20,
            minWidth: 180,
            boxShadow: "0 4px 16px rgba(0,0,0,0.2)"
          }}
        >
          {options.map((o) => (
            <label
              key={o.value}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontWeight: 400, cursor: "pointer" }}
            >
              <input type="checkbox" checked={selected.includes(o.value)} onChange={() => toggleValue(o.value)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
