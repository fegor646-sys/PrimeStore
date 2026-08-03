// Справочник способов заработать Prime Coin. Как и с товарами, это только
// СИД для первого запуска - дальше всё редактируется в админке, а новые
// строки (ежедневные задания, миссии, колесо удачи) добавляются сюда же
// без переписывания кода: достаточно новой группы в EARN_SEED.

const EARN_SEED = [
  // --- Hold'em ---
  { code: "holdem-quads", groupId: "holdem", groupTitle: "Hold'em", groupOrder: 1, title: "Каре", amount: 50, sortOrder: 1 },
  { code: "holdem-sf", groupId: "holdem", groupTitle: "Hold'em", groupOrder: 1, title: "Стрит-флеш", amount: 180, sortOrder: 2 },
  { code: "holdem-rf", groupId: "holdem", groupTitle: "Hold'em", groupOrder: 1, title: "Роял-флеш", amount: 200, sortOrder: 3 },

  // --- Omaha ---
  { code: "omaha-quads", groupId: "omaha", groupTitle: "Omaha", groupOrder: 2, title: "Каре", amount: 40, sortOrder: 1 },
  { code: "omaha-sf", groupId: "omaha", groupTitle: "Omaha", groupOrder: 2, title: "Стрит-флеш", amount: 180, sortOrder: 2 },
  { code: "omaha-rf", groupId: "omaha", groupTitle: "Omaha", groupOrder: 2, title: "Роял-флеш", amount: 150, sortOrder: 3 },

  // --- Турнирные достижения ---
  { code: "tour-ko", groupId: "tournament", groupTitle: "Турнирные достижения", groupOrder: 3, title: "Каждый нокаут", amount: 10, sortOrder: 1 },
  { code: "tour-itm", groupId: "tournament", groupTitle: "Турнирные достижения", groupOrder: 3, title: "Попадание в ITM", amount: 10, sortOrder: 2 },
  { code: "tour-ft", groupId: "tournament", groupTitle: "Турнирные достижения", groupOrder: 3, title: "Финальный стол", amount: 25, sortOrder: 3 },
  { code: "tour-win", groupId: "tournament", groupTitle: "Турнирные достижения", groupOrder: 3, title: "Победа в турнире", amount: 100, sortOrder: 4 },

  // --- Автоматические начисления (справочно, суммы считаются процентом) ---
  { code: "auto-rake", groupId: "auto", groupTitle: "Автоматически", groupOrder: 4, title: "5% Prime Coin от рейка (еженедельно)", amount: 0, sortOrder: 1 },
  { code: "auto-deposit", groupId: "auto", groupTitle: "Автоматически", groupOrder: 4, title: "5% Prime Coin от каждого депозита", amount: 0, sortOrder: 2 },
];

// Категории заявок на достижения (экран «Отправить достижение»).
const ACHIEVEMENT_CATEGORIES = [
  { id: "combo", title: "Комбинация", icon: "🃏" },
  { id: "tournament", title: "Турнир", icon: "🏆" },
  { id: "knockouts", title: "Нокауты", icon: "💥" },
  { id: "other", title: "Другое достижение", icon: "📷" },
];

// Настройки, которые админ может менять на лету, без релиза.
const DEFAULT_SETTINGS = {
  rake_percent: "5",
  deposit_percent: "5",
  coin_rate: "1", // 1 Prime Coin = 1 грн при покупке
  club_name: "PRIME POKER CLUB",
  buy_note: "После оформления заявки с вами свяжется администратор для оплаты. Prime Coin начисляются автоматически после подтверждения.",
};

module.exports = { EARN_SEED, ACHIEVEMENT_CATEGORIES, DEFAULT_SETTINGS };
