import { NextRequest, NextResponse } from "next/server";
import { COOKIE, authRequired, validSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    required: authRequired(),
    authed: await validSession(req.cookies.get(COOKIE)?.value),
  });
}
