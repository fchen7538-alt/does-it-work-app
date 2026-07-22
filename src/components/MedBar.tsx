import type { Drug } from "@/lib/types";

export default function MedBar({
  drugs,
  selected,
  onToggle,
}: {
  drugs: Drug[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="medbar">
      <div className="medbar-label">What are you currently taking? (tap all that apply)</div>
      {drugs.map((d) => (
        <div
          key={d.id}
          className={`medchip ${selected.has(d.id) ? "on" : ""}`}
          onClick={() => onToggle(d.id)}
        >
          {d.label}
        </div>
      ))}
    </div>
  );
}
