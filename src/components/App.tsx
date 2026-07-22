"use client";

import { useEffect, useState } from "react";
import type { Drug, ProductDetailView, ProductListItem } from "@/lib/types";
import SearchScreen from "./SearchScreen";
import DetailScreen from "./DetailScreen";

export default function App({ initialDrugs }: { initialDrugs: Drug[] }) {
  const [drugs] = useState<Drug[]>(initialDrugs);
  const [selectedMeds, setSelectedMeds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductListItem[]>([]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const medsParam = [...selectedMeds].join(",");

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (medsParam) params.set("meds", medsParam);

    fetch(`/api/products?${params}`)
      .then((res) => res.json())
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, [query, medsParam]);

  useEffect(() => {
    if (!openId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    const params = new URLSearchParams();
    if (medsParam) params.set("meds", medsParam);

    fetch(`/api/products/${openId}?${params}`)
      .then((res) => res.json())
      .then((data) => setDetail(data))
      .finally(() => setDetailLoading(false));
  }, [openId, medsParam]);

  function toggleMed(id: string) {
    setSelectedMeds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (openId) {
    if (detailLoading || !detail) {
      return (
        <>
          <button className="back" onClick={() => setOpenId(null)}>
            ‹ Back to search
          </button>
          <div className="loading">Loading…</div>
        </>
      );
    }
    return <DetailScreen product={detail} onBack={() => setOpenId(null)} />;
  }

  return (
    <SearchScreen
      drugs={drugs}
      selectedMeds={selectedMeds}
      onToggleMed={toggleMed}
      query={query}
      onQueryChange={setQuery}
      items={items}
      onOpenItem={setOpenId}
    />
  );
}
