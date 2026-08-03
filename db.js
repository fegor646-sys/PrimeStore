const path = require("path");
const Database = require("better-sqlite3");

const { SHOP_SEED } = require("./catalog");
const { EARN_SEED, DEFAULT_SETTINGS } = require("./rewards");

const db = new Database(path.join(__dirname, "db.sqlite"));
db.pragma("journal_mode = WAL");

/* ------------------------------------------------------------------ */
/* Схема                                                               */
/* ------------------------------------------------------------------ */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT,
    firstName TEXT,
    playerId TEXT,
    balance INTEGER NOT NULL DEFAULT 0,
    totalEarned INTEGER NOT NULL DEFAULT 0,
    totalSpent INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS shop_items (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    kind TEXT NOT NULL DEFAULT 'simple',
    price INTEGER NOT NULL DEFAULT 0,
    salePrice INTEGER,
    saleStart TEXT,
    saleEnd TEXT,
    image TEXT,
    meta TEXT NOT NULL DEFAULT '{}',
    active INTEGER NOT NULL DEFAULT 1,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS earn_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    groupId TEXT NOT NULL,
    groupTitle TEXT NOT NULL,
    groupOrder INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    amount INTEGER NOT NULL,
    reason TEXT NOT NULL,
    refType TEXT,
    refId TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    itemId TEXT NOT NULL,
    itemTitle TEXT NOT NULL,
    variantLabel TEXT,
    quantity INTEGER NOT NULL DEFAULT 1,
    price INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    comment TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS coin_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    amount INTEGER NOT NULL,
    payAmount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT NOT NULL,
    category TEXT NOT NULL,
    comment TEXT,
    photo TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    awarded INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(userId, id DESC);
  CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(userId, id DESC);
  CREATE INDEX IF NOT EXISTS idx_ach_user ON achievements(userId, id DESC);
`);

/* ------------------------------------------------------------------ */
/* Первичное наполнение                                                */
/* ------------------------------------------------------------------ */
const now = () => new Date().toISOString();

function seedShopIfNeeded() {
  if (db.prepare("SELECT COUNT(*) c FROM shop_items").get().c > 0) return;
  const insert = db.prepare(`
    INSERT INTO shop_items (id, title, subtitle, description, kind, price, image, meta, active, sortOrder, createdAt)
    VALUES (@id, @title, @subtitle, @description, @kind, @price, @image, @meta, 1, @sortOrder, @createdAt)
  `);
  db.transaction((rows) => {
    for (const row of rows) {
      insert.run({
        id: row.id,
        title: row.title,
        subtitle: row.subtitle || null,
        description: row.description || null,
        kind: row.kind || "simple",
        price: row.price,
        image: row.image || null,
        meta: JSON.stringify(row.meta || {}),
        sortOrder: row.sortOrder || 0,
        createdAt: now(),
      });
    }
  })(SHOP_SEED);
  console.log(`[db] Загружено товаров: ${SHOP_SEED.length}`);
}

function seedEarnRulesIfNeeded() {
  if (db.prepare("SELECT COUNT(*) c FROM earn_rules").get().c > 0) return;
  const insert = db.prepare(`
    INSERT INTO earn_rules (code, groupId, groupTitle, groupOrder, title, amount, active, sortOrder)
    VALUES (@code, @groupId, @groupTitle, @groupOrder, @title, @amount, 1, @sortOrder)
  `);
  db.transaction((rows) => rows.forEach((r) => insert.run({ groupOrder: 0, ...r })))(EARN_SEED);
  console.log(`[db] Загружено правил начисления: ${EARN_SEED.length}`);
}

function seedSettingsIfNeeded() {
  const insert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, value);
}

// Старые базы могли быть созданы до появления порядка разделов.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
ensureColumn("earn_rules", "groupOrder", "INTEGER NOT NULL DEFAULT 0");

seedShopIfNeeded();
seedEarnRulesIfNeeded();
seedSettingsIfNeeded();

/* ------------------------------------------------------------------ */
/* Настройки                                                           */
/* ------------------------------------------------------------------ */
function getSettings() {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    String(key),
    String(value)
  );
  return getSettings();
}

/* ------------------------------------------------------------------ */
/* Пользователи                                                        */
/* ------------------------------------------------------------------ */
function getUser(telegramId) {
  const id = String(telegramId);
  let row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!row) {
    db.prepare("INSERT INTO users (id, createdAt) VALUES (?, ?)").run(id, now());
    row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  }
  return row;
}

function touchUser(telegramId, { username, firstName } = {}) {
  const user = getUser(telegramId);
  db.prepare("UPDATE users SET username = ?, firstName = ? WHERE id = ?").run(
    username ?? user.username,
    firstName ?? user.firstName,
    user.id
  );
  return getUser(telegramId);
}

function setPlayerId(telegramId, playerId) {
  getUser(telegramId);
  db.prepare("UPDATE users SET playerId = ? WHERE id = ?").run(playerId || null, String(telegramId));
  return getUser(telegramId);
}

// Единая точка изменения баланса: любое движение Prime Coin пишется в
// историю операций, поэтому «История» и профиль всегда сходятся с балансом.
const applyBalance = db.transaction((telegramId, amount, reason, ref = {}) => {
  const user = getUser(telegramId);
  const delta = Math.round(Number(amount));
  if (!delta) return { ok: false, error: "zero_amount", user };
  if (delta < 0 && user.balance + delta < 0) return { ok: false, error: "insufficient_funds", user };

  // Возврат за отменённый заказ — это не заработок, а откат траты: иначе
  // «всего заработано» в профиле раздувалось бы на каждой отмене.
  const isRefund = ref.counter === "refund";
  const earned = delta > 0 && !isRefund ? user.totalEarned + delta : user.totalEarned;
  const spent = isRefund ? Math.max(0, user.totalSpent - Math.abs(delta)) : delta < 0 ? user.totalSpent - delta : user.totalSpent;

  db.prepare("UPDATE users SET balance = ?, totalEarned = ?, totalSpent = ? WHERE id = ?").run(
    user.balance + delta,
    earned,
    spent,
    user.id
  );
  db.prepare(
    "INSERT INTO transactions (userId, amount, reason, refType, refId, createdAt) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(user.id, delta, reason, ref.type || null, ref.id != null ? String(ref.id) : null, now());

  return { ok: true, user: getUser(telegramId) };
});

function getHistory(telegramId, limit = 100) {
  return db
    .prepare("SELECT id, amount, reason, refType, refId, createdAt FROM transactions WHERE userId = ? ORDER BY id DESC LIMIT ?")
    .all(String(telegramId), limit);
}

function getProfile(telegramId) {
  const user = getUser(telegramId);
  const orders = db.prepare("SELECT COUNT(*) c FROM orders WHERE userId = ? AND status = 'done'").get(user.id).c;
  const achievements = db
    .prepare("SELECT COUNT(*) c FROM achievements WHERE userId = ? AND status = 'approved'")
    .get(user.id).c;
  return {
    id: user.id,
    username: user.username,
    firstName: user.firstName,
    playerId: user.playerId,
    balance: user.balance,
    totalEarned: user.totalEarned,
    totalSpent: user.totalSpent,
    ordersDone: orders,
    achievementsApproved: achievements,
    createdAt: user.createdAt,
  };
}

/* ------------------------------------------------------------------ */
/* Магазин: акции + расчёт актуальной цены                             */
/* ------------------------------------------------------------------ */
// Акция активна, только если задана цена и текущий момент попадает в окно дат.
// Пустая дата = «без ограничения» с этой стороны. Ничего чистить по расписанию
// не нужно: как только окно закрылось, цена сама возвращается к обычной.
function saleActive(row, at = new Date()) {
  if (row.salePrice == null) return false;
  if (row.saleStart && at < new Date(row.saleStart)) return false;
  if (row.saleEnd && at > new Date(row.saleEnd)) return false;
  return true;
}

function rowToItem(row) {
  const onSale = saleActive(row);
  let meta = {};
  try {
    meta = JSON.parse(row.meta || "{}");
  } catch (e) {
    meta = {};
  }
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    kind: row.kind,
    price: onSale ? row.salePrice : row.price,
    basePrice: row.price,
    salePrice: row.salePrice,
    saleStart: row.saleStart,
    saleEnd: row.saleEnd,
    onSale,
    image: row.image,
    meta,
    active: !!row.active,
    sortOrder: row.sortOrder,
  };
}

function getShopItems({ onlyActive = true } = {}) {
  const sql = onlyActive
    ? "SELECT * FROM shop_items WHERE active = 1 ORDER BY sortOrder ASC, rowid ASC"
    : "SELECT * FROM shop_items ORDER BY sortOrder ASC, rowid ASC";
  return db.prepare(sql).all().map(rowToItem);
}

function getShopItem(id) {
  const row = db.prepare("SELECT * FROM shop_items WHERE id = ?").get(String(id));
  return row ? rowToItem(row) : null;
}

function slugify(title) {
  const base = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || `item-${Date.now()}`;
}

function createShopItem(data) {
  let id = data.id ? String(data.id) : slugify(data.title);
  while (db.prepare("SELECT 1 FROM shop_items WHERE id = ?").get(id)) id = `${id}-${Math.floor(Math.random() * 1000)}`;

  const maxOrder = db.prepare("SELECT COALESCE(MAX(sortOrder), 0) m FROM shop_items").get().m;
  db.prepare(`
    INSERT INTO shop_items (id, title, subtitle, description, kind, price, salePrice, saleStart, saleEnd, image, meta, active, sortOrder, createdAt)
    VALUES (@id, @title, @subtitle, @description, @kind, @price, @salePrice, @saleStart, @saleEnd, @image, @meta, @active, @sortOrder, @createdAt)
  `).run({
    id,
    title: String(data.title),
    subtitle: data.subtitle || null,
    description: data.description || null,
    kind: data.kind || "simple",
    price: Number(data.price) || 0,
    salePrice: data.salePrice == null || data.salePrice === "" ? null : Number(data.salePrice),
    saleStart: data.saleStart || null,
    saleEnd: data.saleEnd || null,
    image: data.image || null,
    meta: JSON.stringify(data.meta || {}),
    active: data.active === false ? 0 : 1,
    sortOrder: data.sortOrder != null ? Number(data.sortOrder) : maxOrder + 1,
    createdAt: now(),
  });
  return getShopItem(id);
}

const ITEM_FIELDS = ["title", "subtitle", "description", "kind", "price", "salePrice", "saleStart", "saleEnd", "image", "active", "sortOrder"];

function updateShopItem(id, data) {
  const existing = db.prepare("SELECT * FROM shop_items WHERE id = ?").get(String(id));
  if (!existing) return null;

  const next = { ...existing };
  for (const field of ITEM_FIELDS) {
    if (data[field] === undefined) continue;
    if (field === "active") next.active = data.active ? 1 : 0;
    else if (field === "price" || field === "sortOrder") next[field] = Number(data[field]) || 0;
    else if (field === "salePrice") next.salePrice = data.salePrice == null || data.salePrice === "" ? null : Number(data.salePrice);
    else if (field === "saleStart" || field === "saleEnd") next[field] = data[field] || null;
    else next[field] = data[field] === null ? null : String(data[field]);
  }
  if (data.meta !== undefined) next.meta = JSON.stringify(data.meta || {});

  db.prepare(`
    UPDATE shop_items SET title=@title, subtitle=@subtitle, description=@description, kind=@kind,
      price=@price, salePrice=@salePrice, saleStart=@saleStart, saleEnd=@saleEnd,
      image=@image, meta=@meta, active=@active, sortOrder=@sortOrder
    WHERE id=@id
  `).run(next);
  return getShopItem(id);
}

function deleteShopItem(id) {
  return db.prepare("DELETE FROM shop_items WHERE id = ?").run(String(id)).changes > 0;
}

/* ------------------------------------------------------------------ */
/* Покупка товара                                                      */
/* ------------------------------------------------------------------ */
const purchase = db.transaction((telegramId, itemId, options = {}) => {
  const item = getShopItem(itemId);
  if (!item || !item.active) return { ok: false, error: "unknown_item" };

  let price = item.price;
  let quantity = 1;
  let variantLabel = null;

  if (item.kind === "variant") {
    const variants = item.meta.variants || [];
    const variant = variants.find((v) => v.label === options.variantLabel) || variants[0];
    if (!variant) return { ok: false, error: "unknown_variant" };
    // Скидка применяется пропорционально: акция на товар работает и для номиналов.
    const discount = item.onSale && item.basePrice > 0 ? item.price / item.basePrice : 1;
    price = Math.round(Number(variant.price) * discount);
    variantLabel = variant.label;
  } else if (item.kind === "amount") {
    quantity = Math.max(1, Math.round(Number(options.quantity) || 0));
    const min = Number(item.meta.minAmount) || 1;
    if (quantity < min) return { ok: false, error: "amount_too_small", min };
    price = item.price * quantity;
  }

  const user = getUser(telegramId);
  if (user.balance < price) return { ok: false, error: "insufficient_funds", balance: user.balance, price };

  const label = variantLabel
    ? `${item.title} · ${variantLabel}`
    : item.kind === "amount"
    ? `${item.title} · ${quantity} ${item.meta.unit || "шт"}`
    : item.title;

  const info = db.prepare(`
    INSERT INTO orders (userId, itemId, itemTitle, variantLabel, quantity, price, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(user.id, item.id, label, variantLabel, quantity, price, now(), now());

  applyBalance(user.id, -price, `Купівля: ${label}`, { type: "order", id: info.lastInsertRowid });

  return {
    ok: true,
    order: db.prepare("SELECT * FROM orders WHERE id = ?").get(info.lastInsertRowid),
    item,
    user: getUser(telegramId),
  };
});

function getUserOrders(telegramId, limit = 50) {
  return db.prepare("SELECT * FROM orders WHERE userId = ? ORDER BY id DESC LIMIT ?").all(String(telegramId), limit);
}

function listOrders({ status } = {}) {
  const sql = status
    ? "SELECT o.*, u.username, u.firstName, u.playerId FROM orders o LEFT JOIN users u ON u.id = o.userId WHERE o.status = ? ORDER BY o.id DESC LIMIT 300"
    : "SELECT o.*, u.username, u.firstName, u.playerId FROM orders o LEFT JOIN users u ON u.id = o.userId ORDER BY o.id DESC LIMIT 300";
  return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

// Отмена заказа возвращает Prime Coin обратно — отдельной строкой в истории,
// чтобы у игрока было видно и списание, и возврат.
const setOrderStatus = db.transaction((orderId, status) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(Number(orderId));
  if (!order) return { ok: false, error: "unknown_order" };
  if (order.status === status) return { ok: true, order };
  if (!["pending", "done", "canceled"].includes(status)) return { ok: false, error: "bad_status" };

  if (status === "canceled" && order.status !== "canceled") {
    applyBalance(order.userId, order.price, `Повернення: ${order.itemTitle}`, { type: "order-refund", id: order.id, counter: "refund" });
  }
  if (order.status === "canceled" && status !== "canceled") {
    const user = getUser(order.userId);
    if (user.balance < order.price) return { ok: false, error: "insufficient_funds" };
    applyBalance(order.userId, -order.price, `Повторне списання: ${order.itemTitle}`, { type: "order", id: order.id });
  }

  db.prepare("UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?").run(status, now(), order.id);
  return { ok: true, order: db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id) };
});

/* ------------------------------------------------------------------ */
/* Заявки на покупку Prime Coin                                        */
/* ------------------------------------------------------------------ */
function createCoinRequest(telegramId, amount) {
  const user = getUser(telegramId);
  const coins = Math.max(1, Math.round(Number(amount) || 0));
  const rate = Number(getSettings().coin_rate) || 1;
  const info = db.prepare(`
    INSERT INTO coin_requests (userId, amount, payAmount, status, createdAt, updatedAt)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(user.id, coins, Math.round(coins * rate), now(), now());
  return db.prepare("SELECT * FROM coin_requests WHERE id = ?").get(info.lastInsertRowid);
}

function listCoinRequests({ status } = {}) {
  const sql = status
    ? "SELECT c.*, u.username, u.firstName, u.playerId FROM coin_requests c LEFT JOIN users u ON u.id = c.userId WHERE c.status = ? ORDER BY c.id DESC LIMIT 300"
    : "SELECT c.*, u.username, u.firstName, u.playerId FROM coin_requests c LEFT JOIN users u ON u.id = c.userId ORDER BY c.id DESC LIMIT 300";
  return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

const resolveCoinRequest = db.transaction((requestId, status) => {
  const req = db.prepare("SELECT * FROM coin_requests WHERE id = ?").get(Number(requestId));
  if (!req) return { ok: false, error: "unknown_request" };
  if (req.status !== "pending") return { ok: false, error: "already_resolved" };

  db.prepare("UPDATE coin_requests SET status = ?, updatedAt = ? WHERE id = ?").run(status, now(), req.id);
  if (status === "approved") {
    applyBalance(req.userId, req.amount, "Купівля Prime Coin", { type: "coin-request", id: req.id });
  }
  return { ok: true, request: db.prepare("SELECT * FROM coin_requests WHERE id = ?").get(req.id) };
});

/* ------------------------------------------------------------------ */
/* Достижения                                                          */
/* ------------------------------------------------------------------ */
function createAchievement(telegramId, { category, comment, photo }) {
  const user = getUser(telegramId);
  const info = db.prepare(`
    INSERT INTO achievements (userId, category, comment, photo, status, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)
  `).run(user.id, String(category), comment || null, photo || null, now(), now());
  return db.prepare("SELECT id, userId, category, comment, status, awarded, createdAt FROM achievements WHERE id = ?").get(
    info.lastInsertRowid
  );
}

function getUserAchievements(telegramId, limit = 50) {
  return db
    .prepare("SELECT id, category, comment, status, awarded, createdAt FROM achievements WHERE userId = ? ORDER BY id DESC LIMIT ?")
    .all(String(telegramId), limit);
}

function listAchievements({ status } = {}) {
  const sql = status
    ? "SELECT a.*, u.username, u.firstName, u.playerId FROM achievements a LEFT JOIN users u ON u.id = a.userId WHERE a.status = ? ORDER BY a.id DESC LIMIT 200"
    : "SELECT a.*, u.username, u.firstName, u.playerId FROM achievements a LEFT JOIN users u ON u.id = a.userId ORDER BY a.id DESC LIMIT 200";
  return status ? db.prepare(sql).all(status) : db.prepare(sql).all();
}

const resolveAchievement = db.transaction((id, { status, amount, title }) => {
  const row = db.prepare("SELECT * FROM achievements WHERE id = ?").get(Number(id));
  if (!row) return { ok: false, error: "unknown_achievement" };
  if (row.status !== "pending") return { ok: false, error: "already_resolved" };

  const awarded = status === "approved" ? Math.max(0, Math.round(Number(amount) || 0)) : 0;
  db.prepare("UPDATE achievements SET status = ?, awarded = ?, updatedAt = ? WHERE id = ?").run(status, awarded, now(), row.id);
  if (awarded > 0) {
    applyBalance(row.userId, awarded, title || "Досягнення підтверджено", { type: "achievement", id: row.id });
  }
  return { ok: true, achievement: db.prepare("SELECT * FROM achievements WHERE id = ?").get(row.id), awarded };
});

/* ------------------------------------------------------------------ */
/* Правила начисления (справочник «Заработать»)                        */
/* ------------------------------------------------------------------ */
function getEarnRules({ onlyActive = true } = {}) {
  const sql = onlyActive
    ? "SELECT * FROM earn_rules WHERE active = 1 ORDER BY groupOrder ASC, groupTitle ASC, sortOrder ASC"
    : "SELECT * FROM earn_rules ORDER BY groupOrder ASC, groupTitle ASC, sortOrder ASC";
  return db.prepare(sql).all().map((r) => ({ ...r, active: !!r.active }));
}

function getEarnGroups() {
  const groups = [];
  const byId = {};
  for (const rule of getEarnRules({ onlyActive: true })) {
    if (!byId[rule.groupId]) {
      byId[rule.groupId] = { id: rule.groupId, title: rule.groupTitle, items: [] };
      groups.push(byId[rule.groupId]);
    }
    byId[rule.groupId].items.push({ id: rule.id, code: rule.code, title: rule.title, amount: rule.amount });
  }
  return groups;
}

function createEarnRule(data) {
  const info = db.prepare(`
    INSERT INTO earn_rules (code, groupId, groupTitle, groupOrder, title, amount, active, sortOrder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.code || null,
    String(data.groupId || "custom"),
    String(data.groupTitle || "Інше"),
    Number(data.groupOrder) || 99,
    String(data.title),
    Number(data.amount) || 0,
    data.active === false ? 0 : 1,
    Number(data.sortOrder) || 0
  );
  return db.prepare("SELECT * FROM earn_rules WHERE id = ?").get(info.lastInsertRowid);
}

function updateEarnRule(id, data) {
  const row = db.prepare("SELECT * FROM earn_rules WHERE id = ?").get(Number(id));
  if (!row) return null;
  db.prepare("UPDATE earn_rules SET groupTitle = ?, title = ?, amount = ?, active = ?, sortOrder = ? WHERE id = ?").run(
    data.groupTitle !== undefined ? String(data.groupTitle) : row.groupTitle,
    data.title !== undefined ? String(data.title) : row.title,
    data.amount !== undefined ? Number(data.amount) : row.amount,
    data.active !== undefined ? (data.active ? 1 : 0) : row.active,
    data.sortOrder !== undefined ? Number(data.sortOrder) : row.sortOrder,
    row.id
  );
  return db.prepare("SELECT * FROM earn_rules WHERE id = ?").get(row.id);
}

function deleteEarnRule(id) {
  return db.prepare("DELETE FROM earn_rules WHERE id = ?").run(Number(id)).changes > 0;
}

/* ------------------------------------------------------------------ */
/* Автоначисления за рейк и депозит                                    */
/* ------------------------------------------------------------------ */
function accrue(telegramId, type, baseAmount) {
  const settings = getSettings();
  const percent = Number(type === "rake" ? settings.rake_percent : settings.deposit_percent) || 0;
  const base = Math.max(0, Number(baseAmount) || 0);
  const coins = Math.floor((base * percent) / 100);
  if (coins <= 0) return { ok: false, error: "zero_amount" };

  const label = type === "rake" ? `За рейк (${percent}% від ${base} грн)` : `За депозит (${percent}% від ${base} грн)`;
  const result = applyBalance(telegramId, coins, label, { type: `accrual-${type}` });
  return { ok: result.ok, coins, percent, base, user: result.user };
}

/* ------------------------------------------------------------------ */
/* Сводка для админки                                                  */
/* ------------------------------------------------------------------ */
function getStats() {
  const one = (sql, ...args) => db.prepare(sql).get(...args);
  return {
    users: one("SELECT COUNT(*) c FROM users").c,
    coinsInCirculation: one("SELECT COALESCE(SUM(balance), 0) c FROM users").c,
    pendingOrders: one("SELECT COUNT(*) c FROM orders WHERE status = 'pending'").c,
    pendingAchievements: one("SELECT COUNT(*) c FROM achievements WHERE status = 'pending'").c,
    pendingCoinRequests: one("SELECT COUNT(*) c FROM coin_requests WHERE status = 'pending'").c,
    activeItems: one("SELECT COUNT(*) c FROM shop_items WHERE active = 1").c,
  };
}

function findUsers(query, limit = 20) {
  const q = `%${String(query || "").trim()}%`;
  return db
    .prepare(
      "SELECT id, username, firstName, playerId, balance FROM users WHERE id LIKE ? OR username LIKE ? OR firstName LIKE ? OR playerId LIKE ? ORDER BY balance DESC LIMIT ?"
    )
    .all(q, q, q, q, limit);
}

module.exports = {
  getSettings,
  setSetting,
  getUser,
  touchUser,
  setPlayerId,
  applyBalance,
  getHistory,
  getProfile,
  getShopItems,
  getShopItem,
  createShopItem,
  updateShopItem,
  deleteShopItem,
  purchase,
  getUserOrders,
  listOrders,
  setOrderStatus,
  createCoinRequest,
  listCoinRequests,
  resolveCoinRequest,
  createAchievement,
  getUserAchievements,
  listAchievements,
  resolveAchievement,
  getEarnRules,
  getEarnGroups,
  createEarnRule,
  updateEarnRule,
  deleteEarnRule,
  accrue,
  getStats,
  findUsers,
};
