import type { NextRequest } from "next/server";

/**
 * An anonymous visitor id kept in a cookie. Wetin has no accounts; the id exists only so the gateway can give
 * each visitor their own daily budget (Otari end users) and one person cannot use up everyone's free questions.
 */
export type Visitor = { id: string; isNew: boolean };

const COOKIE = "wetin_uid";

export function visitorId(req: NextRequest): Visitor {
  const v = req.cookies.get(COOKIE)?.value;
  if (v && /^v_[a-f0-9]{24}$/.test(v)) return { id: v, isNew: false };
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return { id: "v_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(""), isNew: true };
}

export function withVisitorCookie(res: Response, v: Visitor): Response {
  if (v.isNew) res.headers.append("set-cookie", `${COOKIE}=${v.id}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly; Secure`);
  return res;
}
