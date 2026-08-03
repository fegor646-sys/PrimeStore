/* ==========================================================
   PRIME STORE — Telegram Mini App
   ========================================================== */

const tg = window.Telegram?.WebApp;
const state = {
  tab: "home",
  profile: null,
  items: [],
  earn: [],
  orders: [],
  achievements: [],
  history: [],
  settings: {},
  categories: [],
  isAdmin: false,
  loading: true,
};

const $ = (sel) => document.querySelector(sel);
const screen = $("#screen");

function initData() {
  const value = tg?.initData || "";
  return value || "dev"; // "dev" работает только если на сервере задан DEV_USER_ID
}

async function api(path, { method = "GET", body } = {}) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  let url = path;
  if (method === "GET") {
    url += (path.includes("?") ? "&" : "?") + "initData=" + encodeURIComponent(initData());
  } else {
    opts.body = JSON.stringify({ ...(body || {}), initData: initData() });
  }
  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw Object.assign(new Error(data.error || "request_failed"), data);
  return data;
}

/* ---------------- утилиты ---------------- */
const fmt = (n) => Number(n || 0).toLocaleString("ru-RU");

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch (e) {
    return "";
  }
}

function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ORDER_STATUS = {
  pending: { label: "В обработке", icon: "🟡" },
  done: { label: "Выполнен", icon: "🟢" },
  canceled: { label: "Отменён", icon: "🔴" },
};
const REVIEW_STATUS = {
  pending: { label: "На проверке", icon: "🟡" },
  approved: { label: "Одобрено", icon: "🟢" },
  rejected: { label: "Отклонено", icon: "🔴" },
};

function toast(message, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = message;
  $("#toastHost").appendChild(el);
  setTimeout(() => el.remove(), 2600);
  if (kind === "bad") tg?.HapticFeedback?.notificationOccurred?.("error");
  if (kind === "good") tg?.HapticFeedback?.notificationOccurred?.("success");
}

const ERRORS = {
  insufficient_funds: "Недостаточно Prime Coin на балансе",
  unknown_item: "Товар недоступен",
  amount_too_small: "Сумма меньше минимальной",
  bad_amount: "Укажите корректное количество",
  invalid_init_data: "Откройте приложение через Telegram",
};

function showError(err) {
  toast(ERRORS[err?.error] || ERRORS[err?.message] || "Что-то пошло не так, попробуйте ещё раз", "bad");
}

/* ---------------- шторка ---------------- */
function openSheet(html) {
  const host = $("#sheetHost");
  host.innerHTML = `<div class="backdrop"></div><div class="sheet"><div class="grabber"></div>${html}</div>`;
  requestAnimationFrame(() => host.classList.add("open"));
  host.querySelector(".backdrop").onclick = closeSheet;
  return host.querySelector(".sheet");
}

function closeSheet() {
  const host = $("#sheetHost");
  host.classList.remove("open");
  setTimeout(() => (host.innerHTML = ""), 220);
}

/* ---------------- шапка баланса ---------------- */
function balanceBlock() {
  const p = state.profile || {};
  return `
    <div class="card balance-card">
      <img class="coin" src="assets/coin.png" alt="Prime Coin" />
      <div>
        <div class="balance-label">ВАШ БАЛАНС</div>
        <div class="balance-value">${fmt(p.balance)}</div>
        <div class="balance-unit"><i class="pc-badge">P</i> Prime Coin</div>
      </div>
    </div>
    <div class="cta-grid">
      <button class="cta secondary" data-act="buy">
        <span class="cta-ico">🛒</span><span>КУПИТЬ<small>Prime Coin</small></span>
      </button>
      <button class="cta gold" data-act="earn">
        <span class="cta-ico">💰</span><span>ЗАРАБОТАТЬ<small>Prime Coin</small></span>
      </button>
    </div>`;
}

function priceBlock(item) {
  const prefix = item.kind === "variant" || item.kind === "amount" ? '<span class="prefix">ОТ</span>' : "";
  const old = item.onSale ? `<span class="old">${fmt(item.basePrice)}</span>` : "";
  return `<div class="tile-price">${prefix}${old}${fmt(item.price)} <i class="pc-badge">P</i></div>`;
}

/* ---------------- экран: главная ---------------- */
function renderHome() {
  const tiles = state.items
    .map(
      (item) => `
      <div class="tile ${item.onSale ? "sale" : ""}" data-item="${esc(item.id)}">
        ${item.onSale ? '<span class="sale-flag">АКЦИЯ</span>' : ""}
        <img class="tile-img" src="${esc(item.image || "assets/items/vip.svg")}" alt="${esc(item.title)}" />
        <div class="tile-title">${esc(item.title)}</div>
        ${item.subtitle ? `<div class="tile-sub">${esc(item.subtitle)}</div>` : ""}
        ${priceBlock(item)}
      </div>`
    )
    .join("");

  const rake = state.settings.rake_percent || 5;
  const deposit = state.settings.deposit_percent || 5;

  screen.innerHTML = `
    ${balanceBlock()}
    <div class="section-title"><span class="rhomb">◆</span>Весь ассортимент<span class="rhomb">◆</span></div>
    ${tiles ? `<div class="grid">${tiles}</div>` : '<div class="empty">Ассортимент пока пуст.<br/>Администратор скоро добавит товары.</div>'}
    <div class="info-strip">
      <div class="info-cell"><b>${rake}% ОТ РЕЙКА</b><span>получай Prime Coin с каждой раздачи</span></div>
      <div class="info-cell"><b>${deposit}% ОТ ДЕПОЗИТА</b><span>получай Prime Coin с каждого депозита</span></div>
      <div class="info-cell"><b>ДОСТИЖЕНИЯ</b><span>получай Prime Coin за игровые достижения</span></div>
    </div>`;

  screen.querySelectorAll("[data-item]").forEach((el) => {
    el.onclick = () => openItem(el.dataset.item);
  });
}

/* ---------------- покупка товара ---------------- */
function openItem(id) {
  const item = state.items.find((i) => i.id === id);
  if (!item) return;
  tg?.HapticFeedback?.impactOccurred?.("light");

  let controls = "";
  if (item.kind === "variant") {
    const variants = item.meta.variants || [];
    const discount = item.onSale && item.basePrice > 0 ? item.price / item.basePrice : 1;
    controls = `<div class="quick" id="variants">${variants
      .map(
        (v, i) =>
          `<button data-label="${esc(v.label)}" data-price="${Math.round(v.price * discount)}" class="${i === 0 ? "active" : ""}">${esc(
            v.label
          )}</button>`
      )
      .join("")}</div>`;
  } else if (item.kind === "amount") {
    const min = item.meta.minAmount || 1;
    controls = `<label class="field"><span>Количество (${esc(item.meta.unit || "шт")}, минимум ${min})</span>
      <input type="number" id="qty" inputmode="numeric" min="${min}" step="${item.meta.step || 1}" value="${min}" /></label>`;
  }

  const sheet = openSheet(`
    <img class="sheet-hero" src="${esc(item.image || "assets/items/vip.svg")}" alt="" />
    <h3>${esc(item.title)}</h3>
    <p class="sheet-sub">${esc(item.description || item.subtitle || "")}</p>
    ${controls}
    <div class="spread" style="margin-bottom:14px">
      <span class="muted small">К списанию</span>
      <span class="amount" id="total">${fmt(item.price)} PC</span>
    </div>
    <button class="btn" id="confirm">Подтвердить покупку</button>
    <button class="btn ghost" id="cancel" style="margin-top:8px">Отмена</button>
  `);

  let variantLabel = item.meta.variants?.[0]?.label || null;
  const total = sheet.querySelector("#total");

  function recalc() {
    if (item.kind === "variant") {
      const active = sheet.querySelector("#variants button.active");
      total.textContent = fmt(active?.dataset.price || item.price) + " PC";
    } else if (item.kind === "amount") {
      const qty = Math.max(1, Number(sheet.querySelector("#qty").value) || 0);
      total.textContent = fmt(qty * item.price) + " PC";
    }
  }

  sheet.querySelectorAll("#variants button").forEach((btn) => {
    btn.onclick = () => {
      sheet.querySelectorAll("#variants button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      variantLabel = btn.dataset.label;
      recalc();
    };
  });
  sheet.querySelector("#qty")?.addEventListener("input", recalc);
  sheet.querySelector("#cancel").onclick = closeSheet;

  sheet.querySelector("#confirm").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const body = { itemId: item.id };
      if (item.kind === "variant") body.variantLabel = variantLabel;
      if (item.kind === "amount") body.quantity = Number(sheet.querySelector("#qty").value);

      const data = await api("/api/shop/buy", { method: "POST", body });
      Object.assign(state, { profile: data.profile, history: data.history, orders: data.orders });
      closeSheet();
      toast("Заказ оформлен, ожидайте подтверждения", "good");
      render();
    } catch (err) {
      e.target.disabled = false;
      showError(err);
    }
  };
}

/* ---------------- экран: баланс ---------------- */
function renderBalance() {
  const p = state.profile || {};
  screen.innerHTML = `
    ${balanceBlock()}
    <div class="section-title"><span class="rhomb">◆</span>Как заработать<span class="rhomb">◆</span></div>
    ${state.earn
      .map(
        (group) => `
      <div class="earn-group">
        <h4>${esc(group.title)}</h4>
        ${group.items
          .map(
            (rule) => `<div class="earn-row"><span>${esc(rule.title)}</span>${
              rule.amount > 0 ? `<b>${fmt(rule.amount)} PC</b>` : ""
            }</div>`
          )
          .join("")}
      </div>`
      )
      .join("")}
    <button class="btn" id="sendAchievement">Отправить достижение</button>
    <div class="section-title"><span class="rhomb">◆</span>Мои заявки<span class="rhomb">◆</span></div>
    ${
      state.achievements.length
        ? `<div class="list">${state.achievements
            .map((a) => {
              const cat = state.categories.find((c) => c.id === a.category);
              const st = REVIEW_STATUS[a.status] || REVIEW_STATUS.pending;
              return `<div class="line">
                <div class="line-main">
                  <div class="line-title">${cat?.icon || "🏅"} ${esc(cat?.title || a.category)}</div>
                  <div class="line-sub">${fmtDateTime(a.createdAt)} · ${st.icon} ${st.label}</div>
                </div>
                ${a.awarded > 0 ? `<span class="amount plus">+${fmt(a.awarded)}</span>` : ""}
              </div>`;
            })
            .join("")}</div>`
        : '<div class="empty">Заявок пока нет. Отправьте первое достижение и получите Prime Coin.</div>'
    }`;

  screen.querySelector("#sendAchievement").onclick = openAchievementForm;
}

/* ---------------- покупка Prime Coin ---------------- */
function openBuyCoins() {
  const rate = Number(state.settings.coin_rate) || 1;
  const sheet = openSheet(`
    <h3>Купить Prime Coin</h3>
    <p class="sheet-sub">${esc(state.settings.buy_note || "")}</p>
    <div class="quick" id="presets">
      ${[100, 300, 500, 1000, 2500].map((n) => `<button data-n="${n}">${fmt(n)}</button>`).join("")}
    </div>
    <label class="field"><span>Количество Prime Coin</span>
      <input type="number" id="coins" inputmode="numeric" min="1" value="500" /></label>
    <div class="spread" style="margin-bottom:14px">
      <span class="muted small">К оплате</span>
      <span class="amount" id="pay">${fmt(500 * rate)} грн</span>
    </div>
    <button class="btn" id="send">Оформить заявку</button>
    <button class="btn ghost" id="cancel" style="margin-top:8px">Отмена</button>
  `);

  const input = sheet.querySelector("#coins");
  const pay = sheet.querySelector("#pay");
  const recalc = () => (pay.textContent = fmt(Math.max(0, Number(input.value) || 0) * rate) + " грн");

  input.oninput = recalc;
  sheet.querySelectorAll("#presets button").forEach((b) => {
    b.onclick = () => {
      input.value = b.dataset.n;
      recalc();
    };
  });
  sheet.querySelector("#cancel").onclick = closeSheet;
  sheet.querySelector("#send").onclick = async (e) => {
    e.target.disabled = true;
    try {
      await api("/api/coins/request", { method: "POST", body: { amount: Number(input.value) } });
      closeSheet();
      toast("Заявка отправлена администратору", "good");
    } catch (err) {
      e.target.disabled = false;
      showError(err);
    }
  };
}

/* ---------------- форма достижения ---------------- */
function openAchievementForm() {
  const sheet = openSheet(`
    <h3>Отправить достижение</h3>
    <p class="sheet-sub">Выберите категорию, приложите скриншот — администратор проверит заявку и начислит Prime Coin.</p>
    <div class="cat-grid" id="cats">
      ${state.categories
        .map(
          (c, i) => `<div class="cat ${i === 0 ? "active" : ""}" data-cat="${esc(c.id)}"><span class="ico">${c.icon}</span>${esc(
            c.title
          )}</div>`
        )
        .join("")}
    </div>
    <div style="height:14px"></div>
    <img class="preview" id="preview" hidden alt="" />
    <label class="field"><span>Скриншот (необязательно, до 5 МБ)</span>
      <input type="file" id="photo" accept="image/*" /></label>
    <label class="field"><span>Комментарий (необязательно)</span>
      <textarea id="comment" placeholder="Например: каре на NL25, стол Prime 4"></textarea></label>
    <button class="btn" id="send">Отправить заявку</button>
    <button class="btn ghost" id="cancel" style="margin-top:8px">Отмена</button>
  `);

  let category = state.categories[0]?.id;
  let photo = null;

  sheet.querySelectorAll("[data-cat]").forEach((el) => {
    el.onclick = () => {
      sheet.querySelectorAll("[data-cat]").forEach((x) => x.classList.remove("active"));
      el.classList.add("active");
      category = el.dataset.cat;
    };
  });

  sheet.querySelector("#photo").onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast("Файл больше 5 МБ, выберите другой", "bad");
    const reader = new FileReader();
    reader.onload = () => {
      photo = reader.result;
      const preview = sheet.querySelector("#preview");
      preview.src = photo;
      preview.hidden = false;
    };
    reader.readAsDataURL(file);
  };

  sheet.querySelector("#cancel").onclick = closeSheet;
  sheet.querySelector("#send").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const data = await api("/api/achievements", {
        method: "POST",
        body: { category, comment: sheet.querySelector("#comment").value, photo },
      });
      state.achievements = data.achievements;
      closeSheet();
      toast("Заявка отправлена на проверку", "good");
      render();
    } catch (err) {
      e.target.disabled = false;
      showError(err);
    }
  };
}

/* ---------------- экран: акции ---------------- */
function renderPromos() {
  const sale = state.items.filter((i) => i.onSale);
  screen.innerHTML = `
    <div class="section-title"><span class="rhomb">◆</span>Акции<span class="rhomb">◆</span></div>
    ${
      sale.length
        ? `<div class="grid">${sale
            .map(
              (item) => `
        <div class="tile sale" data-item="${esc(item.id)}">
          <span class="sale-flag">АКЦИЯ</span>
          <img class="tile-img" src="${esc(item.image)}" alt="" />
          <div class="tile-title">${esc(item.title)}</div>
          <div class="tile-sub">${item.saleEnd ? "до " + fmtDate(item.saleEnd) : "бессрочно"}</div>
          ${priceBlock(item)}
        </div>`
            )
            .join("")}</div>`
        : '<div class="empty">Сейчас активных акций нет.<br/>Загляните позже — мы регулярно снижаем цены.</div>'
    }
    <div class="section-title"><span class="rhomb">◆</span>Мои заказы<span class="rhomb">◆</span></div>
    ${
      state.orders.length
        ? `<div class="list">${state.orders
            .map((o) => {
              const st = ORDER_STATUS[o.status] || ORDER_STATUS.pending;
              return `<div class="line">
                <div class="line-main">
                  <div class="line-title">${esc(o.itemTitle)}</div>
                  <div class="line-sub">${fmtDateTime(o.createdAt)} · ${st.icon} ${st.label}</div>
                </div>
                <span class="amount minus">−${fmt(o.price)}</span>
              </div>`;
            })
            .join("")}</div>`
        : '<div class="empty">Заказов пока нет.</div>'
    }`;

  screen.querySelectorAll("[data-item]").forEach((el) => (el.onclick = () => openItem(el.dataset.item)));
}

/* ---------------- экран: история ---------------- */
function renderHistory() {
  screen.innerHTML = `
    <div class="section-title"><span class="rhomb">◆</span>История операций<span class="rhomb">◆</span></div>
    ${
      state.history.length
        ? `<div class="list">${state.history
            .map(
              (t) => `<div class="line">
                <div class="line-main">
                  <div class="line-title">${esc(t.reason)}</div>
                  <div class="line-sub">${fmtDateTime(t.createdAt)}</div>
                </div>
                <span class="amount ${t.amount > 0 ? "plus" : "minus"}">${t.amount > 0 ? "+" : "−"}${fmt(Math.abs(t.amount))}</span>
              </div>`
            )
            .join("")}</div>`
        : '<div class="empty">Операций пока нет.<br/>Заработайте первые Prime Coin — и они появятся здесь.</div>'
    }`;
}

/* ---------------- экран: профиль ---------------- */
function renderProfile() {
  const p = state.profile || {};
  screen.innerHTML = `
    <div class="section-title"><span class="rhomb">◆</span>Личный кабинет<span class="rhomb">◆</span></div>
    <div class="card balance-card" style="margin-bottom:12px">
      <img class="coin" src="assets/coin.png" alt="" />
      <div>
        <div class="balance-label">ТЕКУЩИЙ БАЛАНС</div>
        <div class="balance-value">${fmt(p.balance)}</div>
        <div class="balance-unit"><i class="pc-badge">P</i> Prime Coin</div>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat"><b>${fmt(p.totalEarned)}</b><span>Всего заработано</span></div>
      <div class="stat"><b>${fmt(p.totalSpent)}</b><span>Всего потрачено</span></div>
      <div class="stat"><b>${fmt(p.ordersDone)}</b><span>Выполнено заказов</span></div>
      <div class="stat"><b>${fmt(p.achievementsApproved)}</b><span>Достижений подтверждено</span></div>
    </div>
    <div class="line" style="margin-top:12px">
      <div class="line-main">
        <div class="line-title">Дата регистрации</div>
        <div class="line-sub">${fmtDate(p.createdAt)}</div>
      </div>
    </div>
    <div class="line" style="margin-top:8px">
      <div class="line-main">
        <div class="line-title">ID в клубе</div>
        <div class="line-sub">${p.playerId ? esc(p.playerId) : "не указан — нажмите, чтобы добавить"}</div>
      </div>
      <button class="btn ghost" style="width:auto;padding:8px 14px" id="editId">Изменить</button>
    </div>
    ${state.isAdmin ? '<a class="btn secondary" style="display:block;text-align:center;text-decoration:none;margin-top:14px" href="admin.html">Админ-панель</a>' : ""}
  `;

  screen.querySelector("#editId").onclick = () => {
    const sheet = openSheet(`
      <h3>ID в клубе</h3>
      <p class="sheet-sub">Укажите ваш игровой ID — администратор будет видеть, кому выдавать заказы и начислять Prime Coin.</p>
      <label class="field"><span>Ваш ID</span><input id="pid" value="${esc(state.profile.playerId || "")}" maxlength="40" /></label>
      <button class="btn" id="save">Сохранить</button>
    `);
    sheet.querySelector("#save").onclick = async (e) => {
      e.target.disabled = true;
      try {
        const data = await api("/api/player-id", { method: "POST", body: { playerId: sheet.querySelector("#pid").value } });
        state.profile = data.profile;
        closeSheet();
        toast("Сохранено", "good");
        render();
      } catch (err) {
        e.target.disabled = false;
        showError(err);
      }
    };
  };
}

/* ---------------- навигация ---------------- */
const TABS = [
  { id: "home", label: "ГЛАВНАЯ", icon: '<path d="M3 10.5 12 3l9 7.5V21H3z"/>' },
  { id: "balance", label: "БАЛАНС", icon: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M9 10h6"/>' },
  { id: "promos", label: "АКЦИИ", icon: '<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13M12 8c-3 0-5-4-1-4 2 0 1 4 1 4zm0 0c3 0 5-4 1-4-2 0-1 4-1 4z"/>' },
  { id: "history", label: "ИСТОРИЯ", icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { id: "profile", label: "ПРОФИЛЬ", icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>' },
];

function renderTabs() {
  $("#tabbar").innerHTML = TABS.map(
    (t) => `<button class="tab ${state.tab === t.id ? "active" : ""}" data-tab="${t.id}">
      <span class="tab-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg></span>
      ${t.label}
    </button>`
  ).join("");

  $("#tabbar").querySelectorAll("[data-tab]").forEach((btn) => {
    btn.onclick = () => {
      state.tab = btn.dataset.tab;
      tg?.HapticFeedback?.selectionChanged?.();
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });
}

function render() {
  if (state.loading) {
    screen.innerHTML = '<div class="loader">ЗАГРУЗКА…</div>';
    return;
  }
  ({
    home: renderHome,
    balance: renderBalance,
    promos: renderPromos,
    history: renderHistory,
    profile: renderProfile,
  }[state.tab] || renderHome)();

  renderTabs();

  screen.querySelectorAll('[data-act="buy"]').forEach((b) => (b.onclick = openBuyCoins));
  screen.querySelectorAll('[data-act="earn"]').forEach(
    (b) =>
      (b.onclick = () => {
        state.tab = "balance";
        render();
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
  );

  const pendingCount =
    state.orders.filter((o) => o.status === "pending").length +
    state.achievements.filter((a) => a.status === "pending").length;
  $("#bellDot").hidden = pendingCount === 0;
}

/* ---------------- старт ---------------- */
async function boot() {
  try {
    tg?.ready?.();
    tg?.expand?.();
    if (tg?.setHeaderColor) tg.setHeaderColor("#05010D");
    if (tg?.setBackgroundColor) tg.setBackgroundColor("#05010D");
  } catch (e) {}

  render();
  try {
    const data = await api("/api/state");
    Object.assign(state, data, { loading: false });
    render();
  } catch (err) {
    state.loading = false;
    screen.innerHTML = `<div class="empty">Не удалось загрузить данные.<br/>${
      err?.error === "invalid_init_data" ? "Откройте приложение через бота в Telegram." : "Проверьте соединение и попробуйте снова."
    }</div>`;
  }
}

$("#bellBtn").onclick = () => {
  const pending = [
    ...state.orders.filter((o) => o.status === "pending").map((o) => `🟡 Заказ «${o.itemTitle}» в обработке`),
    ...state.achievements.filter((a) => a.status === "pending").map(() => "🟡 Заявка на достижение проверяется"),
  ];
  openSheet(`
    <h3>Уведомления</h3>
    <p class="sheet-sub">Статусы ваших активных заявок.</p>
    ${
      pending.length
        ? `<div class="list">${pending.map((t) => `<div class="line"><div class="line-main"><div class="line-title">${esc(t)}</div></div></div>`).join("")}</div>`
        : '<div class="empty">Активных заявок нет.</div>'
    }
  `);
};

$("#menuBtn").onclick = () => {
  openSheet(`
    <h3>${esc(state.settings.club_name || "PRIME POKER CLUB")}</h3>
    <p class="sheet-sub">Экосистема лояльности PRIME: зарабатывайте Prime Coin за игру и обменивайте их на фишки, билеты, VIP-статус и фирменный мерч.</p>
    <div class="list">
      <div class="line"><div class="line-main"><div class="line-title">${state.settings.rake_percent || 5}% от рейка</div><div class="line-sub">начисляется еженедельно</div></div></div>
      <div class="line"><div class="line-main"><div class="line-title">${state.settings.deposit_percent || 5}% от депозита</div><div class="line-sub">начисляется автоматически</div></div></div>
      <div class="line"><div class="line-main"><div class="line-title">Курс покупки</div><div class="line-sub">1 Prime Coin = ${state.settings.coin_rate || 1} грн</div></div></div>
    </div>
  `);
};

boot();
