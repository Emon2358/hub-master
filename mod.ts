import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

interface TokenData {
  access_token: string;
  refresh_token: string;
}

// In-memory storage for tokens (use persistent storage in production)
const menbakuData: Record<string, TokenData> = {};

// Request handler
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // If the request is to /update, extract the "code" parameter as access_token.
  // (In a full implementation you would also use a user_id query parameter to store tokens.)
  if (url.pathname === "/update") {
    // Extract the code parameter
    const code = url.searchParams.get("code");
    if (code) {
      // Here you might store the token associated with a user.
      // This example does not include user identification, so it just responds with success.
      return new Response("認証しました！", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } else {
      return new Response("失敗しました。", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }
  // /menbaku.json returns the current token data as valid JSON.
  else if (url.pathname === "/menbaku.json") {
    return new Response(JSON.stringify(menbakuData), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  
  // Default response for other endpoints.
  return new Response("Not Found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

console.log("Deno Deploy server running.");
serve(handler);
