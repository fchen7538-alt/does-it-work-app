import { NextRequest, NextResponse } from "next/server";
import { getProductDetail } from "@/lib/data";

export function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const meds = (searchParams.get("meds") ?? "").split(",").filter(Boolean);

  const product = getProductDetail(params.id, meds);
  if (!product) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(product);
}
