import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // Handle the /update endpoint, which expects a query parameter "code"
  if (url.pathname === "/update") {
    const code = url.searchParams.get("code");
    if (code) {
      // Here, the code value is considered as the access token.
      // Optionally, you could store the token for later use.
      return new Response("認証に成功しました！", {
        status: 200,
        headers: { "Content-Type": "text/plain" }
      });
    } else {
      return new Response("失敗しました。", {
        status: 400,
        headers: { "Content-Type": "text/plain" }
      });
    }
  }
  // Optionally, provide the menbaku.json endpoint if needed in your application.
  else if (url.pathname === "/menbaku.json") {
    // For this example, we're just returning an empty JSON object.
    const dummyData = {};
    return new Response(JSON.stringify(dummyData), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  // Provide a default response for other endpoints.
  else {
    return new Response(
      "Deno Deploy OAuth2 Redirect Page.\nUse /update?code=... to update token.",
      { status: 200, headers: { "Content-Type": "text/plain" } }
    );
  }
}

console.log("Deno Deploy server running.");
serve(handler);
