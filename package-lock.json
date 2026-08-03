require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const db = require("./db");
const { ACHIEVEMENT_CATEGORIES } = require("./rewards");
const tg = require("./telegram");

const app = express();
app.use(cors());
// Скриншоты достижений приходят как base64 внутри JSON, поэтому лимит выше дефолтного.
app.use(express.json({ limit: "8mb" }));

/* ------------------------------------------------------------------ */
/* Аутентификация                                                      */
/* ------------------------------------------------------------------ */
function auth(req, res, next) {
  const initData = (req.body && req.body.initData) || req.query.initData;
  const tgUser = tg.verifyInitData(initData);
  if (!tgUser) return res.status(401).json({ success: false, error: "invalid_init_data" });
  req.tgUser = tgUser;
  next();
}

function requireAdmin(req, res, next) {
  auth(req, res, () => {
    if (!tg.isAdmin(req.tgUser.id)) return res.status(403).json({ success: false, error: "not_admin" });
    next();
  });
}

/* ------------------------------------------------------------------ */
/* API игрока                                                          */
/* ------------------------------------------------------------------ */
app.post("/api/auth", auth, (req, res) => {
  db.touchUser(req.tgUser.id, {
    username: req.tgUser.username || null,
    firstName: req.tgUser.first_name || null,
  });
  res.json({
    success: true,
    profile: db.getProfile(req.tgUser.id),
    isAdmin: tg.isAdmin(req.tgUser.id),
    settings: db.getSettings(),
    categories: ACHIEVEMENT_CATEGORIES,
  });
});

// Один запрос отдаёт всё, что нужно главному экрану — меньше round-trip'ов
// на мобильном интернете.
app.get("/api/state", auth, (req, res) => {
  res.json({
    success: true,
    profile: db.getProfile(req.tgUser.id),
    items: db.getShopItems({ onlyActive: true }),
    earn: db.getEarnGroups(),
    orders: db.getUserOrders(req.tgUser.id, 30),
    achievements: db.getUserAchievements(req.tgUser.id, 30),
    history: db.getHistory(req.tgUser.id, 100),
    settings: db.getSettings(),
    categories: ACHIEVEMENT_CATEGORIES,
    isAdmin: tg.isAdmin(req.tgUser.id),
  });
});

app.post("/api/player-id", auth, (req, res) => {
  const playerId = String(req.body.playerId || "").trim().slice(0, 40);
  res.json({ success: true, profile: db.getProfile(db.setPlayerId(req.tgUser.id, playerId).id) });
});

app.post("/api/shop/buy", (req, res) => {
  auth(req, res, async () => {
    const result = db.purchase(req.tgUser.id, req.body.itemId, {
      variantLabel: req.body.variantLabel,
      quantity: req.body.quantity,
    });
    if (!result.ok) return res.status(400).json({ success: false, ...result });

    tg.notifyNewOrder(req.tgUser, result.user, result.order).catch((e) => console.error(e));
    res.json({
      success: true,
      order: result.order,
      profile: db.getProfile(req.tgUser.id),
      history: db.getHistory(req.tgUser.id, 100),
      orders: db.getUserOrders(req.tgUser.id, 30),
    });
  });
});

app.post("/api/coins/request", (req, res) => {
  auth(req, res, () => {
    const amount = Math.round(Number(req.body.amount) || 0);
    if (amount <= 0) return res.status(400).json({ success: false, error: "bad_amount" });

    const request = db.createCoinRequest(req.tgUser.id, amount);
    tg.notifyNewCoinRequest(req.tgUser, db.getUser(req.tgUser.id), request).catch((e) => console.error(e));
    res.json({ success: true, request });
  });
});

app.post("/api/achievements", (req, res) => {
  auth(req, res, () => {
    const category = String(req.body.category || "");
    const known = ACHIEVEMENT_CATEGORIES.find((c) => c.id === category);
    if (!known) return res.status(400).json({ success: false, error: "unknown_category" });

    const photo = typeof req.body.photo === "string" && req.body.photo.startsWith("data:image/") ? req.body.photo : null;
    const comment = String(req.body.comment || "").slice(0, 500);
    const achievement = db.createAchievement(req.tgUser.id, { category, comment, photo });

    tg.notifyNewAchievement(req.tgUser, db.getUser(req.tgUser.id), achievement, known.title).catch((e) => console.error(e));
    res.json({ success: true, achievement, achievements: db.getUserAchievements(req.tgUser.id, 30) });
  });
});

/* ------------------------------------------------------------------ */
/* API админа                                                          */
/* ------------------------------------------------------------------ */
app.get("/api/admin/overview", requireAdmin, (req, res) => {
  res.json({
    success: true,
    stats: db.getStats(),
    orders: db.listOrders({ status: "pending" }),
    coinRequests: db.listCoinRequests({ status: "pending" }),
    achievements: db.listAchievements({ status: "pending" }),
    settings: db.getSettings(),
  });
});

/* ------------------------------------------------------------------ */
/* Загрузка картинок товаров                                           */
/* ------------------------------------------------------------------ */
// Картинки лежат файлами в public/uploads, а в базе хранится только путь.
// Так /api/state остаётся лёгким — иначе каждая загрузка приложения тянула
// бы все изображения ассортимента в base64.
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Удаляем только то, что лежит в нашей папке загрузок: путь из сида
// (assets/items/...) или внешняя ссылка не должны трогаться.
function removeUpload(imagePath) {
  const value = String(imagePath || "");
  if (!value.startsWith("uploads/") || value.includes("..")) return;
  const file = path.join(UPLOAD_DIR, path.basename(value));
  fs.promises.unlink(file).catch(() => {});
}

app.post("/api/admin/upload", requireAdmin, (req, res) => {
  const match = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/i.exec(String(req.body.image || ""));
  if (!match) return res.status(400).json({ success: false, error: "bad_image" });

  const ext = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length > 4 * 1024 * 1024) return res.status(400).json({ success: false, error: "too_large" });

  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    fs.writeFileSync(path.join(UPLOAD_DIR, name), buffer);
  } catch (err) {
    console.error("upload failed:", err);
    return res.status(500).json({ success: false, error: "write_failed" });
  }

  if (req.body.replace) removeUpload(req.body.replace);
  res.json({ success: true, path: `uploads/${name}` });
});

app.get("/api/admin/items", requireAdmin, (req, res) => {
  res.json({ success: true, items: db.getShopItems({ onlyActive: false }) });
});

app.post("/api/admin/items", requireAdmin, (req, res) => {
  if (!String(req.body.title || "").trim()) return res.status(400).json({ success: false, error: "bad_title" });
  res.json({ success: true, item: db.createShopItem(req.body) });
});

app.put("/api/admin/items/:id", requireAdmin, (req, res) => {
  const previous = db.getShopItem(req.params.id);
  const item = db.updateShopItem(req.params.id, req.body);
  if (!item) return res.status(404).json({ success: false, error: "unknown_item" });
  // Картинку заменили — старый файл больше никому не нужен.
  if (previous && previous.image && previous.image !== item.image) removeUpload(previous.image);
  res.json({ success: true, item });
});

app.delete("/api/admin/items/:id", requireAdmin, (req, res) => {
  const item = db.getShopItem(req.params.id);
  const deleted = db.deleteShopItem(req.params.id);
  if (deleted && item) removeUpload(item.image);
  res.json({ success: deleted });
});

app.get("/api/admin/orders", requireAdmin, (req, res) => {
  res.json({ success: true, orders: db.listOrders({ status: req.query.status || null }) });
});

app.post("/api/admin/orders/:id/status", requireAdmin, (req, res) => {
  const result = db.setOrderStatus(req.params.id, String(req.body.status));
  if (!result.ok) return res.status(400).json({ success: false, ...result });

  const text =
    req.body.status === "done"
      ? `✅ Замовлення #${result.order.id} виконано: <b>${tg.escapeHtml(result.order.itemTitle)}</b>`
      : req.body.status === "canceled"
      ? `🔴 Замовлення #${result.order.id} скасовано. На баланс повернено <b>${result.order.price} PC</b>.`
      : null;
  if (text) tg.notifyUser(result.order.userId, text).catch((e) => console.error(e));

  res.json({ success: true, order: result.order });
});

app.get("/api/admin/coin-requests", requireAdmin, (req, res) => {
  res.json({ success: true, requests: db.listCoinRequests({ status: req.query.status || null }) });
});

app.post("/api/admin/coin-requests/:id/resolve", requireAdmin, (req, res) => {
  const status = req.body.status === "approved" ? "approved" : "rejected";
  const result = db.resolveCoinRequest(req.params.id, status);
  if (!result.ok) return res.status(400).json({ success: false, ...result });

  const text =
    status === "approved"
      ? `💰 Оплату підтверджено. Нараховано <b>${result.request.amount} Prime Coin</b>.`
      : `❌ Заявку на купівлю Prime Coin відхилено.`;
  tg.notifyUser(result.request.userId, text).catch((e) => console.error(e));

  res.json({ success: true, request: result.request });
});

app.get("/api/admin/achievements", requireAdmin, (req, res) => {
  res.json({ success: true, achievements: db.listAchievements({ status: req.query.status || null }) });
});

app.post("/api/admin/achievements/:id/resolve", requireAdmin, (req, res) => {
  const status = req.body.status === "approved" ? "approved" : "rejected";
  const result = db.resolveAchievement(req.params.id, {
    status,
    amount: req.body.amount,
    title: req.body.title || "Досягнення підтверджено",
  });
  if (!result.ok) return res.status(400).json({ success: false, ...result });

  const text =
    status === "approved"
      ? `🏆 Досягнення підтверджено. Нараховано <b>${result.awarded} Prime Coin</b>.`
      : `❌ Заявку на досягнення відхилено.`;
  tg.notifyUser(result.achievement.userId, text).catch((e) => console.error(e));

  res.json({ success: true, achievement: result.achievement });
});

app.get("/api/admin/earn-rules", requireAdmin, (req, res) => {
  res.json({ success: true, rules: db.getEarnRules({ onlyActive: false }) });
});

app.post("/api/admin/earn-rules", requireAdmin, (req, res) => {
  if (!String(req.body.title || "").trim()) return res.status(400).json({ success: false, error: "bad_title" });
  res.json({ success: true, rule: db.createEarnRule(req.body) });
});

app.put("/api/admin/earn-rules/:id", requireAdmin, (req, res) => {
  const rule = db.updateEarnRule(req.params.id, req.body);
  if (!rule) return res.status(404).json({ success: false, error: "unknown_rule" });
  res.json({ success: true, rule });
});

app.delete("/api/admin/earn-rules/:id", requireAdmin, (req, res) => {
  res.json({ success: db.deleteEarnRule(req.params.id) });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  res.json({ success: true, users: db.findUsers(req.query.q || "") });
});

// Ручное начисление: и «+N Prime Coin просто так», и процент от рейка/депозита.
app.post("/api/admin/balance", requireAdmin, (req, res) => {
  const { targetUserId, mode, value, reason } = req.body;
  if (!targetUserId) return res.status(400).json({ success: false, error: "missing_target" });

  if (mode === "rake" || mode === "deposit") {
    const result = db.accrue(targetUserId, mode, value);
    if (!result.ok) return res.status(400).json({ success: false, ...result });
    tg.notifyUser(
      targetUserId,
      `💎 Нараховано <b>${result.coins} Prime Coin</b> — ${mode === "rake" ? "за рейк" : "за депозит"} (${result.percent}% від ${result.base} грн).`
    ).catch((e) => console.error(e));
    return res.json({ success: true, coins: result.coins, profile: db.getProfile(targetUserId) });
  }

  const amount = Math.round(Number(value) || 0);
  const result = db.applyBalance(targetUserId, amount, reason || (amount > 0 ? "Нарахування адміністратором" : "Списання адміністратором"));
  if (!result.ok) return res.status(400).json({ success: false, ...result });
  if (amount > 0) {
    tg.notifyUser(targetUserId, `💎 Нараховано <b>${amount} Prime Coin</b>.`).catch((e) => console.error(e));
  }
  res.json({ success: true, profile: db.getProfile(targetUserId) });
});

app.get("/api/admin/user/:id", requireAdmin, (req, res) => {
  res.json({
    success: true,
    profile: db.getProfile(req.params.id),
    history: db.getHistory(req.params.id, 50),
    orders: db.getUserOrders(req.params.id, 30),
  });
});

app.get("/api/admin/settings", requireAdmin, (req, res) => {
  res.json({ success: true, settings: db.getSettings() });
});

app.post("/api/admin/settings", requireAdmin, (req, res) => {
  let settings = db.getSettings();
  for (const [key, value] of Object.entries(req.body.settings || {})) settings = db.setSetting(key, value);
  res.json({ success: true, settings });
});

/* ------------------------------------------------------------------ */
/* Статика                                                             */
/* ------------------------------------------------------------------ */
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR));
app.get("/", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.get("/admin.html", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "admin.html")));
app.get("/health", (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`PRIME STORE запущено на порту ${PORT}`));
