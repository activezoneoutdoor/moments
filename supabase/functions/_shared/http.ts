function allowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "https://www2.activezoneoutdoor.cy,http://localhost:3000")
    .split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function isAllowedOrigin(origin: string | null): origin is string {
  return !!origin && allowedOrigins().includes(origin);
}

// Any site may call these functions: access is by upload token or staff session, never cookies.
// Keeping CORS open means a misconfigured origin shows up as a readable error rather than a blocked request.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Handler = (req: Request, body: Record<string, unknown>) => Promise<unknown>;

type Options = {
  /** Staff-only functions return the real error message so staff can fix setup problems; public ones stay generic. */
  exposeErrors?: boolean;
};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  // Supabase query errors are plain objects with a message.
  if (error && typeof error === "object" && "message" in error) return String((error as { message: unknown }).message);
  return String(error);
}

/** Wraps a JSON POST handler with CORS preflight and error handling. */
export function handleJson(handler: Handler, { exposeErrors = false }: Options = {}): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    try {
      const body = await req.json().catch(() => ({}));
      const result = await handler(req, body ?? {});
      if (result instanceof Response) {
        // Non-JSON answers (such as images) still need CORS headers for the browser to read them.
        for (const [key, value] of Object.entries(corsHeaders)) result.headers.set(key, value);
        return result;
      }
      return json(result);
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: exposeErrors ? `Server error: ${errorMessage(error)}` : "Something went wrong. Please try again." }, 500);
    }
  };
}

export function serveJson(handler: Handler, options?: Options) {
  Deno.serve(handleJson(handler, options));
}

export function requireString(body: Record<string, unknown>, key: string, maxLength = 500): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    throw new HttpError(400, `Missing or invalid ${key}.`);
  }
  return value.trim();
}
