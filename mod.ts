import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

// Open Deno KV for persistent storage (available on Deno Deploy)
const kv = await Deno.openKv();

interface TokenData {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  obtained_at: number; // epoch seconds when token was obtained
}

// Persistent storage key for the token is ["token"]
async function storeToken(tokenData: TokenData) {
  await kv.set(["token"], tokenData);
}

async function getStoredToken(): Promise<TokenData | null> {
  const result = await kv.get<TokenData>(["token"]);
  return result.value || null;
}

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

// Render a rich HTML page using Bulma CSS
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

async function grantRole(userId: string, roleId: string, guildId: string): Promise<{ success: boolean, error?: string }> {
  const botToken = Deno.env.get("BOT_TOKEN");
  if (!botToken) return { success: false, error: "BOT_TOKEN not set" };
  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bot ${botToken}`,
      "Content-Type": "application/json"
    }
  });
  if (response.ok) {
    return { success: true };
  } else {
    const errText = await response.text();
    return { success: false, error: errText };
  }
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Root: Display dashboard with token info and action buttons
  if (url.pathname === "/") {
    const token = await getStoredToken();
    let tokenInfo = "<p>トークンは保存されていません。</p>";
    if (token) {
      tokenInfo = `<p><strong>Access Token:</strong> ${token.access_token}</p>
      <p><strong>Expires In:</strong> ${token.expires_in} 秒</p>
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
    // Exchange authorization code for tokens and store them
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
    // Refresh token using stored refresh token
    const stored = await getStoredToken();
    if (stored) {
      const refreshed = await refreshAccessToken(stored);
      if (refreshed && refreshed.access_token) {
        await storeToken(refreshed);
        return new Response(renderHTML("リフレッシュ完了", `<p>アクセストークンが更新されました！</p><p><a class="button is-primary" href="/">ホームに戻る</a></p>`), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } else {
        return new Response(renderHTML("リフレッシュエラー", `<p>アクセストークンのリフレッシュに失敗しました。ログをご確認ください。</p><p><a class="button is-warning" href="/">ホームに戻る</a></p>`), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    } else {
      return new Response(renderHTML("エラー", `<p>保存されたトークンが見つかりません。まずはOAuth2認証を行ってください。</p><p><a class="button is-link" href="/auth">認証を行う</a></p>`), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  } else if (url.pathname === "/grant") {
    // Grant role endpoint. Expected query parameters: user_id, role_id.
    const userId = url.searchParams.get("user_id");
    const roleId = url.searchParams.get("role_id");
    // guild_id can be provided optionally; otherwise use env variable DEFAULT_GUILD_ID.
    const guildId = url.searchParams.get("guild_id") || Deno.env.get("DEFAULT_GUILD_ID");
    if (userId && roleId && guildId) {
      const result = await grantRole(userId, roleId, guildId);
      if (result.success) {
        const content = `<p>ロールの付与に成功しました！</p><p><a class="button is-primary" href="/">ホームに戻る</a></p>`;
        return new Response(renderHTML("ロール付与完了", content), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      } else {
        const content = `<p>ロールの付与に失敗しました。</p><p>Error: ${result.error}</p><p><a class="button is-warning" href="/">ホームに戻る</a></p>`;
        return new Response(renderHTML("ロール付与エラー", content), {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }
    } else {
      return new Response("必要なパラメーターが不足しています（user_id, role_id）", { status: 400 });
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
