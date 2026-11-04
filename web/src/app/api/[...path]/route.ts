import { NextRequest, NextResponse } from "next/server";

// Browser -> /api/v1/... -> this proxy -> FastAPI. The backend URL is read at runtime (API_URL),
// so one built image works for any environment, and the browser never needs CORS.
export const dynamic = "force-dynamic";

const API = (process.env.API_URL ?? "http://localhost:8000").replace(/\/$/, "");
const ALLOWED_ROOTS = new Set(["v1", "health"]);

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!ALLOWED_ROOTS.has(path[0])) {
    return NextResponse.json({ detail: "Not found" }, { status: 404 });
  }
  const url = `${API}/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: { "content-type": req.headers.get("content-type") ?? "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(90_000), // a sleeping free-tier API can take ~1 minute to wake
  };
  if (req.method !== "GET" && req.method !== "HEAD") init.body = await req.text();

  try {
    const upstream = await fetch(url, init);
    const body = upstream.status === 204 ? null : await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return NextResponse.json(
      { detail: "The server is waking up or can't be reached. Wait a minute and try again." },
      { status: 503 },
    );
  }
}

export { handler as GET, handler as POST, handler as PATCH, handler as PUT, handler as DELETE };
