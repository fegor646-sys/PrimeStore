// Стартовый ассортимент магазина. Используется ОДИН раз - при первом запуске,
// чтобы наполнить таблицу shop_items. Дальше единственный источник правды - база,
// а весь ассортимент редактируется админом через CMS (/admin.html -> Товары).
//
// kind определяет поведение карточки:
//   simple  - обычный товар, фиксированная цена (мерч, VIP, магнит...)
//   slot    - прокрут PRIME Mystery Slot
//   amount  - товар с вводом количества (фишки: 1 PC = 1 грн)
//   variant - товар с выбором номинала (турнирные билеты)
//
// variants хранится в поле meta как JSON: [{ label, price }]

const SHOP_SEED = [
  {
    id: "slot-spin",
    title: "MYSTERY SLOT",
    subtitle: "1 прокрут",
    kind: "slot",
    price: 50,
    description: "Один прокрут PRIME Mystery Slot. После списания заявка уходит администратору, прокрут начисляется в игре.",
    image: "assets/items/slot.svg",
    sortOrder: 1,
  },
  {
    id: "tournament-ticket",
    title: "ТУРНИРНЫЙ БИЛЕТ",
    subtitle: "Любой бай-ин",
    kind: "variant",
    price: 110,
    description: "Билет на турнир PRIME. Выберите нужный номинал бай-ина.",
    image: "assets/items/ticket.svg",
    sortOrder: 2,
    meta: {
      variants: [
        { label: "110 UAH", price: 110 },
        { label: "220 UAH", price: 220 },
        { label: "550 UAH", price: 550 },
        { label: "990 UAH", price: 990 },
      ],
    },
  },
  {
    id: "game-chips",
    title: "ИГРОВЫЕ ФИШКИ",
    subtitle: "1 PC = 1 грн",
    kind: "amount",
    price: 1,
    description: "Игровые фишки на баланс в клубе. Курс: 1 Prime Coin = 1 грн фишек.",
    image: "assets/items/chips.svg",
    sortOrder: 3,
    meta: { minAmount: 100, step: 50, unit: "грн" },
  },
  {
    id: "vip-status",
    title: "VIP СТАТУС",
    subtitle: "30 дней",
    kind: "simple",
    price: 900,
    description: "VIP-статус в клубе PRIME на 30 дней: приоритетная поддержка, спецпредложения и закрытые турниры.",
    image: "assets/items/vip.svg",
    sortOrder: 4,
  },
  {
    id: "merch-magnet",
    title: "МАГНИТ",
    subtitle: "Фирменный",
    kind: "simple",
    price: 100,
    description: "Фирменный магнит PRIME Poker Club.",
    image: "assets/items/magnet.svg",
    sortOrder: 5,
  },
  {
    id: "merch-mug",
    title: "КРУЖКА",
    subtitle: "Фирменная",
    kind: "simple",
    price: 450,
    description: "Керамическая кружка с логотипом PRIME.",
    image: "assets/items/mug.svg",
    sortOrder: 6,
  },
  {
    id: "merch-cap",
    title: "КЕПКА",
    subtitle: "Фирменная",
    kind: "simple",
    price: 700,
    description: "Кепка PRIME с вышитым логотипом.",
    image: "assets/items/cap.svg",
    sortOrder: 7,
  },
  {
    id: "merch-polo",
    title: "ПОЛО",
    subtitle: "Фирменное",
    kind: "simple",
    price: 2000,
    description: "Поло PRIME. Размер уточнит администратор после оформления заказа.",
    image: "assets/items/polo.svg",
    sortOrder: 8,
  },
  {
    id: "merch-sign",
    title: "ВЫВЕСКА PRIME",
    subtitle: "Коллекционная",
    kind: "simple",
    price: 2500,
    description: "Коллекционная светящаяся вывеска PRIME. Ограниченная серия.",
    image: "assets/items/sign.svg",
    sortOrder: 9,
  },
];

module.exports = { SHOP_SEED };
