// server.js
import express from "express";
import { Telegraf } from "telegraf";
import fetch from "node-fetch"; // якщо в тебе Node 18+ і є глобальний fetch — можеш видалити цей імпорт і залежність

// 🔧 Змінні середовища (задати на Render у Settings → Environment)
const {
  BOT_TOKEN,               // токен з BotFather
  SHEETS_WEBHOOK_URL,      // URL твого Apps Script (/exec)
  WEBHOOK_SECRET = "secret-123", // будь-який рядок для шляху вебхука
  PORT = 3000,
  RENDER_EXTERNAL_URL = "", // Render сам підставить під час рантайму
} = process.env;

if (!BOT_TOKEN || !SHEETS_WEBHOOK_URL) {
  console.error("❌ BOT_TOKEN або SHEETS_WEBHOOK_URL не задані");
  process.exit(1);
}

const WEBHOOK_PATH = `/tg/${WEBHOOK_SECRET}`;

const app = express();
app.use(express.json());

// 🤖 Telegraf
const bot = new Telegraf(BOT_TOKEN);

// === Helpers ===
async function saveUser(ctx, allow = true) {
  const u = ctx.from || {};
  const payload = {
    action: allow ? "subscribe" : "unsubscribe", // 👈 це важливо для Apps Script
    user_id: u.id,
    username: u.username || "",
    first_name: u.first_name || "",
    allow,
  };

  try {
    const res = await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));
    console.log("Sheets response:", json);
  } catch (e) {
    console.error("saveUser error:", e);
  }
}

// === Команди бота ===
bot.start(async (ctx) => {
  await saveUser(ctx, true);
  await ctx.reply(
    "Привіт! Це лаунчер-бот. Якщо колись зміниться адреса твого WebApp — я надішлю нове посилання у цей чат.\n\n" +
    "Щоб відписатися — /stop"
  );
});

bot.command("stop", async (ctx) => {
  await saveUser(ctx, false);
  await ctx.reply("Відписала. Щоб знову підписатися — /start");
});

// === HTTP-роути ===
app.get("/", (_, res) => res.send("OK"));
app.get("/healthz", (_, res) => res.json({ ok: true }));

// === Webhook для Telegram ===
app.use(bot.webhookCallback(WEBHOOK_PATH));

// === Запуск сервера і виставлення вебхука ===
app.listen(PORT, async () => {
  const hookUrl = `${RENDER_EXTERNAL_URL || ""}${WEBHOOK_PATH}`;
  try {
    await bot.telegram.setWebhook(hookUrl);
    console.log("✅ Webhook set to:", hookUrl);
  } catch (e) {
    console.error("setWebhook error:", e);
  }
  console.log("Listening on", PORT);
});
