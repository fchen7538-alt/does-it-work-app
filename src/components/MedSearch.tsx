"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Drug } from "@/lib/types";

const MAX_SUGGESTIONS = 8;

export default function MedSearch({
  drugs,
  selected,
  onToggle,
}: {
  drugs: Drug[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const q = text.trim().toLowerCase();
    if (!q) return [];
    return drugs
      .filter((d) => !selected.has(d.id))
      .filter((d) => d.label.toLowerCase().includes(q) || d.brandNames?.some((b) => b.toLowerCase().includes(q)))
      .slice(0, MAX_SUGGESTIONS);
  }, [text, drugs, selected]);

  useEffect(() => {
    setActiveIndex(0);
  }, [text]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function pick(drug: Drug) {
    onToggle(drug.id);
    setText("");
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = suggestions[activeIndex];
      if (chosen) pick(chosen);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const selectedDrugs = drugs.filter((d) => selected.has(d.id));

  return (
    <div className="medsearch" ref={containerRef}>
      <div className="medsearch-label">What are you currently taking?</div>
      <div className="medsearch-box">
        <input
          placeholder="Search a medication…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="medsearch-dropdown">
          {suggestions.map((d, i) => (
            <div
              key={d.id}
              className={`medsearch-option ${i === activeIndex ? "active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(d);
              }}
              onMouseEnter={() => setActiveIndex(i)}
            >
              {d.label}
            </div>
          ))}
        </div>
      )}
      {selectedDrugs.length > 0 && (
        <div className="medsearch-selected">
          {selectedDrugs.map((d) => (
            <div key={d.id} className="medchip on" onClick={() => onToggle(d.id)}>
              {d.label} <span className="medchip-remove">✕</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
