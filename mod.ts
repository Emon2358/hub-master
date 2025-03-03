import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

// Deno Deploy の永続化ストレージ（KV）をオープン
const kv = await Deno.openKv();

// BOT_TOKEN を環境変数から取得
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
if (!BOT_TOKEN) {
  throw new Error("環境変数 BOT_TOKEN が定義されていません。");
}

interface TokenData {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  obtained_at: number; // トークン取得時のエポック秒
}

// アクセストークンを永続化ストレージに保存（キー: ["token"]）
async function storeToken(tokenData: TokenData) {
  await kv.set(["token"], tokenData);
}

// 永続化ストレージからアクセストークンを取得
async function getStoredToken(): Promise<TokenData | null> {
  const result = await kv.get<TokenData>(["token"]);
  return result.value || null;
}

// OAuth2 認証コードをアクセストークンに交換する
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

// リフレッシュトークンを用いてアクセストークンを更新する
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

// 認証成功時用の HTML レンダー関数（黒基調、クールな背景＆ペケアニメーション、ホームボタン無し）
function renderSuccessHTML(title: string, content: string): string {
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
    .container {
      text-align: center;
    }
    .circle {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      background: #444;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      margin: 0 auto 20px auto;
      animation: pekeAnimation 2s infinite;
    }
    @keyframes pekeAnimation {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.2); }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="circle">ペケ</div>
    <h1>${title}</h1>
    <div>${content}</div>
  </div>
</body>
</html>`;
}

// setting.json を読み込む（Deno Deploy でもバンドルファイルとして利用可能な前提）
async function loadSettings(): Promise<any | null> {
  try {
    const data = await Deno.readTextFile("setting.json");
    return JSON.parse(data);
  } catch (err) {
    console.error("設定の読み込みに失敗しました:", err);
    return null;
  }
}

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
    params.append("scope", "identify guilds.join"); // 必要なスコープ
    const oauthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    return Response.redirect(oauthUrl, 302);
  } else if (url.pathname === "/update") {
    // /update エンドポイント：認証コードを受け取りアクセストークンに交換、KV に保存、かつ認証成功時のみ設定のロールを付与する
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
        // setting.json の情報を読み込み、ロール付与を実施（ユーザー情報が取得できた場合のみ）
        const settings = await loadSettings();
        if (settings && settings.guildid && settings.roleid && userId) {
          const guildId = settings.guildid;
          const roleId = settings.roleid;
          const addRoleUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`;
          const roleRes = await fetch(addRoleUrl, {
            method: "PUT",
            headers: {
              "Authorization": `Bot ${BOT_TOKEN}`
            },
          });
          if (!roleRes.ok) {
            console.error("ロールの付与に失敗しました", await roleRes.text());
          }
        }
        // 認証成功ページ（ホームに戻るボタンはなし）
        return new Response(
          renderSuccessHTML("認証完了", `<p>認証に成功しました！ロールが付与されました。</p>`),
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
    // /menbaku.json では、保存されたアクセストークンと setting.json の情報を JSON として返す
    const token = await getStoredToken();
    const settings = await loadSettings();
    return new Response(JSON.stringify({ token, settings }), {
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
