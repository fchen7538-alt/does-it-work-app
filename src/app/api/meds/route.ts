import { NextResponse } from "next/server";
import { listDrugs } from "@/lib/data";

export function GET() {
  return NextResponse.json({ items: listDrugs() });
}
