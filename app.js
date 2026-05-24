const SUPABASE_URL = "https://allcnnxedveesyyvqavb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_H1Z7eE29GXki-Txjk2yNTA_IhOiKNpC";
const cloud = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

let currentUser = null;
let householdId = localStorage.getItem("coupleFinanceHouseholdId") || "";
let householdInviteCode = localStorage.getItem("coupleFinanceInviteCode") || "";
let cloudReady = false;
let activeView = "dashboard";
let entryMode = "Despesa";
let editingEntryId = "";
let savingTimer = null;
let lastSavedAt = "";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const seed = {
  selectedMonth: months[new Date().getMonth()],
  selectedYear: new Date().getFullYear(),
  profile: { personOne: "Pessoa 1", personTwo: "Pessoa 2", salaryOne: 0, salaryTwo: 0, salaryDayOne: 5, salaryDayTwo: 5 },
  categoriesIncome: ["💸 Salário", "💵 Renda Extra", "💰 Pix Recebido", "↩ Reembolso"],
  categoriesExpense: ["🍌 Alimentação", "🏠 Moradia", "⚡ Energia", "💧 Água", "📞 Internet", "🚗 Transporte", "💊 Saúde", "🎁 Presentes", "📈 Impostos / Taxas", "🧾 Outros"],
  paymentTypes: ["Pix", "Dinheiro", "Cartão de Débito", "Transferência", "Boleto"],
  accounts: [],
  cards: [],
  entries: [],
  installments: [],
  fixedBills: [],
  cardRecurring: [],
  cardPayments: [],
  goals: [],
  notifications: []
};

let state = blankState();

function blankState() {
  return structuredClone(seed);
}

function normalizeState(data) {
  const next = { ...blankState(), ...(data && typeof data === "object" ? data : {}) };
  next.selectedMonth = months.includes(next.selectedMonth) ? next.selectedMonth : months[new Date().getMonth()];
  next.selectedYear = Number(next.selectedYear || new Date().getFullYear());
  next.profile = { ...seed.profile, ...(next.profile || {}) };
  ["accounts", "cards", "entries", "installments", "fixedBills", "cardRecurring", "cardPayments", "goals", "notifications"].forEach((key) => {
    next[key] = Array.isArray(next[key]) ? next[key] : [];
  });
  next.categoriesIncome = Array.isArray(next.categoriesIncome) && next.categoriesIncome.length ? next.categoriesIncome : seed.categoriesIncome;
  next.categoriesExpense = Array.isArray(next.categoriesExpense) && next.categoriesExpense.length ? next.categoriesExpense : seed.categoriesExpense;
  next.paymentTypes = Array.isArray(next.paymentTypes) && next.paymentTypes.length ? next.paymentTypes : seed.paymentTypes;
  next.cards = next.cards.map((card) => ({
    id: card.id || crypto.randomUUID(),
    name: card.name || "Cartão",
    owner: card.owner || next.profile.personOne || "Pessoa 1",
    limit: Number(card.limit || 0),
    closeDay: Number(card.closeDay || 20),
    dueDay: Number(card.dueDay || 10),
    color: card.color || "Azul"
  }));
  next.entries = next.entries.map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    date: entry.date || today(),
    month: entry.month || dateInfo(entry.date).month,
    year: Number(entry.year || dateInfo(entry.date).year),
    type: entry.type === "Receita" ? "Receita" : "Despesa",
    category: entry.category || "🧾 Outros",
    description: entry.description || "Sem descrição",
    value: Number(entry.value || 0),
    person: entry.person || next.profile.personOne || "Pessoa 1",
    payment: entry.payment || "Pix",
    account: entry.account || accountOptions(next)[0] || "Carteira",
    status: entry.status || "Pago",
    notes: entry.notes || ""
  }));
  next.installments = next.installments.map((item) => ({
    id: item.id || crypto.randomUUID(),
    card: item.card || "",
    date: item.date || today(),
    firstMonth: item.firstMonth || invoicePeriodForPurchase(item.date || today(), item.card || "").month,
    firstYear: Number(item.firstYear || invoicePeriodForPurchase(item.date || today(), item.card || "").year),
    description: item.description || "Compra no cartão",
    category: item.category || "🧾 Outros",
    value: Number(item.value || 0),
    parts: Math.max(1, Number(item.parts || 1)),
    paidMonths: Array.isArray(item.paidMonths) ? item.paidMonths : []
  }));
  next.fixedBills = next.fixedBills.map((item) => ({
    id: item.id || crypto.randomUUID(),
    name: item.name || "Conta fixa",
    value: Number(item.value || 0),
    dueDay: Number(item.dueDay || 1),
    category: item.category || "🧾 Outros",
    person: item.person || next.profile.personOne || "Pessoa 1",
    paidMonths: Array.isArray(item.paidMonths) ? item.paidMonths : [],
    active: item.active !== false
  }));
  next.cardRecurring = next.cardRecurring.map((item) => ({
    id: item.id || crypto.randomUUID(),
    card: item.card || "",
    description: item.description || "Fixo no cartão",
    category: item.category || "🧾 Outros",
    value: Number(item.value || 0),
    day: Number(item.day || 1),
    paidMonths: Array.isArray(item.paidMonths) ? item.paidMonths : [],
    active: item.active !== false
  }));
  next.cardPayments = next.cardPayments.map((item) => ({
    id: item.id || crypto.randomUUID(),
    card: item.card || "",
    month: item.month || next.selectedMonth,
    year: Number(item.year || next.selectedYear),
    value: Number(item.value || 0),
    date: item.date || today(),
    description: item.description || "Pagamento da fatura"
  }));
  return next;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function dateInfo(dateValue) {
  const date = new Date(`${dateValue || ""}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { month: state.selectedMonth, year: state.selectedYear };
  return { month: months[date.getUTCMonth()], year: date.getUTCFullYear() };
}

function monthIndex(month) {
  return Math.max(0, months.indexOf(String(month || "").toLowerCase()));
}

function periodKey(month = state.selectedMonth, year = state.selectedYear) {
  return `${year}:${month}`;
}

function sameCard(left, right) {
  return String(left || "").trim().toLowerCase() === String(right || "").trim().toLowerCase();
}

function formatMoney(value) {
  return money.format(Number(value || 0));
}

function total(items) {
  return items.reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function byPeriod(items, month = state.selectedMonth, year = state.selectedYear) {
  return (items || []).filter((item) => {
    const info = item.date ? dateInfo(item.date) : { month: item.month, year: item.year };
    return (item.month || info.month) === month && Number(item.year || info.year || year) === Number(year);
  });
}

function people() {
  return [state.profile.personOne || "Pessoa 1", state.profile.personTwo || "Pessoa 2", "Ambos"];
}

function accountOptions(source = state) {
  return source.accounts?.length ? source.accounts.map((item) => item.name) : ["Carteira"];
}

function cardOptions() {
  return state.cards.length ? state.cards.map((item) => item.name) : [];
}

function invoicePeriodForPurchase(dateValue, cardName) {
  const card = state.cards.find((item) => sameCard(item.name, cardName));
  const date = new Date(`${dateValue || today()}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { month: state.selectedMonth, year: state.selectedYear };
  const closeDay = Number(card?.closeDay || 20);
  const addMonth = date.getUTCDate() > closeDay ? 1 : 0;
  const invoiceDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + addMonth, 1));
  return { month: months[invoiceDate.getUTCMonth()], year: invoiceDate.getUTCFullYear() };
}

function installmentDateForPeriod(day, month, year) {
  const index = monthIndex(month);
  const lastDay = new Date(Number(year), index + 1, 0).getDate();
  return new Date(Date.UTC(Number(year), index, Math.min(Number(day || 1), lastDay))).toISOString().slice(0, 10);
}

function installmentSchedule(item) {
  const start = monthIndex(item.firstMonth);
  const firstYear = Number(item.firstYear || state.selectedYear);
  const purchase = new Date(`${item.date || today()}T00:00:00Z`);
  const purchaseDay = Number.isNaN(purchase.getTime()) ? 1 : purchase.getUTCDate();
  const partValue = Number(item.value || 0) / Math.max(1, Number(item.parts || 1));
  return Array.from({ length: Math.max(1, Number(item.parts || 1)) }, (_, index) => {
    const absolute = start + index;
    const month = months[absolute % 12];
    const year = firstYear + Math.floor(absolute / 12);
    return {
      ...item,
      source: "installment",
      partIndex: index + 1,
      month,
      year,
      value: partValue,
      date: installmentDateForPeriod(purchaseDay, month, year),
      paid: (item.paidMonths || []).includes(periodKey(month, year))
    };
  });
}

function recurringCardItems(cardName = "", month = state.selectedMonth, year = state.selectedYear) {
  const targetMonthIndex = monthIndex(month);
  const targetYear = Number(year);
  const candidates = [
    { index: targetMonthIndex, year: targetYear },
    { index: (targetMonthIndex + 11) % 12, year: targetYear - (targetMonthIndex === 0 ? 1 : 0) }
  ];
  return (state.cardRecurring || [])
    .filter((item) => item.active !== false && (!cardName || sameCard(item.card, cardName)))
    .flatMap((item) => candidates.map((candidate) => {
      const date = installmentDateForPeriod(item.day, months[candidate.index], candidate.year);
      const invoice = invoicePeriodForPurchase(date, item.card);
      if (invoice.month !== month || Number(invoice.year) !== targetYear) return null;
      return {
        ...item,
        source: "cardRecurring",
        month,
        year: targetYear,
        date,
        paid: (item.paidMonths || []).includes(periodKey(month, targetYear))
      };
    }).filter(Boolean));
}

function cardMonthItems(cardName, month = state.selectedMonth, year = state.selectedYear) {
  const installments = state.installments
    .filter((item) => sameCard(item.card, cardName))
    .flatMap(installmentSchedule)
    .filter((item) => item.month === month && Number(item.year) === Number(year));
  return [...installments, ...recurringCardItems(cardName, month, year)];
}

function cardPayments(cardName, month = state.selectedMonth, year = state.selectedYear) {
  return (state.cardPayments || []).filter((item) => sameCard(item.card, cardName) && item.month === month && Number(item.year) === Number(year));
}

function cardInvoice(cardName, month = state.selectedMonth, year = state.selectedYear) {
  const items = cardMonthItems(cardName, month, year);
  const invoiceTotal = total(items);
  const paidMarked = total(items.filter((item) => item.paid));
  const payments = total(cardPayments(cardName, month, year));
  const paidTotal = Math.min(invoiceTotal, paidMarked + payments);
  return { card: cardName, items, invoiceTotal, paidTotal, open: Math.max(0, invoiceTotal - paidTotal) };
}

function cardUsedLimit(cardName) {
  const installments = state.installments
    .filter((item) => sameCard(item.card, cardName))
    .flatMap(installmentSchedule)
    .filter((item) => !item.paid);
  const recurring = (state.cardRecurring || [])
    .filter((item) => sameCard(item.card, cardName) && item.active !== false)
    .map((item) => ({ value: Number(item.value || 0) }));
  return total(installments) + total(recurring);
}

function fixedPaid(item, month = state.selectedMonth, year = state.selectedYear) {
  return (item.paidMonths || []).includes(periodKey(month, year));
}

function currentSummary() {
  const entries = byPeriod(state.entries);
  const income = total(entries.filter((item) => item.type === "Receita"));
  const expense = total(entries.filter((item) => item.type === "Despesa" && item.status !== "Pendente"));
  const fixedPaidTotal = total(state.fixedBills.filter((item) => item.active !== false && fixedPaid(item)));
  const fixedPending = total(state.fixedBills.filter((item) => item.active !== false && !fixedPaid(item)));
  const cardMonth = total(state.cards.map((card) => ({ value: cardInvoice(card.name).invoiceTotal })));
  const salary = availableSalaryTotal();
  const goals = total(state.goals.map((goal) => ({ value: goal.saved })));
  return { income, expense, fixedPaidTotal, fixedPending, cardMonth, salary, goals, balance: income + salary - expense - fixedPaidTotal - cardMonth };
}

function salaryAvailable(day) {
  const now = new Date();
  if (Number(state.selectedYear) < now.getFullYear()) return true;
  if (Number(state.selectedYear) > now.getFullYear()) return false;
  const selected = monthIndex(state.selectedMonth);
  if (selected < now.getMonth()) return true;
  if (selected > now.getMonth()) return false;
  return now.getDate() >= Number(day || 1);
}

function availableSalaryTotal() {
  const one = salaryAvailable(state.profile.salaryDayOne) ? Number(state.profile.salaryOne || 0) : 0;
  const two = salaryAvailable(state.profile.salaryDayTwo) ? Number(state.profile.salaryTwo || 0) : 0;
  return one + two;
}

function html(strings, ...values) {
  return strings.map((part, index) => part + (values[index] ?? "")).join("");
}

function input(name, label, type = "text", value = "", attrs = "") {
  return html`<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeAttr(value)}" ${attrs}></label>`;
}

function select(name, label, options, selected = "") {
  return html`<label class="field"><span>${label}</span><select name="${name}">${options.map((option) => `<option value="${escapeAttr(option)}" ${option === selected ? "selected" : ""}>${option}</option>`).join("")}</select></label>`;
}

function escapeAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function empty(text = "Nenhum item cadastrado") {
  return `<div class="empty"><strong>${text}</strong><span>Adicione o primeiro registro para começar.</span></div>`;
}

function showToast(text, type = "success") {
  $(".app-toast")?.remove();
  document.body.insertAdjacentHTML("beforeend", `<div class="app-toast ${type} show"><b>${type === "error" ? "!" : "✓"}</b><span>${text}</span></div>`);
  setTimeout(() => $(".app-toast")?.remove(), 2800);
}

async function init() {
  bindStaticEvents();
  if (!cloud) {
    renderAuth("Supabase não carregou. Confira a conexão.");
    return;
  }
  const { data } = await cloud.auth.getSession();
  currentUser = data.session?.user || null;
  cloud.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) await loadWorkspace();
    else renderAuth();
  });
  if (currentUser) await loadWorkspace();
  else renderAuth();
}

function bindStaticEvents() {
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  document.addEventListener("change", handleChange);
  $("#quick-add")?.addEventListener("click", () => setActiveView("entries"));
}

function setAppReady(ready) {
  document.body.classList.toggle("app-ready", ready);
  document.body.classList.toggle("auth-locked", !ready);
}

function renderAuth(message = "") {
  setAppReady(false);
  $("#auth-screen").innerHTML = html`
    <div class="auth-card simple-auth">
      <div class="auth-copy">
        <span class="brand-mark">DF</span>
        <h1>DuoFin</h1>
        <p>Entre para acessar o controle financeiro compartilhado do casal.</p>
      </div>
      ${message ? `<div class="auth-message">${message}</div>` : ""}
      <form id="login-form">
        ${input("email", "E-mail", "email", localStorage.getItem("duofinLoginEmail") || "", "autocomplete=\"email\" required")}
        <label class="field"><span>Senha</span><div class="password-wrap"><input name="password" type="password" minlength="6" autocomplete="current-password" required><button type="button" class="show-password" data-toggle-password>Ver</button></div></label>
        <label class="remember-login"><input type="checkbox" name="remember" checked> <span>Lembrar meu e-mail neste aparelho</span></label>
        <button class="primary" type="submit">Entrar</button>
        <div class="auth-actions">
          <button type="button" class="ghost" data-auth-signup>Criar conta</button>
          <button type="button" class="ghost" data-auth-reset>Recuperar senha</button>
        </div>
      </form>
    </div>
  `;
}

async function handleAuth(form) {
  const data = Object.fromEntries(new FormData(form));
  const email = String(data.email || "").trim();
  const password = String(data.password || "");
  if (data.remember) localStorage.setItem("duofinLoginEmail", email);
  else localStorage.removeItem("duofinLoginEmail");
  const { error } = await cloud.auth.signInWithPassword({ email, password });
  if (error) renderAuth(translateAuthError(error.message));
}

async function signup() {
  const email = $("#login-form [name=email]")?.value?.trim();
  const password = $("#login-form [name=password]")?.value || "";
  if (!email || password.length < 6) {
    renderAuth("Informe e-mail e senha com pelo menos 6 caracteres.");
    return;
  }
  const { error } = await cloud.auth.signUp({ email, password });
  if (error) renderAuth(translateAuthError(error.message));
  else renderAuth("Conta criada. Se pedir confirmação, confira seu e-mail; se não pedir, tente entrar.");
}

async function resetPassword() {
  const email = $("#login-form [name=email]")?.value?.trim();
  if (!email) {
    renderAuth("Digite seu e-mail primeiro para recuperar a senha.");
    return;
  }
  const { error } = await cloud.auth.resetPasswordForEmail(email, { redirectTo: location.href.split("?")[0] });
  renderAuth(error ? translateAuthError(error.message) : "Link de recuperação enviado, se o e-mail estiver cadastrado.");
}

function translateAuthError(message) {
  if (/invalid login/i.test(message)) return "E-mail ou senha inválidos.";
  if (/rate limit/i.test(message)) return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
  return message || "Não foi possível entrar.";
}

async function loadWorkspace() {
  setAppReady(true);
  cloudReady = false;
  renderLoading();
  try {
    await ensureHousehold();
    const { data, error } = await cloud.from("household_states").select("data").eq("household_id", householdId).maybeSingle();
    if (error) throw error;
    state = normalizeState(data?.data || {});
    cloudReady = true;
    render();
  } catch (error) {
    console.error(error);
    renderAuth(`Erro ao carregar seus dados: ${error.message || error}`);
  }
}

async function ensureHousehold() {
  if (householdId) {
    const { data } = await cloud.from("households").select("id, invite_code").eq("id", householdId).maybeSingle();
    if (data?.id) {
      householdInviteCode = data.invite_code || householdInviteCode;
      localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
      return;
    }
  }

  const { data: memberRows, error: memberError } = await cloud.from("household_members").select("household_id").eq("user_id", currentUser.id).limit(1);
  if (memberError) throw memberError;
  if (memberRows?.[0]?.household_id) {
    householdId = memberRows[0].household_id;
    localStorage.setItem("coupleFinanceHouseholdId", householdId);
    const { data } = await cloud.from("households").select("invite_code").eq("id", householdId).maybeSingle();
    householdInviteCode = data?.invite_code || householdInviteCode;
    if (householdInviteCode) localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
    return;
  }

  await createHousehold();
}

function randomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function createHousehold() {
  const invite_code = randomCode();
  const { data: household, error } = await cloud.from("households").insert({ name: "Finanças do Casal", invite_code, created_by: currentUser.id }).select("id, invite_code").single();
  if (error) throw error;
  householdId = household.id;
  householdInviteCode = household.invite_code;
  localStorage.setItem("coupleFinanceHouseholdId", householdId);
  localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  await cloud.from("household_members").insert({ household_id: householdId, user_id: currentUser.id, role: "owner" });
  await cloud.from("household_states").insert({ household_id: householdId, data: blankState() });
}

async function joinHousehold(code) {
  const joinCode = String(code || "").trim().toUpperCase();
  if (!joinCode) return;
  const { data, error } = await cloud.rpc("join_household_by_code", { join_code: joinCode });
  if (error) {
    showToast(error.message || "Código não encontrado", "error");
    return;
  }
  householdId = data;
  householdInviteCode = joinCode;
  localStorage.setItem("coupleFinanceHouseholdId", householdId);
  localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  await loadWorkspace();
}

async function saveNow(show = false) {
  if (!cloudReady || !householdId) return;
  const payload = normalizeState(state);
  state = payload;
  const { error } = await cloud.from("household_states").upsert({ household_id: householdId, data: payload, updated_at: new Date().toISOString() });
  if (error) {
    console.error(error);
    showToast(`Erro ao salvar: ${error.message}`, "error");
    return;
  }
  lastSavedAt = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  localStorage.setItem("coupleFinanceApp", JSON.stringify(payload));
  if (show) showToast("Salvo");
  renderCloudPanel();
}

function saveSoon() {
  clearTimeout(savingTimer);
  savingTimer = setTimeout(() => saveNow(false), 350);
}

function commit(message = "Salvo") {
  state = normalizeState(state);
  render();
  saveNow(false);
  showToast(message);
}

function renderLoading() {
  $("#dashboard").innerHTML = `<div class="panel"><h2>Carregando seus dados...</h2><p>Buscando o cofre financeiro compartilhado.</p></div>`;
}

function render() {
  setAppReady(true);
  document.body.dataset.view = activeView;
  renderCloudPanel();
  renderMonthFilter();
  renderDashboard();
  renderEntries();
  renderStatement();
  renderFixed();
  renderAgenda();
  renderCards();
  renderAccounts();
  renderMethod();
  renderGoals();
  renderSettings();
  renderMore();
  setActiveView(activeView, false);
}

function renderCloudPanel() {
  const panel = $("#cloud-panel");
  if (!panel) return;
  panel.innerHTML = html`
    <button class="notif-button" type="button" data-view="settings" title="Configurações">⚙</button>
    <div class="top-status"><span>Online</span><small>${lastSavedAt ? `Salvo ${lastSavedAt}` : "Sincronizado"}</small></div>
  `;
}

function renderMonthFilter() {
  const month = $("#month-filter");
  if (!month) return;
  month.innerHTML = months.map((item) => `<option ${item === state.selectedMonth ? "selected" : ""}>${item}</option>`).join("");
  if (!$("#year-filter")) {
    month.closest("label")?.insertAdjacentHTML("afterend", `<label class="field compact year-compact"><span>Ano</span><select id="year-filter"></select></label>`);
  }
  const year = $("#year-filter");
  const current = new Date().getFullYear();
  year.innerHTML = Array.from({ length: 7 }, (_, index) => current - 3 + index)
    .map((item) => `<option value="${item}" ${Number(state.selectedYear) === item ? "selected" : ""}>${item}</option>`)
    .join("");
  $("#period-switcher").innerHTML = "";
}

function setActiveView(view, shouldRender = true) {
  activeView = view || "dashboard";
  $$(".view").forEach((item) => item.classList.toggle("active", item.id === activeView));
  $$(".tab").forEach((item) => item.classList.toggle("active", item.dataset.view === activeView));
  $("#page-title").textContent = {
    dashboard: "Visão geral",
    entries: "Lançamentos",
    statement: "Extrato",
    fixed: "Despesas Fixas",
    agenda: "Agenda",
    cards: "Cartões",
    accounts: "Carteira",
    method: "50/30/20",
    goals: "Metas",
    settings: "Configurações",
    more: "Mais"
  }[activeView] || "DuoFin";
  document.body.dataset.view = activeView;
  if (shouldRender) render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderDashboard() {
  const summary = currentSummary();
  const mood = summary.balance < 0 ? ["Atenção", "O saldo está negativo. Vamos segurar os gastos."] : summary.balance < Math.max(summary.salary, 1) * 0.1 ? ["Apertado", "O mês está justo, mas ainda dá para organizar."] : ["Tudo bem", "Vocês estão indo bem esse mês."];
  const upcoming = nextFixedBills().slice(0, 4);
  $("#dashboard").innerHTML = html`
    <section class="bank-home clean-home">
      <div class="balance-card">
        <div>
          <span>Saldo do mês</span>
          <strong>${formatMoney(summary.balance)}</strong>
          <small>${state.selectedMonth} de ${state.selectedYear}</small>
          <p class="mood-message">${mood[1]}</p>
        </div>
        <div class="mini-couple ${summary.balance < 0 ? "sad" : "happy"}"><b>☺</b><b>☺</b><small>${mood[0]}</small></div>
      </div>
      <div class="quick-actions">
        <button class="action-chip" data-view="entries"><b>＋</b><span>Lançar</span></button>
        <button class="action-chip" data-view="cards"><b>▣</b><span>Cartões</span></button>
        <button class="action-chip" data-view="fixed"><b>◷</b><span>Fixos</span></button>
        <button class="action-chip" data-view="statement"><b>☷</b><span>Extrato</span></button>
      </div>
    </section>
    <section class="summary-grid">
      ${metric("Entradas", summary.income + summary.salary, "good", "entries")}
      ${metric("Saídas", summary.expense + summary.fixedPaidTotal, "bad", "statement")}
      ${metric("Cartões", summary.cardMonth, "info", "cards")}
      ${metric("Pendente", summary.fixedPending, "warn", "fixed")}
    </section>
    <section class="panel">
      <div class="section-title"><span>◷</span><div><h2>Próximas contas</h2><small>Contas fixas perto do vencimento.</small></div></div>
      ${upcoming.length ? upcoming.map((item) => listRow(item.name, `${item.category} · vence dia ${item.dueDay}`, item.value, `<button class="tiny ghost" data-pay-fixed="${item.id}">Marcar pago</button>`)).join("") : empty("Nenhuma conta fixa pendente")}
    </section>
  `;
}

function metric(label, value, tone, view) {
  return `<article class="metric ${tone} clickable" data-view="${view}"><span>${label}</span><strong>${formatMoney(value)}</strong></article>`;
}

function nextFixedBills() {
  return [...state.fixedBills]
    .filter((item) => item.active !== false && !fixedPaid(item))
    .sort((a, b) => Number(a.dueDay || 1) - Number(b.dueDay || 1));
}

function renderEntries() {
  const editing = editingEntryId ? state.entries.find((item) => item.id === editingEntryId) : null;
  if (editing) entryMode = editing.type;
  const isIncome = entryMode === "Receita";
  $("#entries").innerHTML = html`
    <section class="feature-hero entries-hero">
      <div><span>Movimento do mês</span><h2>Lançamentos</h2><p>Entradas e saídas simples ficam aqui. Compra no cartão também pode ser lançada nesta tela.</p></div>
    </section>
    <div class="entries-split">
      <form class="entry-form guided-form" id="entry-form" autocomplete="off">
        <div class="span-3 form-heading"><span>＋</span><div><h2>${editing ? "Editar lançamento" : "Novo lançamento"}</h2><small>Pix, dinheiro, débito, salário extra e despesas do dia.</small></div></div>
        <div class="mode-picker span-3">
          <button class="${entryMode === "Receita" ? "active" : ""}" type="button" data-entry-mode="Receita">Entrada</button>
          <button class="${entryMode === "Despesa" ? "active" : ""}" type="button" data-entry-mode="Despesa">Saída</button>
        </div>
        ${input("value", "Valor", "number", editing?.value || "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("date", "Data", "date", editing?.date || today(), "required")}
        ${select("category", isIncome ? "De onde veio?" : "Categoria", isIncome ? state.categoriesIncome : state.categoriesExpense, editing?.category || "")}
        ${input("description", "Descrição", "text", editing?.description || "", "required")}
        ${select("person", "Quem?", people(), editing?.person || people()[0])}
        ${!isIncome ? select("payment", "Como pagou?", state.paymentTypes, editing?.payment || state.paymentTypes[0]) : ""}
        ${select("account", isIncome ? "Conta que recebeu" : "Conta de onde saiu", accountOptions(), editing?.account || accountOptions()[0])}
        ${!isIncome ? select("status", "Situação", ["Pago", "Pendente"], editing?.status || "Pago") : ""}
        <button class="primary span-2" type="submit">${editing ? "Salvar alteração" : "Salvar lançamento"}</button>
        ${editing ? `<button class="ghost" type="button" data-cancel-entry>Cancelar</button>` : ""}
      </form>
      <form class="entry-form guided-form" id="card-form" autocomplete="off">
        <div class="span-3 form-heading"><span>▣</span><div><h2>Compra no cartão</h2><small>O app calcula a fatura pelo fechamento do cartão.</small></div></div>
        ${state.cards.length ? select("card", "Cartão", cardOptions(), cardOptions()[0]) : `<div class="panel span-3"><strong>Nenhum cartão cadastrado</strong><p>Cadastre um cartão na aba Cartões antes de lançar compra no crédito.</p><button class="ghost" type="button" data-view="cards">Cadastrar cartão</button></div>`}
        ${input("date", "Data da compra", "date", today(), "required")}
        ${input("description", "Descrição", "text", "", "required")}
        ${select("category", "Categoria", state.categoriesExpense, state.categoriesExpense[0])}
        ${input("value", "Valor total", "number", "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("parts", "Parcelas", "number", "1", "min=\"1\" step=\"1\" required")}
        <button class="primary" type="submit" ${state.cards.length ? "" : "disabled"}>Salvar compra</button>
      </form>
    </div>
    <section class="panel">
      <div class="section-title"><span>☷</span><div><h2>Lançamentos deste mês</h2><small>Edite ou exclua quando precisar.</small></div></div>
      ${byPeriod(state.entries).length ? byPeriod(state.entries).map((item) => listRow(item.description, `${item.type} · ${item.category} · ${item.status}`, item.value, `<button class="tiny ghost" data-edit-entry="${item.id}">Editar</button><button class="tiny danger" data-delete-entry="${item.id}">Excluir</button>`, item.type === "Receita" ? "income" : "expense")).join("") : empty("Nenhum lançamento no mês")}
    </section>
  `;
}

function addEntry(form) {
  const data = Object.fromEntries(new FormData(form));
  const value = Number(String(data.value || "").replace(",", "."));
  if (!Number.isFinite(value) || value <= 0) return showToast("Informe um valor válido", "error");
  const info = dateInfo(data.date);
  const payload = {
    id: editingEntryId || crypto.randomUUID(),
    date: data.date,
    month: info.month,
    year: info.year,
    type: entryMode,
    category: data.category,
    description: data.description || data.category,
    value,
    person: data.person,
    payment: entryMode === "Receita" ? "Recebimento" : data.payment,
    account: data.account,
    status: entryMode === "Receita" ? "Pago" : data.status,
    notes: ""
  };
  if (editingEntryId) {
    state.entries = state.entries.map((item) => item.id === editingEntryId ? payload : item);
    editingEntryId = "";
  } else {
    state.entries.unshift(payload);
  }
  commit("Lançamento salvo");
}

function addInstallment(form) {
  if (!state.cards.length) return showToast("Cadastre um cartão primeiro", "error");
  const data = Object.fromEntries(new FormData(form));
  const value = Number(String(data.value || "").replace(",", "."));
  const parts = Math.max(1, Number(data.parts || 1));
  if (!Number.isFinite(value) || value <= 0) return showToast("Informe o valor da compra", "error");
  const invoice = invoicePeriodForPurchase(data.date, data.card);
  state.installments.unshift({
    id: crypto.randomUUID(),
    card: data.card,
    date: data.date,
    firstMonth: invoice.month,
    firstYear: invoice.year,
    description: data.description || "Compra no cartão",
    category: data.category,
    value,
    parts,
    paidMonths: []
  });
  commit("Compra no cartão salva");
}

function renderStatement() {
  const rows = [
    ...byPeriod(state.entries).map((item) => ({ date: item.date, title: item.description, detail: `${item.type} · ${item.category} · ${item.status}`, value: item.value, tone: item.type === "Receita" ? "income" : "expense", action: `<button class="tiny ghost" data-edit-entry="${item.id}">Editar</button>` })),
    ...state.cards.flatMap((card) => cardMonthItems(card.name).map((item) => ({ date: item.date, title: item.description, detail: `Cartão · ${card.name} · ${item.source === "installment" ? `parcela ${item.partIndex}/${item.parts}` : "fixo mensal"} · ${item.paid ? "Pago" : "Aberto"}`, value: item.value, tone: "card", action: item.source === "installment" ? `<button class="tiny ghost" data-toggle-card-part="${item.id}|${item.month}|${item.year}">${item.paid ? "Reabrir" : "Pago"}</button>` : `<button class="tiny ghost" data-toggle-card-recurring="${item.id}">${item.paid ? "Reabrir" : "Pago"}</button>` }))),
    ...state.fixedBills.filter((item) => item.active !== false).map((item) => ({ date: installmentDateForPeriod(item.dueDay, state.selectedMonth, state.selectedYear), title: item.name, detail: `Despesa fixa · ${item.category} · ${fixedPaid(item) ? "Pago" : "Pendente"}`, value: item.value, tone: "fixed", action: `<button class="tiny ghost" data-pay-fixed="${item.id}">${fixedPaid(item) ? "Reabrir" : "Pago"}</button>` }))
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  $("#statement").innerHTML = html`
    <section class="feature-hero statement-hero"><div><span>Histórico</span><h2>Extrato</h2><p>Tudo que movimenta o mês aparece aqui: lançamentos, cartão e despesas fixas.</p></div></section>
    <section class="panel statement-list">
      ${rows.length ? rows.map((item) => listRow(item.title, `${dateFmt.format(new Date(`${item.date}T00:00:00Z`))} · ${item.detail}`, item.value, item.action, item.tone)).join("") : empty("Nada no extrato deste mês")}
    </section>
  `;
}

function renderFixed() {
  $("#fixed").innerHTML = html`
    <section class="feature-hero fixed-hero"><div><span>Todo mês</span><h2>Despesas Fixas</h2><p>Contas no dinheiro e cobranças fixas no cartão ficam juntas aqui.</p></div></section>
    <div class="entries-split">
      <form class="entry-form guided-form" id="fixed-form">
        <div class="span-3 form-heading"><span>◷</span><div><h2>Nova despesa fixa</h2><small>Aluguel, energia, internet e mensalidades.</small></div></div>
        ${input("name", "Nome", "text", "", "required")}
        ${input("value", "Valor", "number", "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("dueDay", "Vence dia", "number", "10", "min=\"1\" max=\"31\" required")}
        ${select("category", "Categoria", state.categoriesExpense, state.categoriesExpense[0])}
        ${select("person", "Responsável", people(), people()[0])}
        <button class="primary" type="submit">Salvar fixa</button>
      </form>
      <form class="entry-form guided-form" id="card-recurring-form">
        <div class="span-3 form-heading"><span>▣</span><div><h2>Fixo no cartão</h2><small>Streaming, internet no cartão, apps e assinaturas.</small></div></div>
        ${state.cards.length ? select("card", "Cartão", cardOptions(), cardOptions()[0]) : `<div class="panel span-3">Cadastre um cartão primeiro.</div>`}
        ${input("description", "Nome", "text", "", "required")}
        ${select("category", "Categoria", state.categoriesExpense, state.categoriesExpense[0])}
        ${input("value", "Valor mensal", "number", "", "step=\"0.01\" inputmode=\"decimal\" required")}
        ${input("day", "Dia da cobrança", "number", "1", "min=\"1\" max=\"31\" required")}
        <button class="primary" type="submit" ${state.cards.length ? "" : "disabled"}>Salvar fixo no cartão</button>
      </form>
    </div>
    <section class="panel"><div class="section-title"><span>◷</span><div><h2>Fixos cadastrados</h2></div></div>
      ${state.fixedBills.length ? state.fixedBills.map((item) => listRow(item.name, `${item.category} · vence dia ${item.dueDay} · ${fixedPaid(item) ? "Pago" : "Pendente"}`, item.value, `<button class="tiny ghost" data-pay-fixed="${item.id}">${fixedPaid(item) ? "Reabrir" : "Pago"}</button><button class="tiny danger" data-delete-fixed="${item.id}">Excluir</button>`)).join("") : empty("Nenhuma despesa fixa")}
      ${state.cardRecurring.length ? `<h3>Fixos no cartão</h3>${state.cardRecurring.map((item) => listRow(item.description, `${item.card} · dia ${item.day}`, item.value, `<button class="tiny ghost" data-toggle-card-recurring="${item.id}">Pago/Reabrir</button><button class="tiny danger" data-delete-card-recurring="${item.id}">Excluir</button>`)).join("")}` : ""}
    </section>
  `;
}

function addFixed(form) {
  const data = Object.fromEntries(new FormData(form));
  state.fixedBills.unshift({ id: crypto.randomUUID(), name: data.name, value: Number(String(data.value).replace(",", ".")), dueDay: Number(data.dueDay || 1), category: data.category, person: data.person, paidMonths: [], active: true });
  commit("Despesa fixa salva");
}

function addCardRecurring(form) {
  const data = Object.fromEntries(new FormData(form));
  state.cardRecurring.unshift({ id: crypto.randomUUID(), card: data.card, description: data.description, category: data.category, value: Number(String(data.value).replace(",", ".")), day: Number(data.day || 1), paidMonths: [], active: true });
  commit("Fixo no cartão salvo");
}

function renderAgenda() {
  $("#agenda").innerHTML = html`
    <section class="feature-hero fixed-hero"><div><span>Calendário</span><h2>Agenda do mês</h2><p>Vencimentos e faturas em ordem.</p></div></section>
    <section class="panel">
      ${nextFixedBills().length ? nextFixedBills().map((item) => listRow(item.name, `Vence dia ${item.dueDay}`, item.value, `<button class="tiny ghost" data-pay-fixed="${item.id}">Marcar pago</button>`)).join("") : empty("Nada pendente")}
    </section>
  `;
}

function renderCards() {
  $("#cards").innerHTML = html`
    <section class="feature-hero cards-hero"><div><span>Crédito</span><h2>Cartões</h2><p>Cadastre cartões e acompanhe faturas, limite usado e vencimento.</p></div></section>
    <form class="entry-form guided-form" id="card-settings-form">
      <div class="span-3 form-heading"><span>▣</span><div><h2>Novo cartão</h2><small>Limite, fechamento e vencimento.</small></div></div>
      ${input("name", "Nome do cartão", "text", "", "required")}
      ${select("owner", "Titular", people(), people()[0])}
      ${input("limit", "Limite", "number", "", "step=\"0.01\" inputmode=\"decimal\" required")}
      ${input("closeDay", "Fecha dia", "number", "20", "min=\"1\" max=\"31\" required")}
      ${input("dueDay", "Vence dia", "number", "10", "min=\"1\" max=\"31\" required")}
      <button class="primary" type="submit">Salvar cartão</button>
    </form>
    <section class="card-grid">
      ${state.cards.length ? state.cards.map(cardHtml).join("") : empty("Nenhum cartão cadastrado")}
    </section>
  `;
}

function cardHtml(card) {
  const invoice = cardInvoice(card.name);
  const used = cardUsedLimit(card.name);
  const available = Number(card.limit || 0) - used;
  return html`
    <article class="credit-card">
      <div><span>${card.owner}</span><strong>${card.name}</strong></div>
      <div class="card-lines">
        <span>Limite</span><b>${formatMoney(card.limit)}</b>
        <span>Usado</span><b>${formatMoney(used)}</b>
        <span>Disponível</span><b>${formatMoney(available)}</b>
        <span>Fatura atual</span><b>${formatMoney(invoice.invoiceTotal)}</b>
        <span>Fecha</span><b>dia ${card.closeDay}</b>
        <span>Vence</span><b>dia ${card.dueDay}</b>
      </div>
      <div class="card-actions">
        <button class="tiny ghost" data-pay-card="${card.name}">Pagar fatura</button>
        <button class="tiny danger" data-delete-card="${card.id}">Excluir</button>
      </div>
      <div class="invoice-items">
        ${invoice.items.length ? invoice.items.map((item) => `<span class="${item.paid ? "paid" : "open"}">${item.description} · ${item.source === "installment" ? `${item.partIndex}/${item.parts}` : "fixo"} <b>${formatMoney(item.value)}</b></span>`).join("") : "<small>Nenhuma compra nesta fatura.</small>"}
      </div>
    </article>
  `;
}

function addCard(form) {
  const data = Object.fromEntries(new FormData(form));
  state.cards.unshift({ id: crypto.randomUUID(), name: data.name, owner: data.owner, limit: Number(String(data.limit).replace(",", ".")), closeDay: Number(data.closeDay || 20), dueDay: Number(data.dueDay || 10), color: "Azul" });
  commit("Cartão salvo");
}

function renderAccounts() {
  $("#accounts").innerHTML = html`
    <section class="feature-hero"><div><span>Carteira</span><h2>Nossa Carteira</h2><p>Contas, bancos e dinheiro disponível.</p></div></section>
    <form class="entry-form guided-form" id="account-form">
      ${input("name", "Nome", "text", "", "required")}
      ${select("type", "Tipo", ["Corrente", "Poupança", "Digital", "Dinheiro", "Investimento"], "Corrente")}
      ${select("owner", "Titular", people(), people()[0])}
      ${input("initial", "Saldo inicial", "number", "0", "step=\"0.01\" inputmode=\"decimal\"")}
      <button class="primary" type="submit">Salvar carteira</button>
    </form>
    <section class="panel">${state.accounts.length ? state.accounts.map((item) => listRow(item.name, `${item.type} · ${item.owner}`, item.initial, `<button class="tiny danger" data-delete-account="${item.id}">Excluir</button>`)).join("") : empty("Nenhuma carteira")}</section>
  `;
}

function addAccount(form) {
  const data = Object.fromEntries(new FormData(form));
  state.accounts.unshift({ id: crypto.randomUUID(), name: data.name, type: data.type, owner: data.owner, initial: Number(String(data.initial || 0).replace(",", ".")) });
  commit("Carteira salva");
}

function renderMethod() {
  const income = Number(state.profile.salaryOne || 0) + Number(state.profile.salaryTwo || 0);
  $("#method").innerHTML = html`
    <section class="feature-hero"><div><span>Planejamento</span><h2>50/30/20</h2><p>Calculado pelos salários cadastrados.</p></div></section>
    <section class="panel method-box">
      ${[["50%", "Necessidades", income * .5], ["30%", "Guardar/investir", income * .3], ["20%", "Desejos", income * .2]].map(([p, label, value]) => `<div class="method-row"><b>${p}</b><span>${label}</span><strong>${formatMoney(value)}</strong></div>`).join("")}
    </section>
  `;
}

function renderGoals() {
  $("#goals").innerHTML = html`
    <section class="feature-hero goals-hero"><div><span>Objetivos</span><h2>Metas</h2><p>Acompanhe o dinheiro guardado.</p></div></section>
    <form class="entry-form guided-form" id="goal-form">
      ${input("title", "Meta", "text", "", "required")}
      ${input("target", "Valor total", "number", "", "step=\"0.01\" required")}
      ${input("saved", "Já guardado", "number", "0", "step=\"0.01\"")}
      <button class="primary" type="submit">Salvar meta</button>
    </form>
    <section class="panel">${state.goals.length ? state.goals.map((goal) => {
      const percent = Math.min(100, Math.round(Number(goal.saved || 0) / Math.max(1, Number(goal.target || 1)) * 100));
      return `<div class="list-item"><div><strong>${goal.title}</strong><span>${percent}% concluído · falta ${formatMoney(Number(goal.target || 0) - Number(goal.saved || 0))}</span></div><b>${formatMoney(goal.saved)}</b><button class="tiny danger" data-delete-goal="${goal.id}">Excluir</button></div>`;
    }).join("") : empty("Nenhuma meta")}</section>
  `;
}

function addGoal(form) {
  const data = Object.fromEntries(new FormData(form));
  state.goals.unshift({ id: crypto.randomUUID(), title: data.title, target: Number(String(data.target).replace(",", ".")), saved: Number(String(data.saved || 0).replace(",", ".")) });
  commit("Meta salva");
}

function renderSettings() {
  $("#settings").innerHTML = html`
    <section class="feature-hero"><div><span>Conta</span><h2>Configurações</h2><p>Perfil, convite e acesso.</p></div></section>
    <form class="entry-form guided-form" id="profile-form">
      ${input("personOne", "Pessoa 1", "text", state.profile.personOne)}
      ${input("salaryOne", "Salário pessoa 1", "number", state.profile.salaryOne, "step=\"0.01\"")}
      ${input("salaryDayOne", "Dia que cai", "number", state.profile.salaryDayOne, "min=\"1\" max=\"31\"")}
      ${input("personTwo", "Pessoa 2", "text", state.profile.personTwo)}
      ${input("salaryTwo", "Salário pessoa 2", "number", state.profile.salaryTwo, "step=\"0.01\"")}
      ${input("salaryDayTwo", "Dia que cai", "number", state.profile.salaryDayTwo, "min=\"1\" max=\"31\"")}
      <button class="primary" type="submit">Salvar perfil</button>
    </form>
    <section class="panel">
      <h2>Conectar companheiro</h2>
      <p>Código do cofre: <strong>${householdInviteCode || "carregando..."}</strong></p>
      <form id="join-form" class="mini-form">${input("code", "Entrar com código", "text", "", "autocomplete=\"off\"")}<button class="primary" type="submit">Conectar</button></form>
      <button class="danger" type="button" data-signout>Sair da conta</button>
    </section>
  `;
}

function saveProfile(form) {
  const data = Object.fromEntries(new FormData(form));
  state.profile = { personOne: data.personOne, personTwo: data.personTwo, salaryOne: Number(data.salaryOne || 0), salaryTwo: Number(data.salaryTwo || 0), salaryDayOne: Number(data.salaryDayOne || 5), salaryDayTwo: Number(data.salaryDayTwo || 5) };
  commit("Perfil salvo");
}

function renderMore() {
  $("#more").innerHTML = html`
    <section class="more-hero"><div><span>Menu</span><h2>Mais opções</h2><p>Acesse áreas menos usadas sem lotar a barra principal.</p></div></section>
    <div class="more-grid">
      ${["agenda", "accounts", "method", "goals", "settings"].map((view) => `<button class="more-card" data-view="${view}"><b>•</b><span><strong>${$("#page-title") ? ({ agenda: "Agenda", accounts: "Carteira", method: "50/30/20", goals: "Metas", settings: "Configurações" }[view]) : view}</strong><small>Abrir área</small></span></button>`).join("")}
    </div>
  `;
}

function listRow(title, detail, value, action = "", tone = "") {
  return `<div class="list-item ${tone}"><div><strong>${title}</strong><span>${detail}</span></div><b>${formatMoney(value)}</b><span class="card-actions">${action}</span></div>`;
}

function handleSubmit(event) {
  const form = event.target;
  if (!form?.id) return;
  event.preventDefault();
  if (form.id === "login-form") handleAuth(form);
  if (form.id === "entry-form") addEntry(form);
  if (form.id === "card-form") addInstallment(form);
  if (form.id === "fixed-form") addFixed(form);
  if (form.id === "card-recurring-form") addCardRecurring(form);
  if (form.id === "card-settings-form") addCard(form);
  if (form.id === "account-form") addAccount(form);
  if (form.id === "goal-form") addGoal(form);
  if (form.id === "profile-form") saveProfile(form);
  if (form.id === "join-form") joinHousehold(new FormData(form).get("code"));
}

async function handleClick(event) {
  const view = event.target.closest("[data-view]");
  if (view) return setActiveView(view.dataset.view);
  if (event.target.closest("[data-auth-signup]")) return signup();
  if (event.target.closest("[data-auth-reset]")) return resetPassword();
  if (event.target.closest("[data-toggle-password]")) {
    const input = event.target.closest(".password-wrap")?.querySelector("input");
    if (input) {
      input.type = input.type === "password" ? "text" : "password";
      event.target.textContent = input.type === "password" ? "Ver" : "Ocultar";
    }
  }
  if (event.target.closest("[data-cancel-entry]")) {
    editingEntryId = "";
    renderEntries();
  }
  const editEntry = event.target.closest("[data-edit-entry]");
  if (editEntry) {
    editingEntryId = editEntry.dataset.editEntry;
    setActiveView("entries");
  }
  const deleteEntry = event.target.closest("[data-delete-entry]");
  if (deleteEntry && confirm("Excluir este lançamento?")) {
    state.entries = state.entries.filter((item) => item.id !== deleteEntry.dataset.deleteEntry);
    commit("Lançamento excluído");
  }
  const payFixed = event.target.closest("[data-pay-fixed]");
  if (payFixed) {
    state.fixedBills = state.fixedBills.map((item) => item.id === payFixed.dataset.payFixed ? togglePaid(item) : item);
    commit("Status da despesa fixa atualizado");
  }
  const togglePart = event.target.closest("[data-toggle-card-part]");
  if (togglePart) {
    const [id, month, year] = togglePart.dataset.toggleCardPart.split("|");
    state.installments = state.installments.map((item) => item.id === id ? togglePaid(item, month, year) : item);
    commit("Status da parcela atualizado");
  }
  const toggleRecurring = event.target.closest("[data-toggle-card-recurring]");
  if (toggleRecurring) {
    state.cardRecurring = state.cardRecurring.map((item) => item.id === toggleRecurring.dataset.toggleCardRecurring ? togglePaid(item) : item);
    commit("Status do fixo no cartão atualizado");
  }
  const payCard = event.target.closest("[data-pay-card]");
  if (payCard) {
    const cardName = payCard.dataset.payCard;
    const invoice = cardInvoice(cardName);
    if (invoice.open <= 0) return showToast("Fatura já está paga");
    state.cardPayments.unshift({ id: crypto.randomUUID(), card: cardName, month: state.selectedMonth, year: state.selectedYear, value: invoice.open, date: today(), description: "Pagamento da fatura" });
    commit("Pagamento da fatura registrado");
  }
  const deleteMap = [
    ["data-delete-card", "cards"],
    ["data-delete-fixed", "fixedBills"],
    ["data-delete-card-recurring", "cardRecurring"],
    ["data-delete-account", "accounts"],
    ["data-delete-goal", "goals"]
  ];
  for (const [attr, key] of deleteMap) {
    const button = event.target.closest(`[${attr}]`);
    if (button && confirm("Excluir este item?")) {
      state[key] = state[key].filter((item) => item.id !== button.getAttribute(attr));
      commit("Item excluído");
      return;
    }
  }
  if (event.target.closest("[data-signout]")) {
    await cloud.auth.signOut();
    localStorage.removeItem("coupleFinanceHouseholdId");
    householdId = "";
    currentUser = null;
    renderAuth();
  }
}

function togglePaid(item, month = state.selectedMonth, year = state.selectedYear) {
  const key = periodKey(month, year);
  const paidMonths = new Set(item.paidMonths || []);
  if (paidMonths.has(key)) paidMonths.delete(key);
  else paidMonths.add(key);
  return { ...item, paidMonths: [...paidMonths] };
}

function handleChange(event) {
  if (event.target.id === "month-filter") {
    state.selectedMonth = event.target.value;
    render();
    saveSoon();
  }
  if (event.target.id === "year-filter") {
    state.selectedYear = Number(event.target.value);
    render();
    saveSoon();
  }
  if (event.target.matches("[data-entry-mode]")) {
    entryMode = event.target.dataset.entryMode;
    renderEntries();
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-entry-mode]");
  if (button) {
    entryMode = button.dataset.entryMode;
    renderEntries();
  }
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

init();
