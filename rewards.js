// Справочник способов заработать Prime Coin. Как и с товарами, это только
// СИД для первого запуска - дальше всё редактируется в админке, а новые
// строки (ежедневные задания, миссии, колесо удачи) добавляются сюда же
// без переписывания кода: достаточно новой группы в EARN_SEED.

const EARN_SEED = [
  // --- Hold'em ---
  { code: "holdem-quads", groupId: "holdem", groupTitle: "Hold'em", groupOrder: 1, title: "Каре", amount: 50, sortOrder: 1 },
  { code: "holdem-sf", groupId: "holdem", groupTitle: "Hold'em", groupOrder: 1, title: "Стріт-флеш", amount: 180, sortOrder: 2 },
  { code: "holdem-rf", groupId: "holdem", groupTitle: "Hold'em", groupOrder: 1, title: "Роял-флеш", amount: 200, sortOrder: 3 },

  // --- Omaha ---
  { code: "omaha-quads", groupId: "omaha", groupTitle: "Omaha", groupOrder: 2, title: "Каре", amount: 40, sortOrder: 1 },
  { code: "omaha-sf", groupId: "omaha", groupTitle: "Omaha", groupOrder: 2, title: "Стріт-флеш", amount: 180, sortOrder: 2 },
  { code: "omaha-rf", groupId: "omaha", groupTitle: "Omaha", groupOrder: 2, title: "Роял-флеш", amount: 150, sortOrder: 3 },

  // --- Турнірні досягнення ---
  { code: "tour-ko", groupId: "tournament", groupTitle: "Турнірні досягнення", groupOrder: 3, title: "Кожен нокаут", amount: 10, sortOrder: 1 },
  { code: "tour-itm", groupId: "tournament", groupTitle: "Турнірні досягнення", groupOrder: 3, title: "Потрапляння в ITM", amount: 10, sortOrder: 2 },
  { code: "tour-ft", groupId: "tournament", groupTitle: "Турнірні досягнення", groupOrder: 3, title: "Фінальний стіл", amount: 25, sortOrder: 3 },
  { code: "tour-win", groupId: "tournament", groupTitle: "Турнірні досягнення", groupOrder: 3, title: "Перемога в турнірі", amount: 100, sortOrder: 4 },

  // --- Автоматичні нарахування (довідково, суми рахуються відсотком) ---
  { code: "auto-rake", groupId: "auto", groupTitle: "Автоматично", groupOrder: 4, title: "5% Prime Coin від рейка (щотижня)", amount: 0, sortOrder: 1 },
  { code: "auto-deposit", groupId: "auto", groupTitle: "Автоматично", groupOrder: 4, title: "5% Prime Coin від кожного депозиту", amount: 0, sortOrder: 2 },
];

// Категорії заявок на досягнення (екран «Відправити досягнення»).
const ACHIEVEMENT_CATEGORIES = [
  { id: "combo", title: "Комбінація", icon: "🃏" },
  { id: "tournament", title: "Турнір", icon: "🏆" },
  { id: "knockouts", title: "Нокаути", icon: "💥" },
  { id: "other", title: "Інше досягнення", icon: "📷" },
];

// Налаштування, які адмін може змінювати на льоту, без релізу.
const DEFAULT_SETTINGS = {
  rake_percent: "5",
  deposit_percent: "5",
  coin_rate: "1", // 1 Prime Coin = 1 грн при купівлі
  club_name: "PRIME POKER CLUB",
  buy_note: "Після оформлення заявки з вами зв'яжеться адміністратор для оплати. Prime Coin нараховуються автоматично після підтвердження.",
};

module.exports = { EARN_SEED, ACHIEVEMENT_CATEGORIES, DEFAULT_SETTINGS };
