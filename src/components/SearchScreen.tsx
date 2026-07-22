import type { Drug, ProductListItem } from "@/lib/types";
import MedBar from "./MedBar";

export default function SearchScreen({
  drugs,
  selectedMeds,
  onToggleMed,
  query,
  onQueryChange,
  items,
  onOpenItem,
}: {
  drugs: Drug[];
  selectedMeds: Set<string>;
  onToggleMed: (id: string) => void;
  query: string;
  onQueryChange: (v: string) => void;
  items: ProductListItem[];
  onOpenItem: (id: string) => void;
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
      </div>

      <MedBar drugs={drugs} selected={selectedMeds} onToggle={onToggleMed} />

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
