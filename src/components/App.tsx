"use client";

import { useEffect, useState } from "react";
import type { Drug, ProductDetailView, ProductListItem } from "@/lib/types";
import SearchScreen from "./SearchScreen";
import DetailScreen from "./DetailScreen";
import ScannerModal, { type ScanResult } from "./ScannerModal";

export default function App({ initialDrugs }: { initialDrugs: Drug[] }) {
  const [drugs] = useState<Drug[]>(initialDrugs);
  const [selectedMeds, setSelectedMeds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductListItem[]>([]);

  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetailView | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

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

  async function handleScanResult(result: ScanResult) {
    setScannerOpen(false);

    if (result.type === "text") {
      setScanNotice(null);
      setQuery(result.value);
      return;
    }

    // UPC: try a direct lookup so a good scan skips the list entirely.
    const params = new URLSearchParams();
    if (medsParam) params.set("meds", medsParam);
    const res = await fetch(`/api/products/by-upc/${result.value}?${params}`);
    if (res.ok) {
      const product: ProductDetailView = await res.json();
      setScanNotice(null);
      setDetail(product);
      setOpenId(product.id);
    } else {
      setScanNotice(
        "No product found for that barcode yet — try the \"Scan label text\" mode, or search by name.",
      );
    }
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
    <>
      <SearchScreen
        drugs={drugs}
        selectedMeds={selectedMeds}
        onToggleMed={toggleMed}
        query={query}
        onQueryChange={setQuery}
        items={items}
        onOpenItem={setOpenId}
        onOpenScanner={() => {
          setScanNotice(null);
          setScannerOpen(true);
        }}
        scanNotice={scanNotice}
      />
      {scannerOpen && <ScannerModal onResult={handleScanResult} onClose={() => setScannerOpen(false)} />}
    </>
  );
}
