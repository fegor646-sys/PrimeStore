/* ==========================================================
   PRIME STORE — адмін-панель
   ========================================================== */

const tg = window.Telegram?.WebApp;
const root = document.getElementById("root");

const state = {
  page: "orders",
  stats: {},
  orders: [],
  achievements: [],
  coinRequests: [],
  items: [],
  rules: [],
  users: [],
  settings: {},
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("uk-UA");

function initData() {
  return tg?.initData || "dev";
}

async function api(path, { method = "GET", body } = {}) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  let url = path;
  if (method === "GET") url += (path.includes("?") ? "&" : "?") + "initData=" + encodeURIComponent(initData());
  else opts.body = JSON.stringify({ ...(body || {}), initData: initData() });

  const res = await fetch(url, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) throw Object.assign(new Error(data.error || "request_failed"), data);
  return data;
}

function toast(msg, kind = "") {
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.textContent = msg;
  $("#toastHost").appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function fail(err) {
  toast(err?.error === "not_admin" ? "Немає прав адміністратора" : "Не вдалося виконати дію", "bad");
}

function fmtDateTime(iso) {
  try {
    return new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return "";
  }
}

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

function who(row) {
  const name = row.firstName || "Гравець";
  const uname = row.username ? `@${row.username}` : "без юзернейму";
  return `${esc(name)} (${esc(uname)})<br/>Telegram ID: <code>${esc(row.userId)}</code>${
    row.playerId ? ` · ID у клубі: <code>${esc(row.playerId)}</code>` : ""
  }`;
}

/* ---------------- сторінки ---------------- */
const PAGES = [
  { id: "orders", title: "Замовлення", badge: () => state.stats.pendingOrders },
  { id: "achievements", title: "Досягнення", badge: () => state.stats.pendingAchievements },
  { id: "coins", title: "Купівля PC", badge: () => state.stats.pendingCoinRequests },
  { id: "items", title: "Товари" },
  { id: "rules", title: "Нарахування" },
  { id: "users", title: "Гравці" },
  { id: "settings", title: "Налаштування" },
];

function renderShell(inner) {
  root.innerHTML = `
    <div class="admin-head">
      <h1>PRIME STORE · АДМІН</h1>
      <a href="index.html">← у магазин</a>
    </div>
    <div class="stats">
      <div class="stat"><b>${fmt(state.stats.users)}</b><span>Гравців</span></div>
      <div class="stat"><b>${fmt(state.stats.coinsInCirculation)}</b><span>PC в обігу</span></div>
      <div class="stat"><b>${fmt(state.stats.activeItems)}</b><span>Товарів у продажу</span></div>
    </div>
    <div class="nav">
      ${PAGES.map((p) => {
        const n = p.badge ? p.badge() : 0;
        return `<button data-page="${p.id}" class="${state.page === p.id ? "active" : ""}">${p.title}${
          n ? `<span class="badge">${n}</span>` : ""
        }</button>`;
      }).join("")}
    </div>
    <div class="panel" id="panel">${inner}</div>`;

  root.querySelectorAll("[data-page]").forEach((b) => {
    b.onclick = () => {
      state.page = b.dataset.page;
      loadPage();
    };
  });
}

const empty = (text) => `<div class="empty">${text}</div>`;

/* ---------------- замовлення ---------------- */
function viewOrders() {
  if (!state.orders.length) return empty("Нових замовлень немає.");
  return state.orders
    .map(
      (o) => `
    <div class="rec">
      <div class="rec-top">
        <div>
          <div class="rec-title">#${o.id} · ${esc(o.itemTitle)}</div>
          <div class="rec-meta">${who(o)}<br/>${fmtDateTime(o.createdAt)} · списано <b>${fmt(o.price)} PC</b></div>
        </div>
        <span class="chip ${o.status}">${esc({ pending: "В обробці", done: "Виконано", canceled: "Скасовано" }[o.status])}</span>
      </div>
      ${
        o.status === "pending"
          ? `<div class="rec-actions">
              <button class="btn" data-order="${o.id}" data-status="done">Видати</button>
              <button class="btn ghost" data-order="${o.id}" data-status="canceled">Скасувати</button>
            </div>`
          : ""
      }
    </div>`
    )
    .join("");
}

function bindOrders() {
  root.querySelectorAll("[data-order]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await api(`/api/admin/orders/${btn.dataset.order}/status`, { method: "POST", body: { status: btn.dataset.status } });
        toast(btn.dataset.status === "done" ? "Замовлення видано" : "Замовлення скасовано, Prime Coin повернено", "good");
        loadPage();
      } catch (err) {
        btn.disabled = false;
        fail(err);
      }
    };
  });
}

/* ---------------- досягнення ---------------- */
const CATEGORY_TITLES = { combo: "🃏 Комбінація", tournament: "🏆 Турнір", knockouts: "💥 Нокаути", other: "📷 Інше досягнення" };

function viewAchievements() {
  if (!state.achievements.length) return empty("Заявок на перевірці немає.");
  return state.achievements
    .map(
      (a) => `
    <div class="rec">
      <div class="rec-top">
        <div>
          <div class="rec-title">#${a.id} · ${esc(CATEGORY_TITLES[a.category] || a.category)}</div>
          <div class="rec-meta">${who(a)}<br/>${fmtDateTime(a.createdAt)}${
        a.comment ? `<br/>Коментар: ${esc(a.comment)}` : ""
      }</div>
        </div>
        <span class="chip ${a.status}">${esc({ pending: "На перевірці", approved: "Схвалено", rejected: "Відхилено" }[a.status])}</span>
      </div>
      ${a.photo ? `<img class="rec-shot" src="${esc(a.photo)}" alt="Скриншот" />` : ""}
      ${
        a.status === "pending"
          ? `<div class="rec-actions">
              <button class="btn" data-approve="${a.id}">Схвалити й нарахувати</button>
              <button class="btn ghost" data-reject="${a.id}">Відхилити</button>
            </div>`
          : a.awarded
          ? `<div class="rec-meta">Нараховано: <b>${fmt(a.awarded)} PC</b></div>`
          : ""
      }
    </div>`
    )
    .join("");
}

function bindAchievements() {
  root.querySelectorAll("[data-approve]").forEach((btn) => {
    btn.onclick = () => {
      const id = btn.dataset.approve;
      // Суму адміністратор вказує сам — у ТЗ вона не фіксована і залежить
      // від того, що саме гравець надіслав на скриншоті.
      const sheet = openSheet(`
        <h3>Нарахувати Prime Coin</h3>
        <p class="sheet-sub">Вкажіть, скільки Prime Coin нарахувати гравцю за це досягнення.</p>
        <div class="quick" id="presets">
          ${[10, 25, 40, 50, 100, 150, 180, 200].map((n) => `<button data-n="${n}">${n}</button>`).join("")}
        </div>
        <label class="field"><span>Кількість Prime Coin</span><input type="number" id="amount" value="50" min="0" /></label>
        <label class="field"><span>Підпис в історії гравця</span><input id="title" value="Досягнення підтверджено" /></label>
        <button class="btn" id="save">Схвалити й нарахувати</button>
      `);
      sheet.querySelectorAll("#presets button").forEach((b) => (b.onclick = () => (sheet.querySelector("#amount").value = b.dataset.n)));
      sheet.querySelector("#save").onclick = async (e) => {
        e.target.disabled = true;
        try {
          await api(`/api/admin/achievements/${id}/resolve`, {
            method: "POST",
            body: { status: "approved", amount: sheet.querySelector("#amount").value, title: sheet.querySelector("#title").value },
          });
          closeSheet();
          toast("Досягнення підтверджено", "good");
          loadPage();
        } catch (err) {
          e.target.disabled = false;
          fail(err);
        }
      };
    };
  });

  root.querySelectorAll("[data-reject]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await api(`/api/admin/achievements/${btn.dataset.reject}/resolve`, { method: "POST", body: { status: "rejected" } });
        toast("Заявку відхилено");
        loadPage();
      } catch (err) {
        btn.disabled = false;
        fail(err);
      }
    };
  });
}

/* ---------------- заявки на купівлю PC ---------------- */
function viewCoins() {
  if (!state.coinRequests.length) return empty("Заявок на купівлю Prime Coin немає.");
  return state.coinRequests
    .map(
      (r) => `
    <div class="rec">
      <div class="rec-top">
        <div>
          <div class="rec-title">#${r.id} · ${fmt(r.amount)} PC</div>
          <div class="rec-meta">${who(r)}<br/>${fmtDateTime(r.createdAt)} · до сплати <b>${fmt(r.payAmount)} грн</b></div>
        </div>
        <span class="chip ${r.status}">${esc({ pending: "Очікує оплати", approved: "Оплачено", rejected: "Відхилено" }[r.status])}</span>
      </div>
      ${
        r.status === "pending"
          ? `<div class="rec-actions">
              <button class="btn" data-coin="${r.id}" data-status="approved">Оплату отримано</button>
              <button class="btn ghost" data-coin="${r.id}" data-status="rejected">Відхилити</button>
            </div>`
          : ""
      }
    </div>`
    )
    .join("");
}

function bindCoins() {
  root.querySelectorAll("[data-coin]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      try {
        await api(`/api/admin/coin-requests/${btn.dataset.coin}/resolve`, { method: "POST", body: { status: btn.dataset.status } });
        toast(btn.dataset.status === "approved" ? "Prime Coin нараховано" : "Заявку відхилено", "good");
        loadPage();
      } catch (err) {
        btn.disabled = false;
        fail(err);
      }
    };
  });
}

/* ---------------- CMS товарів ---------------- */
function viewItems() {
  const list = state.items
    .map(
      (i) => `
    <div class="rec ${i.active ? "" : "hidden-flag"}">
      <div class="item-row">
        <img src="${esc(i.image || "assets/items/vip.svg")}" alt="" />
        <div>
          <div class="rec-title">${esc(i.title)}${i.active ? "" : " · приховано"}</div>
          <div class="rec-meta">${esc(i.subtitle || "")}${i.onSale ? ` · <b style="color:var(--gold)">акція активна</b>` : ""}${
        i.salePrice != null && !i.onSale ? " · акція запланована/завершена" : ""
      }</div>
        </div>
        <div class="price">${i.onSale ? `<span class="old">${fmt(i.basePrice)}</span>` : ""}${fmt(i.price)} PC</div>
      </div>
      <div class="rec-actions">
        <button class="btn secondary" data-edit="${esc(i.id)}">Редагувати</button>
        <button class="btn ghost" data-toggle="${esc(i.id)}">${i.active ? "Приховати" : "Показати"}</button>
        <button class="btn ghost" data-del="${esc(i.id)}">Видалити</button>
      </div>
    </div>`
    )
    .join("");

  return `<div class="toolbar"><button class="btn" id="addItem">+ Новий товар</button></div>${
    list || empty("Товарів поки немає.")
  }`;
}

function itemForm(item) {
  const v = item || { kind: "simple", price: 0, active: true, meta: {} };
  const dt = (s) => (s ? String(s).slice(0, 16) : "");
  return `
    <h3>${item ? "Редагувати товар" : "Новий товар"}</h3>
    <p class="sheet-sub">Зміни з'являються в застосунку одразу після збереження.</p>
    <label class="field"><span>Назва</span><input id="f-title" value="${esc(v.title || "")}" /></label>
    <label class="field"><span>Підпис під назвою</span><input id="f-subtitle" value="${esc(v.subtitle || "")}" /></label>
    <label class="field"><span>Опис (необов'язково)</span><textarea id="f-description">${esc(v.description || "")}</textarea></label>
    <div class="grid2">
      <label class="field"><span>Ціна, PC</span><input type="number" id="f-price" value="${v.basePrice ?? v.price ?? 0}" min="0" /></label>
      <label class="field"><span>Порядок показу</span><input type="number" id="f-order" value="${v.sortOrder ?? 0}" /></label>
    </div>
    <label class="field"><span>Тип картки</span>
      <select id="f-kind">
        <option value="simple"${v.kind === "simple" ? " selected" : ""}>Звичайний товар</option>
        <option value="variant"${v.kind === "variant" ? " selected" : ""}>З вибором номіналу</option>
        <option value="amount"${v.kind === "amount" ? " selected" : ""}>З введенням кількості</option>
        <option value="slot"${v.kind === "slot" ? " selected" : ""}>Прокрут Mystery Slot</option>
      </select></label>
    <div class="section-title"><span class="rhomb">◆</span>Фото товару<span class="rhomb">◆</span></div>
    <img class="preview" id="f-preview" src="${esc(v.image || "assets/items/vip.svg")}" alt="" />
    <div class="toolbar">
      <button type="button" class="btn secondary" id="f-pick">Завантажити фото</button>
      <button type="button" class="btn ghost" id="f-clear">Прибрати фото</button>
    </div>
    <input type="file" id="f-file" accept="image/*" hidden />
    <p class="hint">Фото стискається автоматично. Можна замість завантаження вписати шлях або посилання вручну.</p>
    <label class="field"><span>Шлях або посилання на зображення</span><input id="f-image" value="${esc(v.image || "")}" placeholder="assets/items/vip.svg" /></label>
    <label class="field"><span>Номінали / параметри (JSON, необов'язково)</span>
      <textarea id="f-meta" placeholder='{"variants":[{"label":"110 UAH","price":110}]}'>${esc(
        v.meta && Object.keys(v.meta).length ? JSON.stringify(v.meta, null, 2) : ""
      )}</textarea></label>

    <div class="section-title"><span class="rhomb">◆</span>Акція<span class="rhomb">◆</span></div>
    <p class="hint">Залиште акційну ціну порожньою, щоб вимкнути акцію. Після дати завершення ціна повертається до звичайної автоматично.</p>
    <label class="field"><span>Акційна ціна, PC</span><input type="number" id="f-sale" value="${v.salePrice ?? ""}" min="0" /></label>
    <div class="grid2">
      <label class="field"><span>Початок акції</span><input type="datetime-local" id="f-saleStart" value="${dt(v.saleStart)}" /></label>
      <label class="field"><span>Завершення акції</span><input type="datetime-local" id="f-saleEnd" value="${dt(v.saleEnd)}" /></label>
    </div>
    <label class="field"><span>Статус</span>
      <select id="f-active">
        <option value="1"${v.active ? " selected" : ""}>Активний</option>
        <option value="0"${v.active ? "" : " selected"}>Прихований</option>
      </select></label>
    <button class="btn" id="f-save">Зберегти</button>`;
}

// Стискаємо зображення просто в браузері: з телефона прилітають знімки на 4-6 МБ,
// а в картці товару все одно показується квадрат ~150 px.
function shrinkImage(file, maxSide = 700) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        // PNG зберігає прозорість — вона потрібна іконкам товарів на темному тлі.
        const isPng = /png/i.test(file.type);
        resolve(canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.86));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Вішає завантаження фото на форму товару: кнопка → вибір файла → стиснення →
// відправлення на сервер → у поле шляху підставляється адреса збереженого файла.
function bindImageUpload(sheet) {
  const field = sheet.querySelector("#f-image");
  const preview = sheet.querySelector("#f-preview");
  const file = sheet.querySelector("#f-file");
  const pick = sheet.querySelector("#f-pick");

  const startedWith = field.value;

  field.oninput = () => (preview.src = field.value || "assets/items/vip.svg");
  pick.onclick = () => file.click();

  sheet.querySelector("#f-clear").onclick = () => {
    field.value = "";
    preview.src = "assets/items/vip.svg";
  };

  file.onchange = async () => {
    const chosen = file.files[0];
    if (!chosen) return;
    if (chosen.size > 12 * 1024 * 1024) return toast("Файл занадто великий, оберіть інший", "bad");

    pick.disabled = true;
    pick.textContent = "Завантажуємо…";
    try {
      const image = await shrinkImage(chosen);
      preview.src = image;
      const data = await api("/api/admin/upload", { method: "POST", body: { image, replace: startedWith } });
      field.value = data.path;
      preview.src = data.path + "?v=" + Date.now();
      toast("Фото завантажено", "good");
    } catch (err) {
      preview.src = field.value || "assets/items/vip.svg";
      toast("Не вдалося завантажити фото", "bad");
    } finally {
      pick.disabled = false;
      pick.textContent = "Завантажити фото";
      file.value = "";
    }
  };
}

function collectItemForm(sheet) {
  const get = (id) => sheet.querySelector("#f-" + id).value.trim();
  let meta = {};
  const rawMeta = get("meta");
  if (rawMeta) {
    try {
      meta = JSON.parse(rawMeta);
    } catch (e) {
      toast("Перевірте JSON у полі номіналів", "bad");
      return null;
    }
  }
  const toIso = (val) => (val ? new Date(val).toISOString() : null);
  return {
    title: get("title"),
    subtitle: get("subtitle") || null,
    description: get("description") || null,
    kind: get("kind"),
    price: Number(get("price")) || 0,
    salePrice: get("sale") === "" ? null : Number(get("sale")),
    saleStart: toIso(get("saleStart")),
    saleEnd: toIso(get("saleEnd")),
    image: get("image") || null,
    meta,
    active: get("active") === "1",
    sortOrder: Number(get("order")) || 0,
  };
}

function bindItems() {
  $("#addItem").onclick = () => {
    const sheet = openSheet(itemForm(null));
    bindImageUpload(sheet);
    sheet.querySelector("#f-save").onclick = async (e) => {
      const body = collectItemForm(sheet);
      if (!body) return;
      if (!body.title) return toast("Вкажіть назву", "bad");
      e.target.disabled = true;
      try {
        await api("/api/admin/items", { method: "POST", body });
        closeSheet();
        toast("Товар додано", "good");
        loadPage();
      } catch (err) {
        e.target.disabled = false;
        fail(err);
      }
    };
  };

  root.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.onclick = () => {
      const item = state.items.find((i) => i.id === btn.dataset.edit);
      const sheet = openSheet(itemForm(item));
      bindImageUpload(sheet);
      sheet.querySelector("#f-save").onclick = async (e) => {
        const body = collectItemForm(sheet);
        if (!body) return;
        e.target.disabled = true;
        try {
          await api(`/api/admin/items/${encodeURIComponent(item.id)}`, { method: "PUT", body });
          closeSheet();
          toast("Зміни збережено", "good");
          loadPage();
        } catch (err) {
          e.target.disabled = false;
          fail(err);
        }
      };
    };
  });

  root.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.onclick = async () => {
      const item = state.items.find((i) => i.id === btn.dataset.toggle);
      btn.disabled = true;
      try {
        await api(`/api/admin/items/${encodeURIComponent(item.id)}`, { method: "PUT", body: { active: !item.active } });
        toast(item.active ? "Товар приховано" : "Товар знову в продажу", "good");
        loadPage();
      } catch (err) {
        btn.disabled = false;
        fail(err);
      }
    };
  });

  root.querySelectorAll("[data-del]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Видалити товар назавжди? Краще приховати його — тоді історію замовлень буде простіше читати.")) return;
      btn.disabled = true;
      try {
        await api(`/api/admin/items/${encodeURIComponent(btn.dataset.del)}`, { method: "DELETE" });
        toast("Товар видалено");
        loadPage();
      } catch (err) {
        btn.disabled = false;
        fail(err);
      }
    };
  });
}

/* ---------------- правила нарахування ---------------- */
function viewRules() {
  const list = state.rules
    .map(
      (r) => `
    <div class="rec ${r.active ? "" : "hidden-flag"}">
      <div class="item-row" style="grid-template-columns:1fr auto">
        <div>
          <div class="rec-title">${esc(r.title)}</div>
          <div class="rec-meta">${esc(r.groupTitle)}${r.active ? "" : " · приховано"}</div>
        </div>
        <div class="price">${fmt(r.amount)} PC</div>
      </div>
      <div class="rec-actions">
        <button class="btn secondary" data-rule-edit="${r.id}">Редагувати</button>
        <button class="btn ghost" data-rule-toggle="${r.id}">${r.active ? "Приховати" : "Показати"}</button>
        <button class="btn ghost" data-rule-del="${r.id}">Видалити</button>
      </div>
    </div>`
    )
    .join("");
  return `<div class="toolbar"><button class="btn" id="addRule">+ Новий спосіб заробітку</button></div>${
    list || empty("Правил поки немає.")
  }`;
}

function ruleForm(rule) {
  const v = rule || { groupTitle: "Інше", amount: 0, active: true, sortOrder: 0 };
  return `
    <h3>${rule ? "Редагувати" : "Новий спосіб заробітку"}</h3>
    <p class="sheet-sub">Рядок з'явиться на екрані «Отримати Prime Coin» — так додаються нові досягнення, завдання й місії.</p>
    <label class="field"><span>Розділ</span><input id="r-group" value="${esc(v.groupTitle)}" placeholder="Hold'em / Турніри / Щоденні завдання" /></label>
    <label class="field"><span>Назва</span><input id="r-title" value="${esc(v.title || "")}" /></label>
    <div class="grid2">
      <label class="field"><span>Нагорода, PC</span><input type="number" id="r-amount" value="${v.amount}" min="0" /></label>
      <label class="field"><span>Порядок</span><input type="number" id="r-order" value="${v.sortOrder}" /></label>
    </div>
    <button class="btn" id="r-save">Зберегти</button>`;
}

function bindRules() {
  $("#addRule").onclick = () => {
    const sheet = openSheet(ruleForm(null));
    sheet.querySelector("#r-save").onclick = async (e) => {
      const title = sheet.querySelector("#r-title").value.trim();
      if (!title) return toast("Вкажіть назву", "bad");
      e.target.disabled = true;
      try {
        const groupTitle = sheet.querySelector("#r-group").value.trim() || "Інше";
        await api("/api/admin/earn-rules", {
          method: "POST",
          body: {
            title,
            groupTitle,
            groupId: groupTitle.toLowerCase().replace(/\s+/g, "-"),
            amount: sheet.querySelector("#r-amount").value,
            sortOrder: sheet.querySelector("#r-order").value,
          },
        });
        closeSheet();
        toast("Додано", "good");
        loadPage();
      } catch (err) {
        e.target.disabled = false;
        fail(err);
      }
    };
  };

  root.querySelectorAll("[data-rule-edit]").forEach((btn) => {
    btn.onclick = () => {
      const rule = state.rules.find((r) => String(r.id) === btn.dataset.ruleEdit);
      const sheet = openSheet(ruleForm(rule));
      sheet.querySelector("#r-save").onclick = async (e) => {
        e.target.disabled = true;
        try {
          await api(`/api/admin/earn-rules/${rule.id}`, {
            method: "PUT",
            body: {
              title: sheet.querySelector("#r-title").value,
              groupTitle: sheet.querySelector("#r-group").value,
              amount: sheet.querySelector("#r-amount").value,
              sortOrder: sheet.querySelector("#r-order").value,
            },
          });
          closeSheet();
          toast("Збережено", "good");
          loadPage();
        } catch (err) {
          e.target.disabled = false;
          fail(err);
        }
      };
    };
  });

  root.querySelectorAll("[data-rule-toggle]").forEach((btn) => {
    btn.onclick = async () => {
      const rule = state.rules.find((r) => String(r.id) === btn.dataset.ruleToggle);
      try {
        await api(`/api/admin/earn-rules/${rule.id}`, { method: "PUT", body: { active: !rule.active } });
        loadPage();
      } catch (err) {
        fail(err);
      }
    };
  });

  root.querySelectorAll("[data-rule-del]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Видалити рядок?")) return;
      try {
        await api(`/api/admin/earn-rules/${btn.dataset.ruleDel}`, { method: "DELETE" });
        loadPage();
      } catch (err) {
        fail(err);
      }
    };
  });
}

/* ---------------- гравці та нарахування ---------------- */
function viewUsers() {
  const list = state.users
    .map(
      (u) => `
    <div class="rec">
      <div class="item-row" style="grid-template-columns:1fr auto">
        <div>
          <div class="rec-title">${esc(u.firstName || "Гравець")} ${u.username ? esc("@" + u.username) : ""}</div>
          <div class="rec-meta">Telegram ID: <code>${esc(u.id)}</code>${u.playerId ? ` · ID у клубі: <code>${esc(u.playerId)}</code>` : ""}</div>
        </div>
        <div class="price">${fmt(u.balance)} PC</div>
      </div>
      <div class="rec-actions">
        <button class="btn secondary" data-accrue="${esc(u.id)}">Нарахувати</button>
      </div>
    </div>`
    )
    .join("");

  return `
    <label class="field"><span>Пошук за іменем, юзернеймом або ID</span><input id="userSearch" placeholder="Почніть вводити…" /></label>
    ${list || empty("Гравців не знайдено.")}`;
}

function bindUsers() {
  const search = $("#userSearch");
  let timer;
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const data = await api("/api/admin/users?q=" + encodeURIComponent(search.value));
        state.users = data.users;
        const value = search.value;
        renderShell(viewUsers());
        bindUsers();
        const next = $("#userSearch");
        next.value = value;
        next.focus();
      } catch (err) {
        fail(err);
      }
    }, 300);
  };

  root.querySelectorAll("[data-accrue]").forEach((btn) => {
    btn.onclick = () => {
      const userId = btn.dataset.accrue;
      const s = state.settings;
      const sheet = openSheet(`
        <h3>Нарахувати Prime Coin</h3>
        <p class="sheet-sub">За рейк і депозит сума рахується автоматично: ${s.rake_percent || 5}% і ${
        s.deposit_percent || 5
      }% відповідно.</p>
        <label class="field"><span>Тип нарахування</span>
          <select id="a-mode">
            <option value="rake">За рейк (${s.rake_percent || 5}% від суми)</option>
            <option value="deposit">За депозит (${s.deposit_percent || 5}% від суми)</option>
            <option value="manual">Вручну (точна кількість PC)</option>
          </select></label>
        <label class="field"><span id="a-label">Сума рейка, грн</span><input type="number" id="a-value" value="1000" /></label>
        <label class="field" id="a-reason-field" hidden><span>Підпис в історії</span><input id="a-reason" value="Нарахування адміністратором" /></label>
        <button class="btn" id="a-save">Нарахувати</button>
      `);

      const mode = sheet.querySelector("#a-mode");
      mode.onchange = () => {
        const manual = mode.value === "manual";
        sheet.querySelector("#a-label").textContent = manual
          ? "Кількість Prime Coin (мінус — списання)"
          : mode.value === "rake"
          ? "Сума рейка, грн"
          : "Сума депозиту, грн";
        sheet.querySelector("#a-reason-field").hidden = !manual;
      };

      sheet.querySelector("#a-save").onclick = async (e) => {
        e.target.disabled = true;
        try {
          const data = await api("/api/admin/balance", {
            method: "POST",
            body: {
              targetUserId: userId,
              mode: mode.value,
              value: sheet.querySelector("#a-value").value,
              reason: sheet.querySelector("#a-reason")?.value,
            },
          });
          closeSheet();
          toast(data.coins ? `Нараховано ${fmt(data.coins)} PC` : "Баланс оновлено", "good");
          loadPage();
        } catch (err) {
          e.target.disabled = false;
          fail(err);
        }
      };
    };
  });
}

/* ---------------- налаштування ---------------- */
function viewSettings() {
  const s = state.settings;
  return `
    <div class="rec">
      <p class="hint" style="margin-top:0">Відсотки застосовуються при нарахуванні за рейк і депозит. Курс використовується для розрахунку суми до сплати при купівлі Prime Coin.</p>
      <div class="grid2">
        <label class="field"><span>% від рейка</span><input type="number" id="s-rake" value="${esc(s.rake_percent)}" /></label>
        <label class="field"><span>% від депозиту</span><input type="number" id="s-deposit" value="${esc(s.deposit_percent)}" /></label>
      </div>
      <label class="field"><span>Курс: 1 Prime Coin = X грн</span><input type="number" step="0.1" id="s-rate" value="${esc(s.coin_rate)}" /></label>
      <label class="field"><span>Назва клубу</span><input id="s-club" value="${esc(s.club_name)}" /></label>
      <label class="field"><span>Текст при купівлі Prime Coin</span><textarea id="s-note">${esc(s.buy_note)}</textarea></label>
      <button class="btn" id="saveSettings">Зберегти налаштування</button>
    </div>`;
}

function bindSettings() {
  $("#saveSettings").onclick = async (e) => {
    e.target.disabled = true;
    try {
      const data = await api("/api/admin/settings", {
        method: "POST",
        body: {
          settings: {
            rake_percent: $("#s-rake").value,
            deposit_percent: $("#s-deposit").value,
            coin_rate: $("#s-rate").value,
            club_name: $("#s-club").value,
            buy_note: $("#s-note").value,
          },
        },
      });
      state.settings = data.settings;
      toast("Налаштування збережено", "good");
    } catch (err) {
      fail(err);
    } finally {
      e.target.disabled = false;
    }
  };
}

/* ---------------- завантаження ---------------- */
async function loadPage() {
  try {
    const overview = await api("/api/admin/overview");
    Object.assign(state, {
      stats: overview.stats,
      orders: overview.orders,
      achievements: overview.achievements,
      coinRequests: overview.coinRequests,
      settings: overview.settings,
    });

    if (state.page === "items") state.items = (await api("/api/admin/items")).items;
    if (state.page === "rules") state.rules = (await api("/api/admin/earn-rules")).rules;
    if (state.page === "users") state.users = (await api("/api/admin/users")).users;

    const views = {
      orders: viewOrders,
      achievements: viewAchievements,
      coins: viewCoins,
      items: viewItems,
      rules: viewRules,
      users: viewUsers,
      settings: viewSettings,
    };
    renderShell(views[state.page]());

    ({
      orders: bindOrders,
      achievements: bindAchievements,
      coins: bindCoins,
      items: bindItems,
      rules: bindRules,
      users: bindUsers,
      settings: bindSettings,
    }[state.page] || (() => {}))();
  } catch (err) {
    root.innerHTML = `<div class="empty">${
      err?.error === "not_admin"
        ? "У вас немає прав адміністратора.<br/>Додайте свій Telegram ID у змінну ADMIN_IDS."
        : "Відкрийте адмін-панель через Telegram-бота."
    }</div>`;
  }
}

try {
  tg?.ready?.();
  tg?.expand?.();
} catch (e) {}

loadPage();
