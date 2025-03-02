import { serve } from "https://deno.land/std@0.171.0/http/server.ts";

// グローバル変数として、ユーザーごとではなく固定のアクセストークンを保存します。
// ※ 各リクエストで新たに発行されたアクセストークン（codeパラメータで渡される値）を保存するため、毎回最新のものに上書きされます。
let globalToken: { access_token: string } | null = null;

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // /update エンドポイント:
  // URL例: https://kjgd-hub-master-89.deno.dev/update?code=xxxxxxxxxxxxxxxxxx
  // この場合、code パラメータの値（アクセストークン）が毎回動的に付与されるため、固定のURLの後に動的な値が渡されます。
  if (url.pathname === "/update") {
    const code = url.searchParams.get("code");
    if (code) {
      globalToken = { access_token: code };
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
  // /menbaku.json エンドポイント: 保存されたアクセストークンをJSON形式で返す
  else if (url.pathname === "/menbaku.json") {
    return new Response(JSON.stringify({ fixed: globalToken }), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  // 上記以外のエンドポイントは404を返す
  else {
    return new Response("Not Found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

console.log("Deno Deploy server running.");
serve(handler);
