import type { Drug, ProductListItem } from "@/lib/types";
import MedSearch from "./MedSearch";

export default function SearchScreen({
  drugs,
  selectedMeds,
  onToggleMed,
  query,
  onQueryChange,
  items,
  onOpenItem,
  onOpenScanner,
  scanNotice,
}: {
  drugs: Drug[];
  selectedMeds: Set<string>;
  onToggleMed: (id: string) => void;
  query: string;
  onQueryChange: (v: string) => void;
  items: ProductListItem[];
  onOpenItem: (id: string) => void;
  onOpenScanner: () => void;
  scanNotice: string | null;
}) {
  return (
    <>
      <h1 className="appname">Does It Work?</h1>
      <p className="tagline">Plain-language info on supplements and OTC products, based on public research</p>

      <div className="search-box">
        <input
          placeholder="Search a supplement or OTC product"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
        />
        <div className="scan-button" onClick={onOpenScanner} role="button" aria-label="Scan a barcode or label">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3M4 12h16"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {scanNotice && <div className="note-strip">{scanNotice}</div>}

      <MedSearch drugs={drugs} selected={selectedMeds} onToggle={onToggleMed} />

      {items.length ? (
        items.map((item) => (
          <div className="item-row" key={item.id} onClick={() => onOpenItem(item.id)}>
            <div className="item-thumb">{item.initials}</div>
            <div>
              <div className="item-name">{item.name}</div>
              <div className="item-sub">{item.brand}</div>
            </div>
            {item.matchingInteractionCount > 0 && (
              <div className="item-flag">{item.matchingInteractionCount} to know about</div>
            )}
          </div>
        ))
      ) : (
        <div className="empty">
          No matches yet. Try &quot;turmeric,&quot; &quot;fish oil,&quot; &quot;melatonin,&quot; &quot;magnesium,&quot; &quot;ashwagandha,&quot; or &quot;vitamin d.&quot;
        </div>
      )}
    </>
  );
}
