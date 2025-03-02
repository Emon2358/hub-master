import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

// Open Deno KV for persistent storage (available on Deno Deploy)
const kv = await Deno.openKv();

interface TokenData {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  obtained_at: number; // epoch seconds when the token was obtained
}

// Store the token persistently with key ["token"]
async function storeToken(tokenData: TokenData) {
  await kv.set(["token"], tokenData);
}

// Retrieve the stored token from persistent storage
async function getStoredToken(): Promise<TokenData | null> {
  const result = await kv.get<TokenData>(["token"]);
  return result.value || null;
}

// Exchange an authorization code for an access token via Discord's token endpoint
async function exchangeCodeForToken(code: string): Promise<TokenData | null> {
  const clientId = Deno.env.get("DISCORD_CLIENT_ID");
  const clientSecret = Deno.env.get("DISCORD_CLIENT_SECRET");
  const redirectUri = Deno.env.get("REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    console.error("必要な環境変数(DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, REDIRECT_URI)が不足しています");
    return null;
  }

  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", redirectUri);

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
  try {
    const tokenData: any = await response.json();
    const token: TokenData = {
      token_type: tokenData.token_type,
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token,
      scope: tokenData.scope,
      obtained_at: Date.now() / 1000,
    };
    return token;
  } catch (e) {
    console.error("JSONパース中にエラーが発生しました:", e);
    return null;
  }
}

// Refresh the access token using the refresh token
async function refreshAccessToken(oldToken: TokenData): Promise<TokenData | null> {
  const clientId = Deno.env.get("DISCORD_CLIENT_ID");
  const clientSecret = Deno.env.get("DISCORD_CLIENT_SECRET");
  const redirectUri = Deno.env.get("REDIRECT_URI");
  if (!clientId || !clientSecret || !redirectUri) {
    console.error("必要な環境変数が不足しています");
    return null;
  }

  const params = new URLSearchParams();
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("grant_type", "refresh_token");
  params.append("refresh_token", oldToken.refresh_token);
  params.append("redirect_uri", redirectUri);

  const response = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("アクセストークン更新に失敗しました:", errorText);
    return null;
  }
  try {
    const tokenData: any = await response.json();
    const token: TokenData = {
      token_type: tokenData.token_type,
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token,
      scope: tokenData.scope,
      obtained_at: Date.now() / 1000,
    };
    return token;
  } catch (e) {
    console.error("JSONパース中にエラーが発生しました:", e);
    return null;
  }
}

// Render a rich HTML page
function renderHTML(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bulma/0.9.4/css/bulma.min.css">
</head>
<body>
<section class="section">
  <div class="container">
    <h1 class="title">${title}</h1>
    <div class="content">${content}</div>
  </div>
</section>
</body>
</html>`;
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === "/") {
    // Rich dashboard UI:
    const token = await getStoredToken();
    let tokenInfo = "<p>トークンは保存されていません。</p>";
    if (token) {
      tokenInfo = `<p><strong>Access Token:</strong> ${token.access_token}</p>
      <p><strong>Expires In:</strong> ${token.expires_in} seconds</p>
      <p><strong>Obtained At:</strong> ${new Date(token.obtained_at * 1000).toLocaleString()}</p>
      <p><strong>Refresh Token:</strong> ${token.refresh_token}</p>
      <p><strong>Scope:</strong> ${token.scope}</p>`;
    }
    const content = `
      ${tokenInfo}
      <hr>
      <p><a class="button is-link" href="/auth">OAuth2 認証を開始する</a></p>
      <p><a class="button is-info" href="/refresh">アクセストークンをリフレッシュする</a></p>
      <p><a class="button is-primary" href="/menbaku.json">JSONでトークン情報を確認する</a></p>
    `;
    return new Response(renderHTML("Discord OAuth2 ダッシュボード", content), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } else if (url.pathname === "/auth") {
    // Redirect to Discord OAuth2 authorization
    const clientId = Deno.env.get("DISCORD_CLIENT_ID");
    const redirectUri = Deno.env.get("REDIRECT_URI");
    if (!clientId || !redirectUri) {
      return new Response("環境変数が不足しています", { status: 500 });
    }
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("redirect_uri", redirectUri);
    params.append("response_type", "code");
    params.append("scope", "identify guilds.join"); // required scopes
    const oauthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    return Response.redirect(oauthUrl, 302);
  } else if (url.pathname === "/update") {
    // Endpoint to exchange code for tokens and store them
    const code = url.searchParams.get("code");
    if (code) {
      const tokenData = await exchangeCodeForToken(code);
      if (tokenData && tokenData.access_token) {
        await storeToken(tokenData);
        return new Response(renderHTML("認証完了", `<p>認証に成功しました！アクセストークンを取得しました。</p><p><a class="button is-primary" href="/">ホームに戻る</a></p>`), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } else {
        return new Response(renderHTML("認証エラー", `<p>トークン交換に失敗しました。ログを確認してください。</p><p><a class="button is-warning" href="/">ホームに戻る</a></p>`), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    } else {
      return new Response("必要なパラメーターが不足しています。", { status: 400 });
    }
  } else if (url.pathname === "/refresh") {
    // Refresh the token using the stored refresh token
    const stored = await getStoredToken();
    if (stored) {
      const refreshed = await refreshAccessToken(stored);
      if (refreshed && refreshed.access_token) {
        await storeToken(refreshed);
        return new Response(renderHTML("リフレッシュ完了", `<p>アクセストークンが更新されました！</p><p><a class="button is-primary" href="/">ホームに戻る</a></p>`), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } else {
        return new Response(renderHTML("リフレッシュエラー", `<p>アクセストークンのリフレッシュに失敗しました。ログを確認してください。</p><p><a class="button is-warning" href="/">ホームに戻る</a></p>`), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    } else {
      return new Response(renderHTML("エラー", `<p>保存されたトークンが見つかりません。まずはOAuth2認証を行ってください。</p><p><a class="button is-link" href="/auth">認証を行う</a></p>`), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  } else if (url.pathname === "/menbaku.json") {
    // Return stored token as JSON
    const token = await getStoredToken();
    return new Response(JSON.stringify({ token }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } else {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

console.log("Deno Deploy server running.");
serve(handler);
