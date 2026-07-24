import { NextRequest, NextResponse } from "next/server";
import { findProductIdByUpc, getProductDetail } from "@/lib/data";

export function GET(req: NextRequest, { params }: { params: { upc: string } }) {
  const { searchParams } = new URL(req.url);
  const meds = (searchParams.get("meds") ?? "").split(",").filter(Boolean);

  const id = findProductIdByUpc(params.upc);
  const product = id ? getProductDetail(id, meds) : null;
  if (!product) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(product);
}
