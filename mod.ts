import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

interface TokenData {
  access_token: string;
  refresh_token: string;
}

interface MenbakuData {
  [userId: string]: TokenData;
}

// OAuth2認証後のアクセストークンとリフレッシュトークンをユーザーIDに紐づけて保持するデータ
let menbakuData: MenbakuData = {};

// リクエストハンドラー
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // /update エンドポイント：クエリパラメータ user_id, access_token, refresh_token を受け取り更新する
  if (url.pathname === "/update" && req.method === "GET") {
    const userId = url.searchParams.get("user_id");
    const accessToken = url.searchParams.get("access_token");
    const refreshToken = url.searchParams.get("refresh_token");
    if (!userId || !accessToken || !refreshToken) {
      return new Response(
        JSON.stringify({ error: "Missing user_id, access_token or refresh_token parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    menbakuData[userId] = {
      access_token: accessToken,
      refresh_token: refreshToken
    };
    return new Response(
      JSON.stringify({ message: "Token updated", user_id: userId }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
  // /menbaku.json エンドポイント：現在のトークンデータを返す
  else if (url.pathname === "/menbaku.json") {
    return new Response(JSON.stringify(menbakuData), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  // その他のリクエスト：簡単なインフォメーションページを表示
  else {
    const message = "Deno Deploy OAuth2 Redirect Page.\n" +
      "認証完了後は /update?user_id=...&access_token=...&refresh_token=... を使用してトークンが更新されます。";
    return new Response(message, { status: 200 });
  }
}

console.log("Deno Deploy server running.");
serve(handler);
