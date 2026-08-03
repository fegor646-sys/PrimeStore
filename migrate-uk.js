// Одноразова міграція існуючої бази на українську.
//
// Навіщо це потрібно: catalog.js і rewards.js — це СІД, він виконується лише
// один раз, коли таблиці порожні. Якщо база вже створена (а вона створена),
// назви товарів і правил нарахування залишаються такими, якими їх записали
// під час першого запуску, і переклад коду на них не впливає.
//
// Запуск:  node migrate-uk.js
// Прапорці:
//   --dry      нічого не змінювати, лише показати, що буде оновлено
//   --settings скинути buy_note / club_name до значень із rewards.js

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const { SHOP_SEED } = require("./catalog");
const { EARN_SEED, DEFAULT_SETTINGS } = require("./rewards");

const DRY = process.argv.includes("--dry");
const RESET_SETTINGS = process.argv.includes("--settings");

const DB_PATH = path.join(__dirname, "db.sqlite");
if (!fs.existsSync(DB_PATH)) {
  console.error("db.sqlite не знайдено поруч із проєктом. Нема чого мігрувати.");
  process.exit(1);
}

// Бекап робимо завжди — міграція перезаписує тексти без можливості відкату.
if (!DRY) {
  const backup = `${DB_PATH}.ru-backup-${Date.now()}`;
  fs.copyFileSync(DB_PATH, backup);
  console.log(`Резервна копія: ${path.basename(backup)}`);
}

const db = new Database(DB_PATH);
const stats = { items: 0, rules: 0, orders: 0, transactions: 0, settings: 0 };

/* ------------------------------------------------------------------ */
/* Товари: беремо еталон із catalog.js за id                           */
/* ------------------------------------------------------------------ */
const selItem = db.prepare("SELECT id, title, subtitle, description, meta FROM shop_items WHERE id = ?");
const updItem = db.prepare("UPDATE shop_items SET title = ?, subtitle = ?, description = ?, meta = ? WHERE id = ?");

for (const seed of SHOP_SEED) {
  const row = selItem.get(seed.id);
  if (!row) continue;

  // meta зливаємо: акційні/адмінські правки номіналів не затираємо,
  // оновлюємо лише текстову одиницю виміру.
  let meta = {};
  try {
    meta = JSON.parse(row.meta || "{}");
  } catch (e) {
    meta = {};
  }
  const seedMeta = seed.meta || {};
  if (seedMeta.unit) meta.unit = seedMeta.unit;
  if (seedMeta.variants && !meta.variants) meta.variants = seedMeta.variants;
  const nextMeta = JSON.stringify(meta);

  const changed =
    row.title !== seed.title ||
    row.subtitle !== (seed.subtitle || null) ||
    row.description !== (seed.description || null) ||
    row.meta !== nextMeta;

  if (!changed) continue;
  console.log(`  товар  ${seed.id}: «${row.title}» -> «${seed.title}»`);
  if (!DRY) updItem.run(seed.title, seed.subtitle || null, seed.description || null, nextMeta, seed.id);
  stats.items++;
}

/* ------------------------------------------------------------------ */
/* Правила нарахування: еталон із rewards.js за code                   */
/* ------------------------------------------------------------------ */
const selRule = db.prepare("SELECT id, code, groupTitle, title FROM earn_rules WHERE code = ?");
const updRule = db.prepare("UPDATE earn_rules SET groupTitle = ?, title = ? WHERE code = ?");

for (const seed of EARN_SEED) {
  const row = selRule.get(seed.code);
  if (!row) continue;
  if (row.groupTitle === seed.groupTitle && row.title === seed.title) continue;
  console.log(`  правило ${seed.code}: «${row.title}» -> «${seed.title}»`);
  if (!DRY) updRule.run(seed.groupTitle, seed.title, seed.code);
  stats.rules++;
}

/* ------------------------------------------------------------------ */
/* Історія операцій і замовлення                                       */
/* ------------------------------------------------------------------ */
// Ці рядки формувалися старим кодом і лежать у базі як звичайний текст,
// тому перекладаються заміною по словнику. Довші фрази йдуть першими,
// щоб не зіпсувати їх частковим збігом коротших.
const PHRASES = [
  ["Заявка на покупку Prime Coin", "Заявка на купівлю Prime Coin"],
  ["Начисление администратором", "Нарахування адміністратором"],
  ["Списание администратором", "Списання адміністратором"],
  ["Достижение подтверждено", "Досягнення підтверджено"],
  ["Повторное списание", "Повторне списання"],
  ["Покупка Prime Coin", "Купівля Prime Coin"],
  ["ТУРНИРНЫЙ БИЛЕТ", "ТУРНІРНИЙ КВИТОК"],
  ["ИГРОВЫЕ ФИШКИ", "ІГРОВІ ФІШКИ"],
  ["ВЫВЕСКА PRIME", "ВИВІСКА PRIME"],
  ["Любой бай-ин", "Будь-який бай-ін"],
  ["Коллекционная", "Колекційна"],
  ["Фирменный", "Фірмовий"],
  ["Фирменное", "Фірмове"],
  ["VIP СТАТУС", "VIP СТАТУС"],
  ["За депозит", "За депозит"],
  ["Покупка:", "Купівля:"],
  ["Возврат:", "Повернення:"],
  ["КРУЖКА", "ГОРНЯТКО"],
  ["МАГНИТ", "МАГНІТ"],
  ["30 дней", "30 днів"],
  ["За рейк", "За рейк"],
];

function translate(text) {
  if (!text) return text;
  let out = String(text);
  for (const [ru, uk] of PHRASES) out = out.split(ru).join(uk);
  return out;
}

for (const [table, column, key] of [
  ["transactions", "reason", "transactions"],
  ["orders", "itemTitle", "orders"],
]) {
  const rows = db.prepare(`SELECT id, ${column} AS text FROM ${table}`).all();
  const upd = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);
  for (const row of rows) {
    const next = translate(row.text);
    if (next === row.text) continue;
    console.log(`  ${table} #${row.id}: «${row.text}» -> «${next}»`);
    if (!DRY) upd.run(next, row.id);
    stats[key]++;
  }
}

/* ------------------------------------------------------------------ */
/* Налаштування (лише за прапорцем --settings)                         */
/* ------------------------------------------------------------------ */
// Ці поля адмін міг правити руками, тому мовчки їх не чіпаємо.
if (RESET_SETTINGS) {
  const upd = db.prepare("UPDATE settings SET value = ? WHERE key = ?");
  for (const key of ["club_name", "buy_note"]) {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    if (!row || row.value === DEFAULT_SETTINGS[key]) continue;
    console.log(`  налаштування ${key}: «${row.value}» -> «${DEFAULT_SETTINGS[key]}»`);
    if (!DRY) upd.run(DEFAULT_SETTINGS[key], key);
    stats.settings++;
  }
} else {
  const note = db.prepare("SELECT value FROM settings WHERE key = 'buy_note'").get();
  if (note && note.value !== DEFAULT_SETTINGS.buy_note) {
    console.log("\nbuy_note у базі відрізняється від значення з rewards.js.");
    console.log("Якщо це старий російський текст — запустіть з прапорцем --settings.");
  }
}

console.log(
  `\n${DRY ? "[dry-run] " : ""}Оновлено: товарів ${stats.items}, правил ${stats.rules}, ` +
    `операцій ${stats.transactions}, замовлень ${stats.orders}, налаштувань ${stats.settings}.`
);
