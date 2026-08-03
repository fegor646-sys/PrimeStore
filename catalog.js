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
    description: "Один прокрут PRIME Mystery Slot. Після списання заявка йде адміністратору, прокрут нараховується в грі.",
    image: "assets/items/slot.svg",
    sortOrder: 1,
  },
  {
    id: "tournament-ticket",
    title: "ТУРНІРНИЙ КВИТОК",
    subtitle: "Будь-який бай-ін",
    kind: "variant",
    price: 110,
    description: "Квиток на турнір PRIME. Оберіть потрібний номінал бай-іну.",
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
    title: "ІГРОВІ ФІШКИ",
    subtitle: "1 PC = 1 грн",
    kind: "amount",
    price: 1,
    description: "Ігрові фішки на баланс у клубі. Курс: 1 Prime Coin = 1 грн фішок.",
    image: "assets/items/chips.svg",
    sortOrder: 3,
    meta: { minAmount: 100, step: 50, unit: "грн" },
  },
  {
    id: "vip-status",
    title: "VIP СТАТУС",
    subtitle: "30 днів",
    kind: "simple",
    price: 900,
    description: "VIP-статус у клубі PRIME на 30 днів: пріоритетна підтримка, спецпропозиції та закриті турніри.",
    image: "assets/items/vip.svg",
    sortOrder: 4,
  },
  {
    id: "merch-magnet",
    title: "МАГНІТ",
    subtitle: "Фірмовий",
    kind: "simple",
    price: 100,
    description: "Фірмовий магніт PRIME Poker Club.",
    image: "assets/items/magnet.svg",
    sortOrder: 5,
  },
  {
    id: "merch-mug",
    title: "ГОРНЯТКО",
    subtitle: "Фірмове",
    kind: "simple",
    price: 450,
    description: "Керамічне горнятко з логотипом PRIME.",
    image: "assets/items/mug.svg",
    sortOrder: 6,
  },
  {
    id: "merch-cap",
    title: "КЕПКА",
    subtitle: "Фірмове",
    kind: "simple",
    price: 700,
    description: "Кепка PRIME з вишитим логотипом.",
    image: "assets/items/cap.svg",
    sortOrder: 7,
  },
  {
    id: "merch-polo",
    title: "ПОЛО",
    subtitle: "Фірмове",
    kind: "simple",
    price: 2000,
    description: "Поло PRIME. Розмір уточнить адміністратор після оформлення замовлення.",
    image: "assets/items/polo.svg",
    sortOrder: 8,
  },
  {
    id: "merch-sign",
    title: "ВИВІСКА PRIME",
    subtitle: "Колекційна",
    kind: "simple",
    price: 2500,
    description: "Колекційна світна вивіска PRIME. Обмежена серія.",
    image: "assets/items/sign.svg",
    sortOrder: 9,
  },
];

module.exports = { SHOP_SEED };
