import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

interface TokenData {
  access_token: string;
  // 将来的にrefresh_tokenも保存する場合はここに追加可能です。
}

// メモリ上にユーザーIDとTokenDataを保存する。
// 本番環境では永続化ストレージを利用することを推奨します。
const menbakuData: Record<string, TokenData> = {};

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // /update エンドポイント: user_id と code パラメータを受け取り、トークン情報を保存する
  if (url.pathname === "/update") {
    const userId = url.searchParams.get("user_id");
    const code = url.searchParams.get("code"); // この code がアクセストークンとなります
    if (userId && code) {
      menbakuData[userId] = { access_token: code };
      return new Response("認証しました！", {
        status: 200,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    } else {
      return new Response("失敗しました。必要なパラメータが不足しています。", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  } 
  // /menbaku.json エンドポイント: 保存されたトークン情報をJSON形式で返す
  else if (url.pathname === "/menbaku.json") {
    return new Response(JSON.stringify(menbakuData), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } 
  // それ以外のルートは404を返す
  else {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

console.log("Deno Deploy server running.");
serve(handler);
