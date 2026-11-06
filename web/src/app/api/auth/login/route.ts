import { NextRequest, NextResponse } from "next/server";
import { COOKIE, MAX_AGE, authRequired, makeSession, passwordMatches } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!authRequired()) return NextResponse.json({ ok: true });
  let password = "";
  try {
    password = String((await req.json()).password ?? "");
  } catch {
    /* empty body */
  }
  if (!(await passwordMatches(password))) {
    await new Promise((r) => setTimeout(r, 1000)); // slows down guessing
    return NextResponse.json({ detail: "Wrong password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await makeSession(), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.headers.get("x-forwarded-proto") === "https",
    maxAge: MAX_AGE,
    path: "/",
  });
  return res;
}
