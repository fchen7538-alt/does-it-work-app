import { NextRequest, NextResponse } from "next/server";
import { listProducts } from "@/lib/data";

export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";
  const meds = (searchParams.get("meds") ?? "").split(",").filter(Boolean);

  const items = listProducts(q, meds);
  return NextResponse.json({ items });
}
