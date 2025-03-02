import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

interface TokenData {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

// グローバル変数として、最新のアクセストークン情報を保存します。
// 本番環境ではデータベース等の永続化ストレージを利用することを推奨します。
let storedToken: TokenData | null = null;

async function exchangeCodeForToken(code: string): Promise<TokenData | null> {
  const client_id = Deno.env.get("DISCORD_CLIENT_ID");
  const client_secret = Deno.env.get("DISCORD_CLIENT_SECRET");
  const redirect_uri = Deno.env.get("REDIRECT_URI");
  if (!client_id || !client_secret || !redirect_uri) {
    console.error("必要な環境変数(DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, REDIRECT_URI)が不足しています");
    return null;
  }

  const params = new URLSearchParams();
  params.append("client_id", client_id);
  params.append("client_secret", client_secret);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", redirect_uri);

  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("トークン交換に失敗しました:", errorText);
    return null;
  }
  const tokenData: TokenData = await response.json();
  return tokenData;
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // /update エンドポイント:
  // 例: https://kjgd-hub-master-89.deno.dev/update?code=認可コード
  if (url.pathname === "/update") {
    const code = url.searchParams.get("code");
    if (code) {
      const tokenData = await exchangeCodeForToken(code);
      if (tokenData && tokenData.access_token) {
        storedToken = tokenData;
        return new Response("認証しました！", {
          status: 200,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      } else {
        return new Response("トークン交換に失敗しました。", {
          status: 400,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    } else {
      return new Response("失敗しました。必要なパラメータが不足しています。", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  }
  // /menbaku.json エンドポイント: 保存されたアクセストークン情報をJSON形式で返す
  else if (url.pathname === "/menbaku.json") {
    return new Response(JSON.stringify({ token: storedToken }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  // それ以外は404を返す
  else {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

console.log("Deno Deploy server running.");
serve(handler);
