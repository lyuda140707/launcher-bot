// server.js
import express from "express";
import { Telegraf } from "telegraf";
import fetch from "node-fetch";

const {
  BOT_TOKEN,
  SHEETS_WEBHOOK_URL,
  WEBHOOK_SECRET = "secret-123",
  PORT = 3000,
  RENDER_EXTERNAL_URL = "",
  API_KEY,                      // 👈 ДОДАЙ у Render (той самий, що в Apps Script)
  ADMINS = "7963871119"         // 👈 твій Telegram ID (можна кілька через кому)
} = process.env;

if (!BOT_TOKEN || !SHEETS_WEBHOOK_URL) {
  console.error("❌ BOT_TOKEN або SHEETS_WEBHOOK_URL не задані");
  process.exit(1);
}

const WEBHOOK_PATH = `/tg/${WEBHOOK_SECRET}`;
const ADMIN_IDS = ADMINS.split(",").map(s => Number(s.trim())).filter(Boolean);

const app = express();
app.use(express.json());

const bot = new Telegraf(BOT_TOKEN);

// ---- helpers ----
async function saveUser(ctx, allow = true) {
  const u = ctx.from || {};
  const payload = {
    action: allow ? "subscribe" : "unsubscribe",
    user_id: u.id,
    username: u.username || "",
    first_name: u.first_name || "",
    allow
  };
  try {
    const r = await fetch(SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));
    console.log("Sheets response:", j);
  } catch (e) { console.error("saveUser error:", e); }
}

async function getAllowedUserIds() {
  const url = `${SHEETS_WEBHOOK_URL}?action=list&key=${encodeURIComponent(API_KEY)}`;
  const r = await fetch(url);
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "list failed");
  return j.users || [];
}

async function broadcast(text) {
  const ids = await getAllowedUserIds();
  let ok = 0, fail = 0;
  for (const id of ids) {
    try {
      await bot.telegram.sendMessage(id, text, { disable_web_page_preview: true });
      ok++;
      await new Promise(res => setTimeout(res, 35)); // легкий тротлінг
    } catch {
      fail++;
    }
  }
  return { total: ids.length, ok, fail };
}

// ---- commands ----
bot.start(async (ctx) => {
  await saveUser(ctx, true);
  await ctx.reply(
    "Привіт! Це лаунчер-бот. Якщо колись зміниться адреса WebApp — я надішлю нове посилання у цей чат."
  );
});




// тільки для адміну: /broadcast ТЕКСТ
bot.command("broadcast", async (ctx) => {
  if (!ADMIN_IDS.includes(ctx.from.id)) return; // тихо ігноруємо не-адмінів
  const text = ctx.message.text.replace(/^\/broadcast(@\w+)?\s*/,'').trim();
  if (!text) return ctx.reply("Напиши текст після команди: /broadcast Нове посилання ...");
  try {
    const res = await broadcast(text);
    await ctx.reply(`Готово: надіслано ${res.ok} із ${res.total}. Помилок: ${res.fail}`);
  } catch (e) {
    await ctx.reply("Помилка розсилки: " + String(e));
  }
});

// ---- http & webhook ----
app.get("/", (_, res) => res.send("OK"));
app.get("/healthz", (_, res) => res.json({ ok: true }));

app.use(bot.webhookCallback(WEBHOOK_PATH));

app.listen(PORT, async () => {
  const hookUrl = `${RENDER_EXTERNAL_URL || ""}${WEBHOOK_PATH}`;
  try {
    await bot.telegram.setWebhook(hookUrl);
    console.log("✅ Webhook set to:", hookUrl);
  } catch (e) { console.error("setWebhook error:", e); }
  console.log("Listening on", PORT);
});
async function broadcast(text) {
  const ids = await getAllowedUserIds();
  let ok = 0, fail = 0;

  for (const id of ids) {
    try {
      await bot.telegram.sendMessage(id, text, { disable_web_page_preview: true });
      ok++;
      await new Promise(res => setTimeout(res, 35));
    } catch (e) {
      fail++;
      // якщо юзер заблокував або акаунт видалений — помічаємо allow=false
      const msg = String(e?.description || e?.message || "");
      const code = e?.response?.error_code;
      if (code === 403 || /blocked by the user|user is deactivated/i.test(msg)) {
        try {
          await fetch(SHEETS_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "unsubscribe", user_id: id })
          });
        } catch {}
      }
    }
  }
  return { total: ids.length, ok, fail };
}

