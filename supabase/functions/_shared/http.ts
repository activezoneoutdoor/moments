const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://studio.activezoneoutdoor.cy,http://localhost:3000")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

export function isAllowedOrigin(origin: string | null): origin is string {
  return !!origin && allowedOrigins.includes(origin);
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": isAllowedOrigin(origin) ? origin : allowedOrigins[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/** Wraps a JSON POST handler with CORS preflight and error handling. */
export function serveJson(handler: (req: Request, body: Record<string, unknown>) => Promise<unknown>) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

    try {
      const body = await req.json().catch(() => ({}));
      return json(req, await handler(req, body ?? {}));
    } catch (error) {
      if (error instanceof HttpError) return json(req, { error: error.message }, error.status);
      console.error(error);
      return json(req, { error: "Something went wrong. Please try again." }, 500);
    }
  });
}

export function requireString(body: Record<string, unknown>, key: string, maxLength = 500): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new HttpError(400, `Missing or invalid ${key}.`);
  }
  return value.trim();
}
