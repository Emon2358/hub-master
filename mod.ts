import {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  REST,
  Routes,
} from "discord.js";
import fetch from "node-fetch";
import "dotenv/config";

const BOT_TOKEN = process.env.BOT_TOKEN;
const DEFAULT_GUILD_ID = process.env.DEFAULT_GUILD_ID;
const DENO_URL = process.env.DENO_URL.replace(/\/$/, ""); // 末尾のスラッシュ削除
const OAUTH_URL = process.env.OAUTH_URL; // OAuth2認証画面へのURL

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

// アプリケーションコマンド（スラッシュコマンド）の定義
const commands = [
  {
    name: "menbaku",
    description: "保存されたトークン情報を利用して自動参加を行います",
  },
  {
    name: "verfly",
    description: "Discord認証ボードを表示します",
  },
  {
    name: "refresh",
    description: "アクセストークンをリフレッシュします",
  },
];

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  try {
    console.log("アプリケーションコマンドを登録中...");
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("アプリケーションコマンドの登録に成功しました。");
  } catch (error) {
    console.error("アプリケーションコマンド登録エラー:", error);
  }
});

// /menbaku コマンドでは、実行ユーザーのIDに対応するトークンを /token エンドポイントから取得し、
// そのトークンを利用してDiscord API の Add Guild Member エンドポイントにアクセスします。
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === "menbaku") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const userId = interaction.user.id;
      // /token エンドポイントから実行ユーザーのトークン情報を取得
      const res = await fetch(`${DENO_URL}/token?user_id=${userId}`);
      const data = await res.json();
      const tokenData = data.token;
      if (!tokenData || !tokenData.access_token) {
        await interaction.editReply("あなたのアクセストークンが見つかりません。まずは認証を行ってください。");
        return;
      }
      // トークンを利用してユーザー情報を取得
      const userRes = await fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (!userRes.ok) {
        const errText = await userRes.text();
        await interaction.editReply(`アクセストークンからユーザー情報を取得できませんでした。\nエラー: ${errText}`);
        return;
      }
      const userInfo = await userRes.json();
      const guildId = interaction.guildId || DEFAULT_GUILD_ID;
      const addMemberUrl = `https://discord.com/api/v10/guilds/${guildId}/members/${userInfo.id}`;
      const payload = { access_token: tokenData.access_token };
      const addRes = await fetch(addMemberUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bot ${BOT_TOKEN}`,
        },
        body: JSON.stringify(payload),
      });
      if (addRes.ok) {
        await interaction.editReply("自動参加に成功しました！");
      } else {
        const addErr = await addRes.text();
        await interaction.editReply(`自動参加に失敗しました。\nエラー: ${addErr}`);
      }
    } catch (err) {
      console.error(err);
      await interaction.editReply("エラーが発生しました。管理者に連絡してください。");
    }
  } else if (interaction.commandName === "verfly") {
    const embed = new EmbedBuilder()
      .setTitle("Discord 認証ボード")
      .setDescription("以下のボタンを押してDiscord認証を開始してください。\n認証後、自動的にサーバー参加とロール付与が行われます。")
      .setColor(0x7289da);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel("認証を開始する")
        .setStyle(ButtonStyle.Link)
        .setURL(OAUTH_URL)
    );
    await interaction.reply({ embeds: [embed], components: [row] });
  } else if (interaction.commandName === "refresh") {
    await interaction.deferReply({ ephemeral: true });
    try {
      const res = await fetch(`${DENO_URL}/refresh`);
      await res.text();
      await interaction.editReply("アクセストークンが更新されました！");
    } catch (err) {
      console.error(err);
      await interaction.editReply("アクセストークン更新中にエラーが発生しました。");
    }
  }
});

client.login(BOT_TOKEN);
