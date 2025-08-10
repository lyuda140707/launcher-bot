import express from "express";
import { Telegraf } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;                 // токен бота з BotFather
const SHEETS_WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL; // твій Google Script URL
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "secret-123"; // будь-який рядок
const WEBHOOK_PATH = `/tg/${WEBHOOK_SECRET}`;

if (!BOT_TOKEN || !SHEETS_WEBHOOK_URL) {
  console.error("❌ BOT_TOKEN або SHEETS_WEBHOOK_URL не задані");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

async function saveUser(ctx, allow = true) {
  const u = ctx.from || {};
  const payload = {
    user_id: u.id,
    username: u.username || "",
    first_name: u.first_name || "",
    allow
  };
  try {
    await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("saveUser error:", e);
  }
}

bot.start(async (ctx) => {
  await saveUser(ctx, true);
  await ctx.reply(
    "Привіт! Це лаунчер. Якщо колись зміниться адреса WebApp — я надішлю тобі нове посилання тут у чаті. " +
    "Щоб відписатись — /stop"
  );
});

bot.command("stop", async (ctx) => {
  await saveUser(ctx, false);
  await ctx.reply("Відписка оформлена. Коли схочеш знову — /start");
});

const app = express();
app.use(express.json());

app.get("/", (_, res) => res.send("OK"));

app.post(WEBHOOK_PATH, (req, res) => {
  bot.handleUpdate(req.body, res);
});

const port = process.env.PORT || 3000;
app.listen(port, async () => {
  // Render виставляє RENDER_EXTERNAL_URL під час рантайму
  const base = process.env.RENDER_EXTERNAL_URL || "";
  const hookUrl = `${base}${WEBHOOK_PATH}`;
  try {
    await bot.telegram.setWebhook(hookUrl);
    console.log("✅ Webhook set to:", hookUrl);
  } catch (e) {
    console.error("setWebhook error:", e);
  }
  console.log("Listening on", port);
});
