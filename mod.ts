import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

// Deno KV を利用して永続化ストレージを使用
const kv = await Deno.openKv();

interface TokenData {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  obtained_at: number; // トークン取得時の epoch 秒
}

// ユーザーごとにトークンを保存（キー: ["token", userId]）
async function storeToken(userId: string, tokenData: TokenData) {
  await kv.set(["token", userId], tokenData);
}

// 指定されたユーザーのトークンを取得する関数
async function getToken(userId: string): Promise<TokenData | null> {
  const result = await kv.get<TokenData>(["token", userId]);
  return result.value || null;
}

// OAuth2認可コードからアクセストークンに交換する関数
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

// HTML を Bulma を利用して生成するヘルパー関数
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

  // ルート: 認証ボードを全員が閲覧できる形で表示
  if (url.pathname === "/") {
    const authImage = Deno.env.get("AUTH_BOARD_IMAGE_URL");
    const imageHTML = authImage ? `<figure class="image"><img src="${authImage}" alt="認証画像"></figure>` : "";
    const content = `
      ${imageHTML}
      <p>以下のボタンを押してDiscord認証を開始してください。</p>
      <p><a class="button is-link" href="/auth">認証を開始する</a></p>
    `;
    return new Response(renderHTML("Discord 認証ボード", content), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } 
  // /auth: DiscordのOAuth2認証画面へリダイレクト
  else if (url.pathname === "/auth") {
    const clientId = Deno.env.get("DISCORD_CLIENT_ID");
    const redirectUri = Deno.env.get("REDIRECT_URI");
    if (!clientId || !redirectUri) {
      return new Response("必要な環境変数が不足しています。", { status: 500 });
    }
    const params = new URLSearchParams();
    params.append("client_id", clientId);
    params.append("redirect_uri", redirectUri);
    params.append("response_type", "code");
    params.append("scope", "identify guilds.join");
    const oauthUrl = `https://discord.com/api/oauth2/authorize?${params.toString()}`;
    return Response.redirect(oauthUrl, 302);
  } 
  // /update: OAuth2認証完了後、認可コードからトークン交換を行い、ユーザーをサーバーに参加＋ロール付与する
  else if (url.pathname === "/update") {
    const code = url.searchParams.get("code");
    if (code) {
      const tokenData = await exchangeCodeForToken(code);
      if (tokenData && tokenData.access_token) {
        // アクセストークンからユーザーIDを取得する
        const userRes = await fetch("https://discord.com/api/v10/users/@me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (!userRes.ok) {
          const errText = await userRes.text();
          return new Response(renderHTML("認証エラー", `<p>ユーザー情報の取得に失敗しました。エラー: ${errText}</p><p><a class="button is-warning" href="/">ホームに戻る</a></p>`), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        const userInfo = await userRes.json();
        const userId = userInfo.id;
        // ユーザーを対象サーバーに参加させ、環境変数 AUTH_ROLE_ID が設定されていればロールを付与する
        const BOT_TOKEN = Deno.env.get("BOT_TOKEN");
        const guildId = Deno.env.get("DEFAULT_GUILD_ID");
        const authRoleId = Deno.env.get("AUTH_ROLE_ID"); // 任意
        const joinUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`;
        const payload = { access_token: tokenData.access_token };
        const joinRes = await fetch(joinUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bot ${BOT_TOKEN}`,
          },
          body: JSON.stringify(payload),
        });
        if (!joinRes.ok) {
          const joinErr = await joinRes.text();
          return new Response(renderHTML("認証エラー", `<p>サーバーへの参加に失敗しました。エラー: ${joinErr}</p><p><a class="button is-warning" href="/">ホームに戻る</a></p>`), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
        // AUTH_ROLE_ID が設定されていればロール付与を実施
        if (authRoleId) {
          const roleUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${authRoleId}`;
          const roleRes = await fetch(roleUrl, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bot ${BOT_TOKEN}`,
            },
          });
          if (!roleRes.ok) {
            const roleErr = await roleRes.text();
            return new Response(renderHTML("認証結果", `<p>サーバーへの参加は成功しましたが、ロールの付与に失敗しました。エラー: ${roleErr}</p><p><a class="button is-warning" href="/">ホームに戻る</a></p>`), {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }
        }
        // ユーザーごとにトークンを永続化
        await storeToken(userId, tokenData);
        return new Response(renderHTML("認証結果", `<p>認証に成功しました！サーバーに追加され、ロールが付与されました。</p><p><a class="button is-primary" href="/">ホームに戻る</a></p>`), {
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
  } 
  // /token: クエリパラメータ user_id に対応するトークン情報をJSONで返す
  else if (url.pathname === "/token") {
    const userId = url.searchParams.get("user_id");
    if (!userId) {
      return new Response("user_idパラメーターが必要です。", { status: 400 });
    }
    const token = await getToken(userId);
    return new Response(JSON.stringify({ token }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } 
  else {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

console.log("Deno Deploy server running.");
serve(handler);
