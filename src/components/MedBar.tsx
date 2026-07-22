"use client";

import { useState } from "react";
import type { Drug } from "@/lib/types";

const COLLAPSED_COUNT = 12;

export default function MedBar({
  drugs,
  selected,
  onToggle,
}: {
  drugs: Drug[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const needsCollapse = drugs.length > COLLAPSED_COUNT;
  // Always show anything already selected, even if it'd otherwise be hidden,
  // so tapping "show less" never silently hides an active choice.
  const visible =
    !needsCollapse || expanded
      ? drugs
      : drugs.filter((d, i) => i < COLLAPSED_COUNT || selected.has(d.id));

  return (
    <div className="medbar">
      <div className="medbar-label">What are you currently taking? (tap all that apply)</div>
      {visible.map((d) => (
        <div
          key={d.id}
          className={`medchip ${selected.has(d.id) ? "on" : ""}`}
          onClick={() => onToggle(d.id)}
        >
          {d.label}
        </div>
      ))}
      {needsCollapse && (
        <div className="medchip" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : `+${drugs.length - visible.length} more`}
        </div>
      )}
    </div>
  );
}
