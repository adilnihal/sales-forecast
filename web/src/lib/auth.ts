// Single-owner login. APP_PASSWORD turns it on; leave it unset for local use (no login).
// The session is a signed cookie, so no database or user table is needed.
export const COOKIE = "sl_session";
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const authRequired = () => Boolean(process.env.APP_PASSWORD);

const secret = () => process.env.AUTH_SECRET || process.env.APP_PASSWORD || "";

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeSession(): Promise<string> {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return `${exp}.${await sign(exp)}`;
}

export async function validSession(cookie: string | undefined): Promise<boolean> {
  if (!authRequired()) return true;
  if (!cookie) return false;
  const [exp, sig] = cookie.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  const good = await sign(exp);
  if (good.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < good.length; i++) diff |= good.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export async function passwordMatches(input: string): Promise<boolean> {
  const a = await sign("pw:" + input);
  const b = await sign("pw:" + (process.env.APP_PASSWORD ?? ""));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
