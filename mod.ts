import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

// Deno Deploy の永続化ストレージ（KV）をオープン
const kv = await Deno.openKv();

// BOT_TOKEN を環境変数から取得
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
if (!BOT_TOKEN) {
  throw new Error("環境変数 BOT_TOKEN が定義されていません。");
}

// DEFAULT_GUILD_ID (設定保存時のキーとして利用)
const DEFAULT_GUILD_ID = Deno.env.get("DEFAULT_GUILD_ID") || "default";

// TokenData インターフェイス
interface TokenData {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  obtained_at: number; // トークン取得時のエポック秒
}

// トークンをKVストレージに保存（キー: ["token"]）
async function storeToken(tokenData: TokenData) {
  await kv.set(["token"], tokenData);
}

// KVストレージからトークンを取得
async function getStoredToken(): Promise<TokenData | null> {
  const result = await kv.get<TokenData>(["token"]);
  return result.value || null;
}

// OAuth2認証コードをアクセストークンに交換
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

// リフレッシュトークンを用いてアクセストークンを更新
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

// 通常用 HTML レンダー関数（ダッシュボード等）
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

// 認証成功時用 HTML（黒基調、クールな背景＆画像付き円、ホームボタン無し）
function renderSuccessHTML(title: string, content: string): string {
  const imageUrl = "https://i.discogs.com/PQ4VvODS7TrSm__vY8YhDKeM0ZgxYeT5gqMpOCqMMsM/rs:fit/g:sm/q:90/h:444/w:450/czM6Ly9kaXNjb2dz/LWRhdGFiYXNlLWlt/YWdlcy9MLTM1NzYx/LTExMTM0MjMwNjEu/anBn.jpeg";
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background: #000;
      color: #fff;
      font-family: "Arial", sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
    }
    .container { text-align: center; }
    .circle {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      background: #444;
      overflow: hidden;
      margin: 0 auto 20px;
      animation: pekeAnimation 2s infinite;
    }
    .circle img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    @keyframes pekeAnimation {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.2); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="circle"><img src="${imageUrl}" alt="Image"></div>
    <h1>${title}</h1>
    <div>${content}</div>
  </div>
</body>
</html>`;
}

/*
  このコードでは、環境変数に設定された DENO_URL を介して、
  リモート側（例：Deno Deploy 側）に用意した設定取得／保存用エンドポイントと通信しています。
  リモート側のエンドポイント（GET /settings?guildId=... と POST /settings）は、
  各自の実装に合わせて用意してください。
*/

// 以下は、KVストレージを用いて設定情報を永続的に保存するためのエンドポイント
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/") {
    // ダッシュボード画面
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
      <p><a class="button is-primary" href="/menbaku.json">JSONでトークン＆設定情報を確認する</a></p>
    `;
    return new Response(renderHTML("Discord OAuth2 ダッシュボード", content), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } else if (url.pathname === "/auth") {
    // Discord OAuth2 認証画面へリダイレクト
    const clientId = Deno.env.get("DISCORD_CLIENT_ID");
    const redirectUri = Deno.env.get("REDIRECT_URI");
    if (!clientId || !redirectUri) {
      return new Response("環境変数が不足しています", { status: 500 });
    }
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("redirect_uri", redirectUri);
    params.append("response_type", "code");
    params.append("scope", "identify guilds.join");
    const oauthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    return Response.redirect(oauthUrl, 302);
  } else if (url.pathname === "/update") {
    // /update エンドポイント：認証コードを受け取りアクセストークンに交換、KVに保存、かつ認証成功時のみ設定のロールを付与
    const code = url.searchParams.get("code");
    if (code) {
      const tokenData = await exchangeCodeForToken(code);
      if (tokenData && tokenData.access_token) {
        await storeToken(tokenData);
        // ユーザー情報を取得
        const userRes = await fetch("https://discord.com/api/v10/users/@me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        let userId: string | null = null;
        if (userRes.ok) {
          const userJson = await userRes.json();
          userId = userJson.id;
        } else {
          console.error("ユーザー情報の取得に失敗しました");
        }
        // KVストレージから設定情報を取得（DEFAULT_GUILD_ID を使用）
        const settingsRes = await kv.get(["settings", DEFAULT_GUILD_ID]);
        const settings = settingsRes.value;
        if (settings && settings.guildid && settings.roleid && userId) {
          const guildId = settings.guildid;
          const roleId = settings.roleid;
          const addRoleUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`;
          const roleRes = await fetch(addRoleUrl, {
            method: "PUT",
            headers: {
              "Authorization": `Bot ${BOT_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          });
          if (!roleRes.ok) {
            console.error("ロールの付与に失敗しました", await roleRes.text());
          }
        }
        return new Response(
          renderSuccessHTML("認証完了", `<p>認証に成功し、ロールが付与されました。</p>`),
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      } else {
        return new Response(
          renderHTML(
            "認証エラー",
            `<p>トークン交換に失敗しました。ログを確認してください。</p><p><a class="button is-warning" href="/">ホームに戻る</a></p>`
          ),
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    } else {
      return new Response("必要なパラメーターが不足しています。", { status: 400 });
    }
  } else if (url.pathname === "/refresh") {
    // 保存されたリフレッシュトークンを用いてアクセストークンを更新
    const stored = await getStoredToken();
    if (stored) {
      const refreshed = await refreshAccessToken(stored);
      if (refreshed && refreshed.access_token) {
        await storeToken(refreshed);
        return new Response(
          renderHTML(
            "リフレッシュ完了",
            `<p>アクセストークンが更新されました！</p><p><a class="button is-primary" href="/">ホームに戻る</a></p>`
          ),
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      } else {
        return new Response(
          renderHTML(
            "リフレッシュエラー",
            `<p>アクセストークンのリフレッシュに失敗しました。ログを確認してください。</p><p><a class="button is-warning" href="/">ホームに戻る</a></p>`
          ),
          { headers: { "Content-Type": "text/html; charset=utf-8" } }
        );
      }
    } else {
      return new Response(
        renderHTML(
          "エラー",
          `<p>保存されたトークンが見つかりません。まずはOAuth2認証を行ってください。</p><p><a class="button is-link" href="/auth">認証を行う</a></p>`
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } }
      );
    }
  } else if (url.pathname === "/menbaku.json") {
    // /menbaku.json では、保存されたトークンとKV上の設定情報をJSONで返す
    const token = await getStoredToken();
    const settingsRes = await kv.get(["settings", DEFAULT_GUILD_ID]);
    const settings = settingsRes.value || {};
    return new Response(JSON.stringify({ token, settings }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } else if (url.pathname === "/settings") {
    // GET /settings?guildId=... と POST /settings のエンドポイント
    if (req.method === "GET") {
      const guildId = url.searchParams.get("guildId");
      if (!guildId) {
        return new Response(JSON.stringify({ error: "guildId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
      const result = await kv.get(["settings", guildId]);
      return new Response(JSON.stringify({ settings: result.value || {} }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    } else if (req.method === "POST") {
      try {
        const body = await req.json();
        const guildId = body.guildId;
        if (!guildId) {
          return new Response(JSON.stringify({ error: "guildId is required in JSON body" }), {
            status: 400,
            headers: { "Content-Type": "application/json; charset=utf-8" },
          });
        }
        const { guildId: _, ...settings } = body;
        await kv.set(["settings", guildId], settings);
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      } catch (error) {
        console.error("Error processing POST /settings", error);
        return new Response(JSON.stringify({ error: "Failed to save settings" }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  } else {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

console.log("Deno Deploy server running.");
serve(handler);
