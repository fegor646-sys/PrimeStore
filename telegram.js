const crypto = require("crypto");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_IDS = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// В деве initData из браузера нет — DEV_USER_ID позволяет открыть Mini App
// прямо в браузере. На проде переменную не задаём, и работает только Telegram.
const DEV_USER_ID = process.env.DEV_USER_ID || "";

/**
 * Проверяет initData от Telegram.WebApp. Это единственный надёжный способ
 * узнать, что запрос действительно от заявленного пользователя — telegramId
 * из тела запроса доверять нельзя.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
function verifyInitData(initData) {
  if (DEV_USER_ID && (!initData || initData === "dev")) {
    return { id: DEV_USER_ID, first_name: "Dev", username: "dev" };
  }
  if (!initData || typeof initData !== "string") return null;
  if (!BOT_TOKEN) {
    console.warn("BOT_TOKEN не задан — проверить initData невозможно");
    return null;
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  if (computed !== hash) return null;

  try {
    const user = JSON.parse(params.get("user"));
    return user && user.id ? user : null;
  } catch (e) {
    return null;
  }
}

function isAdmin(telegramId) {
  return ADMIN_IDS.includes(String(telegramId));
}

function escapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendMessage(chatId, text) {
  if (!BOT_TOKEN) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
    if (!res.ok) console.error("sendMessage failed:", res.status, await res.text());
  } catch (err) {
    console.error("sendMessage error:", err);
  }
}

function notifyAdmins(text) {
  // Відправка повідомлень адмінам/у канали вимкнена на прохання власника проєкту.
  return Promise.resolve();
}

function userLine(tgUser, dbUser) {
  const name = [tgUser?.first_name, tgUser?.last_name].filter(Boolean).join(" ") || dbUser?.firstName || "Гравець";
  const uname = tgUser?.username ? `@${tgUser.username}` : "без юзернейму";
  return (
    `Гравець: <b>${escapeHtml(name)}</b> (${escapeHtml(uname)})\n` +
    `Telegram ID: <code>${escapeHtml(tgUser?.id || dbUser?.id)}</code>` +
    (dbUser?.playerId ? `\nID у клубі: <code>${escapeHtml(dbUser.playerId)}</code>` : "")
  );
}

function notifyNewOrder(tgUser, dbUser, order) {
  return notifyAdmins(
    `🛒 <b>Нове замовлення #${order.id}</b>\n${userLine(tgUser, dbUser)}\n` +
      `Товар: <b>${escapeHtml(order.itemTitle)}</b>\nСписано: <b>${order.price} PC</b>`
  );
}

function notifyNewCoinRequest(tgUser, dbUser, request) {
  return notifyAdmins(
    `💳 <b>Заявка на купівлю Prime Coin #${request.id}</b>\n${userLine(tgUser, dbUser)}\n` +
      `Сума: <b>${request.amount} PC</b> (${request.payAmount} грн)`
  );
}

function notifyNewAchievement(tgUser, dbUser, achievement, categoryTitle) {
  return notifyAdmins(
    `🏆 <b>Заявка на досягнення #${achievement.id}</b>\n${userLine(tgUser, dbUser)}\n` +
      `Категорія: <b>${escapeHtml(categoryTitle)}</b>` +
      (achievement.comment ? `\nКоментар: ${escapeHtml(achievement.comment)}` : "") +
      `\n\nПеревірити в адмін-панелі.`
  );
}

function notifyUser(telegramId, text) {
  return sendMessage(telegramId, text);
}

module.exports = {
  ADMIN_IDS,
  BOT_TOKEN,
  verifyInitData,
  isAdmin,
  notifyAdmins,
  notifyNewOrder,
  notifyNewCoinRequest,
  notifyNewAchievement,
  notifyUser,
  escapeHtml,
};
