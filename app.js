const SUPABASE_URL = "https://allcnnxedveesyyvqavb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_H1Z7eE29GXki-Txjk2yNTA_IhOiKNpC";
const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const months = ["janeiro", "fevereiro", "marco", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

let user = null;
let householdId = localStorage.getItem("duofinV2HouseholdId") || "";
let inviteCode = localStorage.getItem("duofinV2InviteCode") || "";
let activeView = "home";
let launchType = "expense";
let editingCardId = "";
let editingPurchaseId = "";
let editingEntryId = "";
let editingFixedId = "";
let editingCardFixedId = "";
let showInviteCode = false;
let valuesHidden = localStorage.getItem("duofinV2HideValues") === "1";
let state = emptyState();
let lastSaved = "";
let lastSaveError = "";
let saveQueue = Promise.resolve();
let sessionTimer = null;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function userHouseholdKey() {
  return user?.id ? `duofinV2HouseholdId:${user.id}` : "duofinV2HouseholdId";
}

function userInviteKey() {
  return user?.id ? `duofinV2InviteCode:${user.id}` : "duofinV2InviteCode";
}

function localStateKey() {
  return householdId ? `duofinV2Local:${householdId}` : "duofinV2Local";
}

function rememberHousehold() {
  if (!householdId) return;

  localStorage.setItem("duofinV2HouseholdId", householdId);
  localStorage.setItem(userHouseholdKey(), householdId);

  if (inviteCode) {
    localStorage.setItem("duofinV2InviteCode", inviteCode);
    localStorage.setItem(userInviteKey(), inviteCode);
  }
}

function hasFinancialData(data) {
  return ["cards", "entries", "cardPurchases", "fixedBills", "cardFixedBills", "cardPayments", "goals"].some((key) => Array.isArray(data?.[key]) && data[key].length);
}

function readLocalBackup() {
  const keys = [localStateKey(), "duofinV2Local"].filter(Boolean);

  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;

      const parsed = normalize(JSON.parse(raw));
      if (hasFinancialData(parsed)) return parsed;
    } catch (_error) {}
  }

  return null;
}

function emptyState() {
  const now = new Date();

  return {
    selectedMonth: months[now.getMonth()],
    selectedYear: now.getFullYear(),
    profile: {
      personOne: "Pessoa 1",
      personTwo: "Pessoa 2",
      salaryOne: 0,
      salaryTwo: 0,
      salaryDayOne: 5,
      salaryDayTwo: 5
    },
    categoriesIncome: ["Salario", "Renda extra", "Pix recebido", "Reembolso"],
    categoriesExpense: ["Mercado", "Moradia", "Internet", "Transporte", "Saude", "Lazer", "Presente", "Outros"],
    accounts: [],
    cards: [],
    entries: [],
    cardPurchases: [],
    fixedBills: [],
    cardFixedBills: [],
    cardPayments: [],
    goals: [],
    notifications: [],
    meta: {}
  };
}

function normalize(raw) {
  const clean = { ...emptyState(), ...(raw && typeof raw === "object" ? raw : {}) };

  clean.profile = { ...emptyState().profile, ...(clean.profile || {}) };

  ["accounts", "cards", "entries", "cardPurchases", "fixedBills", "cardFixedBills", "cardPayments", "goals", "notifications"].forEach((key) => {
    clean[key] = Array.isArray(clean[key]) ? clean[key] : [];
  });

  clean.categoriesIncome = Array.isArray(clean.categoriesIncome) && clean.categoriesIncome.length ? clean.categoriesIncome : emptyState().categoriesIncome;
  clean.categoriesExpense = Array.isArray(clean.categoriesExpense) && clean.categoriesExpense.length ? clean.categoriesExpense : emptyState().categoriesExpense;
  clean.selectedMonth = months.includes(clean.selectedMonth) ? clean.selectedMonth : emptyState().selectedMonth;
  clean.selectedYear = Number(clean.selectedYear || new Date().getFullYear());
  clean.meta = clean.meta && typeof clean.meta === "object" ? clean.meta : {};

  clean.cards = clean.cards.map((card) => ({
    id: card.id || crypto.randomUUID(),
    name: card.name || "Cartao",
    owner: card.owner || clean.profile.personOne,
    limit: Number(card.limit || 0),
    closeDay: Number(card.closeDay || 20),
    dueDay: Number(card.dueDay || 10)
  }));

  clean.entries = clean.entries.map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    type: entry.type === "income" ? "income" : "expense",
    date: entry.date || today(),
    month: entry.month || dateInfo(entry.date).month,
    year: Number(entry.year || dateInfo(entry.date).year),
    description: entry.description || "Lancamento",
    category: entry.category || "Outros",
    value: Number(entry.value || 0),
    person: entry.person || clean.profile.personOne,
    status: entry.status || "paid"
  }));

  clean.cardPurchases = clean.cardPurchases.map((purchase) => {
    const invoice = invoiceFor(purchase.date || today(), purchase.card || "");

    return {
      id: purchase.id || crypto.randomUUID(),
      card: purchase.card || "",
      date: purchase.date || today(),
      firstMonth: purchase.firstMonth || invoice.month,
      firstYear: Number(purchase.firstYear || invoice.year),
      description: purchase.description || "Compra no cartao",
      category: purchase.category || "Outros",
      value: Number(purchase.value || 0),
      parts: Math.max(1, Number(purchase.parts || 1)),
      paidPeriods: Array.isArray(purchase.paidPeriods) ? purchase.paidPeriods : []
    };
  });

  clean.fixedBills = clean.fixedBills.map((bill) => ({
    id: bill.id || crypto.randomUUID(),
    description: bill.description || "Despesa fixa",
    category: bill.category || "Outros",
    person: bill.person || clean.profile.personOne,
    value: Number(bill.value || 0),
    dueDay: Number(bill.dueDay || 1),
    paidPeriods: Array.isArray(bill.paidPeriods) ? bill.paidPeriods : [],
    active: bill.active !== false
  }));

  clean.cardFixedBills = clean.cardFixedBills.map((bill) => ({
    id: bill.id || crypto.randomUUID(),
    card: bill.card || "",
    description: bill.description || "Fixo no cartao",
    category: bill.category || "Outros",
    value: Number(bill.value || 0),
    chargeDay: Number(bill.chargeDay || 1),
    paidPeriods: Array.isArray(bill.paidPeriods) ? bill.paidPeriods : [],
    active: bill.active !== false
  }));

  clean.cardPayments = clean.cardPayments.map((payment) => ({
    id: payment.id || crypto.randomUUID(),
    card: payment.card || "",
    month: payment.month || clean.selectedMonth,
    year: Number(payment.year || clean.selectedYear),
    value: Number(payment.value || 0),
    date: payment.date || today()
  }));

  clean.notifications = clean.notifications.map((item) => ({
    id: item.id || crypto.randomUUID(),
    message: item.message || "Atualizacao no cofre",
    view: item.view || "home",
    createdAt: item.createdAt || new Date().toISOString(),
    readBy: Array.isArray(item.readBy) ? item.readBy : []
  }));

  return clean;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateInfo(value) {
  const date = new Date(`${value || ""}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { month: state.selectedMonth, year: state.selectedYear };

  return {
    month: months[date.getUTCMonth()],
    year: date.getUTCFullYear()
  };
}

function monthIndex(month) {
  const index = months.indexOf(String(month || "").toLowerCase());
  return index < 0 ? 0 : index;
}

function periodKey(month = state.selectedMonth, year = state.selectedYear) {
  return `${year}:${month}`;
}

function same(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function brl(value) {
  if (valuesHidden) return "R$ ***";
  return money.format(Number(value || 0));
}

function total(items) {
  return items.reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function people() {
  return [state.profile.personOne || "Pessoa 1", state.profile.personTwo || "Pessoa 2", "Ambos"];
}

function cardNames() {
  return state.cards.map((card) => card.name);
}

function currentEntries() {
  return state.entries.filter((entry) => entry.month === state.selectedMonth && Number(entry.year) === Number(state.selectedYear));
}

function invoiceFor(dateValue, cardName) {
  const card = state.cards.find((item) => same(item.name, cardName));
  const date = new Date(`${dateValue || today()}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return {
      month: state.selectedMonth,
      year: state.selectedYear
    };
  }

  const closeDay = Number(card?.closeDay || 20);
  const invoiceDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + (date.getUTCDate() > closeDay ? 1 : 0), 1));

  return {
    month: months[invoiceDate.getUTCMonth()],
    year: invoiceDate.getUTCFullYear()
  };
}

function dateForDay(day, month, year) {
  const index = monthIndex(month);
  const lastDay = new Date(Number(year), index + 1, 0).getDate();

  return new Date(Date.UTC(Number(year), index, Math.min(Number(day || 1), lastDay))).toISOString().slice(0, 10);
}

function purchaseParts(purchase) {
  const start = monthIndex(purchase.firstMonth);
  const firstYear = Number(purchase.firstYear || state.selectedYear);
  const purchaseDate = new Date(`${purchase.date || today()}T00:00:00Z`);
  const day = Number.isNaN(purchaseDate.getTime()) ? 1 : purchaseDate.getUTCDate();
  const partValue = Number(purchase.value || 0) / Math.max(1, Number(purchase.parts || 1));

  return Array.from({ length: Math.max(1, Number(purchase.parts || 1)) }, (_, index) => {
    const absolute = start + index;
    const month = months[absolute % 12];
    const year = firstYear + Math.floor(absolute / 12);
    const key = periodKey(month, year);

    return {
      ...purchase,
      source: "purchase",
      part: index + 1,
      month,
      year,
      value: partValue,
      date: dateForDay(day, month, year),
      paid: (purchase.paidPeriods || []).includes(key)
    };
  });
}

function cardFixedItems(cardName, month = state.selectedMonth, year = state.selectedYear) {
  const targetMonth = monthIndex(month);
  const targetYear = Number(year);

  const candidates = [
    { monthIndex: targetMonth, year: targetYear },
    { monthIndex: (targetMonth + 11) % 12, year: targetYear - (targetMonth === 0 ? 1 : 0) }
  ];

  return state.cardFixedBills
    .filter((bill) => bill.active !== false && (!cardName || same(bill.card, cardName)))
    .flatMap((bill) =>
      candidates
        .map((candidate) => {
          const date = dateForDay(bill.chargeDay, months[candidate.monthIndex], candidate.year);
          const invoice = invoiceFor(date, bill.card);

          if (invoice.month !== month || Number(invoice.year) !== targetYear) return null;

          const key = periodKey(month, targetYear);

          return {
            ...bill,
            source: "fixed-card",
            month,
            year: targetYear,
            date,
            paid: (bill.paidPeriods || []).includes(key)
          };
        })
        .filter(Boolean)
    );
}

function cardItems(cardName) {
  const purchases = state.cardPurchases
    .filter((purchase) => same(purchase.card, cardName))
    .flatMap(purchaseParts)
    .filter((part) => part.month === state.selectedMonth && Number(part.year) === Number(state.selectedYear));

  return [...purchases, ...cardFixedItems(cardName)];
}

function cardPayments(cardName) {
  return state.cardPayments.filter((payment) => same(payment.card, cardName) && payment.month === state.selectedMonth && Number(payment.year) === Number(state.selectedYear));
}

function cardInvoice(cardName) {
  const items = cardItems(cardName);
  const amount = total(items);
  const paidByMark = total(items.filter((item) => item.paid));
  const paidByPayment = total(cardPayments(cardName));

  return {
    items,
    amount,
    paid: Math.min(amount, paidByMark + paidByPayment),
    open: Math.max(0, amount - paidByMark - paidByPayment)
  };
}

function cardAffectsBalance(card) {
  const now = new Date();
  const selectedMonth = monthIndex(state.selectedMonth);
  const selectedYear = Number(state.selectedYear);

  if (selectedYear < now.getFullYear()) return true;
  if (selectedYear > now.getFullYear()) return false;
  if (selectedMonth < now.getMonth()) return true;
  if (selectedMonth > now.getMonth()) return false;

  return now.getDate() >= Number(card.closeDay || 20);
}

function cardUsedLimit(cardName) {
  const openPurchases = state.cardPurchases
    .filter((purchase) => same(purchase.card, cardName))
    .flatMap(purchaseParts)
    .filter((part) => !part.paid);

  const fixed = state.cardFixedBills.filter((bill) => same(bill.card, cardName) && bill.active !== false);
  const payments = state.cardPayments.filter((payment) => same(payment.card, cardName));

  return Math.max(0, total(openPurchases) + total(fixed) - total(payments));
}

function fixedIsPaid(bill) {
  return (bill.paidPeriods || []).includes(periodKey());
}

async function init() {
  bindEvents();

  if (!db) {
    return renderAuth("Nao foi possivel carregar o Supabase.");
  }

  const params = new URLSearchParams(location.search);

  if (params.has("sair") || params.has("login") || params.has("logout")) {
    await db.auth.signOut();

    localStorage.removeItem("duofinV2HouseholdId");
    localStorage.removeItem("duofinV2InviteCode");

    householdId = "";
    inviteCode = "";

    history.replaceState({}, document.title, location.pathname);

    return renderAuth("Entre novamente para continuar.");
  }

  const { data } = await db.auth.getSession();
  user = data.session?.user || null;

  db.auth.onAuthStateChange(async (_event, session) => {
    user = session?.user || null;

    if (user) {
      await loadApp();
    } else {
      renderAuth();
    }
  });

  if (user) {
    await loadApp();
  } else {
    renderAuth();
  }
}

function bindEvents() {
  document.addEventListener("submit", onSubmit);
  document.addEventListener("click", onClick);
  document.addEventListener("change", onChange);

  $("#settings-open")?.addEventListener("click", toggleValues);
  $("#privacy-toggle")?.addEventListener("click", toggleValues);

  ["click", "keydown", "touchstart", "scroll"].forEach((eventName) => {
    document.addEventListener(eventName, resetSessionTimer, { passive: true });
  });
}

function unlockApp(unlocked) {
  document.body.classList.toggle("locked", !unlocked);
}

function updatePrivacyButtons() {
  const label = valuesHidden ? "Mostrar" : "Ocultar";

  if ($("#settings-open")) $("#settings-open").textContent = valuesHidden ? "Ver" : "Priv";
  if ($("#privacy-toggle")) $("#privacy-toggle").textContent = label;

  document.body.classList.toggle("hide-values", valuesHidden);
}

function toggleValues() {
  valuesHidden = !valuesHidden;
  localStorage.setItem("duofinV2HideValues", valuesHidden ? "1" : "0");

  render();
  updatePrivacyButtons();
}

function resetSessionTimer() {
  if (!user) return;

  clearTimeout(sessionTimer);

  sessionTimer = setTimeout(() => {
    hardSignOut("Sessao encerrada apos 10 minutos sem uso.");
  }, 10 * 60 * 1000);
}

function setCurrentPeriod() {
  const now = new Date();
  state.selectedMonth = months[now.getMonth()];
  state.selectedYear = now.getFullYear();
}

async function hardSignOut(message = "Entre novamente para continuar.") {
  try {
    await db?.auth?.signOut();
  } catch (_error) {}

  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith("sb-") || key.startsWith("duofinV2HouseholdId") || key.startsWith("duofinV2InviteCode")) {
      localStorage.removeItem(key);
    }
  });

  clearTimeout(sessionTimer);

  householdId = "";
  inviteCode = "";
  user = null;
  activeView = "home";

  unlockApp(false);
  renderAuth(message);
}

function renderAuth(message = "") {
  unlockApp(false);
  clearTimeout(sessionTimer);
  updatePrivacyButtons();

  $("#auth").innerHTML = `
    <article class="auth-card">
      <div class="auth-hero">
        <img class="brand-logo auth-logo" src="app-icon.svg" alt="DuoFin">
        <h1>DuoFin</h1>
        <p>O dinheiro do casal em uma tela so.</p>
      </div>

      ${message ? `<div class="auth-message">${message}</div>` : ""}

      <form id="login-form">
        ${input("email", "E-mail", "email", localStorage.getItem("duofinV2Email") || "", "autocomplete=\"email\" required")}

        <label class="field">
          <span>Senha</span>
          <div class="password-box">
            <input name="password" type="password" minlength="6" autocomplete="current-password" required>
            <button class="show-pass" type="button" data-password>Ver</button>
          </div>
        </label>

        <button class="primary" type="submit">Entrar</button>

        <div class="auth-actions">
          <button class="ghost" type="button" data-signup>Criar conta</button>
          <button class="ghost" type="button" data-reset>Recuperar</button>
        </div>
      </form>
    </article>
  `;
}

async function login(form) {
  const data = Object.fromEntries(new FormData(form));
  const email = String(data.email || "").trim();
  const password = String(data.password || "");

  localStorage.setItem("duofinV2Email", email);

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    renderAuth(authMessage(error.message));
  }
}

async function signup() {
  const email = $("#login-form [name=email]")?.value?.trim();
  const password = $("#login-form [name=password]")?.value || "";

  if (!email || password.length < 6) {
    return renderAuth("Informe e-mail e senha com pelo menos 6 caracteres.");
  }

  const { error } = await db.auth.signUp({ email, password });

  renderAuth(error ? authMessage(error.message) : "Conta criada. Agora tente entrar.");
}

async function resetPassword() {
  const email = $("#login-form [name=email]")?.value?.trim();

  if (!email) {
    return renderAuth("Digite seu e-mail primeiro.");
  }

  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: location.href.split("?")[0]
  });

  renderAuth(error ? authMessage(error.message) : "Se o e-mail existir, o link foi enviado.");
}

function authMessage(message) {
  if (/invalid login/i.test(message)) return "E-mail ou senha invalidos.";
  if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos.";

  return message || "Nao foi possivel entrar.";
}

async function loadApp() {
  unlockApp(true);

  $("#home").innerHTML = `<section class="panel"><h2>Carregando...</h2><p class="muted">Buscando seu cofre v2.</p></section>`;

  try {
    householdId = localStorage.getItem(userHouseholdKey()) || localStorage.getItem("duofinV2HouseholdId") || "";
    inviteCode = localStorage.getItem(userInviteKey()) || localStorage.getItem("duofinV2InviteCode") || "";

    await ensureHousehold();

    const { data, error } = await db
      .from("duofin_v2_states")
      .select("data")
      .eq("household_id", householdId)
      .maybeSingle();

    if (error) throw error;

    state = normalize(data?.data || {});

    const localBackup = readLocalBackup();

    if (!hasFinancialData(state) && localBackup) {
      state = localBackup;
      await saveState(true);
      toast("Dados locais recuperados neste aparelho.");
    }

    setCurrentPeriod();
    resetSessionTimer();
    render();
  } catch (error) {
    console.error(error);
    renderAuth(`Erro ao carregar: ${error.message || error}`);
  }
}

async function ensureHousehold() {
  if (householdId) {
    const { data } = await db
      .from("duofin_v2_households")
      .select("id, invite_code")
      .eq("id", householdId)
      .maybeSingle();

    if (data?.id) {
      inviteCode = data.invite_code || inviteCode;
      await ensureMembership(data.id, "owner");
      rememberHousehold();
      return;
    }
  }

  const { data: memberships, error } = await db
    .from("duofin_v2_members")
    .select("household_id")
    .eq("user_id", user.id)
    .limit(1);

  if (error) throw error;

  if (memberships?.[0]?.household_id) {
    householdId = memberships[0].household_id;

    const { data } = await db
      .from("duofin_v2_households")
      .select("invite_code")
      .eq("id", householdId)
      .maybeSingle();

    inviteCode = data?.invite_code || inviteCode;

    rememberHousehold();
    return;
  }

  await createHousehold();
}

async function ensureMembership(targetId = householdId, role = "member") {
  if (!targetId || !user?.id) return;

  const { data: existing, error: selectError } = await db
    .from("duofin_v2_members")
    .select("household_id")
    .eq("household_id", targetId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing?.household_id) return;

  const { error } = await db
    .from("duofin_v2_members")
    .insert({
      household_id: targetId,
      user_id: user.id,
      role
    });

  if (error && error.code !== "23505") {
    throw error;
  }
}

function newInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function createHousehold() {
  const code = newInviteCode();

  const { data, error } = await db
    .from("duofin_v2_households")
    .insert({
      name: "DuoFin",
      invite_code: code,
      created_by: user.id
    })
    .select("id, invite_code")
    .single();

  if (error) throw error;

  householdId = data.id;
  inviteCode = data.invite_code;

  rememberHousehold();
  await ensureMembership(householdId, "owner");

  // O SQL tambem cria esse vinculo por trigger. Esta chamada mantem cofres antigos corrigidos.
}

async function joinHousehold(code) {
  const joinCode = String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!joinCode) {
    return toast("Informe o codigo.");
  }

  const { data, error } = await db.rpc("duofin_v2_join_by_code", {
    join_code: joinCode
  });

  if (error) {
    console.error("Erro ao conectar no cofre:", error);
    return toast(error.message || "Codigo nao encontrado.");
  }

  householdId = data;
  inviteCode = joinCode;

  rememberHousehold();

  toast("Conectado ao cofre.");
  await loadApp();
}

async function changeInviteCode() {
  const custom = prompt("Novo codigo do cofre. Deixe vazio para gerar automatico:");

  if (custom === null) return;

  const nextCode = String(custom || newInviteCode())
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);

  if (nextCode.length < 4) {
    return toast("Use pelo menos 4 letras ou numeros.");
  }

  const { error } = await db
    .from("duofin_v2_households")
    .update({ invite_code: nextCode })
    .eq("id", householdId);

  if (error) {
    return toast(`Erro ao trocar codigo: ${error.message}`);
  }

  inviteCode = nextCode;
  rememberHousehold();
  showInviteCode = true;

  commit("Codigo de convite atualizado.", "settings");
}

async function saveState(showToast = false) {
  state = normalize(state);

  localStorage.setItem(localStateKey(), JSON.stringify(state));

  if (!householdId) {
    lastSaveError = "Cofre nao carregado.";
    renderHeaderStatus();
    toast(`Erro ao salvar: ${lastSaveError}`);
    return false;
  }

  const { error } = await db.rpc("duofin_v2_save_state", {
    target_household: householdId,
    payload: state
  });

  if (error) {
    console.error("Erro ao salvar no Supabase:", error);
    lastSaveError = error.message || String(error);
    renderHeaderStatus();
    toast(`Erro ao salvar: ${lastSaveError}`);
    return false;
  }

  lastSaveError = "";
  lastSaved = new Date().toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });

  renderHeaderStatus();

  if (showToast) {
    toast("Salvo.");
  }

  return true;
}

function addNotification(message, view = activeView) {
  state.notifications = state.notifications || [];

  state.notifications.unshift({
    id: crypto.randomUUID(),
    message,
    view,
    createdAt: new Date().toISOString(),
    readBy: []
  });

  state.notifications = state.notifications.slice(0, 30);
}

function commit(message, view = activeView) {
  state = normalize(state);
  addNotification(message, view);
  render();

  toast("Salvando...");

  saveQueue = saveQueue
    .catch(() => {})
    .then(async () => {
      const saved = await saveState(false);
      toast(saved ? `${message} Salvo.` : "Nao salvou. Veja o erro mostrado.");
      return saved;
    });

  return saveQueue;
}

function render() {
  unlockApp(true);
  document.body.dataset.view = activeView;

  updatePrivacyButtons();
  renderHeaderStatus();
  renderPeriodSelects();
  renderHome();
  renderLaunch();
  renderCards();
  renderFixed();
  renderStatement();
  renderSettings();
  setView(activeView, false);
}

function renderHeaderStatus() {
  $(".brand-row small").textContent = lastSaveError ? "Erro ao salvar" : lastSaved ? `Salvo ${lastSaved}` : "Controle compartilhado";
}

function renderPeriodSelects() {
  $("#month-select").innerHTML = months
    .map((month) => `<option ${month === state.selectedMonth ? "selected" : ""}>${month}</option>`)
    .join("");

  const now = new Date().getFullYear();

  $("#year-select").innerHTML = Array.from({ length: 7 }, (_, index) => now - 3 + index)
    .map((year) => `<option value="${year}" ${Number(state.selectedYear) === year ? "selected" : ""}>${year}</option>`)
    .join("");
}

function setView(view, scroll = true) {
  activeView = view || "home";

  $$(".view").forEach((section) => {
    section.classList.toggle("active", section.id === activeView);
  });

  $$(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.go === activeView);
  });

  document.body.dataset.view = activeView;

  if (scroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function monthSalary() {
  const now = new Date();
  const currentMonth = monthIndex(state.selectedMonth);
  const currentYear = Number(state.selectedYear);

  const salaryOne =
    currentYear < now.getFullYear() ||
    (currentYear === now.getFullYear() && currentMonth < now.getMonth()) ||
    (currentYear === now.getFullYear() && currentMonth === now.getMonth() && now.getDate() >= Number(state.profile.salaryDayOne || 1))
      ? Number(state.profile.salaryOne || 0)
      : 0;

  const salaryTwo =
    currentYear < now.getFullYear() ||
    (currentYear === now.getFullYear() && currentMonth < now.getMonth()) ||
    (currentYear === now.getFullYear() && currentMonth === now.getMonth() && now.getDate() >= Number(state.profile.salaryDayTwo || 1))
      ? Number(state.profile.salaryTwo || 0)
      : 0;

  return salaryOne + salaryTwo;
}

function summary() {
  const entries = currentEntries();
  const income = total(entries.filter((entry) => entry.type === "income")) + monthSalary();
  const expense = total(entries.filter((entry) => entry.type === "expense" && entry.status === "paid"));
  const cards = total(state.cards.map((card) => ({ value: cardInvoice(card.name).amount })));
  const cardsForBalance = total(state.cards.filter(cardAffectsBalance).map((card) => ({ value: cardInvoice(card.name).open })));
  const fixedPaid = total(state.fixedBills.filter((bill) => fixedIsPaid(bill)));

  return {
    income,
    expense,
    cards,
    cardsForBalance,
    fixedPaid,
    balance: income - expense - cardsForBalance - fixedPaid
  };
}

function upcomingBills() {
  const fixed = state.fixedBills
    .filter((bill) => bill.active !== false && !fixedIsPaid(bill))
    .map((bill) => ({
      date: dateForDay(bill.dueDay, state.selectedMonth, state.selectedYear),
      title: bill.description,
      detail: `${bill.category} - ${bill.person}`,
      value: bill.value
    }));

  const invoices = state.cards
    .map((card) => {
      const invoice = cardInvoice(card.name);

      return {
        date: dateForDay(card.dueDay, state.selectedMonth, state.selectedYear),
        title: `Fatura ${card.name}`,
        detail: invoice.open > 0 ? "Aberta" : "Paga",
        value: invoice.open
      };
    })
    .filter((item) => item.value > 0);

  return [...fixed, ...invoices]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 5);
}

function invoiceCards() {
  return state.cards
    .map((card) => ({ card, invoice: cardInvoice(card.name) }))
    .filter((item) => item.invoice.amount > 0)
    .slice(0, 4);
}

function setupSteps() {
  return [
    {
      done: Number(state.profile.salaryOne || 0) > 0 || Number(state.profile.salaryTwo || 0) > 0,
      title: "Cadastrar salario",
      detail: "Informe pelo menos uma renda mensal.",
      view: "settings"
    },
    {
      done: state.cards.length > 0,
      title: "Cadastrar cartao",
      detail: "Adicione limite, fechamento e vencimento.",
      view: "cards"
    },
    {
      done: state.fixedBills.length > 0 || state.cardFixedBills.length > 0,
      title: "Adicionar fixos",
      detail: "Coloque aluguel, internet ou assinatura.",
      view: "fixed"
    },
    {
      done: state.entries.length > 0 || state.cardPurchases.length > 0,
      title: "Fazer primeiro lancamento",
      detail: "Registre uma entrada, saida ou compra.",
      view: "launch"
    }
  ];
}

function unreadNotifications() {
  const uid = user?.id || "";

  return (state.notifications || [])
    .filter((item) => !uid || !(item.readBy || []).includes(uid))
    .slice(0, 5);
}

function renderHome() {
  const data = summary();
  const tight = data.income > 0 && data.balance <= data.income * 0.12;

  const mood =
    data.balance < 0
      ? { label: "Atencao", text: "Saldo negativo. Vale revisar os gastos.", tone: "bad" }
      : tight
        ? { label: "Apertado", text: "O mes esta apertado. Segurem os extras.", tone: "warn" }
        : { label: "OK", text: "Voces estao indo bem esse mes.", tone: "good" };

  const bills = upcomingBills();
  const invoices = invoiceCards();
  const steps = setupSteps();
  const alerts = unreadNotifications();
  const pendingSteps = steps.filter((step) => !step.done);

  $("#home").innerHTML = `
    <section class="hero-card wide">
      <span>Saldo do mes</span>
      <h2>${brl(data.balance)}</h2>
      <p>${mood.text}</p>
      <div class="couple ${mood.tone}">
        <div class="couple-people">
          <span class="person one"><i></i></span>
          <span class="heart"></span>
          <span class="person two"><i></i></span>
        </div>
        <small>${mood.label}</small>
      </div>
    </section>

    <section class="shortcut-grid wide">
      <button class="shortcut" data-go="launch"><b>+</b><span>Lancar agora</span></button>
      <button class="shortcut" data-go="cards"><b>CC</b><span>Ver cartoes</span></button>
      <button class="shortcut" data-go="fixed"><b>Fx</b><span>Despesas fixas</span></button>
      <button class="shortcut" data-go="statement"><b>Ex</b><span>Extrato</span></button>
    </section>

    <section class="metrics wide">
      ${metric("Entradas", data.income, "launch")}
      ${metric("Saidas", data.expense + data.fixedPaid, "statement")}
      ${metric("Cartoes", data.cards, "cards")}
      ${metric("Saldo", data.balance, "statement")}
    </section>

    ${
      alerts.length
        ? `
      <section class="panel wide">
        <h2>Notificacoes</h2>
        <div class="notification-list">
          ${alerts
            .map(
              (item) => `
            <button class="notification-item" data-read-notification="${item.id}" type="button">
              <strong>${item.message}</strong>
              <span>${new Date(item.createdAt).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit"
              })}</span>
            </button>
          `
            )
            .join("")}
        </div>
      </section>
    `
        : ""
    }

    ${
      pendingSteps.length
        ? `
      <section class="panel wide">
        <h2>Primeiros passos</h2>
        <div class="setup-grid">
          ${steps
            .map(
              (step) => `
            <button class="setup-step ${step.done ? "done" : ""}" data-go="${step.view}" type="button">
              <b>${step.done ? "OK" : "+"}</b>
              <span><strong>${step.title}</strong><small>${step.detail}</small></span>
            </button>
          `
            )
            .join("")}
        </div>
      </section>
    `
        : ""
    }

    <section class="panel">
      <h2>Proximas contas</h2>
      ${
        bills.length
          ? bills.map((item) => row(item.title, `${dateFmt.format(new Date(`${item.date}T00:00:00Z`))} - ${item.detail}`, item.value)).join("")
          : empty("Nenhuma conta pendente")
      }
    </section>

    <section class="panel">
      <h2>Faturas do mes</h2>
      ${
        invoices.length
          ? invoices
              .map(({ card, invoice }) =>
                row(
                  card.name,
                  `Vence dia ${card.dueDay} - aberto ${brl(invoice.open)}`,
                  invoice.amount,
                  `<button class="tiny ghost" data-pay-card="${card.name}" type="button">Pagar</button><button class="tiny ghost" data-go="cards" type="button">Abrir</button>`
                )
              )
              .join("")
          : empty("Nenhuma fatura no mes")
      }
    </section>
  `;
}

function metric(label, value, go = "") {
  return `<article class="metric" ${go ? `data-go="${go}"` : ""}><span>${label}</span><strong>${brl(value)}</strong></article>`;
}

function renderLaunch() {
  if (editingPurchaseId) launchType = "expense";

  const editingEntry = state.entries.find((entry) => entry.id === editingEntryId);

  if (editingEntry) {
    launchType = editingEntry.type;
  }

  const isIncome = launchType === "income";
  const editingPurchase = state.cardPurchases.find((purchase) => purchase.id === editingPurchaseId);

  $("#launch").innerHTML = `
    <section class="form-card wide">
      <h2 class="form-title">${editingEntry ? "Editar lancamento" : "Lancamentos"}</h2>

      <div class="tabs">
        <button class="${isIncome ? "active" : ""}" data-launch-type="income" type="button">Entrada</button>
        <button class="${!isIncome ? "active" : ""}" data-launch-type="expense" type="button">Saida</button>
      </div>

      <form id="entry-form" class="form-card">
        ${input("value", "Valor", "number", editingEntry?.value || "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("date", "Data", "date", editingEntry?.date || today(), "required")}
        ${select("category", isIncome ? "Origem" : "Categoria", isIncome ? state.categoriesIncome : state.categoriesExpense, editingEntry?.category || "")}
        ${input("description", "Descricao", "text", editingEntry?.description || "", "required")}
        ${select("person", "Quem?", people(), editingEntry?.person || "")}
        ${!isIncome ? select("status", "Situacao", [["paid", "Pago"], ["pending", "Pendente"]], editingEntry?.status || "paid") : ""}

        <button class="primary" type="submit">${editingEntry ? "Salvar alteracoes" : "Salvar lancamento"}</button>

        ${editingEntry ? `<button class="ghost" type="button" data-cancel-entry-edit>Cancelar edicao</button>` : ""}
      </form>
    </section>

    ${
      !isIncome
        ? `<section class="form-card wide">
      <h2 class="form-title">${editingPurchase ? "Editar compra no cartao" : "Compra no cartao"}</h2>

      <form id="card-purchase-form" class="form-card">
        ${
          state.cards.length
            ? select("card", "Cartao", cardNames(), editingPurchase?.card || "")
            : `<div class="empty"><strong>Nenhum cartao cadastrado</strong><span>Cadastre um cartao primeiro.</span></div>`
        }

        ${input("date", "Data da compra", "date", editingPurchase?.date || today(), "required")}
        ${input("description", "Descricao", "text", editingPurchase?.description || "", "required")}
        ${select("category", "Categoria", state.categoriesExpense, editingPurchase?.category || "")}
        ${input("value", "Valor total", "number", editingPurchase?.value || "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("parts", "Parcelas", "number", editingPurchase?.parts || "1", "min=\"1\" step=\"1\" required")}

        <button class="primary" type="submit" ${state.cards.length ? "" : "disabled"}>${editingPurchase ? "Salvar alteracoes" : "Salvar compra"}</button>

        ${editingPurchase ? `<button class="ghost" type="button" data-cancel-purchase-edit>Cancelar edicao</button>` : ""}
      </form>
    </section>`
        : ""
    }
  `;
}

function addEntry(form) {
  const data = Object.fromEntries(new FormData(form));
  const value = Number(String(data.value || "").replace(",", "."));

  if (!Number.isFinite(value) || value <= 0) {
    return toast("Informe um valor valido.");
  }

  const info = dateInfo(data.date);

  const nextEntry = {
    id: editingEntryId || crypto.randomUUID(),
    type: launchType,
    date: data.date,
    month: info.month,
    year: info.year,
    description: data.description,
    category: data.category,
    value,
    person: data.person,
    status: launchType === "income" ? "paid" : data.status
  };

  if (editingEntryId) {
    state.entries = state.entries.map((entry) => (entry.id === editingEntryId ? nextEntry : entry));
    editingEntryId = "";
    commit("Lancamento atualizado.", "statement");
    return;
  }

  state.entries.unshift(nextEntry);
  commit("Lancamento salvo.");
}

function addCardPurchase(form) {
  const data = Object.fromEntries(new FormData(form));
  const value = Number(String(data.value || "").replace(",", "."));

  if (!state.cards.length) {
    return toast("Cadastre um cartao primeiro.");
  }

  if (!Number.isFinite(value) || value <= 0) {
    return toast("Informe um valor valido.");
  }

  const invoice = invoiceFor(data.date, data.card);

  const nextPurchase = {
    id: editingPurchaseId || crypto.randomUUID(),
    card: data.card,
    date: data.date,
    firstMonth: invoice.month,
    firstYear: invoice.year,
    description: data.description,
    category: data.category,
    value,
    parts: Math.max(1, Number(data.parts || 1)),
    paidPeriods: []
  };

  if (editingPurchaseId) {
    const old = state.cardPurchases.find((purchase) => purchase.id === editingPurchaseId);
    nextPurchase.paidPeriods = old?.paidPeriods || [];

    state.cardPurchases = state.cardPurchases.map((purchase) => (purchase.id === editingPurchaseId ? nextPurchase : purchase));

    editingPurchaseId = "";
    commit("Compra atualizada.");
    return;
  }

  state.cardPurchases.unshift(nextPurchase);
  commit("Compra no cartao salva.");
}

function renderCards() {
  const editing = state.cards.find((card) => card.id === editingCardId);

  $("#cards").innerHTML = `
    <section class="form-card wide">
      <h2 class="form-title">${editing ? "Editar cartao" : "Novo cartao"}</h2>

      <form id="card-form" class="form-card">
        ${input("name", "Nome do cartao", "text", editing?.name || "", "required")}
        ${select("owner", "Titular", people(), editing?.owner || "")}
        ${input("limit", "Limite", "number", editing?.limit || "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("closeDay", "Fecha dia", "number", editing?.closeDay || "20", "min=\"1\" max=\"31\" required")}
        ${input("dueDay", "Vence dia", "number", editing?.dueDay || "10", "min=\"1\" max=\"31\" required")}

        <button class="primary" type="submit">${editing ? "Salvar alteracoes" : "Salvar cartao"}</button>

        ${editing ? `<button class="ghost" type="button" data-cancel-card-edit>Cancelar edicao</button>` : ""}
      </form>
    </section>

    <section class="wide">
      ${state.cards.length ? state.cards.map(cardHtml).join("") : empty("Nenhum cartao cadastrado")}
    </section>
  `;
}

function cardHtml(card) {
  const invoice = cardInvoice(card.name);
  const used = cardUsedLimit(card.name);

  return `
    <article class="credit-card">
      <div>
        <span>${card.owner}</span>
        <h2>${card.name}</h2>
      </div>

      <div class="card-lines">
        <span>Limite</span><b>${brl(card.limit)}</b>
        <span>Usado</span><b>${brl(used)}</b>
        <span>Disponivel</span><b>${brl(Number(card.limit || 0) - used)}</b>
        <span>Fatura atual</span><b>${brl(invoice.amount)}</b>
        <span>Pago</span><b>${brl(invoice.paid)}</b>
        <span>Aberto</span><b>${brl(invoice.open)}</b>
        <span>Fecha</span><b>dia ${card.closeDay}</b>
        <span>Vence</span><b>dia ${card.dueDay}</b>
      </div>

      <div class="actions">
        <button class="tiny ghost" data-edit-card="${card.id}">Editar</button>
        <button class="tiny ghost" data-pay-card="${card.name}">Pagar fatura</button>
        <button class="tiny danger" data-delete-card="${card.id}">Excluir</button>
      </div>

      <div class="invoice-items">
        ${
          invoice.items.length
            ? invoice.items
                .map(
                  (item) => `
          <span>
            <i>${item.description} - ${item.source === "purchase" ? `${item.part}/${item.parts}` : "fixo"}</i>
            <b>${brl(item.value)}</b>
            ${item.source === "purchase" ? `<button class="tiny ghost" data-edit-purchase="${item.id}" type="button">Editar</button>` : ""}
          </span>
        `
                )
                .join("")
            : `<span>Nenhuma compra nesta fatura.</span>`
        }
      </div>
    </article>
  `;
}

function addCard(form) {
  const data = Object.fromEntries(new FormData(form));
  const limit = Number(String(data.limit || "").replace(",", "."));

  if (!data.name || !Number.isFinite(limit)) {
    return toast("Preencha os dados do cartao.");
  }

  const nextCard = {
    id: editingCardId || crypto.randomUUID(),
    name: data.name,
    owner: data.owner,
    limit,
    closeDay: Number(data.closeDay || 20),
    dueDay: Number(data.dueDay || 10)
  };

  if (editingCardId) {
    const oldCard = state.cards.find((card) => card.id === editingCardId);

    state.cards = state.cards.map((card) => (card.id === editingCardId ? nextCard : card));

    if (oldCard && oldCard.name !== nextCard.name) {
      state.cardPurchases = state.cardPurchases.map((purchase) => (same(purchase.card, oldCard.name) ? { ...purchase, card: nextCard.name } : purchase));
      state.cardFixedBills = state.cardFixedBills.map((bill) => (same(bill.card, oldCard.name) ? { ...bill, card: nextCard.name } : bill));
      state.cardPayments = state.cardPayments.map((payment) => (same(payment.card, oldCard.name) ? { ...payment, card: nextCard.name } : payment));
    }

    editingCardId = "";
    commit("Cartao atualizado.");
    return;
  }

  state.cards.unshift(nextCard);
  commit("Cartao salvo.");
}

function renderFixed() {
  const editingFixed = state.fixedBills.find((bill) => bill.id === editingFixedId);
  const editingCardFixed = state.cardFixedBills.find((bill) => bill.id === editingCardFixedId);

  $("#fixed").innerHTML = `
    <section class="form-card wide">
      <h2 class="form-title">${editingFixed ? "Editar despesa fixa" : "Despesa fixa"}</h2>

      <form id="fixed-form" class="form-card">
        ${input("description", "Nome", "text", editingFixed?.description || "", "required")}
        ${input("value", "Valor", "number", editingFixed?.value || "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("dueDay", "Vence dia", "number", editingFixed?.dueDay || "10", "min=\"1\" max=\"31\" required")}
        ${select("category", "Categoria", state.categoriesExpense, editingFixed?.category || "")}
        ${select("person", "Responsavel", people(), editingFixed?.person || "")}

        <button class="primary" type="submit">${editingFixed ? "Salvar alteracoes" : "Salvar despesa fixa"}</button>

        ${editingFixed ? `<button class="ghost" type="button" data-cancel-fixed-edit>Cancelar edicao</button>` : ""}
      </form>
    </section>

    <section class="form-card wide">
      <h2 class="form-title">${editingCardFixed ? "Editar fixo no cartao" : "Fixo no cartao"}</h2>

      <form id="card-fixed-form" class="form-card">
        ${
          state.cards.length
            ? select("card", "Cartao", cardNames(), editingCardFixed?.card || "")
            : `<div class="empty"><strong>Nenhum cartao cadastrado</strong><span>Cadastre um cartao primeiro.</span></div>`
        }

        ${input("description", "Nome", "text", editingCardFixed?.description || "", "required")}
        ${input("value", "Valor", "number", editingCardFixed?.value || "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("chargeDay", "Dia da cobranca", "number", editingCardFixed?.chargeDay || "1", "min=\"1\" max=\"31\" required")}
        ${select("category", "Categoria", state.categoriesExpense, editingCardFixed?.category || "")}

        <button class="primary" type="submit" ${state.cards.length ? "" : "disabled"}>${editingCardFixed ? "Salvar alteracoes" : "Salvar fixo no cartao"}</button>

        ${editingCardFixed ? `<button class="ghost" type="button" data-cancel-card-fixed-edit>Cancelar edicao</button>` : ""}
      </form>
    </section>

    <section class="panel wide">
      <h2>Fixos cadastrados</h2>

      ${
        state.fixedBills.length
          ? state.fixedBills
              .map((bill) =>
                row(
                  bill.description,
                  `${bill.category} - vence dia ${bill.dueDay} - ${fixedIsPaid(bill) ? "Pago" : "Pendente"}`,
                  bill.value,
                  `<button class="tiny ghost" data-edit-fixed="${bill.id}">Editar</button><button class="tiny ghost" data-toggle-fixed="${bill.id}">${fixedIsPaid(bill) ? "Reabrir" : "Pago"}</button>`
                )
              )
              .join("")
          : empty("Nenhuma despesa fixa")
      }

      ${
        state.cardFixedBills.length
          ? `<h2>Fixos no cartao</h2>${state.cardFixedBills
              .map((bill) => row(bill.description, `${bill.card} - dia ${bill.chargeDay}`, bill.value, `<button class="tiny ghost" data-edit-card-fixed="${bill.id}">Editar</button>`))
              .join("")}`
          : ""
      }
    </section>
  `;
}

function addFixed(form) {
  const data = Object.fromEntries(new FormData(form));
  const value = Number(String(data.value || "").replace(",", "."));

  if (!data.description || !Number.isFinite(value) || value <= 0) {
    return toast("Preencha a despesa fixa.");
  }

  const nextFixed = {
    id: editingFixedId || crypto.randomUUID(),
    description: data.description,
    category: data.category,
    person: data.person,
    value,
    dueDay: Number(data.dueDay || 1),
    paidPeriods: state.fixedBills.find((bill) => bill.id === editingFixedId)?.paidPeriods || [],
    active: true
  };

  if (editingFixedId) {
    state.fixedBills = state.fixedBills.map((bill) => (bill.id === editingFixedId ? nextFixed : bill));
    editingFixedId = "";
    commit("Despesa fixa atualizada.", "fixed");
    return;
  }

  state.fixedBills.unshift(nextFixed);
  commit("Despesa fixa salva.");
}

function addCardFixed(form) {
  const data = Object.fromEntries(new FormData(form));
  const value = Number(String(data.value || "").replace(",", "."));

  if (!state.cards.length) {
    return toast("Cadastre um cartao primeiro.");
  }

  if (!data.description || !Number.isFinite(value) || value <= 0) {
    return toast("Preencha o fixo no cartao.");
  }

  const nextCardFixed = {
    id: editingCardFixedId || crypto.randomUUID(),
    card: data.card,
    description: data.description,
    category: data.category,
    value,
    chargeDay: Number(data.chargeDay || 1),
    paidPeriods: state.cardFixedBills.find((bill) => bill.id === editingCardFixedId)?.paidPeriods || [],
    active: true
  };

  if (editingCardFixedId) {
    state.cardFixedBills = state.cardFixedBills.map((bill) => (bill.id === editingCardFixedId ? nextCardFixed : bill));
    editingCardFixedId = "";
    commit("Fixo no cartao atualizado.", "fixed");
    return;
  }

  state.cardFixedBills.unshift(nextCardFixed);
  commit("Fixo no cartao salvo.");
}

function renderStatement() {
  const rows = [
    ...currentEntries().map((entry) => ({
      ...entry,
      source: "entry",
      title: entry.description,
      detail: `${entry.type === "income" ? "Entrada" : "Saida"} - ${entry.category}`
    })),
    ...state.cards.flatMap((card) =>
      cardItems(card.name).map((item) => ({
        ...item,
        source: item.source,
        title: item.description,
        detail: `Cartao - ${card.name}`
      }))
    ),
    ...state.fixedBills.map((bill) => ({
      ...bill,
      source: "fixed",
      date: dateForDay(bill.dueDay, state.selectedMonth, state.selectedYear),
      title: bill.description,
      detail: `Fixo - ${fixedIsPaid(bill) ? "Pago" : "Pendente"}`
    }))
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  $("#statement").innerHTML = `
    <section class="panel wide">
      <h2>Extrato do mes</h2>
      ${rows.length ? rows.map(statementRow).join("") : empty("Nada no extrato")}
    </section>
  `;
}

function statementRow(item) {
  const date = dateFmt.format(new Date(`${item.date}T00:00:00Z`));
  let action = "";

  if (item.source === "entry") {
    action = `<button class="tiny ghost" data-edit-entry="${item.id}">Editar</button><button class="tiny danger" data-delete-entry="${item.id}">Excluir</button>`;
  }

  if (item.source === "purchase") {
    action = `<button class="tiny ghost" data-edit-purchase="${item.id}">Editar</button>`;
  }

  if (item.source === "fixed") {
    action = `<button class="tiny ghost" data-edit-fixed="${item.id}">Editar</button>`;
  }

  return row(item.title, `${date} - ${item.detail}`, item.value, action);
}

async function testRemoteSave() {
  const stamp = new Date().toISOString();

  state.meta = {
    ...(state.meta || {}),
    saveTestAt: stamp
  };

  const saved = await saveState(false);

  if (!saved) return;

  const { data, error } = await db
    .from("duofin_v2_states")
    .select("data")
    .eq("household_id", householdId)
    .maybeSingle();

  if (error) {
    lastSaveError = error.message || String(error);
    renderHeaderStatus();
    return toast(`Erro ao ler teste: ${lastSaveError}`);
  }

  const ok = data?.data?.meta?.saveTestAt === stamp;

  toast(ok ? "Teste OK: Supabase salvou e leu." : "Teste falhou: dado nao voltou do Supabase.");
  renderSettings();
}

function renderSettings() {
  $("#settings").innerHTML = `
    <section class="panel wide">
      <div class="section-head">
        <span>Central do app</span>
        <h2>Mais</h2>
      </div>

      <div class="menu-grid">
        <button class="menu-card" data-go="launch" type="button"><strong>Lancamentos</strong><span>Entradas, saidas e compras no cartao.</span></button>
        <button class="menu-card" data-go="cards" type="button"><strong>Cartoes</strong><span>Limites, faturas e vencimentos.</span></button>
        <button class="menu-card" data-go="fixed" type="button"><strong>Despesas fixas</strong><span>Contas mensais e fixos no cartao.</span></button>
        <button class="menu-card" data-go="statement" type="button"><strong>Extrato</strong><span>Tudo que entrou no mes escolhido.</span></button>
      </div>
    </section>

    <section class="form-card wide">
      <div class="section-head">
        <span>Casal e renda</span>
        <h2 class="form-title">Perfil</h2>
      </div>

      <form id="profile-form" class="form-card">
        ${input("personOne", "Pessoa 1", "text", state.profile.personOne)}
        ${input("salaryOne", "Salario pessoa 1", "number", state.profile.salaryOne, "step=\"0.01\"")}
        ${input("salaryDayOne", "Dia que cai", "number", state.profile.salaryDayOne, "min=\"1\" max=\"31\"")}

        ${input("personTwo", "Pessoa 2", "text", state.profile.personTwo)}
        ${input("salaryTwo", "Salario pessoa 2", "number", state.profile.salaryTwo, "step=\"0.01\"")}
        ${input("salaryDayTwo", "Dia que cai", "number", state.profile.salaryDayTwo, "min=\"1\" max=\"31\"")}

        <button class="primary" type="submit">Salvar perfil</button>
      </form>
    </section>

    <section class="panel wide">
      <div class="section-head">
        <span>Compartilhamento</span>
        <h2>Conectar companheiro</h2>
      </div>

      <div class="settings-grid">
        <div class="setting-card">
          <strong>Codigo do cofre</strong>
          <span>${showInviteCode ? inviteCode || "-" : "Toque para mostrar"}</span>

          <div class="actions">
            <button class="tiny ghost" type="button" data-toggle-code>${showInviteCode ? "Ocultar" : "Mostrar codigo"}</button>
            <button class="tiny ghost" type="button" data-copy-code>Copiar</button>
            <button class="tiny ghost" type="button" data-change-code>Trocar codigo</button>
          </div>
        </div>

        <div class="setting-card">
          <strong>Pessoas conectadas</strong>
          <span>Este cofre e compartilhado por codigo.</span>
        </div>
      </div>

      <form id="join-form" class="form-card">
        ${input("code", "Entrar com codigo", "text", "", "autocomplete=\"off\"")}
        <button class="primary" type="submit">Conectar</button>
      </form>
    </section>

    <section class="panel wide">
      <div class="section-head">
        <span>Instalacao</span>
        <h2>Usar como app</h2>
      </div>

      <div class="settings-grid">
        <div class="setting-card"><strong>Android</strong><span>No Chrome, toque nos tres pontos e escolha Instalar app ou Adicionar a tela inicial.</span></div>
        <div class="setting-card"><strong>iPhone</strong><span>No Safari, toque em Compartilhar e depois Adicionar a Tela de Inicio.</span></div>
      </div>
    </section>

    <section class="panel wide">
      <div class="section-head">
        <span>Seguranca</span>
        <h2>Backup e conta</h2>
      </div>

      <div class="settings-grid">
        <button class="menu-card" type="button" data-export-backup><strong>Exportar backup</strong><span>Baixa uma copia dos dados deste cofre.</span></button>

        ${
          readLocalBackup()
            ? `<button class="menu-card" type="button" data-restore-local><strong>Restaurar dados deste aparelho</strong><span>Use se algo sumiu apos entrar na conta.</span></button>`
            : ""
        }

        <label class="menu-card file-card">
          <strong>Importar backup</strong>
          <span>Use apenas arquivos exportados pelo DuoFin.</span>
          <input id="backup-file" type="file" accept="application/json">
        </label>

        <button class="menu-card danger-card" type="button" data-signout><strong>Sair da conta</strong><span>Fecha a sessao neste aparelho.</span></button>
      </div>
    </section>

    <section class="panel wide">
      <div class="section-head">
        <span>Diagnostico</span>
        <h2>Resumo tecnico</h2>
      </div>

      ${row("Cofre v2", householdId || "nao carregado", 0)}
      ${row("Dados", `Cartoes ${state.cards.length} - Lancamentos ${state.entries.length} - Compras ${state.cardPurchases.length}`, 0)}
      ${row("Ultimo salvo", lastSaved || "ainda nao salvou", 0)}
      ${row("Ultimo erro", lastSaveError || "nenhum", 0)}
      <div class="actions">
        <button class="tiny ghost" type="button" data-test-save>Testar salvamento</button>
      </div>
    </section>
  `;
}

function saveProfile(form) {
  const data = Object.fromEntries(new FormData(form));

  state.profile = {
    personOne: data.personOne,
    personTwo: data.personTwo,
    salaryOne: Number(data.salaryOne || 0),
    salaryTwo: Number(data.salaryTwo || 0),
    salaryDayOne: Number(data.salaryDayOne || 5),
    salaryDayTwo: Number(data.salaryDayTwo || 5)
  };

  commit("Perfil salvo.");
}

function exportBackup() {
  const payload = {
    app: "DuoFin",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: state
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `duofin-backup-${today()}.json`;
  link.click();

  URL.revokeObjectURL(url);

  toast("Backup exportado.");
}

async function importBackup(file) {
  if (!file) return;

  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const imported = payload?.data || payload;

    if (!imported || typeof imported !== "object") {
      throw new Error("Arquivo invalido");
    }

    state = normalize(imported);

    const saved = await saveState(true);

    if (saved) {
      render();
    }
  } catch (error) {
    toast(`Backup invalido: ${error.message}`);
  }
}

function input(name, label, type = "text", value = "", attrs = "") {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value)}" ${attrs}></label>`;
}

function select(name, label, options, selected = "") {
  const normalized = options.map((option) => (Array.isArray(option) ? option : [option, option]));

  return `<label class="field"><span>${label}</span><select name="${name}">${normalized
    .map(([value, text]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${text}</option>`)
    .join("")}</select></label>`;
}

function row(title, detail, value, action = "") {
  return `<div class="list-item"><div><strong>${title}</strong><span>${detail}</span></div><b>${Number(value) ? brl(value) : ""}</b>${action ? `<div class="actions">${action}</div>` : ""}</div>`;
}

function empty(text) {
  return `<div class="empty"><strong>${text}</strong><span>Adicione o primeiro registro.</span></div>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

function toast(message) {
  const toastBox = $("#toast");

  if (!toastBox) {
    console.log(message);
    return;
  }

  toastBox.textContent = message;
  toastBox.hidden = false;

  clearTimeout(toastBox._timer);

  toastBox._timer = setTimeout(() => {
    toastBox.hidden = true;
  }, 2600);
}

function onSubmit(event) {
  const form = event.target;

  if (!form?.id) return;

  event.preventDefault();

  if (form.id === "login-form") login(form);
  if (form.id === "entry-form") addEntry(form);
  if (form.id === "card-purchase-form") addCardPurchase(form);
  if (form.id === "card-form") addCard(form);
  if (form.id === "fixed-form") addFixed(form);
  if (form.id === "card-fixed-form") addCardFixed(form);
  if (form.id === "profile-form") saveProfile(form);
  if (form.id === "join-form") joinHousehold(new FormData(form).get("code"));
}

async function onClick(event) {
  const go = event.target.closest("[data-go]");

  if (go) {
    return setView(go.dataset.go);
  }

  const launch = event.target.closest("[data-launch-type]");

  if (launch) {
    launchType = launch.dataset.launchType;
    renderLaunch();
    return;
  }

  if (event.target.closest("[data-password]")) {
    const input = event.target.closest(".password-box")?.querySelector("input");

    if (!input) return;

    input.type = input.type === "password" ? "text" : "password";
    event.target.textContent = input.type === "password" ? "Ver" : "Ocultar";
  }

  if (event.target.closest("[data-signup]")) {
    signup();
  }

  if (event.target.closest("[data-reset]")) {
    resetPassword();
  }

  if (event.target.closest("[data-toggle-code]")) {
    showInviteCode = !showInviteCode;
    renderSettings();
    return;
  }

  if (event.target.closest("[data-copy-code]")) {
    if (!inviteCode) {
      return toast("Codigo ainda nao carregado.");
    }

    navigator.clipboard
      ?.writeText(inviteCode)
      .then(() => toast("Codigo copiado."))
      .catch(() => toast("Nao foi possivel copiar."));

    return;
  }

  if (event.target.closest("[data-change-code]")) {
    await changeInviteCode();
    return;
  }

  if (event.target.closest("[data-test-save]")) {
    await testRemoteSave();
    return;
  }

  if (event.target.closest("[data-export-backup]")) {
    exportBackup();
    return;
  }

  if (event.target.closest("[data-restore-local]")) {
    const backup = readLocalBackup();

    if (!backup) {
      return toast("Nenhum backup local encontrado.");
    }

    if (!confirm("Restaurar os dados salvos neste aparelho para este cofre?")) {
      return;
    }

    state = normalize(backup);

    const saved = await saveState(true);

    if (saved) {
      render();
    }

    return;
  }

  const readNotification = event.target.closest("[data-read-notification]");

  if (readNotification) {
    const note = state.notifications.find((item) => item.id === readNotification.dataset.readNotification);

    if (!note) return;

    const readBy = new Set(note.readBy || []);

    if (user?.id) {
      readBy.add(user.id);
    }

    state.notifications = state.notifications.map((item) => (item.id === note.id ? { ...item, readBy: Array.from(readBy) } : item));

    saveState(false);
    setView(note.view || "home");
    render();
    return;
  }

  const payCard = event.target.closest("[data-pay-card]");

  if (payCard) {
    const card = payCard.dataset.payCard;
    const invoice = cardInvoice(card);

    if (invoice.open <= 0) {
      return toast("Fatura ja esta paga.");
    }

    const typed = prompt(`Quanto deseja pagar/adiantar? Valor em aberto: ${money.format(invoice.open)}`, String(invoice.open.toFixed(2)).replace(".", ","));

    if (typed === null) return;

    const value = Number(String(typed || "").replace(",", "."));

    if (!Number.isFinite(value) || value <= 0) {
      return toast("Informe um valor valido.");
    }

    state.cardPayments.unshift({
      id: crypto.randomUUID(),
      card,
      month: state.selectedMonth,
      year: state.selectedYear,
      value: Math.min(value, invoice.open),
      date: today()
    });

    commit("Pagamento da fatura salvo.");
  }

  const editEntry = event.target.closest("[data-edit-entry]");

  if (editEntry) {
    editingEntryId = editEntry.dataset.editEntry;
    renderLaunch();
    setView("launch");
    return;
  }

  if (event.target.closest("[data-cancel-entry-edit]")) {
    editingEntryId = "";
    renderLaunch();
    return;
  }

  const deleteEntry = event.target.closest("[data-delete-entry]");

  if (deleteEntry && confirm("Excluir lancamento?")) {
    state.entries = state.entries.filter((entry) => entry.id !== deleteEntry.dataset.deleteEntry);

    if (editingEntryId === deleteEntry.dataset.deleteEntry) {
      editingEntryId = "";
    }

    commit("Lancamento excluido.", "statement");
    return;
  }

  const editCard = event.target.closest("[data-edit-card]");

  if (editCard) {
    editingCardId = editCard.dataset.editCard;
    renderCards();
    setView("cards");
    return;
  }

  if (event.target.closest("[data-cancel-card-edit]")) {
    editingCardId = "";
    renderCards();
    return;
  }

  const editPurchase = event.target.closest("[data-edit-purchase]");

  if (editPurchase) {
    editingPurchaseId = editPurchase.dataset.editPurchase;
    launchType = "expense";
    renderLaunch();
    setView("launch");
    return;
  }

  if (event.target.closest("[data-cancel-purchase-edit]")) {
    editingPurchaseId = "";
    renderLaunch();
    return;
  }

  const deleteCard = event.target.closest("[data-delete-card]");

  if (deleteCard && confirm("Excluir cartao?")) {
    state.cards = state.cards.filter((card) => card.id !== deleteCard.dataset.deleteCard);

    if (editingCardId === deleteCard.dataset.deleteCard) {
      editingCardId = "";
    }

    commit("Cartao excluido.");
  }

  const toggleFixed = event.target.closest("[data-toggle-fixed]");

  if (toggleFixed) {
    state.fixedBills = state.fixedBills.map((bill) => (bill.id === toggleFixed.dataset.toggleFixed ? togglePeriod(bill) : bill));
    commit("Status atualizado.");
  }

  const editFixed = event.target.closest("[data-edit-fixed]");

  if (editFixed) {
    editingFixedId = editFixed.dataset.editFixed;
    renderFixed();
    setView("fixed");
    return;
  }

  if (event.target.closest("[data-cancel-fixed-edit]")) {
    editingFixedId = "";
    renderFixed();
    return;
  }

  const editCardFixed = event.target.closest("[data-edit-card-fixed]");

  if (editCardFixed) {
    editingCardFixedId = editCardFixed.dataset.editCardFixed;
    renderFixed();
    setView("fixed");
    return;
  }

  if (event.target.closest("[data-cancel-card-fixed-edit]")) {
    editingCardFixedId = "";
    renderFixed();
    return;
  }

  if (event.target.closest("[data-signout]")) {
    await hardSignOut("Voce saiu da conta.");
  }
}

function togglePeriod(item) {
  const paid = new Set(item.paidPeriods || []);
  const key = periodKey();

  if (paid.has(key)) {
    paid.delete(key);
  } else {
    paid.add(key);
  }

  return {
    ...item,
    paidPeriods: Array.from(paid)
  };
}

function onChange(event) {
  if (event.target.id === "backup-file") {
    importBackup(event.target.files?.[0]);
    event.target.value = "";
  }

  if (event.target.id === "month-select") {
    state.selectedMonth = event.target.value;
    render();
    saveState();
  }

  if (event.target.id === "year-select") {
    state.selectedYear = Number(event.target.value);
    render();
    saveState();
  }
}

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
