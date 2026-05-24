const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SUPABASE_URL = "https://allcnnxedveesyyvqavb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_H1Z7eE29GXki-Txjk2yNTA_IhOiKNpC";
const cloud = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const seed = {
  selectedMonth: "junho",
  selectedYear: new Date().getFullYear(),
  categoriesIncome: ["💸 Salário", "💵 Renda Extra", "👜 Venda de Produto", "🔧 Serviços Prestados", "💸 13º Salário", "📆 Férias / Rescisão", "💰 Pix Recebido", "↩ Reembolso / Estorno", "📊 Investimentos / Rendimentos"],
  categoriesExpense: ["🍌 Alimentação", "🍔 Restaurantes / Lanches", "🏠 Aluguel / Condomínio", "⚡ Energia", "💧 Água", "📞 Internet / Celular", "🚓 Transporte", "💳 Cartão de Crédito", "🌍 Lazer / Viagens", "💊 Saúde", "👩‍🎓 Educação", "🥼 Roupas / Calçados", "🎁 Presentes", "🔨 Manutenção da Casa", "🧾 Compras Parceladas", "📈 Impostos / Taxas"],
  paymentTypes: ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Pix", "Transferência Bancária", "Boleto", "Débito Automático", "Cheque", "Vale-Alimentação", "Vale-Refeição"],
  accounts: [],
  cards: [],
  entries: [],
  installments: [],
  cardRecurring: [],
  cardPayments: [],
  fixedBills: [],
  methodIncome: 0,
  goals: [],
  notifications: [],
  profile: { personOne: "Ele", personTwo: "Ela", salaryOne: 0, salaryTwo: 0, salaryDayOne: 5, salaryDayTwo: 5 },
  onboardingDone: false,
  tutorialDone: false,
  privacyMode: false,
  recurring: [],
  budgets: {}
};

let state = loadState();
let currentUser = null;
let householdId = localStorage.getItem("coupleFinanceHouseholdId");
let householdInviteCode = localStorage.getItem("coupleFinanceInviteCode");
let householdMembers = [];
let cloudReady = false;
let saveTimer = null;
let loadingCloud = false;
let authMode = "signin";
let entryMode = "Despesa";
let syncStatus = "";
let notificationsOpen = false;
let lastCloudUpdatedAt = null;
let cloudPollStarted = false;
let walletTab = "money";
let modalMode = null;
let editingEntryId = null;
let tutorialStep = 0;
let inviteCodeVisible = false;
let entryFilter = "Todos";
let statementFilter = "Todos";
let statementCardFilter = "Todos";
let statementSearch = "";
let statementStatusFilter = "Todos";
let selectedInvoiceCard = "";
let confirmAction = null;
let currentActionOptions = [];
let toastTimer = null;
const AUTO_LOCK_MS = 5 * 60 * 1000;

const tutorialSteps = [
  ["Visão geral", "Veja saldo do mês, entradas, saídas, cartões, contas fixas, metas, alertas e o resumo inteligente."],
  ["Lançamentos", "Registre somente entradas e saídas feitas na hora. Compras no cartão ficam na aba Cartões."],
  ["Despesas Fixas", "Cadastre aluguel, internet, energia e dívidas mensais. Marque como pago quando sair o dinheiro."],
  ["Nossa Carteira", "Cadastre contas, cartões e rendas como salário. É a base do controle."],
  ["Cartões", "Lance compras parceladas e acompanhe fatura atual, próxima fatura e limite usado."],
  ["50/30/20", "Planeje renda entre essenciais, investimentos e desejos."],
  ["Metas", "Acompanhe objetivos do casal e edite valor guardado ou valor total quando precisar."],
  ["Cadastros", "Ajuste nomes, salários, categorias, recorrências, orçamento e backup."]
];
const tutorialViews = ["dashboard", "entries", "fixed", "accounts", "cards", "method", "goals", "settings"];

const qs = (selector, root = document) => root.querySelector(selector);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function loadState() {
  const saved = localStorage.getItem("coupleFinanceApp");
  return saved ? JSON.parse(saved) : structuredClone(seed);
}

function blankState() {
  const fresh = structuredClone(seed);
  fresh.selectedMonth = months[new Date().getMonth()];
  fresh.selectedYear = new Date().getFullYear();
  return fresh;
}

function ensureStateShape() {
  state.selectedYear ||= new Date().getFullYear();
  state.notifications ||= [];
  state.accounts ||= [];
  state.cards ||= [];
  state.cards = state.cards.map((item) => ({ ...item, closeDay: Number(item.closeDay || 20), dueDay: Number(item.dueDay || 10) }));
  state.entries ||= [];
  state.installments ||= [];
  state.installments = state.installments.map((item) => ({ ...item, paidMonths: item.paidMonths || [] }));
  state.cardRecurring ||= [];
  state.cardRecurring = state.cardRecurring.map((item) => ({ ...item, paidMonths: item.paidMonths || [], active: item.active !== false }));
  state.cardPayments ||= [];
  state.fixedBills ||= [];
  state.fixedBills = state.fixedBills.map((item) => ({ ...item, paidMonths: item.paidMonths || (item.status === "Pago" ? [state.selectedMonth] : []) }));
  state.goals ||= [];
  state.profile ||= { personOne: "Ele", personTwo: "Ela", salaryOne: 0, salaryTwo: 0 };
  state.profile.salaryOne ||= 0;
  state.profile.salaryTwo ||= 0;
  state.profile.salaryDayOne = Number(state.profile.salaryDayOne || 5);
  state.profile.salaryDayTwo = Number(state.profile.salaryDayTwo || 5);
  state.recurring ||= [];
  state.budgets ||= {};
  state.closedMonths ||= [];
  state.notificationMarks ||= {};
  if (typeof state.onboardingDone !== "boolean") state.onboardingDone = false;
  if (typeof state.tutorialDone !== "boolean") state.tutorialDone = false;
  if (typeof state.privacyMode !== "boolean") state.privacyMode = false;
}

function saveState(sync = false) {
  localStorage.setItem("coupleFinanceApp", JSON.stringify(state));
  if (sync && cloudReady && householdId) scheduleCloudSave();
}

async function commitState() {
  saveState(false);
  if (cloudReady && householdId) await saveCloudState();
  else showToast("Salvo neste aparelho", "success");
  render();
}

function byMonth(items, month = state.selectedMonth, year = state.selectedYear) {
  return items.filter((item) => {
    if (item.month !== month) return false;
    if (!item.date) return true;
    const date = new Date(`${item.date}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return true;
    return date.getUTCFullYear() === Number(year);
  });
}

function total(items) {
  return items.reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function monthIndex(month) {
  return months.indexOf(month.toLowerCase());
}

function periodKey(month = state.selectedMonth, year = state.selectedYear) {
  return `${year}:${month}`;
}

function isMonthClosed(month = state.selectedMonth, year = state.selectedYear) {
  return (state.closedMonths || []).includes(periodKey(month, year));
}

function getInstallmentSchedule(item) {
  const start = monthIndex(item.firstMonth);
  const perPart = Number(item.value || 0) / Number(item.parts || 1);
  const purchaseDate = new Date(`${item.date || ""}T00:00:00Z`);
  const purchaseYear = Number.isNaN(purchaseDate.getTime()) ? Number(state.selectedYear || new Date().getFullYear()) : purchaseDate.getUTCFullYear();
  const purchaseDay = Number.isNaN(purchaseDate.getTime()) ? 1 : purchaseDate.getUTCDate();
  const firstYear = Number(item.firstYear || purchaseYear);
  return Array.from({ length: Number(item.parts || 1) }, (_, index) => {
    const month = months[(start + index) % 12];
    const year = firstYear + Math.floor((start + index) / 12);
    const date = installmentDateForPeriod(purchaseDay, month, year);
    return {
      month,
      year,
      date,
      value: perPart,
      paid: isPeriodPaid(item, month, year)
    };
  });
}

function installmentDateForPeriod(day, month, year) {
  const monthNumber = monthIndex(month);
  const lastDay = new Date(Number(year), monthNumber + 1, 0).getDate();
  return new Date(Date.UTC(Number(year), monthNumber, Math.min(Number(day || 1), lastDay))).toISOString().slice(0, 10);
}

function invoicePeriodForPurchase(dateValue, cardName) {
  const card = state.cards.find((item) => sameCard(item.name, cardName));
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return { month: state.selectedMonth, year: Number(state.selectedYear) };
  const closeDay = Number(card?.closeDay || 20);
  const invoiceDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + (date.getUTCDate() > closeDay ? 1 : 0), 1));
  return {
    month: months[invoiceDate.getUTCMonth()],
    year: invoiceDate.getUTCFullYear()
  };
}

function invoiceMonthForPurchase(dateValue, cardName) {
  return invoicePeriodForPurchase(dateValue, cardName).month;
}

function cardKey(name) {
  return String(name || "").trim().toLowerCase();
}

function sameCard(left, right) {
  return cardKey(left) === cardKey(right);
}

function cardTotals(cardName) {
  const selectedIndex = monthIndex(state.selectedMonth);
  const nextMonth = months[(selectedIndex + 1) % 12];
  const nextYear = Number(state.selectedYear || new Date().getFullYear()) + (selectedIndex === 11 ? 1 : 0);
  const scheduled = state.installments
    .filter((item) => sameCard(item.card, cardName))
    .flatMap(getInstallmentSchedule);
  const recurring = cardRecurringItemsForInvoice(cardName);
  const recurringNext = cardRecurringItemsForInvoice(cardName, nextMonth, nextYear).filter((item) => !item.paid);
  const open = scheduled.filter((part) => !part.paid);
  const recurringOpen = recurring.filter((part) => !part.paid);
  const monthOpen = [
    ...open.filter((part) => part.month === state.selectedMonth && Number(part.year) === Number(state.selectedYear)),
    ...recurringOpen
  ];
  return {
    used: total(open) + total(recurringOpen),
    month: total(monthOpen),
    next: total(open.filter((part) => part.month === nextMonth && Number(part.year) === Number(nextYear))) + total(recurringNext)
  };
}

function cardRecurringItemsForInvoice(cardName = "", invoiceMonth = state.selectedMonth, invoiceYear = state.selectedYear) {
  const invoiceMonthIndex = monthIndex(invoiceMonth);
  const invoiceYearNumber = Number(invoiceYear || new Date().getFullYear());
  const candidatePeriods = [
    { monthIndex: invoiceMonthIndex, year: invoiceYearNumber },
    { monthIndex: (invoiceMonthIndex + 11) % 12, year: invoiceYearNumber - (invoiceMonthIndex === 0 ? 1 : 0) }
  ];
  return (state.cardRecurring || [])
    .filter((item) => (!cardName || sameCard(item.card, cardName)) && item.active !== false)
    .flatMap((item) => candidatePeriods.map((period) => {
      const chargeDate = recurringChargeDate(item, period.monthIndex, period.year);
      const invoice = invoicePeriodForPurchase(chargeDate, item.card);
      if (invoice.month !== invoiceMonth || Number(invoice.year) !== invoiceYearNumber) return null;
      return {
        month: invoiceMonth,
        year: invoiceYearNumber,
        date: chargeDate,
        value: Number(item.value || 0),
        paid: isPeriodPaid(item, invoiceMonth, invoiceYearNumber),
        source: "recurring",
        installmentId: item.id,
        description: item.description,
        category: item.category,
        card: item.card,
        partLabel: "fixo mensal"
      };
    }))
    .filter(Boolean);
}

function recurringChargeDate(item, chargeMonthIndex = monthIndex(state.selectedMonth), chargeYear = state.selectedYear) {
  const lastDay = new Date(Number(chargeYear), chargeMonthIndex + 1, 0).getDate();
  return new Date(Date.UTC(Number(chargeYear), chargeMonthIndex, Math.min(Number(item.day || 1), lastDay))).toISOString().slice(0, 10);
}

function isFixedPaid(item, month = state.selectedMonth, year = state.selectedYear) {
  const paid = item.paidMonths || [];
  return paid.includes(periodKey(month, year)) || paid.includes(month);
}

function isPeriodPaid(item, month = state.selectedMonth, year = state.selectedYear) {
  const paid = item.paidMonths || [];
  return paid.includes(periodKey(month, year)) || paid.includes(month);
}

function salaryPlannedTotal() {
  return Number(state.profile.salaryOne || 0) + Number(state.profile.salaryTwo || 0);
}

function isSalaryAvailable(day, month = state.selectedMonth, year = state.selectedYear) {
  const now = new Date();
  const selectedIndex = monthIndex(month);
  if (Number(year) < now.getFullYear()) return true;
  if (Number(year) > now.getFullYear()) return false;
  if (selectedIndex < now.getMonth()) return true;
  if (selectedIndex > now.getMonth()) return false;
  return now.getDate() >= Number(day || 1);
}

function availableSalaryTotal(month = state.selectedMonth, year = state.selectedYear) {
  const one = isSalaryAvailable(state.profile.salaryDayOne, month, year) ? Number(state.profile.salaryOne || 0) : 0;
  const two = isSalaryAvailable(state.profile.salaryDayTwo, month, year) ? Number(state.profile.salaryTwo || 0) : 0;
  return one + two;
}

function nextSalaryText() {
  const salaries = [
    { name: state.profile.personOne || "Primeira pessoa", value: Number(state.profile.salaryOne || 0), day: Number(state.profile.salaryDayOne || 5) },
    { name: state.profile.personTwo || "Segunda pessoa", value: Number(state.profile.salaryTwo || 0), day: Number(state.profile.salaryDayTwo || 5) }
  ].filter((item) => item.value > 0 && !isSalaryAvailable(item.day));
  if (!salaries.length) return "Salários disponíveis";
  const next = salaries.sort((a, b) => a.day - b.day)[0];
  return `${next.name}: dia ${next.day}`;
}

function currentSummary() {
  const entries = byMonth(state.entries);
  const income = total(entries.filter((item) => item.type === "Receita"));
  const expense = total(entries.filter((item) => item.type === "Despesa"));
  const cardMonth = total(state.cards.map((card) => ({ value: cardTotals(card.name).month })));
  const cardDebt = total(state.cards.map((card) => ({ value: cardTotals(card.name).used })));
  const fixedPaid = total((state.fixedBills || []).filter((item) => isFixedPaid(item)));
  const fixedPending = total((state.fixedBills || []).filter((item) => !isFixedPaid(item)));
  const salaryTotal = availableSalaryTotal();
  const salaryPlanned = salaryPlannedTotal();
  const goalsSaved = total((state.goals || []).map((goal) => ({ value: goal.saved })));
  return { income, expense, cardMonth, cardDebt, fixedPaid, fixedPending, salaryTotal, salaryPlanned, goalsSaved, balance: income + salaryTotal - expense - fixedPaid - cardMonth };
}

function pageTitle(view) {
  return {
    dashboard: "Visão geral",
    entries: "Lançamentos",
    statement: "Extrato",
    fixed: "Despesas Fixas",
    agenda: "Agenda",
    cards: "Cartões",
    accounts: "Nossa Carteira",
    method: "Método 50/30/20",
    goals: "Metas financeiras",
    settings: "Cadastros",
    more: "Mais opções"
  }[view];
}

function render() {
  ensureStateShape();
  ensureMoreNavigation();
  ensureSmartNotifications();
  saveState(false);
  renderGate();
  if (!currentUser || !cloudReady) return;
  document.body.dataset.view = document.querySelector(".view.active")?.id || "dashboard";
  renderCloudPanel();
  renderMonthFilter();
  renderDashboard();
  renderOnboarding();
  renderEntries();
  renderStatement();
  renderFixedBills();
  renderAgenda();
  renderCards();
  renderAccounts();
  renderMethod();
  renderGoals();
  renderSettings();
  renderMore();
  renderTutorial();
}

function appPeople() {
  return [state.profile?.personOne || "Ele", state.profile?.personTwo || "Ela", "Ambos"];
}

function formatMoney(value) {
  return state.privacyMode ? "R$ ••••" : money.format(Number(value || 0));
}

function getInviteParam() {
  return new URLSearchParams(location.search).get("invite");
}

function getInviteLink() {
  if (!householdInviteCode) return "";
  const url = new URL(`${location.origin}${location.pathname}`);
  url.searchParams.set("invite", householdInviteCode);
  return url.toString();
}

function setAppReady(ready) {
  document.body.classList.toggle("app-ready", ready);
  document.body.classList.toggle("auth-locked", !ready);
}

function memberDisplayName(member) {
  if (member.user_id === currentUser?.id) return "Você";
  if (member.role === "owner") return "Administrador";
  return "Parceiro";
}

function renderGate(message = "") {
  const auth = qs("#auth-screen");
  if (!cloud) {
    setAppReady(true);
    return;
  }

  if (!currentUser) {
    setAppReady(false);
    const isSignup = authMode === "signup";
    const isForgot = authMode === "forgot";
    const rememberedEmail = localStorage.getItem("duofinLoginEmail") || "";
    const title = isForgot ? "Recupere seu acesso" : isSignup ? "Comece do zero" : "Entre no DuoFin";
    const subtitle = isForgot
      ? "Enviamos um link seguro para você definir uma nova senha."
      : isSignup
        ? "Crie sua conta, cadastre sua renda e depois conecte seu parceiro pelo código."
        : "Acesse o controle financeiro compartilhado do casal.";
    auth.innerHTML = `
      <div class="auth-card fintech-login">
        <div class="login-hero">
          <div class="brand">
            <span class="brand-mark">DF</span>
            <div><strong>DuoFin</strong><small>Finanças do casal</small></div>
          </div>
          <div class="login-hero-copy">
            <span>Controle compartilhado</span>
            <strong>O dinheiro do casal em uma tela só.</strong>
            <small>Salário, cartões, contas fixas, metas e faturas sincronizados.</small>
          </div>
          <div class="login-preview-grid">
            <div><span>Compartilhado</span><strong>Casal</strong></div>
            <div><span>Proteção</span><strong>Login</strong></div>
            <div><span>Organização</span><strong>Mês</strong></div>
          </div>
        </div>
        <div class="auth-copy">
          <h1>${title}</h1>
          <p>${subtitle}</p>
        </div>
        <form id="login-form" class="auth-actions">
          <label class="field"><span>E-mail</span><input name="email" type="email" autocomplete="email" inputmode="email" placeholder="voce@email.com" value="${rememberedEmail}" required></label>
          ${isForgot ? "" : passwordField("Senha", isSignup ? "new-password" : "current-password")}
          ${isForgot ? "" : `<label class="remember-login"><input name="rememberEmail" type="checkbox" ${rememberedEmail ? "checked" : ""}> <span>Lembrar meu e-mail neste aparelho</span></label>`}
          <button class="primary" type="submit">${isForgot ? "Enviar link para senha" : isSignup ? "Criar conta" : "Entrar"}</button>
          <div class="auth-secondary-actions">
            ${isForgot ? `<button class="ghost" id="toggle-auth" type="button">Voltar para entrar</button>` : `<button class="ghost" id="toggle-auth" type="button">${isSignup ? "Já tenho conta" : "Criar conta nova"}</button>`}
            ${isSignup || isForgot ? "" : `<button class="ghost recovery-link" id="forgot-password" type="button">Esqueci minha senha</button>`}
          </div>
        </form>
        <div class="auth-safe-note"><b>✓</b><span>O Chrome pode guardar sua senha com segurança. O DuoFin guarda só seu e-mail, se você quiser.</span></div>
        ${message ? `<p class="mini-status">${message}</p>` : ""}
      </div>
    `;
    qs("#login-form").addEventListener("submit", handlePasswordAuth);
    qs("#toggle-auth").addEventListener("click", () => {
      authMode = isForgot ? "signin" : isSignup ? "signin" : "signup";
      renderGate();
    });
    const forgot = qs("#forgot-password");
    if (forgot) forgot.addEventListener("click", () => {
      const typedEmail = qs("#login-form input[name='email']")?.value?.trim();
      if (typedEmail) localStorage.setItem("duofinLoginEmail", typedEmail);
      authMode = "forgot";
      renderGate();
    });
    return;
  }

  if (authMode === "reset") {
    setAppReady(false);
    auth.innerHTML = `
      <div class="auth-card">
        <div class="brand">
          <span class="brand-mark">DF</span>
          <div><strong>DuoFin</strong><small>${currentUser.email}</small></div>
        </div>
        <h1>Criar nova senha</h1>
        <p>Defina uma senha para entrar direto na sua conta das próximas vezes.</p>
        <form id="new-password-form" class="auth-actions">
          ${passwordField("Nova senha")}
          <button class="primary" type="submit">Salvar senha</button>
        </form>
        ${message ? `<p class="mini-status">${message}</p>` : ""}
      </div>
    `;
    qs("#new-password-form").addEventListener("submit", updatePassword);
    return;
  }

  if (!cloudReady) {
    setAppReady(false);
    const invite = getInviteParam();
    auth.innerHTML = `
      <div class="auth-card">
        <div class="brand">
          <span class="brand-mark">DF</span>
          <div><strong>DuoFin</strong><small>${currentUser.email}</small></div>
        </div>
        ${invite ? `
          <h1>Confirmar convite</h1>
          <p>Você foi convidado para compartilhar as finanças do casal. Ao aceitar, esta conta verá e poderá alterar os mesmos dados do cofre.</p>
          <div class="invite-alert">
            <strong>Cuidado antes de aceitar</strong>
            <span>Use este convite apenas com a pessoa que deve participar do controle financeiro.</span>
          </div>
          <div class="auth-actions">
            <button class="primary" id="accept-invite" type="button">Aceitar convite</button>
            <button class="ghost" id="ignore-invite" type="button">Ignorar convite e abrir minha conta</button>
            <button class="ghost" id="logout" type="button">Usar outro e-mail</button>
          </div>
        ` : `
          <h1>Escolha seu espaço financeiro</h1>
          <p>Para compartilhar com seu companheiro, entre com o código dele. Se for começar sozinho, crie um cofre novo.</p>
          <form class="auth-actions" id="manual-invite-form">
            <label class="field"><span>Código de convite</span><input name="code" placeholder="CASAL-ABC123"></label>
            <button class="primary" type="submit">Entrar com código</button>
            <button class="ghost" id="create-household" type="button">Criar cofre novo</button>
            <button class="ghost" id="logout" type="button">Usar outro e-mail</button>
          </form>
        `}
        ${message ? `<p class="mini-status">${message}</p>` : ""}
      </div>
    `;
    const logout = qs("#logout");
    if (logout) logout.addEventListener("click", signOut);
    const accept = qs("#accept-invite");
    if (accept) accept.addEventListener("click", () => joinHousehold(invite));
    const ignoreInvite = qs("#ignore-invite");
    if (ignoreInvite) ignoreInvite.addEventListener("click", () => {
      history.replaceState({}, "", location.pathname);
      loadExistingHousehold(true);
    });
    const manualInvite = qs("#manual-invite-form");
    if (manualInvite) manualInvite.addEventListener("submit", (event) => {
      event.preventDefault();
      joinHousehold(new FormData(event.target).get("code"));
    });
    const create = qs("#create-household");
    if (create) create.addEventListener("click", createHousehold);
    return;
  }

  setAppReady(true);
}

function renderCloudPanel(message = "") {
  const panel = qs("#cloud-panel");

  if (!cloud) {
    panel.innerHTML = `<span class="mini-status">Modo local</span>`;
    return;
  }

  if (!currentUser || !cloudReady) {
    panel.innerHTML = "";
    return;
  }

  const savedText = message || syncStatus || "Pronto para salvar";
  panel.innerHTML = `
    <div class="top-status">
      <span><i class="dot"></i> Online</span>
      <small>${savedText}</small>
    </div>
    <button class="notif-button" id="toggle-notifications" type="button" title="Notificações">🔔${unreadCount() ? `<b>${unreadCount()}</b>` : ""}</button>
    <button class="notif-button" id="toggle-privacy" type="button" title="Ocultar valores">${state.privacyMode ? "🙈" : "👁"}</button>
  `;
  qs("#toggle-notifications").addEventListener("click", () => {
    notificationsOpen = !notificationsOpen;
    renderNotifications();
  });
  qs("#toggle-privacy").addEventListener("click", () => {
    state.privacyMode = !state.privacyMode;
    commitState();
  });
  renderNotifications();
}

function unreadCount() {
  return (state.notifications || []).filter((item) => !isNotificationRead(item)).length;
}

function currentActor() {
  return currentUser?.email?.split("@")[0] || "Alguém";
}

function currentActorId() {
  return currentUser?.id || currentUser?.email || "local";
}

function notificationUserKey() {
  return currentActorId();
}

function isNotificationRead(item) {
  return Boolean(item.readBy?.[notificationUserKey()]);
}

function markNotificationRead(item, view = item.view) {
  return {
    ...item,
    view,
    read: false,
    readBy: {
      ...(item.readBy || {}),
      [notificationUserKey()]: new Date().toISOString()
    }
  };
}

function notify(type, text, view = "", visible = true, source = "user") {
  ensureStateShape();
  state.notifications.unshift({
    id: crypto.randomUUID(),
    type,
    text,
    view: view || notificationTarget(type, text),
    actor: currentActor(),
    actorId: currentActorId(),
    source,
    at: new Date().toISOString(),
    read: false,
    readBy: {}
  });
  state.notifications = state.notifications.slice(0, 30);
  if (visible) showToast(text, type === "card" ? "info" : "success");
}

function smartNotify(key, type, text, view = "") {
  const scopedKey = `${state.selectedMonth}:${key}`;
  if (state.notificationMarks[scopedKey]) return;
  state.notificationMarks[scopedKey] = true;
  notify(type, text, view, false, "auto");
}

function showToast(text, tone = "success") {
  if (!text || !document.body) return;
  let toast = qs("#app-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "app-toast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }
  const icon = tone === "error" ? "!" : tone === "info" ? "i" : "✓";
  toast.className = `app-toast ${tone} show`;
  toast.innerHTML = `<b>${icon}</b><span>${text}</span>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function notificationTarget(type, text = "") {
  const lower = text.toLowerCase();
  if (type === "entry") return "statement";
  if (type === "card") return "cards";
  if (type === "account") return "accounts";
  if (type === "goal") return "goals";
  if (type === "invite") return "settings";
  if (lower.includes("vence") || lower.includes("atrasad")) return "agenda";
  if (lower.includes("fixo") || lower.includes("conta fixa")) return "fixed";
  if (lower.includes("orçamento") || lower.includes("perfil") || lower.includes("categoria") || lower.includes("backup")) return "settings";
  return "dashboard";
}

function ensureSmartNotifications() {
  if (!currentUser || !cloudReady) return;
  const summary = currentSummary();
  fixedBillsWithDueInfo().filter((item) => !isFixedPaid(item)).forEach((item) => {
    if (item.diffDays === 3) smartNotify(`fixed-${item.id}-3`, "sync", `${item.name} vence em 3 dias`, "agenda");
    if (item.diffDays === 0) smartNotify(`fixed-${item.id}-0`, "sync", `${item.name} vence hoje`, "agenda");
    if (item.diffDays < 0) smartNotify(`fixed-${item.id}-late`, "sync", `${item.name} está atrasada`, "agenda");
  });
  if (summary.balance < 0) smartNotify("negative-balance", "sync", "O saldo do mês ficou negativo", "dashboard");
  state.cards.forEach((card) => {
    const totals = cardTotals(card.name);
    if (Number(card.limit || 0) && totals.used >= Number(card.limit || 0) * 0.8) {
      smartNotify(`card-limit-${card.id}`, "card", `${card.name} já usou 80% do limite`, "cards");
    }
    const now = new Date();
    const dueDate = new Date(Number(state.selectedYear || now.getFullYear()), monthIndex(state.selectedMonth), Math.min(Number(card.dueDay || 10), 28));
    const diffDays = Math.round((dueDate - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    if (totals.month > 0 && diffDays === 3) smartNotify(`card-due-${card.id}-3`, "card", `Fatura ${card.name} vence em 3 dias`, "cards");
    if (totals.month > 0 && diffDays === 0) smartNotify(`card-due-${card.id}-0`, "card", `Fatura ${card.name} vence hoje`, "cards");
  });
  state.goals.forEach((goal) => {
    if (Number(goal.target || 0) && Number(goal.saved || 0) >= Number(goal.target || 0)) {
      smartNotify(`goal-done-${goal.id}`, "goal", `Meta concluída: ${goal.title}`, "goals");
    }
  });
}

function renderNotifications() {
  let panel = qs("#notifications-panel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "notifications-panel";
    panel.className = "notifications-panel";
    document.body.appendChild(panel);
  }

  if (!notificationsOpen) {
    panel.classList.remove("open");
    return;
  }

  const items = state.notifications || [];
  panel.classList.add("open");
  panel.innerHTML = `
    <div class="notifications-head">
      <strong>Notificações</strong>
      <button class="tiny ghost" id="mark-read" type="button">Marcar lidas</button>
    </div>
    <div class="notifications-list">
      ${items.length ? items.map(notificationItem).join("") : `<div class="empty"><strong>Nada por aqui</strong><span>As novidades do casal aparecem aqui.</span></div>`}
    </div>
  `;
  qs("#mark-read").addEventListener("click", () => {
    state.notifications = state.notifications.map((item) => markNotificationRead(item));
    commitState();
    notificationsOpen = true;
    renderNotifications();
  });
}

function renderTutorial() {
  const modal = qs("#app-modal");
  if (state.tutorialDone || modalMode) return;
  document.body.classList.add("modal-open");
  modal.classList.add("open");
  const [title, text] = tutorialSteps[tutorialStep];
  modal.innerHTML = `
    <div class="modal-card tutorial-card">
      <div class="modal-head">
        <strong>Tour rápido</strong>
        <button class="ghost tiny" id="skip-tutorial" type="button">Pular</button>
      </div>
      <div class="tutorial-body">
        <span class="tutorial-count">${tutorialStep + 1} de ${tutorialSteps.length}</span>
        <h2>${title}</h2>
        <p>${text}</p>
      </div>
      <div class="tutorial-actions">
        <button class="ghost" id="prev-tutorial" type="button" ${tutorialStep === 0 ? "disabled" : ""}>Voltar</button>
        <button class="ghost" id="open-tutorial-view" type="button">Abrir esta aba</button>
        <button class="primary" id="next-tutorial" type="button">${tutorialStep === tutorialSteps.length - 1 ? "Concluir" : "Próximo"}</button>
      </div>
    </div>
  `;
  qs("#skip-tutorial").addEventListener("click", finishTutorial);
  qs("#prev-tutorial").addEventListener("click", () => {
    tutorialStep = Math.max(0, tutorialStep - 1);
    renderTutorial();
  });
  qs("#next-tutorial").addEventListener("click", () => {
    if (tutorialStep >= tutorialSteps.length - 1) finishTutorial();
    else {
      tutorialStep += 1;
      renderTutorial();
    }
  });
  qs("#open-tutorial-view").addEventListener("click", () => {
    const target = tutorialViews[tutorialStep] || "dashboard";
    finishTutorial();
    setActiveView(target);
  });
}

function finishTutorial() {
  state.tutorialDone = true;
  document.body.classList.remove("modal-open");
  qs("#app-modal").classList.remove("open");
  qs("#app-modal").innerHTML = "";
  commitState();
}

function openQuickAdd() {
  modalMode = "quick";
  renderModal();
}

function closeModal() {
  modalMode = null;
  document.body.classList.remove("modal-open");
  qs("#app-modal").classList.remove("open");
  qs("#app-modal").innerHTML = "";
}

function renderModal() {
  const modal = qs("#app-modal");
  if (!modalMode) return closeModal();
  document.body.classList.add("modal-open");
  modal.classList.add("open");
  if (typeof modalMode === "object") {
    modal.innerHTML = editModalHtml(modalMode);
    qs("#close-modal").addEventListener("click", closeModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    }, { once: true });
    const form = qs("#edit-modal-form");
    if (form) form.addEventListener("submit", saveEditModal);
    return;
  }
  if (modalMode === "confirm") {
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><strong>Confirmar ação</strong><button class="ghost tiny" id="close-modal" type="button">Fechar</button></div>
        <div class="tutorial-body"><p>Tem certeza que deseja continuar?</p></div>
        <div class="tutorial-actions"><button class="ghost" id="cancel-confirm" type="button">Cancelar</button><button class="danger" id="accept-confirm" type="button">Confirmar</button></div>
      </div>
    `;
    qs("#close-modal").addEventListener("click", closeModal);
    qs("#cancel-confirm").addEventListener("click", closeModal);
    qs("#accept-confirm").addEventListener("click", () => {
      const action = confirmAction;
      confirmAction = null;
      closeModal();
      if (action) action();
    });
    return;
  }
  if (modalMode === "itemActions") {
    modal.innerHTML = `
      <div class="modal-card">
        <div class="modal-head"><strong>Opções do item</strong><button class="ghost tiny" id="close-modal" type="button">Fechar</button></div>
        <div class="quick-shortcuts action-options">
          ${(currentActionOptions || []).map((item) => `<button class="quick-shortcut" type="button" ${item.dataset}><b>${item.icon}</b><span>${item.label}</span></button>`).join("")}
        </div>
      </div>
    `;
    qs("#close-modal").addEventListener("click", closeModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    }, { once: true });
    return;
  }
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <strong>Ação rápida</strong>
        <button class="ghost tiny" id="close-modal" type="button">Fechar</button>
      </div>
      <div class="quick-shortcuts">
        <button class="quick-shortcut" type="button" data-view="entries"><b>＋</b><span>Lançar entrada/saída</span></button>
        <button class="quick-shortcut" type="button" data-view="entries"><b>▣</b><span>Compra no cartão</span></button>
        <button class="quick-shortcut" type="button" data-view="fixed"><b>◷</b><span>Despesa fixa</span></button>
        <button class="quick-shortcut" type="button" data-view="accounts"><b>≋</b><span>Carteira</span></button>
        <button class="quick-shortcut danger-soft" type="button" id="quick-logout"><b>↩</b><span>Sair da conta</span></button>
      </div>
      <form class="auth-actions" id="quick-form">
        <small class="quick-form-title">Ou salve um lançamento simples aqui</small>
        ${select("type", "Tipo", ["Saída", "Entrada"])}
        ${input("value", "Valor", "number", "", "0.01")}
        ${input("description", "Descrição", "text", "")}
        ${select("person", "Quem?", appPeople())}
        <button class="primary" type="submit">Salvar rápido</button>
      </form>
    </div>
  `;
  qs("#close-modal").addEventListener("click", closeModal);
  modal.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", closeModal));
  qs("#quick-logout").addEventListener("click", () => {
    closeModal();
    signOut();
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  }, { once: true });
  qs("#quick-form").addEventListener("submit", saveQuickEntry);
}

function editModalHtml(config) {
  const title = { fixed: "Editar conta fixa", account: "Editar carteira", card: "Editar cartão", installment: "Editar compra do cartão", cardRecurring: "Editar fixo no cartão", cardPayment: "Editar pagamento da fatura", goal: "Editar meta", category: "Editar categoria", goalAdd: "Adicionar valor à meta" }[config.kind] || "Editar";
  const fields = config.fields.map(editFieldHtml).join("");
  return `
    <div class="modal-card">
      <div class="modal-head">
        <strong>${title}</strong>
        <button class="ghost tiny" id="close-modal" type="button">Fechar</button>
      </div>
      <form class="auth-actions" id="edit-modal-form">
        <input type="hidden" name="kind" value="${config.kind}">
        <input type="hidden" name="id" value="${config.id}">
        ${config.extra ? Object.entries(config.extra).map(([key, value]) => `<input type="hidden" name="${key}" value="${value}">`).join("") : ""}
        ${fields}
        <button class="primary" type="submit">Salvar alteração</button>
      </form>
    </div>
  `;
}

function editFieldHtml(field) {
  if (field.type === "select") {
    return `<label class="field"><span>${labelWithHelp(field.label, field.help || "")}</span><select name="${field.name}">${field.options.map((option) => {
      const selected = field.match === "card" ? sameCard(option, field.value) : option === field.value;
      return `<option ${selected ? "selected" : ""}>${option}</option>`;
    }).join("")}</select></label>`;
  }
  return input(field.name, field.label, field.type || "text", field.value ?? "", field.step || "", field.help || "");
}

function saveEditModal(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (data.kind === "fixed") {
    const item = state.fixedBills.find((bill) => bill.id === data.id);
    if (item) Object.assign(item, { name: data.name, value: Number(data.value || 0), dueDay: Number(data.dueDay || 1) });
  }
  if (data.kind === "account") {
    const item = state.accounts.find((account) => account.id === data.id);
    if (item) {
      const oldName = item.name;
      item.name = data.name;
      item.initial = Number(data.initial || 0);
      state.entries = state.entries.map((entry) => entry.account === oldName ? { ...entry, account: item.name } : entry);
    }
  }
  if (data.kind === "card") {
    const item = state.cards.find((card) => card.id === data.id);
    if (item) {
      const oldName = item.name;
      item.name = data.name;
      item.limit = Number(data.limit || 0);
      item.closeDay = Number(data.closeDay || 20);
      item.dueDay = Number(data.dueDay || 10);
      state.installments = state.installments.map((installment) => sameCard(installment.card, oldName) ? { ...installment, card: item.name } : installment);
      state.cardRecurring = state.cardRecurring.map((fixed) => sameCard(fixed.card, oldName) ? { ...fixed, card: item.name } : fixed);
    }
  }
  if (data.kind === "installment") {
    const item = state.installments.find((installment) => installment.id === data.id);
    if (item) {
      const purchaseDate = new Date(`${data.date}T00:00:00Z`);
      const purchaseMonth = Number.isNaN(purchaseDate.getTime()) ? state.selectedMonth : months[purchaseDate.getUTCMonth()];
      const invoicePeriod = invoicePeriodForPurchase(data.date, data.card);
      const firstMonth = data.firstMonth === purchaseMonth ? invoicePeriod.month : data.firstMonth;
      const baseYear = Number.isNaN(purchaseDate.getTime()) ? Number(state.selectedYear || new Date().getFullYear()) : purchaseDate.getUTCFullYear();
      const firstYear = data.firstMonth === purchaseMonth ? invoicePeriod.year : baseYear + (monthIndex(firstMonth) < (Number.isNaN(purchaseDate.getTime()) ? monthIndex(state.selectedMonth) : purchaseDate.getUTCMonth()) ? 1 : 0);
      Object.assign(item, {
        date: data.date,
        card: data.card,
        description: data.description,
        category: data.category,
        value: Number(data.value || 0),
        parts: Math.max(1, Number(data.parts || 1)),
        firstMonth,
        firstYear
      });
    }
  }
  if (data.kind === "cardRecurring") {
    const item = state.cardRecurring.find((fixed) => fixed.id === data.id);
    if (item) {
      Object.assign(item, {
        card: data.card,
        description: data.description,
        category: data.category,
        value: Number(data.value || 0),
        day: Number(data.day || 1)
      });
    }
  }
  if (data.kind === "cardPayment") {
    const item = state.cardPayments.find((payment) => payment.id === data.id);
    if (item) Object.assign(item, { description: data.description, value: Number(data.value || 0), date: data.date });
  }
  if (data.kind === "goal") {
    const item = state.goals.find((goal) => goal.id === data.id);
    if (item) Object.assign(item, { title: data.title, target: Number(data.target || 0), saved: Number(data.saved || 0), due: data.due, status: data.status || item.status });
  }
  if (data.kind === "goalAdd") {
    const item = state.goals.find((goal) => goal.id === data.id);
    if (item) {
      item.saved = Number(item.saved || 0) + Number(data.value || 0);
      if (item.saved >= Number(item.target || 0)) item.status = "Concluído";
    }
  }
  if (data.kind === "category") {
    const key = data.categoryKind === "Receita" ? "categoriesIncome" : "categoriesExpense";
    state[key] = state[key].map((item) => item === data.oldName ? data.name : item);
    state.entries = state.entries.map((item) => item.category === data.oldName ? { ...item, category: data.name } : item);
    state.installments = state.installments.map((item) => item.category === data.oldName ? { ...item, category: data.name } : item);
  }
  notify("sync", "Alteração salva");
  closeModal();
  commitState();
}

function askConfirm(action) {
  confirmAction = action;
  modalMode = "confirm";
  renderModal();
}

function openItemActions(options) {
  currentActionOptions = options;
  modalMode = "itemActions";
  renderModal();
}

function actionOption(label, icon, dataset) {
  return { label, icon, dataset };
}

function optionButton(kind, id) {
  return `<button class="tiny ghost" data-options-kind="${kind}" data-options-id="${id}">Opções</button>`;
}

function saveQuickEntry(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const type = data.type === "Entrada" ? "Receita" : "Despesa";
  const today = new Date().toISOString().slice(0, 10);
  state.entries.unshift({
    id: crypto.randomUUID(),
    date: today,
    month: months[new Date().getMonth()],
    type,
    category: type === "Receita" ? state.categoriesIncome[0] : state.categoriesExpense[0],
    description: data.description || (type === "Receita" ? "Entrada rápida" : "Saída rápida"),
    value: Number(data.value || 0),
    person: data.person,
    payment: type === "Receita" ? "Recebimento" : "Pix",
    account: accountOptions()[0],
    status: "Pago",
    notes: ""
  });
  notify("entry", `${data.type} rápida · ${formatMoney(Number(data.value || 0))}`);
  closeModal();
  commitState();
}

function notificationItem(item) {
  const time = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.at));
  const view = item.view || notificationTarget(item.type, item.text);
  const read = isNotificationRead(item);
  const isAuto = item.source === "auto";
  const isOwn = !item.actorId ? item.actor === currentActor() : item.actorId === currentActorId();
  const origin = isAuto ? "Alerta automático" : isOwn ? "Você" : `${item.actor || "Parceiro"} · parceiro`;
  return `
    <button class="notification-item ${read ? "" : "unread"} ${isAuto ? "auto-alert" : isOwn ? "own-change" : "partner-change"}" type="button" data-notification-id="${item.id}" data-notification-view="${view}">
      <span>${notificationIcon(item.type)}</span>
      <div><strong>${item.text}</strong><small>${origin} · ${time} · abrir ${pageTitle(view) || "tela"}</small></div>
    </button>
  `;
}

function notificationIcon(type) {
  return { entry: "＋", card: "▣", account: "≋", goal: "◇", invite: "↗", sync: "✓" }[type] || "•";
}

async function copyInviteLink() {
  const inviteCode = householdInviteCode;
  if (!inviteCode) return;
  try {
    await navigator.clipboard.writeText(inviteCode);
    notify("invite", `Código de convite copiado: ${inviteCode}`);
    await commitState();
    renderCloudPanel("Código copiado");
  } catch {
    renderCloudPanel(inviteCode);
  }
}

async function rotateInviteCode() {
  if (!cloudReady || !householdId) return;
  const ok = confirm("Gerar um novo código? O código antigo deixa de funcionar para novos convites.");
  if (!ok) return;
  const nextCode = makeInviteCode();
  let { data, error } = await cloud.rpc("rotate_household_invite", { new_code: nextCode });
  if (error) {
    const fallback = await cloud
      .from("households")
      .update({ invite_code: nextCode })
      .eq("id", householdId)
      .select("invite_code")
      .single();
    data = fallback.data?.invite_code;
    error = fallback.error;
  }
  if (error) {
    showToast("Não deu para trocar o código. Atualize o SQL do Supabase e tente de novo.", "error");
    return;
  }
  householdInviteCode = data || nextCode;
  inviteCodeVisible = true;
  localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  notify("invite", "Novo código de convite gerado");
  await commitState();
  renderSettings();
}

async function loadHouseholdMembers() {
  householdMembers = [];
  if (!cloudReady || !householdId || !cloud) return;
  const { data, error } = await cloud.rpc("list_household_members");
  if (!error && Array.isArray(data)) {
    householdMembers = data;
    return;
  }
  const fallback = await cloud
    .from("household_members")
    .select("household_id,user_id,role,created_at")
    .eq("household_id", householdId);
  householdMembers = fallback.data || [];
}

async function removeHouseholdMember(userId) {
  if (!userId || userId === currentUser?.id) return;
  const ok = confirm("Remover esta pessoa do cofre? Ela não verá mais os dados compartilhados.");
  if (!ok) return;
  const { error } = await cloud.rpc("remove_household_member", { member_user_id: userId });
  if (error) {
    showToast("Não deu para remover. Atualize o SQL do Supabase e tente de novo.", "error");
    return;
  }
  householdMembers = householdMembers.filter((member) => member.user_id !== userId);
  notify("invite", "Pessoa removida do cofre");
  await commitState();
  renderSettings();
}

function promptJoinHousehold() {
  const code = prompt("Cole aqui o código de convite do cofre compartilhado:", "");
  if (!code) return;
  joinHousehold(code);
}

function showJoinError(message) {
  loadingCloud = false;
  const text = message || "Não conseguimos entrar no cofre. Confira o código e tente de novo.";
  if (cloudReady) {
    alert(text);
    renderCloudPanel(text);
    return;
  }
  renderGate(text);
}

async function handlePasswordAuth(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = String(form.get("email") || "").trim();
  if (form.get("rememberEmail") || authMode === "forgot") localStorage.setItem("duofinLoginEmail", email);
  else localStorage.removeItem("duofinLoginEmail");
  if (authMode === "forgot") {
    const { error } = await cloud.auth.resetPasswordForEmail(email, {
      redirectTo: location.href.split("#")[0]
    });
    renderGate(error ? translateAuthError(error.message) : "Enviamos um link para você criar uma nova senha.");
    return;
  }

  const password = form.get("password");
  const response = authMode === "signup"
    ? await cloud.auth.signUp({ email, password })
    : await cloud.auth.signInWithPassword({ email, password });

  if (response.error) {
    renderGate(translateAuthError(response.error.message));
    return;
  }

  currentUser = response.data.user || response.data.session?.user || null;
  if (!currentUser && authMode === "signup") {
    renderGate("Conta criada. Confira seu e-mail para confirmar o cadastro.");
    return;
  }

  await loadExistingHousehold();
}

async function updatePassword(event) {
  event.preventDefault();
  const password = new FormData(event.target).get("password");
  const { error } = await cloud.auth.updateUser({ password });
  if (error) {
    renderGate(translateAuthError(error.message));
    return;
  }
  authMode = "signin";
  await loadExistingHousehold();
}

function translateAuthError(message) {
  const text = String(message || "");
  if (text.includes("Invalid login credentials")) return "E-mail ou senha inválidos.";
  if (text.includes("Password should be")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (text.includes("User already registered")) return "Este e-mail já tem conta. Use Entrar.";
  if (text.includes("Email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (text.includes("For security purposes")) return "Aguarde alguns instantes antes de tentar novamente.";
  return text;
}

async function signOut() {
  await cloud.auth.signOut();
  currentUser = null;
  cloudReady = false;
  householdId = null;
  householdInviteCode = null;
  localStorage.removeItem("coupleFinanceHouseholdId");
  localStorage.removeItem("coupleFinanceInviteCode");
  render();
}

function makeInviteCode() {
  return `CASAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function createHousehold() {
  loadingCloud = true;
  renderGate("Criando...");
  const id = crypto.randomUUID();
  const code = makeInviteCode();
  const { error: householdError } = await cloud.from("households").insert({ id, name: "Finanças do Casal", invite_code: code, created_by: currentUser.id });
  if (householdError) {
    loadingCloud = false;
    return renderGate(householdError.message);
  }

  const { error: memberError } = await cloud.from("household_members").insert({ household_id: id, user_id: currentUser.id, role: "owner" });
  if (memberError) {
    loadingCloud = false;
    return renderGate(memberError.message);
  }

  householdId = id;
  householdInviteCode = code;
  cloudReady = true;
  state = blankState();
  localStorage.setItem("coupleFinanceApp", JSON.stringify(state));
  localStorage.setItem("coupleFinanceHouseholdId", householdId);
  localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  await saveCloudState();
  startCloudPolling();
  loadingCloud = false;
  render();
}

async function joinHousehold(code) {
  if (!code) return showJoinError("Convite inválido");
  loadingCloud = true;
  renderGate("Confirmando convite...");
  const normalizedCode = String(code).trim().toUpperCase();
  const { data, error } = await cloud.rpc("join_household_by_code", { join_code: normalizedCode });
  if (error) return showJoinError(error.message);
  householdId = data;
  householdInviteCode = normalizedCode;
  localStorage.setItem("coupleFinanceHouseholdId", householdId);
  localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  await loadCloudState();
  history.replaceState({}, "", location.pathname);
  loadingCloud = false;
  render();
}

async function loadExistingHousehold(ignoreInvite = false) {
  if (getInviteParam() && !ignoreInvite) {
    cloudReady = false;
    renderGate("Confirme o convite antes de abrir qualquer dado.");
    return;
  }

  const storedHouseholdId = localStorage.getItem("coupleFinanceHouseholdId");
  if (storedHouseholdId) {
    householdId = storedHouseholdId;
    const loaded = await tryLoadHouseholdById(storedHouseholdId);
    if (loaded) {
      render();
      return;
    }
  }

  const { data: memberships } = await cloud
    .from("household_members")
    .select("household_id")
    .eq("user_id", currentUser.id)
    .limit(1);

  if (!memberships?.length) {
    cloudReady = false;
    render();
    return;
  }

  householdId = memberships[0].household_id;
  localStorage.setItem("coupleFinanceHouseholdId", householdId);
  const { data: household } = await cloud.from("households").select("invite_code").eq("id", householdId).single();
  householdInviteCode = household?.invite_code || householdInviteCode;
  if (householdInviteCode) localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  await loadCloudState();
  render();
}

async function tryLoadHouseholdById(id) {
  const { data: household, error: householdError } = await cloud
    .from("households")
    .select("invite_code")
    .eq("id", id)
    .single();

  if (householdError || !household) {
    localStorage.removeItem("coupleFinanceHouseholdId");
    localStorage.removeItem("coupleFinanceInviteCode");
    return false;
  }

  householdInviteCode = household.invite_code || householdInviteCode;
  if (householdInviteCode) localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  await loadCloudState();
  return true;
}

async function loadCloudState() {
  const { data, error } = await cloud.from("household_states").select("data, updated_at").eq("household_id", householdId).single();
  if (!error && data?.data && Object.keys(data.data).length) {
    state = data.data;
    lastCloudUpdatedAt = data.updated_at;
    localStorage.setItem("coupleFinanceApp", JSON.stringify(state));
  } else {
    cloudReady = true;
    await saveCloudState();
  }
  cloudReady = true;
  await loadHouseholdMembers();
  startCloudPolling();
}

function scheduleCloudSave() {
  if (loadingCloud) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCloudState, 650);
}

async function saveCloudState() {
  if (!cloudReady || !householdId) return;
  syncStatus = "Salvando...";
  const { error } = await cloud.from("household_states").upsert({
    household_id: householdId,
    data: state,
    updated_at: new Date().toISOString()
  });
  if (error) {
    syncStatus = `Erro ao salvar: ${error.message}`;
    showToast(syncStatus, "error");
    renderCloudPanel();
    return;
  }

  const { data: saved, error: readError } = await cloud
    .from("household_states")
    .select("updated_at")
    .eq("household_id", householdId)
    .single();
  if (!readError) lastCloudUpdatedAt = saved.updated_at;
  syncStatus = readError ? `Salvo, mas não conferido: ${readError.message}` : `Salvo ${formatSyncTime(saved.updated_at)}`;
  showToast(readError ? "Salvo, mas não consegui conferir a nuvem" : "Salvo na nuvem", readError ? "info" : "success");
  renderCloudPanel();
}

function startCloudPolling() {
  if (cloudPollStarted) return;
  cloudPollStarted = true;
  setInterval(refreshCloudState, 18000);
}

async function refreshCloudState() {
  if (!cloudReady || !householdId || loadingCloud) return;
  const { data, error } = await cloud
    .from("household_states")
    .select("data, updated_at")
    .eq("household_id", householdId)
    .single();
  if (error || !data?.updated_at || data.updated_at === lastCloudUpdatedAt) return;
  state = data.data;
  lastCloudUpdatedAt = data.updated_at;
  localStorage.setItem("coupleFinanceApp", JSON.stringify(state));
  syncStatus = `Atualizado ${formatSyncTime(data.updated_at)}`;
  loadingCloud = true;
  render();
  loadingCloud = false;
}

function formatSyncTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

async function initCloud() {
  if (!cloud) {
    render();
    return;
  }

  const { data } = await cloud.auth.getSession();
  currentUser = data.session?.user || null;
  cloud.auth.onAuthStateChange((_event, session) => {
    if (_event === "PASSWORD_RECOVERY") authMode = "reset";
    currentUser = session?.user || null;
    if (currentUser && authMode !== "reset") loadExistingHousehold();
    else if (currentUser) renderGate();
    else render();
  });

  if (currentUser) await loadExistingHousehold();
  else render();
}

function renderMonthFilter() {
  const select = qs("#month-filter");
  if (select && !qs("#year-filter")) {
    select.closest("label")?.insertAdjacentHTML("afterend", `
      <label class="field compact year-compact">
        <span>Ano</span>
        <select id="year-filter"></select>
      </label>
    `);
  }
  const yearSelect = qs("#year-filter");
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 7 }, (_, index) => currentYear - 3 + index);
  select.innerHTML = months.map((month) => `<option ${month === state.selectedMonth ? "selected" : ""}>${month}</option>`).join("");
  if (yearSelect) {
    yearSelect.innerHTML = years.map((year) => `<option value="${year}" ${Number(state.selectedYear) === year ? "selected" : ""}>${year}</option>`).join("");
  }
}

function ensureMoreNavigation() {
  const tabs = qs(".tabs");
  const fixedTab = qs('[data-view="fixed"]', tabs);
  if (fixedTab) {
    fixedTab.title = "Despesas Fixas";
    const label = qs("span", fixedTab);
    if (label) label.textContent = "Despesas Fixas";
  }
  if (tabs && !qs('[data-view="more"]', tabs)) {
    tabs.insertAdjacentHTML("beforeend", `<button class="tab tab-more" data-view="more" title="Mais">☰ <span>Mais</span></button>`);
  }
  if (!qs("#more")) {
    qs(".shell").insertAdjacentHTML("beforeend", `<section class="view" id="more"></section>`);
  }
}

function renderDashboard() {
  const summary = currentSummary();
  const forecast = monthForecast(summary);
  const budgetAlerts = budgetWarnings();
  const categoryTotals = byMonth(state.entries)
    .filter((item) => item.type === "Despesa")
    .reduce((acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + Number(item.value || 0) }), {});
  const chartData = monthChartData(summary);
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
  const actionCards = dashboardActionCards(summary, forecast, todaySummary(), budgetAlerts, topCategory);
  const mood = dashboardMood(summary.balance, summary.salaryTotal);

  qs("#dashboard").innerHTML = `
    <section class="bank-home">
      <div class="balance-card">
        <div>
          <span>Saldo do mês</span>
          <strong>${formatMoney(summary.balance)}</strong>
          <small>${state.selectedMonth} de ${state.selectedYear} · Conta compartilhada</small>
          <p class="mood-message">${mood.message}</p>
        </div>
        ${coupleIllustration(mood)}
        <div class="balance-ring">
          <span>${mood.label}</span>
        </div>
      </div>
      <div class="quick-actions">
        <button class="action-chip" data-view="entries"><b>＋</b><span>Lançamento</span></button>
        <button class="action-chip" data-view="statement"><b>☷</b><span>Extrato</span></button>
        <button class="action-chip" data-view="agenda"><b>◌</b><span>Agenda</span></button>
        <button class="action-chip" data-view="cards"><b>▣</b><span>Cartão</span></button>
      </div>
    </section>
    ${initialSetupPanel()}
    <div class="summary-grid bank-metrics compact-dashboard">
      ${metric("Entradas", summary.income + summary.salaryTotal, "good")}
      ${metric("Saídas", summary.expense + summary.fixedPaid, "bad")}
      ${metric("Cartões", summary.cardMonth, "info")}
      ${metric("Metas", summary.goalsSaved, "good")}
    </div>
    ${dashboardInvoicesHtml()}
    <div class="grid-2">
      ${dashboardForecastHtml(summary)}
      ${dashboardPeopleHtml()}
    </div>
    <div class="grid-2">
      <div class="panel dashboard-priority">
        <div class="section-title">
          <span>!</span>
          <div><h2>O que olhar agora</h2><small>Alertas do mês e próximos passos</small></div>
        </div>
        <div class="list">
          ${actionCards.map(dashboardActionCard).join("")}
        </div>
      </div>
      <div class="panel dashboard-chart">
        <h2>Gráfico do mês</h2>
        ${donutChart(chartData)}
      </div>
    </div>
  `;
}

function dashboardForecastHtml(summary = currentSummary()) {
  const openInvoices = total(state.cards.map((card) => ({ value: cardStatementSummary(card).open })));
  const fixedPending = summary.fixedPending;
  const projected = summary.balance - fixedPending - openInvoices;
  return `
    <div class="panel dashboard-forecast">
      <div class="section-title"><span>↯</span><div><h2>Previsão do mês</h2><small>Se pagar o que ainda está aberto.</small></div></div>
      <div class="forecast-grid">
        <div><span>Saldo agora</span><strong>${formatMoney(summary.balance)}</strong></div>
        <div><span>Faturas abertas</span><strong>${formatMoney(openInvoices)}</strong></div>
        <div><span>Fixos pendentes</span><strong>${formatMoney(fixedPending)}</strong></div>
        <div><span>Depois de pagar</span><strong>${formatMoney(projected)}</strong></div>
      </div>
    </div>
  `;
}

function dashboardPeopleHtml() {
  const people = appPeople();
  const rows = people.map((person) => {
    const entries = byMonth(state.entries).filter((item) => item.person === person);
    const income = total(entries.filter((item) => item.type === "Receita"));
    const expense = total(entries.filter((item) => item.type === "Despesa"));
    const fixed = total((state.fixedBills || []).filter((item) => item.person === person && isFixedPaid(item)));
    return { person, income, expense: expense + fixed, balance: income - expense - fixed };
  });
  return `
    <div class="panel dashboard-people">
      <div class="section-title"><span>◎</span><div><h2>Resumo por pessoa</h2><small>Entradas, saídas e fixos pagos no mês.</small></div></div>
      <div class="list">
        ${rows.map((row) => `<div class="list-item"><div><strong>${row.person}</strong><span>Entradas ${formatMoney(row.income)} · Saídas ${formatMoney(row.expense)}</span></div><b>${formatMoney(row.balance)}</b></div>`).join("")}
      </div>
    </div>
  `;
}

function dashboardInvoicesHtml() {
  if (!state.cards.length) return "";
  const invoices = state.cards
    .map((card) => ({ card, summary: cardStatementSummary(card) }))
    .filter((item) => item.summary.invoiceTotal > 0 || item.summary.open > 0);
  return `
    <div class="panel dashboard-invoices">
      <div class="section-title">
        <span>▣</span>
        <div><h2>Faturas do mês</h2><small>Valor atual dos cartões em ${state.selectedMonth}/${state.selectedYear}.</small></div>
      </div>
      <div class="dashboard-invoice-grid">
        ${invoices.length ? invoices.map(dashboardInvoiceCard).join("") : `<div class="empty"><strong>Nenhuma fatura no mês</strong><span>Compras no cartão aparecem aqui quando forem lançadas.</span></div>`}
      </div>
    </div>
  `;
}

function dashboardInvoiceCard({ card, summary }) {
  const open = summary.open;
  return `
    <article class="dashboard-invoice-card">
      <div>
        <span>${card.name}</span>
        <strong>${formatMoney(open)}</strong>
        <small>Atual ${formatMoney(summary.invoiceTotal)} · vence dia ${card.dueDay || 10}</small>
      </div>
      <div class="card-actions">
        <button class="tiny ghost" type="button" data-card-detail="${card.name}">Ver</button>
        ${open > 0 ? `<button class="tiny ghost" type="button" data-partial-card-payment="${card.name}">Pagar parcial</button><button class="tiny ghost" type="button" data-pay-card-month="${card.name}">Quitar</button>` : `<button class="tiny ghost" type="button" data-reopen-card-month="${card.name}">Reabrir</button>`}
      </div>
    </article>
  `;
}

function initialSetupPanel() {
  const salaryTotal = Number(state.profile.salaryOne || 0) + Number(state.profile.salaryTwo || 0);
  const steps = [
    {
      done: salaryTotal > 0,
      icon: "R$",
      title: "Colocar uma renda",
      note: "Cadastre o salário médio de pelo menos uma pessoa.",
      view: "settings"
    },
    {
      done: state.accounts.length > 0,
      icon: "≋",
      title: "Criar uma carteira",
      note: "Informe onde o dinheiro fica: banco, dinheiro ou conta digital.",
      view: "accounts",
      wallet: "money"
    },
    {
      done: state.cards.length > 0,
      icon: "▣",
      title: "Adicionar cartão",
      note: "Cadastre limite e cartão para fatura e compras parceladas.",
      view: "cards"
    },
    {
      done: state.fixedBills.length > 0 || state.cardRecurring.length > 0,
      icon: "◷",
      title: "Adicionar gastos fixos",
      note: "Inclua aluguel, internet, assinatura ou conta mensal.",
      view: "fixed"
    }
  ];
  if (steps.every((step) => step.done)) return "";
  return `
    <div class="panel setup-panel">
      <div>
        <h2>Comece pelo básico</h2>
        <p>Com esses dados, o app já consegue calcular saldo, fatura, contas e previsão do mês.</p>
      </div>
      <div class="setup-steps">
        ${steps.map((step) => `
          <button class="setup-step ${step.done ? "done" : ""}" type="button" data-view="${step.view}" ${step.wallet ? `data-setup-wallet="${step.wallet}"` : ""}>
            <b>${step.done ? "✓" : step.icon}</b>
            <span><strong>${step.title}</strong><small>${step.note}</small></span>
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function budgetWarnings(includeAll = false) {
  const monthExpenses = byMonth(state.entries).filter((item) => item.type === "Despesa");
  return Object.entries(state.budgets || {}).map(([category, limit]) => {
    const spent = total(monthExpenses.filter((item) => item.category === category));
    return { category, limit, spent, percent: Math.round((spent / Math.max(1, limit)) * 100) };
  }).filter((item) => item.limit > 0 && (includeAll || item.percent >= 80));
}

function dashboardActionCards(summary, forecast, today, budgetAlerts, topCategory) {
  const fixedAlerts = fixedBillsWithDueInfo().filter((item) => !isFixedPaid(item) && item.priority !== "normal");
  const cards = [];
  if (forecast.afterAll < 0) {
    cards.push({ title: "Saldo previsto negativo", note: "Depois das pendências, o mês fecha no vermelho.", value: formatMoney(forecast.afterAll), view: "fixed", tone: "bad" });
  }
  if (fixedAlerts.length) {
    cards.push({ title: "Contas vencendo", note: `${fixedAlerts.length} gasto${fixedAlerts.length === 1 ? "" : "s"} fixo${fixedAlerts.length === 1 ? "" : "s"} precisa${fixedAlerts.length === 1 ? "" : "m"} de atenção.`, value: String(fixedAlerts.length), view: "agenda", tone: "warn" });
  }
  if (summary.cardMonth > 0) {
    cards.push({ title: "Fatura do mês", note: "Veja compras abertas e pagas na tela de cartões.", value: formatMoney(summary.cardMonth), view: "cards", tone: "info" });
  }
  if (budgetAlerts.length) {
    cards.push({ title: "Orçamento no limite", note: `${budgetAlerts[0].category} já usou ${budgetAlerts[0].percent}% do limite.`, value: formatMoney(budgetAlerts[0].spent), view: "settings", tone: "warn" });
  }
  if (today.dueToday || today.overdue) {
    cards.push({ title: "Vencimentos de hoje", note: `${today.dueToday} vence hoje · ${today.overdue} atrasada${today.overdue === 1 ? "" : "s"}.`, value: String(today.dueToday + today.overdue), view: "agenda", tone: today.overdue ? "bad" : "warn" });
  }
  if (!cards.length) {
    cards.push({ title: "Mês sob controle", note: topCategory ? `Maior categoria: ${topCategory[0]}.` : "Nenhum alerta importante agora.", value: formatMoney(topCategory?.[1] || 0), view: "statement", tone: "good" });
  }
  return cards.slice(0, 4);
}

function dashboardActionCard(item) {
  return `
    <button class="list-item dashboard-action ${item.tone}" type="button" data-view="${item.view}">
      <div><strong>${item.title}</strong><span>${item.note}</span></div>
      <b>${item.value}</b>
    </button>
  `;
}

function monthForecast(summary = currentSummary()) {
  const nextBill = fixedBillsWithDueInfo().find((item) => !isFixedPaid(item)) || null;
  return {
    nextBill,
    afterAll: summary.balance - summary.fixedPending
  };
}

function monthlyReport() {
  const current = state.selectedMonth;
  const currentIndex = monthIndex(current);
  const previous = months[(currentIndex + 11) % 12];
  const previousYear = Number(state.selectedYear) - (currentIndex === 0 ? 1 : 0);
  const currentEntries = byMonth(state.entries, current, state.selectedYear);
  const previousEntries = byMonth(state.entries, previous, previousYear);
  const currentExpense = total(currentEntries.filter((item) => item.type === "Despesa"));
  const previousExpense = total(previousEntries.filter((item) => item.type === "Despesa"));
  const currentIncome = total(currentEntries.filter((item) => item.type === "Receita"));
  const previousIncome = total(previousEntries.filter((item) => item.type === "Receita"));
  const categoryTotals = currentEntries
    .filter((item) => item.type === "Despesa")
    .reduce((acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + Number(item.value || 0) }), {});
  const top = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const expenseDiff = currentExpense - previousExpense;
  const incomeDiff = currentIncome - previousIncome;
  return {
    expenseDiff,
    incomeDiff,
    expenseText: expenseDiff > 0 ? "Gastou mais que no mês anterior" : expenseDiff < 0 ? "Gastou menos que no mês anterior" : "Mesmo nível do mês anterior",
    incomeText: incomeDiff > 0 ? "Entrou mais dinheiro" : incomeDiff < 0 ? "Entrou menos dinheiro" : "Mesma renda lançada",
    topCategory: top[0],
    topCategoryValue: top[1]
  };
}

function fixedBillsWithDueInfo() {
  const now = new Date();
  const selectedIndex = monthIndex(state.selectedMonth);
  const selectedYear = Number(state.selectedYear || now.getFullYear());
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [...(state.fixedBills || [])].map((item) => {
    const dueDate = new Date(selectedYear, selectedIndex, Math.min(Number(item.dueDay || 1), 28));
    const diffDays = Math.round((dueDate - todayStart) / 86400000);
    let priority = "normal";
    let dueText = `Vence dia ${item.dueDay}`;
    if (diffDays < 0) {
      priority = "overdue";
      dueText = `Atrasada há ${Math.abs(diffDays)} dia${Math.abs(diffDays) === 1 ? "" : "s"}`;
    } else if (diffDays === 0) {
      priority = "today";
      dueText = "Vence hoje";
    } else if (diffDays <= 7) {
      priority = "soon";
      dueText = `Vence em ${diffDays} dia${diffDays === 1 ? "" : "s"}`;
    }
    return { ...item, status: isFixedPaid(item) ? "Pago" : "Pendente", dueDate, diffDays, priority, dueText };
  }).sort((a, b) => {
    const order = { overdue: 0, today: 1, soon: 2, normal: 3 };
    return order[a.priority] - order[b.priority] || a.dueDate - b.dueDate;
  });
}

function fixedAlertItem(item) {
  return `
    <div class="list-item due-item ${item.priority}">
      <div><strong>${item.name}</strong><span>${item.dueText} · conta fixa</span></div>
      <b>${formatMoney(item.value)}</b>
    </div>
  `;
}

function monthChartData(summary) {
  return [
    { label: "Entradas", value: summary.salaryTotal + summary.income, color: "#00bf7a" },
    { label: "Saídas", value: summary.expense, color: "#f04438" },
    { label: "Cartões", value: summary.cardMonth, color: "#147dff" },
    { label: "Despesas fixas", value: summary.fixedPaid + summary.fixedPending, color: "#ffb020" }
  ].map((item) => ({ ...item, value: Number(item.value || 0) }))
    .filter((item) => Number.isFinite(item.value) && item.value > 0);
}

function donutChart(items) {
  if (!items.length) return emptyHtml();
  const totalValue = items.reduce((sum, item) => sum + item.value, 0);
  if (!totalValue) return emptyHtml();
  let cursor = 0;
  const segments = items.map((item) => {
    const start = cursor;
    const size = (item.value / totalValue) * 100;
    cursor = Math.min(100, cursor + size);
    return `${item.color} ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  }).join(", ");
  return `
    <div class="chart-card">
      <div class="donut" style="background: conic-gradient(${segments});">
        <div><strong>${formatMoney(totalValue)}</strong><span>Total movimentado</span></div>
      </div>
      <div class="chart-legend">
        ${items.map((item) => `
          <div>
            <i style="--c:${item.color}"></i>
            <span>${item.label}</span>
            <strong>${formatMoney(item.value)}</strong>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function dashboardInsights(summary) {
  const monthEntries = byMonth(state.entries);
  const expenses = monthEntries.filter((item) => item.type === "Despesa");
  const todayKey = new Date().toISOString().slice(0, 10);
  const todaySpent = total(expenses.filter((item) => item.date === todayKey));
  const biggest = expenses.reduce((max, item) => Number(item.value || 0) > Number(max?.value || 0) ? item : max, null);
  const categoryTotals = expenses.reduce((acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + Number(item.value || 0) }), {});
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
  const daysLeft = Math.max(1, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate() + 1);
  return [
    { label: "Gasto hoje", value: formatMoney(todaySpent), note: "Somente saídas do dia" },
    { label: "Pode gastar por dia", value: formatMoney(Math.max(0, summary.balance) / daysLeft), note: `${daysLeft} dias restantes no mês` },
    { label: "Maior gasto", value: biggest ? formatMoney(biggest.value) : formatMoney(0), note: biggest?.description || "Sem gastos no mês" },
    { label: "Categoria destaque", value: topCategory ? formatMoney(topCategory[1]) : formatMoney(0), note: topCategory?.[0] || "Sem categoria" }
  ];
}

function todaySummary() {
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayEntries = state.entries.filter((item) => item.date === todayKey);
  const income = total(todayEntries.filter((item) => item.type === "Receita"));
  const expense = total(todayEntries.filter((item) => item.type === "Despesa"));
  const fixed = fixedBillsWithDueInfo().filter((item) => !isFixedPaid(item));
  return {
    income,
    expense,
    dueToday: fixed.filter((item) => item.diffDays === 0).length,
    overdue: fixed.filter((item) => item.diffDays < 0).length
  };
}

function fixedToPendingEntry(item) {
  const date = new Date(Number(state.selectedYear || new Date().getFullYear()), monthIndex(state.selectedMonth), Math.min(Number(item.dueDay || 1), 28)).toISOString().slice(0, 10);
  return {
    date,
    category: item.category,
    description: item.name,
    value: item.value
  };
}

function dashboardMood(balance, salaryTotal) {
  if (balance < 0) {
    return {
      state: "sad",
      label: "!",
      text: "atenção",
      message: "Atenção aos gastos, o saldo está negativo."
    };
  }
  if (salaryTotal && balance <= salaryTotal * 0.1) {
    return {
      state: "neutral",
      label: "meio",
      text: "apertado",
      message: "O mês está apertado. Vale segurar os gastos pequenos."
    };
  }
  return {
    state: "happy",
    label: "OK",
    text: "sobrou",
    message: "Vocês estão indo muito bem esse mês."
  };
}

function renderOnboarding() {
  let box = qs("#onboarding-box");
  if (!cloudReady || state.onboardingDone) {
    if (box) box.remove();
    return;
  }

  const dashboard = qs("#dashboard");
  if (box) box.remove();
  box = document.createElement("div");
  box.id = "onboarding-box";
  box.className = "panel onboarding";
  box.innerHTML = `
    <div>
      <h2>Primeiros passos</h2>
      <p>Configure o básico para o controle do casal ficar pronto para uso.</p>
    </div>
    <div class="onboarding-steps">
      ${onboardingStep(Number(state.profile.salaryOne || 0) + Number(state.profile.salaryTwo || 0), "Cadastrar renda", "settings", "Informe o salário médio de pelo menos uma pessoa para a visão geral funcionar.")}
      ${onboardingStep(state.accounts.length, "Adicionar carteira", "accounts", "Cadastre onde o dinheiro fica: banco, dinheiro em casa ou conta digital.")}
      ${onboardingStep(state.cards.length, "Cadastrar cartão", "accounts", "Inclua o cartão e limite para acompanhar fatura e compras parceladas.")}
      ${onboardingStep(state.fixedBills.length, "Despesas fixas", "fixed", "Cadastre aluguel, internet, energia e dívidas mensais.")}
      ${onboardingStep(state.fixedBills.length || state.goals.length, "Conferir agenda", "agenda", "Veja contas vencendo, faturas abertas e metas com data.")}
      ${onboardingStep(state.entries.length || state.installments.length, "Primeiro lançamento", "entries", "Registre uma entrada ou saída para começar o histórico do mês.")}
      ${onboardingStep(state.entries.length || state.installments.length, "Ver extrato", "statement", "Acompanhe tudo que já foi lançado, inclusive pagos e pendentes.")}
      ${onboardingStep(householdInviteCode, "Convidar parceiro", "settings", "Mostre o código em Configurações da conta e envie para seu parceiro.")}
    </div>
    <button class="ghost" id="finish-onboarding" type="button">Ocultar checklist</button>
  `;
  dashboard.prepend(box);
  qs("#finish-onboarding").addEventListener("click", () => {
    state.onboardingDone = true;
    notify("sync", "Checklist inicial concluído");
    commitState();
  });
  document.querySelectorAll("[data-onboarding-view]").forEach((button) => {
    button.addEventListener("click", () => setActiveView(button.dataset.onboardingView));
  });
}

function onboardingStep(done, text, view, detail) {
  return `
    <button class="onboarding-step ${done ? "done" : ""}" type="button" data-onboarding-view="${view}">
      <b>${done ? "✓" : "•"}</b>
      <span>${text}</span>
      <small>${detail}</small>
    </button>
  `;
}

function coupleIllustration(mood) {
  const isHappy = mood.state === "happy";
  const isNeutral = mood.state === "neutral";
  const mouth = isHappy ? "M 30 48 Q 40 58 50 48" : isNeutral ? "M 30 52 L 50 52" : "M 30 56 Q 40 46 50 56";
  const secondMouth = isHappy ? "M 94 48 Q 104 58 114 48" : isNeutral ? "M 94 52 L 114 52" : "M 94 56 Q 104 46 114 56";
  return `
    <div class="couple-widget ${mood.state}" aria-label="${mood.message}">
      <svg viewBox="0 0 150 140" role="img">
        <circle class="coin coin-a" cx="118" cy="26" r="12"></circle>
        <circle class="coin coin-b" cx="32" cy="24" r="9"></circle>
        <path class="heart" d="M74 34c-8-12-27-6-27 9 0 16 27 30 27 30s27-14 27-30c0-15-19-21-27-9z"></path>
        <circle class="head one" cx="40" cy="42" r="24"></circle>
        <circle class="head two" cx="104" cy="42" r="24"></circle>
        <path class="hair one" d="M18 42c0-18 14-30 32-26 0 0-5 16-25 18z"></path>
        <path class="hair two" d="M84 30c7-15 32-16 43 0-8-2-18-1-29 6z"></path>
        <circle class="eye" cx="32" cy="39" r="2.5"></circle>
        <circle class="eye" cx="49" cy="39" r="2.5"></circle>
        <circle class="eye" cx="96" cy="39" r="2.5"></circle>
        <circle class="eye" cx="113" cy="39" r="2.5"></circle>
        <path class="mouth" d="${mouth}"></path>
        <path class="mouth" d="${secondMouth}"></path>
        <path class="body one" d="M16 120c4-30 18-46 36-46s32 16 36 46z"></path>
        <path class="body two" d="M64 120c4-30 18-46 36-46s32 16 36 46z"></path>
        <path class="arm" d="M62 86c12 9 24 9 36 0"></path>
        <text class="mood-text" x="75" y="132" text-anchor="middle">${mood.text}</text>
      </svg>
    </div>
  `;
}

function metric(label, value, tone) {
  return `<article class="metric ${tone}"><span>${label}</span><strong>${formatMoney(value)}</strong></article>`;
}

function statementItem(item) {
  const isIncome = item.type === "Receita";
  return `
    <div class="statement-item">
      <div class="statement-icon ${isIncome ? "income" : "expense"}">${isIncome ? "↓" : "↑"}</div>
      <div>
        <strong>${item.description || item.category}</strong>
        <span>${dateFmt.format(new Date(`${item.date}T00:00:00Z`))} · ${item.category}</span>
      </div>
      <b class="${isIncome ? "income" : "expense"}">${isIncome ? "+" : "-"}${formatMoney(item.value)}</b>
    </div>
  `;
}

function bar(label, value, max, color) {
  const width = Math.min(100, Math.round((value / max) * 100));
  return `<div class="bar-row"><span>${label}</span><div class="track"><div class="fill" style="--w:${width}%;--c:${color}"></div></div><strong>${formatMoney(value)}</strong></div>`;
}

function renderEntries() {
  const editing = editingEntryId ? state.entries.find((item) => item.id === editingEntryId) : null;
  if (editing) entryMode = editing.type;
  if (entryMode === "Cartão") entryMode = "Despesa";
  const isIncome = entryMode === "Receita";
  const monthEntries = byMonth(state.entries);
  const filteredEntries = filterEntries(monthEntries);
  const entryIncome = total(monthEntries.filter((item) => item.type === "Receita"));
  const entryExpense = total(monthEntries.filter((item) => item.type === "Despesa"));
  const pendingExpense = total(monthEntries.filter((item) => item.type === "Despesa" && item.status === "Pendente"));
  const recentCardRows = state.installments.slice(0, 5);
  qs("#entries").innerHTML = `
    <section class="feature-hero entries-hero">
      <div>
        <span>Movimento do mês</span>
        <h2>Lançamentos simples</h2>
        <p>Registre entradas, saídas e compras no cartão. As contas fixas ficam em uma aba própria.</p>
      </div>
      <div class="feature-stats">
        <div><span>Entradas</span><strong>${formatMoney(entryIncome)}</strong></div>
        <div><span>Saídas</span><strong>${formatMoney(entryExpense)}</strong></div>
        <div><span>Pendente</span><strong>${formatMoney(pendingExpense)}</strong></div>
      </div>
    </section>
    <form class="entry-form guided-form" id="entry-form">
      <div class="span-3 form-heading"><span>${editing ? "✎" : "+"}</span><div><h2>${editing ? "Editar lançamento" : "Novo lançamento"}</h2><small>Use para Pix, débito, dinheiro e entradas avulsas.</small></div></div>
      <div class="mode-picker span-3" role="tablist" aria-label="Tipo de lançamento">
        <button class="${entryMode === "Receita" ? "active" : ""}" type="button" data-entry-mode="Receita">Entrada</button>
        <button class="${entryMode === "Despesa" ? "active" : ""}" type="button" data-entry-mode="Despesa">Saída</button>
      </div>
      ${input("value", "Valor", "number", editing?.value || "", "0.01", "Valor total da entrada ou saída.")}
      ${input("date", "Data", "date", editing?.date || new Date().toISOString().slice(0, 10), "", "Data em que aconteceu ou deve acontecer.")}
      ${select("category", isIncome ? "De onde veio?" : "Categoria", isIncome ? state.categoriesIncome : state.categoriesExpense, editing?.category || "", "Ajuda o app a organizar o resumo por tipo.")}
      ${input("description", isIncome ? "Descrição da entrada" : "Descrição da saída", "text", editing?.description || "", "", "Nome curto para reconhecer depois.")}
      ${select("person", "Quem?", appPeople(), editing?.person, "Quem recebeu, pagou ou é responsável.")}
      ${!isIncome ? select("payment", "Como foi pago?", state.paymentTypes.filter((item) => item !== "Cartão de Crédito"), editing?.payment || "", "Forma de pagamento usada nessa saída.") : ""}
      ${select("account", isIncome ? "Conta que recebeu" : "Conta de onde saiu", accountOptions(), editing?.account || "", "Conta/carteira onde o dinheiro entrou ou saiu.")}
      ${!isIncome ? select("status", "Situação", ["Pago", "Pendente"], editing?.status || "", "Pago já saiu da conta. Pendente ainda está para pagar.") : ""}
      <label class="field span-2"><span>Observação opcional</span><input name="notes" value="${editing?.notes || ""}"></label>
      <button class="primary span-2" type="submit">${editing ? "Salvar alterações" : "Salvar lançamento"}</button>
      ${editing ? `<button class="ghost" id="cancel-edit" type="button">Cancelar edição</button>` : ""}
    </form>
    <form class="entry-form guided-form" id="card-form">
      <div class="span-3 form-heading"><span>▣</span><div><h2>Compra no cartão</h2><small>Lance a compra aqui. O app divide parcelas e joga na fatura do cartão.</small></div></div>
      ${select("card", "Cartão", cardOptions(), "", "Cartão onde a compra será lançada. Cadastre cartões na aba Cartões.")} 
      ${input("date", "Data da compra", "date", new Date().toISOString().slice(0, 10), "", "Dia em que você fez a compra.")}
      ${input("description", "Descrição", "text", "", "", "Ex: mercado, farmácia, presente.")}
      ${select("category", "Categoria", state.categoriesExpense, "", "Categoria da compra para relatórios.")}
      ${input("value", "Valor da compra", "number", "", "0.01", "Valor total, antes de dividir em parcelas.")}
      ${input("parts", "Parcelas", "number", "1", "1", "Quantidade de parcelas. Use 1 para compra à vista no cartão.")}
      ${select("firstMonth", "Primeiro mês", months, state.selectedMonth, "Mês em que a primeira parcela entra na fatura.")}
      <button class="primary" type="submit">Salvar compra no cartão</button>
    </form>
    <div class="panel soft-panel">
      <div class="section-title"><span>↻</span><div><h2>Fixos configurados</h2><small>Use isto apenas para gerar receitas/despesas recorrentes antigas.</small></div></div>
      <div class="list">
        ${state.recurring.length ? state.recurring.map((item) => `<div class="list-item"><div><strong>${item.description}</strong><span>${item.type === "Receita" ? "Entrada" : "Saída"} · dia ${item.day} · ${item.category}</span></div><b>${formatMoney(item.value)}</b></div>`).join("") : emptyHtml()}
      </div>
      <button class="ghost" id="generate-recurring" type="button">Gerar fixos deste mês</button>
    </div>
    <div class="panel soft-panel">
      <div class="section-title"><span>☷</span><div><h2>Lançamentos do mês</h2><small>Filtre, edite ou exclua quando precisar.</small></div></div>
      <div class="mode-picker filter-tabs">
        ${["Todos", "Entrada", "Saída", "Pago", "Pendente"].map((filter) => `<button class="${entryFilter === filter ? "active" : ""}" type="button" data-entry-filter="${filter}">${filter}</button>`).join("")}
      </div>
      ${table(["Data", "Tipo", "Categoria", "Descrição", "Valor", "Quem", "Situação", ""], filteredEntries.map((item) => [
      dateFmt.format(new Date(`${item.date}T00:00:00Z`)),
      pill(item.type === "Receita" ? "Entrada" : "Saída", item.type.toLowerCase()),
      item.category,
      item.description,
      `<td class="amount">${formatMoney(item.value)}</td>`,
      pill(item.person, item.person.toLowerCase()),
      pill(item.status, item.status.toLowerCase()),
      `<button class="tiny ghost" data-edit-entry="${item.id}">Editar</button> <button class="tiny danger" data-delete-entry="${item.id}">Excluir</button>`
      ]))}
    </div>
    <div class="panel soft-panel">
      <div class="section-title"><span>▣</span><div><h2>Compras recentes no cartão</h2><small>As compras do crédito também aparecem no Extrato e nas faturas.</small></div></div>
      ${table(["Compra", "Cartão", "Valor", "Parcelas", ""], recentCardRows.map((item) => [
        item.description,
        item.card,
        `<td class="amount">${formatMoney(item.value)}</td>`,
        item.parts,
        `<button class="tiny ghost" data-edit-installment="${item.id}">Editar</button> <button class="tiny danger" data-delete-installment="${item.id}">Excluir</button>`
      ]))}
    </div>
  `;
  qs("#entry-form").addEventListener("submit", addEntry);
  qs("#card-form").addEventListener("submit", addInstallment);
  qs("#generate-recurring").addEventListener("click", generateRecurring);
  const cancel = qs("#cancel-edit");
  if (cancel) cancel.addEventListener("click", () => {
    editingEntryId = null;
    renderEntries();
  });
  document.querySelectorAll("[data-entry-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      entryMode = button.dataset.entryMode;
      renderEntries();
    });
  });
  document.querySelectorAll("[data-entry-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      entryFilter = button.dataset.entryFilter;
      renderEntries();
    });
  });
}

function filterEntries(entries) {
  return entries.filter((item) => {
    if (entryFilter === "Entrada") return item.type === "Receita";
    if (entryFilter === "Saída") return item.type === "Despesa";
    if (entryFilter === "Pago") return item.status === "Pago";
    if (entryFilter === "Pendente") return item.status === "Pendente";
    return true;
  });
}

function generateRecurring() {
  const year = Number(state.selectedYear || new Date().getFullYear());
  const month = monthIndex(state.selectedMonth);
  const monthName = state.selectedMonth;
  let created = 0;
  state.recurring.forEach((item) => {
    const date = new Date(year, month, Math.min(Number(item.day || 1), 28)).toISOString().slice(0, 10);
    const exists = state.entries.some((entry) => {
      const entryDate = new Date(`${entry.date}T00:00:00Z`);
      return entry.recurringId === item.id && entry.month === monthName && entryDate.getUTCFullYear() === year;
    });
    if (exists) return;
    state.entries.unshift({
      id: crypto.randomUUID(),
      recurringId: item.id,
      date,
      month: monthName,
      type: item.type,
      category: item.category,
      description: item.description,
      value: Number(item.value || 0),
      person: item.person,
      payment: item.type === "Receita" ? "Recebimento" : "Pix",
      account: item.account || accountOptions()[0],
      status: item.status || "Pendente",
      notes: "Gerado automaticamente"
    });
    created += 1;
  });
  notify("sync", `${created} fixos gerados para ${monthName}/${year}`);
  commitState();
}

function addEntry(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const payload = {
    id: editingEntryId || crypto.randomUUID(),
    date: data.date,
    month: months[new Date(`${data.date}T00:00:00Z`).getUTCMonth()],
    type: entryMode,
    category: data.category,
    description: data.description,
    value: Number(data.value || 0),
    person: data.person,
    payment: data.payment || "Recebimento",
    account: data.account,
    status: data.status || "Pago",
    notes: data.notes
  };
  if (editingEntryId) {
    state.entries = state.entries.map((item) => item.id === editingEntryId ? payload : item);
    editingEntryId = null;
    notify("entry", `Lançamento editado: ${data.description || data.category}`);
  } else {
    state.entries.unshift(payload);
    notify("entry", `${entryMode === "Receita" ? "Entrada" : "Saída"} registrada: ${data.description || data.category} · ${formatMoney(Number(data.value || 0))}`);
  }
  commitState();
}

function accountOptions() {
  return state.accounts.length ? state.accounts.map((item) => item.name) : ["Carteira"];
}

function renderStatement() {
  const cardInvoices = state.cards.map(cardStatementSummary);
  let rows = [
    ...byMonth(state.entries).map((item) => ({
      id: item.id,
      kind: item.type === "Receita" ? "Entrada" : "Saída",
      date: item.date,
      title: item.description || item.category,
      detail: `${item.category} · ${item.person} · ${item.status}`,
      value: Number(item.value || 0),
      tone: item.type === "Receita" ? "income" : "expense",
      action: optionButton("entry", item.id)
    })),
    ...state.installments.flatMap((item) => getInstallmentSchedule(item)
      .filter((part) => part.month === state.selectedMonth && Number(part.year) === Number(state.selectedYear))
      .map((part, index) => ({
        id: `${item.id}-${index}`,
        kind: "Cartão",
        date: part.date,
        title: item.description,
        detail: `${item.card} · parcela ${index + 1}/${item.parts} · ${part.paid ? "Pago" : "Aberto"}`,
        value: Number(part.value || 0),
        tone: "card",
        action: optionButton("installment", `${item.id}|${part.month}|${part.year}|${part.paid ? "paid" : "open"}`)
      }))),
    ...cardRecurringItemsForInvoice().map((item) => ({
      id: item.id,
      kind: "Cartão",
      date: item.date,
      title: item.description,
      detail: `${item.card} · cobrança fixa · ${item.paid ? "Pago" : "Aberto"}`,
      value: Number(item.value || 0),
      tone: "card",
      action: optionButton("cardRecurring", `${item.id}|${item.paid ? "paid" : "open"}`)
    })),
    ...cardPaymentRows().map((item) => ({
      id: item.id,
      kind: "Cartão",
      date: item.date,
      title: item.description,
      detail: `${item.card} · pagamento da fatura · ${item.month}/${item.year}`,
      value: Number(item.value || 0),
      tone: "card-payment",
      card: item.card,
      action: optionButton("cardPayment", item.id)
    })),
    ...(state.fixedBills || []).map((item) => ({
      id: item.id,
      kind: "Conta fixa",
      date: fixedDateForMonth(item),
      title: item.name,
      detail: `${item.category} · ${item.person} · ${isFixedPaid(item) ? "Pago" : "Pendente"}`,
      value: Number(item.value || 0),
      tone: isFixedPaid(item) ? "fixed-paid" : "fixed-pending",
      action: optionButton("fixed", `${item.id}|${isFixedPaid(item) ? "paid" : "open"}`)
    }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  const query = statementSearch.trim().toLowerCase();
  rows = rows.filter((item) => {
    if (statementFilter !== "Todos" && item.kind !== statementFilter) return false;
    if (statementFilter === "Cartão" && statementCardFilter !== "Todos" && item.card !== statementCardFilter && !String(item.detail || "").includes(statementCardFilter)) return false;
    if (statementStatusFilter === "Aberto" && !String(item.detail || "").includes("Aberto") && !String(item.detail || "").includes("Pendente")) return false;
    if (statementStatusFilter === "Pago" && !String(item.detail || "").includes("Pago") && !String(item.detail || "").includes("pagamento")) return false;
    if (!query) return true;
    return [item.title, item.detail, item.kind, item.value].join(" ").toLowerCase().includes(query);
  });
  const groupedRows = groupStatementRows(rows);

  qs("#statement").innerHTML = `
    <div class="panel helper-panel">
      <h2>Extrato do mês</h2>
      <p>Veja tudo que foi lançado em ${state.selectedMonth} de ${state.selectedYear}: entradas, saídas, faturas e contas fixas. Se marcou algo errado, altere aqui.</p>
    </div>
    <div class="statement-tools panel">
      <label class="field">
        <span>Buscar no extrato</span>
        <input id="statement-search" type="search" value="${statementSearch}" placeholder="Ex: aluguel, Nubank, mercado">
      </label>
      <div class="mode-picker filter-tabs">
        ${["Todos", "Entrada", "Saída", "Cartão", "Conta fixa"].map((filter) => `<button class="${statementFilter === filter ? "active" : ""}" type="button" data-statement-filter="${filter}">${filter}</button>`).join("")}
      </div>
      <div class="mode-picker filter-tabs compact-filter">
        ${["Todos", "Aberto", "Pago"].map((filter) => `<button class="${statementStatusFilter === filter ? "active" : ""}" type="button" data-statement-status="${filter}">${filter}</button>`).join("")}
      </div>
    </div>
    ${statementFilter === "Cartão" ? `
      <div class="panel soft-panel card-statement-panel">
        <div class="section-title"><span>▣</span><div><h2>Extrato por cartão</h2><small>Compras, parcelas, assinaturas e pagamentos da fatura.</small></div></div>
        <label class="field statement-card-select">
          <span>Cartão</span>
          <select id="statement-card-filter">
            ${["Todos", ...state.cards.map((card) => card.name)].map((card) => `<option ${statementCardFilter === card ? "selected" : ""}>${card}</option>`).join("")}
          </select>
        </label>
        <div class="card-invoice-grid">
          ${cardInvoices.filter((item) => statementCardFilter === "Todos" || sameCard(item.card, statementCardFilter)).map(cardStatementCard).join("") || emptyHtml()}
        </div>
      </div>
    ` : ""}
    <div class="statement-list panel">
      ${rows.length ? Object.entries(groupedRows).map(([date, items]) => statementDayGroup(date, items)).join("") : emptyHtml()}
    </div>
  `;
  qs("#statement-search").addEventListener("input", (event) => {
    statementSearch = event.target.value;
    renderStatement();
  });
  document.querySelectorAll("[data-statement-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      statementFilter = button.dataset.statementFilter;
      if (statementFilter !== "Cartão") statementCardFilter = "Todos";
      renderStatement();
    });
  });
  document.querySelectorAll("[data-statement-status]").forEach((button) => {
    button.addEventListener("click", () => {
      statementStatusFilter = button.dataset.statementStatus;
      renderStatement();
    });
  });
  const cardFilter = qs("#statement-card-filter");
  if (cardFilter) cardFilter.addEventListener("change", (event) => {
    statementCardFilter = event.target.value;
    renderStatement();
  });
}

function groupStatementRows(rows) {
  return rows.reduce((acc, item) => {
    const key = item.date;
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});
}

function statementDayGroup(date, items) {
  const dayTotal = items.reduce((sum, item) => sum + (item.tone === "income" ? Number(item.value || 0) : -Number(item.value || 0)), 0);
  return `
    <section class="statement-day">
      <div class="statement-day-head">
        <strong>${dateFmt.format(new Date(`${date}T00:00:00Z`))}</strong>
        <span>${formatMoney(dayTotal)}</span>
      </div>
      ${items.map(statementRow).join("")}
    </section>
  `;
}

function fixedDateForMonth(item) {
  return new Date(Number(state.selectedYear || new Date().getFullYear()), monthIndex(state.selectedMonth), Math.min(Number(item.dueDay || 1), 28)).toISOString().slice(0, 10);
}

function recurringCardDateForMonth(item) {
  return cardRecurringItemsForInvoice(item.card).find((entry) => entry.installmentId === item.id)?.date || recurringChargeDate(item);
}

function cardPaymentRows(cardName = "") {
  return (state.cardPayments || []).filter((item) =>
    item.month === state.selectedMonth &&
    Number(item.year) === Number(state.selectedYear) &&
    (!cardName || sameCard(item.card, cardName))
  );
}

function cardPaymentTotal(cardName) {
  return total(cardPaymentRows(cardName));
}

function cardStatementSummary(card) {
  const items = cardMonthItems(card.name);
  const invoiceTotal = total(items);
  const paidItems = total(items.filter((item) => item.paid));
  const payments = cardPaymentTotal(card.name);
  return {
    card: card.name,
    invoiceTotal,
    paidItems,
    payments,
    open: Math.max(0, invoiceTotal - paidItems - payments),
    itemCount: items.length
  };
}

function cardStatementCard(item) {
  return `
    <article class="card-statement-card">
      <div>
        <span>Fatura ${state.selectedMonth}/${state.selectedYear}</span>
        <strong>${item.card}</strong>
      </div>
      <div class="card-statement-values">
        <span>Total <b>${formatMoney(item.invoiceTotal)}</b></span>
        <span>Pago <b>${formatMoney(item.paidItems + item.payments)}</b></span>
        <span>Aberto <b>${formatMoney(item.open)}</b></span>
      </div>
      <div class="card-actions">
        <button class="tiny ghost" data-partial-card-payment="${item.card}">Pagar parcial</button>
        <button class="tiny ghost" data-pay-card-month="${item.card}">Quitar fatura</button>
      </div>
    </article>
  `;
}

function statementRow(item) {
  return `
    <div class="statement-item ${item.tone}">
      <div class="statement-icon">${item.kind.slice(0, 1)}</div>
      <div>
        <strong>${item.title}</strong>
        <span>${dateFmt.format(new Date(`${item.date}T00:00:00Z`))} · ${item.kind} · ${item.detail}</span>
      </div>
      <b>${formatMoney(item.value)}</b>
      <div class="statement-actions">${item.action}</div>
    </div>
  `;
}

function renderFixedBills() {
  const fixedInfo = fixedBillsWithDueInfo();
  const paidFixed = total(fixedInfo.filter((item) => isFixedPaid(item)));
  const pendingFixed = total(fixedInfo.filter((item) => !isFixedPaid(item)));
  const cardFixed = total((state.cardRecurring || []).filter((item) => item.active !== false).map((item) => ({ value: item.value })));
  qs("#fixed").innerHTML = `
    <section class="feature-hero fixed-hero">
      <div>
        <span>Todo mês</span>
        <h2>Controle mensal</h2>
        <p>Contas recorrentes e assinaturas no cartão, com controle de pago ou pendente.</p>
      </div>
      <div class="feature-stats">
        <div><span>Pagas</span><strong>${formatMoney(paidFixed)}</strong></div>
        <div><span>Pendentes</span><strong>${formatMoney(pendingFixed)}</strong></div>
        <div><span>No cartão</span><strong>${formatMoney(cardFixed)}</strong></div>
      </div>
    </section>
    <form class="settings-form" id="fixed-form">
      <div class="span-3 form-heading"><span>◷</span><div><h2>Nova conta fixa</h2><small>Para aluguel, internet, energia, empréstimos e mensalidades fora do cartão.</small></div></div>
      ${input("name", "Nome da conta", "text", "", "", "Ex: aluguel, internet, energia, empréstimo.")}
      ${input("value", "Valor", "number", "0", "0.01", "Valor mensal dessa conta.")}
      ${input("dueDay", "Vencimento", "number", "10", "1", "Dia do mês em que vence.")}
      ${select("category", "Categoria", state.categoriesExpense, "", "Categoria dessa conta fixa.")}
      ${select("person", "Responsável", appPeople(), "", "Quem costuma pagar ou acompanhar essa conta.")}
      ${select("status", "Status", ["Pendente", "Pago"], "Pendente", "Pago entra no cálculo do saldo. Pendente aparece em atenção.")}
      <button class="primary form-submit" type="submit">Salvar despesa fixa</button>
    </form>
    <div class="panel soft-panel">
      <div class="section-title"><span>☑</span><div><h2>Contas do mês</h2><small>Marque como pago ou volte para pendente se selecionou errado.</small></div></div>
      <div class="wallet-list">
        ${(state.fixedBills || []).length ? state.fixedBills.map(fixedBillCard).join("") : emptyHtml()}
      </div>
    </div>
    <form class="settings-form" id="card-recurring-form">
      <div class="span-3 form-heading"><span>▣</span><div><h2>Nova assinatura no cartão</h2><small>Para internet no cartão, streaming, apps e assinaturas mensais.</small></div></div>
      ${select("card", "Cartão", cardOptions(), "", "Cartão onde a cobrança cai todo mês.")}
      ${input("description", "Nome", "text", "", "", "Ex: internet, Netflix, Spotify, academia.")}
      ${select("category", "Categoria", state.categoriesExpense, "", "Categoria dessa cobrança.")}
      ${input("value", "Valor mensal", "number", "", "0.01", "Valor cobrado todo mês.")}
      ${input("day", "Dia da cobrança", "number", "10", "1", "Dia aproximado em que aparece na fatura.")}
      <button class="primary form-submit" type="submit">Salvar fixo no cartão</button>
    </form>
    <div class="panel soft-panel">
      <div class="section-title"><span>↻</span><div><h2>Assinaturas no cartão</h2><small>Entram na fatura do mês e podem ser marcadas como pagas.</small></div></div>
      <div class="wallet-list">
        ${state.cardRecurring.length ? state.cardRecurring.map(cardRecurringRow).join("") : emptyHtml()}
      </div>
    </div>
  `;
  qs("#fixed-form").addEventListener("submit", addFixedBill);
  qs("#card-recurring-form").addEventListener("submit", addCardRecurring);
}

function renderAgenda() {
  const fixedItems = fixedBillsWithDueInfo().map((item) => ({
    type: "Conta fixa",
    title: item.name,
    date: item.dueDate,
    detail: `${item.dueText} · ${isFixedPaid(item) ? "Pago" : "Pendente"}`,
    value: item.value,
    priority: item.priority
  }));
  const cardItems = state.cards.map((card) => {
    const totals = cardTotals(card.name);
    return {
      type: "Fatura",
      title: card.name,
      date: new Date(Number(state.selectedYear || new Date().getFullYear()), monthIndex(state.selectedMonth), Math.min(Number(card.dueDay || 10), 28)),
      detail: `Vence dia ${card.dueDay || 10} · fecha dia ${card.closeDay || 20}`,
      value: totals.month,
      priority: totals.month > 0 ? "soon" : "normal"
    };
  }).filter((item) => item.value > 0);
  const goalItems = state.goals.filter((goal) => goal.due).map((goal) => ({
    type: "Meta",
    title: goal.title,
    date: new Date(`${goal.due}T00:00:00Z`),
    detail: `${goal.status} · falta ${formatMoney(Math.max(0, Number(goal.target || 0) - Number(goal.saved || 0)))}`,
    value: goal.saved,
    priority: "normal"
  }));
  const items = [...fixedItems, ...cardItems, ...goalItems].sort((a, b) => a.date - b.date);
  qs("#agenda").innerHTML = `
    <div class="panel helper-panel">
      <h2>Agenda financeira</h2>
      <p>Uma linha do tempo com contas, faturas e metas para vocês não perderem vencimentos.</p>
    </div>
    <div class="panel agenda-list">
      ${items.length ? items.map(agendaItem).join("") : emptyHtml()}
    </div>
  `;
}

function agendaItem(item) {
  return `
    <div class="list-item due-item ${item.priority}">
      <div><strong>${item.title}</strong><span>${item.type} · ${dateFmt.format(item.date)} · ${item.detail}</span></div>
      <b>${formatMoney(item.value)}</b>
    </div>
  `;
}

function fixedBillCard(item) {
  const paid = isFixedPaid(item);
  const info = fixedBillsWithDueInfo().find((bill) => bill.id === item.id) || item;
  return `
    <article class="wallet-account fixed-bill ${paid ? "paid" : "pending"}">
      <div>
        <span>${item.category}</span>
        <strong>${item.name}</strong>
        <small>${info.dueText || `Vence dia ${item.dueDay}`} · ${item.person} · ${state.selectedMonth}/${state.selectedYear}</small>
      </div>
      <div class="wallet-account-money">
        <span>${paid ? "Pago no mês" : "Pendente no mês"}</span>
        <strong>${formatMoney(item.value)}</strong>
      </div>
      <div class="wallet-account-flow">
        <button class="tiny ghost" data-toggle-fixed="${item.id}">${paid ? "Marcar pendente" : "Marcar pago"}</button>
        <button class="tiny ghost" data-edit-fixed="${item.id}">Editar</button>
        <button class="tiny danger" data-delete-fixed="${item.id}">Excluir</button>
      </div>
    </article>
  `;
}

function addFixedBill(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.fixedBills.push({
    id: crypto.randomUUID(),
    name: data.name,
    value: Number(data.value || 0),
    dueDay: Number(data.dueDay || 1),
    category: data.category,
    person: data.person,
    status: data.status,
    paidMonths: data.status === "Pago" ? [periodKey()] : []
  });
  notify("sync", `Conta fixa adicionada: ${data.name}`);
  commitState();
}

function editFixedBill(id) {
  const item = state.fixedBills.find((bill) => bill.id === id);
  if (!item) return;
  modalMode = { kind: "fixed", id, fields: [
    { name: "name", label: "Nome", value: item.name },
    { name: "value", label: "Valor", type: "number", step: "0.01", value: item.value },
    { name: "dueDay", label: "Vencimento", type: "number", step: "1", value: item.dueDay }
  ] };
  renderModal();
}

function renderCards() {
  const summary = currentSummary();
  const cardLimit = total(state.cards.map((card) => ({ value: card.limit })));
  const cardUsed = total(state.cards.map((card) => ({ value: cardTotals(card.name).used })));
  const cardAvailable = cardLimit - cardUsed;
  qs("#cards").innerHTML = `
    <section class="feature-hero cards-hero">
      <div>
        <span>Crédito organizado</span>
        <h2>Cartões e faturas</h2>
        <p>Cadastre cartões, acompanhe limite, fechamento, vencimento e faturas. Compras no cartão ficam em Lançamentos.</p>
      </div>
      <div class="feature-stats">
        <div><span>Fatura mês</span><strong>${formatMoney(summary.cardMonth)}</strong></div>
        <div><span>Limite livre</span><strong>${formatMoney(cardAvailable)}</strong></div>
        <div><span>Usado total</span><strong>${formatMoney(cardUsed)}</strong></div>
      </div>
    </section>
    <form class="entry-form guided-form" id="card-settings-form">
      <div class="span-3 form-heading"><span>▣</span><div><h2>Novo cartão</h2><small>Configure limite, fechamento e vencimento para calcular faturas.</small></div></div>
      ${input("name", "Nome do cartão", "text", "", "", "Ex: Nubank, Inter, Itaú.")}
      ${select("owner", "Titular", appPeople(), "", "Pessoa responsável pelo cartão.")}
      ${input("limit", "Limite", "number", "0", "0.01", "Limite total disponível no cartão.")}
      ${input("closeDay", "Dia que fecha", "number", "20", "1", "Compras depois desse dia entram na próxima fatura.")}
      ${input("dueDay", "Dia de vencimento", "number", "10", "1", "Dia em que a fatura vence.")}
      ${select("color", "Cor", ["Azul", "Roxo", "Dourado", "Preto", "Verde"], "", "Só muda o visual do cartão.")}
      <button class="primary" type="submit">Salvar cartão</button>
    </form>
    <div class="panel soft-panel">
      <div class="section-title"><span>▣</span><div><h2>Meus cartões</h2><small>Limite, vencimento, fechamento e fatura atual.</small></div></div>
      <div class="grid-3 card-grid">
        ${state.cards.map(cardSummary).join("") || emptyHtml()}
      </div>
    </div>
    <div class="panel soft-panel">
      <div class="section-title"><span>▣</span><div><h2>Faturas (${state.selectedMonth})</h2></div></div>
      <div class="list">
        ${state.cards.length ? state.cards.map(cardInvoiceRow).join("") : emptyHtml()}
      </div>
    </div>
    ${cardDetailHtml()}
  `;
  qs("#card-settings-form").addEventListener("submit", addCard);
  const detailSelect = qs("#invoice-card-detail-select");
  if (detailSelect) detailSelect.addEventListener("change", (event) => {
    selectedInvoiceCard = event.target.value;
    renderCards();
  });
}

function cardDetailHtml() {
  const card = state.cards.find((item) => sameCard(item.name, selectedInvoiceCard)) || state.cards[0];
  if (!card) return "";
  const items = cardMonthItems(card.name);
  const payments = cardPaymentRows(card.name);
  const summary = cardStatementSummary(card);
  return `
    <div class="panel soft-panel card-detail-panel" id="card-detail-panel">
      <div class="section-title"><span>▣</span><div><h2>Detalhe da fatura: ${card.name}</h2><small>Total ${formatMoney(summary.invoiceTotal)} · pago ${formatMoney(summary.paidItems + summary.payments)} · aberto ${formatMoney(summary.open)}</small></div></div>
      <label class="field statement-card-select">
        <span>Ver cartão</span>
        <select id="invoice-card-detail-select">
          ${state.cards.map((item) => `<option ${sameCard(item.name, card.name) ? "selected" : ""}>${item.name}</option>`).join("")}
        </select>
      </label>
      <div class="grid-2">
        <div class="list">
          <h2>Itens da fatura</h2>
          ${items.length ? items.map((item) => `
            <div class="list-item ${item.paid ? "paid" : "pending"}">
              <div><strong>${item.description}</strong><span>${dateFmt.format(new Date(`${item.date}T00:00:00Z`))} · ${item.category || "Sem categoria"} · ${item.partLabel} · ${item.paid ? "Pago" : "Aberto"}</span></div>
              <b>${formatMoney(item.value)}</b>
              <span class="card-actions">${invoiceItemActions(item)}</span>
            </div>
          `).join("") : emptyHtml()}
        </div>
        <div class="list">
          <h2>Pagamentos da fatura</h2>
          ${payments.length ? payments.map((item) => `
            <div class="list-item">
              <div><strong>${item.description}</strong><span>${dateFmt.format(new Date(`${item.date}T00:00:00Z`))} · ${item.month}/${item.year}</span></div>
              <b>${formatMoney(item.value)}</b>
              <span class="card-actions"><button class="tiny ghost" data-edit-card-payment="${item.id}">Editar</button><button class="tiny danger" data-delete-card-payment="${item.id}">Excluir</button></span>
            </div>
          `).join("") : emptyHtml()}
        </div>
      </div>
    </div>
  `;
}

function invoiceItemActions(item) {
  if (item.source === "recurring") {
    return optionButton("cardRecurring", `${item.installmentId}|${item.paid ? "paid" : "open"}`);
  }
  return optionButton("installment", `${item.installmentId}|${item.month}|${item.year}|${item.paid ? "paid" : "open"}`);
}

function cardRecurringRow(item) {
  const paid = isPeriodPaid(item);
  return `
    <div class="list-item">
      <div><strong>${item.description}</strong><span>${item.card} · dia ${item.day} · ${item.category} · ${paid ? "Pago neste mês" : "Aberto neste mês"}</span></div>
      <b>${formatMoney(item.value)}</b>
      <span class="card-actions">
        <button class="tiny ghost" data-toggle-card-recurring="${item.id}">${paid ? "Reabrir" : "Marcar pago"}</button>
        <button class="tiny ghost" data-edit-card-recurring="${item.id}">Editar</button>
        <button class="tiny danger" data-delete-card-recurring="${item.id}">Excluir</button>
      </span>
    </div>
  `;
}

function cardInvoiceRow(card) {
  const totals = cardTotals(card.name);
  const monthItems = cardMonthItems(card.name);
  const paidItems = monthItems.filter((item) => item.paid);
  const openItems = monthItems.filter((item) => !item.paid);
  const paidTotal = total(paidItems);
  const invoicePayments = cardPaymentTotal(card.name);
  const nextMonth = months[(monthIndex(state.selectedMonth) + 1) % 12];
  const totalMonth = totals.month + paidTotal;
  const openAfterPayments = Math.max(0, totals.month - invoicePayments);
  return `
    <div class="invoice-card">
      <div class="list-item">
        <div>
          <strong>${card.name}</strong>
          <span>Fecha dia ${card.closeDay || 20} · vence dia ${card.dueDay || 10} · Total ${formatMoney(totalMonth)} · Aberta ${formatMoney(openAfterPayments)} · Pago parcial ${formatMoney(invoicePayments)} · Itens pagos ${formatMoney(paidTotal)} · Próxima ${formatMoney(totals.next)} (${nextMonth})</span>
        </div>
        <span class="card-actions">
          ${openItems.length ? `<button class="tiny ghost" data-partial-card-payment="${card.name}">Pagar parcial</button> <button class="tiny ghost" data-pay-card-month="${card.name}">Quitar fatura</button>` : `<button class="tiny ghost" data-reopen-card-month="${card.name}">Reabrir fatura</button>`}
        </span>
      </div>
      <div class="invoice-items">
        ${monthItems.length ? monthItems.map((item) => `
          <span class="${item.paid ? "paid" : "open"}">
            ${item.description} · ${item.partLabel} · ${item.category || "Sem categoria"} · ${item.paid ? "Pago" : "Aberto"}
            <b>${formatMoney(item.value)}</b>
            <small class="invoice-inline-actions">${invoiceItemActions(item)}</small>
          </span>
        `).join("") : `<small>Nenhuma compra nesta fatura.</small>`}
      </div>
    </div>
  `;
}

function cardMonthItems(cardName) {
  const installments = state.installments
    .filter((item) => sameCard(item.card, cardName))
    .flatMap((item) => getInstallmentSchedule(item).map((part, index) => ({ ...part, source: "installment", installmentId: item.id, description: item.description, category: item.category, partLabel: `${index + 1}/${item.parts}` })))
    .filter((part) => part.month === state.selectedMonth && Number(part.year) === Number(state.selectedYear));
  const recurring = state.cardRecurring
    ? cardRecurringItemsForInvoice(cardName)
    : [];
  return [...installments, ...recurring];
}

function cardSummary(card) {
  const totals = cardTotals(card.name);
  const available = Number(card.limit || 0) - totals.used;
  const percent = Math.min(100, Math.round((totals.used / Math.max(card.limit, totals.used, 1)) * 100));
  return `<article class="credit-card ${card.color || "Azul"}">
    <div>
      <span>Cartão de crédito</span>
      <strong>${card.name}</strong>
    </div>
    <div class="card-chip"></div>
    <div class="card-lines">
      <span>Limite total</span><b>${formatMoney(card.limit)}</b>
      <span>Disponível</span><b>${formatMoney(available)}</b>
      <span>Fatura do mês</span><b>${formatMoney(totals.month)}</b>
      <span>Fechamento</span><b>dia ${card.closeDay || 20}</b>
      <span>Vencimento</span><b>dia ${card.dueDay || 10}</b>
    </div>
    <div class="track card-track"><div class="fill" style="--w:${percent}%;--c:rgba(255,255,255,.88)"></div></div>
    <div class="card-actions">
      <button class="tiny ghost" data-edit-card="${card.id}">Editar</button>
      <button class="tiny danger" data-delete-card="${card.id}">Excluir cartão</button>
    </div>
  </article>`;
}

function cardOptions() {
  return state.cards.length ? state.cards.map((item) => item.name) : ["Cadastre um cartão primeiro"];
}

function addInstallment(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (!state.cards.length) {
    showToast("Cadastre um cartão antes de lançar compra no crédito", "error");
    setActiveView("cards");
    return;
  }
  const purchaseMonth = months[new Date(`${data.date}T00:00:00Z`).getUTCMonth()];
  const purchaseDate = new Date(`${data.date}T00:00:00Z`);
  const invoicePeriod = invoicePeriodForPurchase(data.date, data.card);
  const firstMonth = data.firstMonth === purchaseMonth ? invoicePeriod.month : data.firstMonth;
  const baseYear = Number.isNaN(purchaseDate.getTime()) ? Number(state.selectedYear || new Date().getFullYear()) : purchaseDate.getUTCFullYear();
  const firstYear = data.firstMonth === purchaseMonth ? invoicePeriod.year : baseYear + (monthIndex(firstMonth) < (Number.isNaN(purchaseDate.getTime()) ? monthIndex(state.selectedMonth) : purchaseDate.getUTCMonth()) ? 1 : 0);
  state.installments.unshift({
    id: crypto.randomUUID(),
    date: data.date,
    card: data.card,
    description: data.description,
    category: data.category,
    value: Number(data.value || 0),
    parts: Number(data.parts || 1),
    firstMonth,
    firstYear,
    paidMonths: []
  });
  notify("card", `Compra no cartão: ${data.description || data.card} · ${formatMoney(Number(data.value || 0))}`);
  commitState();
}

function addCardRecurring(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (!state.cards.length) return;
  state.cardRecurring.unshift({
    id: crypto.randomUUID(),
    card: data.card,
    description: data.description,
    category: data.category,
    value: Number(data.value || 0),
    day: Number(data.day || 1),
    paidMonths: [],
    active: true
  });
  notify("card", `Fixo no cartão: ${data.description} · ${formatMoney(Number(data.value || 0))}`);
  commitState();
}

function addCardPayment(cardName, value, description = "Pagamento da fatura") {
  state.cardPayments ||= [];
  state.cardPayments.unshift({
    id: crypto.randomUUID(),
    card: cardName,
    value: Number(value || 0),
    description,
    month: state.selectedMonth,
    year: Number(state.selectedYear || new Date().getFullYear()),
    date: new Date().toISOString().slice(0, 10)
  });
}

function renderAccounts() {
  walletTab = "money";
  qs("#accounts").innerHTML = `
    <div class="panel helper-panel">
      <h2>Nossa Carteira</h2>
      <p>Cadastre as contas onde o dinheiro fica: banco, dinheiro em casa, conta digital ou investimento.</p>
    </div>
    <form class="entry-form guided-form" id="account-form">
      <div class="span-3"><h2>Adicionar conta</h2></div>
      ${input("name", "Nome da conta", "text", "", "", "Ex: Nubank, Itaú, Caixa, Dinheiro em casa.")}
      ${select("type", "Tipo", ["Corrente", "Poupança", "Digital", "Investimento", "Dinheiro"], "", "Ajuda a identificar que tipo de dinheiro é esse.")}
      ${select("owner", "Titular", appPeople(), "", "Quem é responsável por essa conta ou carteira.")}
      ${input("initial", "Saldo inicial", "number", "0", "0.01", "Quanto já tinha nessa conta antes de começar a usar o app.")}
      <button class="primary" type="submit">Salvar conta</button>
    </form>
    <div class="panel salary-shortcut">
      <div>
        <h2>Salário automático</h2>
        <p>O salário do casal agora fica em Cadastros, com valor e dia em que cai. A visão geral só mostra como disponível quando chega o dia certo.</p>
      </div>
      <button class="primary" type="button" data-view="settings">Configurar salários</button>
    </div>
    <div class="panel">
      <h2>Contas cadastradas</h2>
      <div class="wallet-list">
        ${state.accounts.length ? state.accounts.map(accountCard).join("") : emptyHtml()}
      </div>
    </div>
  `;
  qs("#account-form").addEventListener("submit", addAccount);
}

function accountCard(account) {
  const paid = state.entries.filter((item) => item.account === account.name && item.status === "Pago");
  const income = total(paid.filter((item) => item.type === "Receita"));
  const expense = total(paid.filter((item) => item.type === "Despesa"));
  const balance = Number(account.initial || 0) + income - expense;
  return `
    <article class="wallet-account">
      <div>
        <span>${account.type}</span>
        <strong>${account.name}</strong>
        <small>Titular: ${account.owner}</small>
      </div>
      <div class="wallet-account-money">
        <span>Saldo atual</span>
        <strong>${formatMoney(balance)}</strong>
      </div>
      <div class="wallet-account-flow">
        <span>Entradas ${formatMoney(income)}</span>
        <span>Saídas ${formatMoney(expense)}</span>
      </div>
      <div class="card-actions">
        <button class="tiny ghost" data-edit-account="${account.id}">Editar</button>
        <button class="tiny danger" data-delete-account="${account.id}">Excluir</button>
      </div>
    </article>
  `;
}

function addAccount(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.accounts.push({ id: crypto.randomUUID(), name: data.name, type: data.type, owner: data.owner, initial: Number(data.initial || 0) });
  notify("account", `Carteira adicionada: ${data.name}`);
  commitState();
}

function editAccount(id) {
  const item = state.accounts.find((account) => account.id === id);
  if (!item) return;
  modalMode = { kind: "account", id, fields: [
    { name: "name", label: "Nome", value: item.name },
    { name: "initial", label: "Saldo inicial", type: "number", step: "0.01", value: item.initial }
  ] };
  renderModal();
}

function addIncome(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const today = new Date();
  const date = new Date(today.getFullYear(), today.getMonth(), Math.min(Number(data.day || today.getDate()), 28)).toISOString().slice(0, 10);
  if (data.recurring === "Sim") {
    state.recurring.push({
      id: crypto.randomUUID(),
      type: "Receita",
      description: data.description,
      value: Number(data.value || 0),
      day: Number(data.day || 1),
      category: data.category,
      person: data.person,
      account: data.account,
      status: "Pago"
    });
  }
  state.entries.unshift({
    id: crypto.randomUUID(),
    date,
    month: months[today.getMonth()],
    type: "Receita",
    category: data.category,
    description: data.description,
    value: Number(data.value || 0),
    person: data.person,
    payment: "Recebimento",
    account: data.account,
    status: "Pago",
    notes: data.recurring === "Sim" ? "Renda recorrente" : ""
  });
  notify("entry", `Renda adicionada: ${data.description} · ${formatMoney(Number(data.value || 0))}`);
  commitState();
}

function renderMethod() {
  const salaryTotal = salaryPlannedTotal();
  const income = salaryTotal;
  const rows = [
    ["50%", "Necessidades", income * .5, "#1677ff"],
    ["30%", "Guardar e investir", income * .3, "#7b5cff"],
    ["20%", "Desejos e lazer", income * .2, "#f4a51c"]
  ];
  qs("#method").innerHTML = `
    <div class="panel helper-panel">
      <h2>Método 50/30/20</h2>
      <p>${salaryTotal ? "Calculado automaticamente pelos salários cadastrados." : "Cadastre pelo menos um salário em Cadastros para calcular o plano automaticamente."}</p>
    </div>
    ${salaryTotal ? "" : `<div class="panel salary-shortcut"><div><h2>Comece pela renda do casal</h2><p>Informe o salário e o dia em que cai para o app calcular o mês sozinho.</p></div><button class="primary" type="button" data-view="settings">Configurar salários</button></div>`}
    <div class="panel method-box">
      ${rows.map(([percent, label, value, color]) => `
        <div class="method-row">
          <b style="color:${color}">${percent}</b>
          <span>${label}</span>
          <strong>${formatMoney(value)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderGoals() {
  const savedTotal = total((state.goals || []).map((goal) => ({ value: goal.saved })));
  const targetTotal = total((state.goals || []).map((goal) => ({ value: goal.target })));
  const doneCount = state.goals.filter((goal) => goal.status === "Concluído" || Number(goal.saved || 0) >= Number(goal.target || 0)).length;
  qs("#goals").innerHTML = `
    <section class="feature-hero goals-hero">
      <div>
        <span>Planos do casal</span>
        <h2>Metas financeiras</h2>
        <p>Guarde dinheiro para objetivos importantes e acompanhe o progresso sem virar planilha.</p>
      </div>
      <div class="feature-stats">
        <div><span>Guardado</span><strong>${formatMoney(savedTotal)}</strong></div>
        <div><span>Objetivo total</span><strong>${formatMoney(targetTotal)}</strong></div>
        <div><span>Concluídas</span><strong>${doneCount}</strong></div>
      </div>
    </section>
    <form class="entry-form" id="goal-form">
      <div class="span-3 form-heading"><span>◇</span><div><h2>Nova meta</h2><small>Defina o objetivo e quanto já foi guardado.</small></div></div>
      ${input("title", "Objetivo", "text", "")}
      ${input("target", "Valor da meta", "number", "", "0.01")}
      ${input("saved", "Valor acumulado", "number", "0", "0.01")}
      ${input("due", "Data-alvo", "date", "")}
      ${select("status", "Status", ["Em progresso", "Concluído", "Pausado"])}
      <button class="primary" type="submit">Adicionar</button>
    </form>
    <div class="grid-3 compact-goals">${state.goals.length ? state.goals.map(goalCard).join("") : emptyHtml()}</div>
  `;
  qs("#goal-form").addEventListener("submit", addGoal);
}

function goalCard(goal) {
  const percent = Math.min(100, Math.round((Number(goal.saved || 0) / Math.max(1, Number(goal.target || 0))) * 100));
  const missing = Math.max(0, Number(goal.target || 0) - Number(goal.saved || 0));
  return `<article class="panel progress-line">
    <h2>${goal.title}</h2>
    <div class="progress-meta"><span>${formatMoney(goal.saved)} de ${formatMoney(goal.target)}</span><strong>${percent}%</strong></div>
    <div class="track"><div class="fill" style="--w:${percent}%;--c:${percent >= 100 ? "#1f7a5b" : "#af7b20"}"></div></div>
    <div class="progress-meta"><span>Falta ${formatMoney(missing)} · ${goal.due ? dateFmt.format(new Date(`${goal.due}T00:00:00Z`)) : "Sem data"}</span>${pill(goal.status, goal.status === "Concluído" ? "done" : "")}</div>
    <div class="card-actions">
      <button class="tiny ghost" data-add-goal="${goal.id}">Adicionar guardado</button>
      <button class="tiny ghost" data-edit-goal="${goal.id}">Editar</button>
      <button class="tiny danger" data-delete-goal="${goal.id}">Excluir</button>
    </div>
  </article>`;
}

function addGoal(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.goals.push({ id: crypto.randomUUID(), title: data.title, target: Number(data.target || 0), saved: Number(data.saved || 0), due: data.due, status: data.status });
  notify("goal", `Meta criada: ${data.title}`);
  commitState();
}

function renderMore() {
  const summary = currentSummary();
  const items = [
    { view: "agenda", icon: "◌", title: "Agenda", note: "Vencimentos, faturas e metas com data", tone: "cyan" },
    { view: "cards", icon: "▣", title: "Cartões", note: `${state.cards.length} cadastrados · fatura ${formatMoney(summary.cardMonth)}`, tone: "blue" },
    { view: "accounts", icon: "≋", title: "Contas e dinheiro", note: `${state.accounts.length} contas · organize onde o dinheiro fica`, tone: "cyan" },
    { view: "goals", icon: "◇", title: "Metas", note: `${state.goals.length} objetivos · guardado ${formatMoney(summary.goalsSaved)}`, tone: "pink" },
    { view: "method", icon: "◴", title: "50/30/20", note: "Planejamento automático pela renda do casal", tone: "gold" },
    { view: "settings", icon: "⚙", title: "Cadastros e configurações", note: "Perfil, convite, backup, sair e reiniciar", tone: "violet" }
  ];
  qs("#more").innerHTML = `
    <section class="more-hero">
      <div>
        <span>Menu do casal</span>
        <h2>Organize sem lotar a tela inicial</h2>
        <p>As áreas de consulta e configuração ficam aqui, separadas por assunto.</p>
      </div>
      <div class="more-hero-balance">
        <small>Saldo do mês</small>
        <strong>${formatMoney(summary.balance)}</strong>
      </div>
    </section>
    <div class="more-grid">
      ${items.map((item) => `
        <button class="more-card ${item.tone}" type="button" data-view="${item.view}">
          <b>${item.icon}</b>
          <span><strong>${item.title}</strong><small>${item.note}</small></span>
        </button>
      `).join("")}
    </div>
    <button class="more-card logout-card logout-card-top" type="button" id="logout-more">
      <b>↩</b>
      <span><strong>Sair da conta</strong><small>Fechar sua sessão neste aparelho</small></span>
    </button>
  `;
  qs("#logout-more").addEventListener("click", signOut);
}

function renderSettings() {
  const inviteCode = householdInviteCode || "";
  qs("#settings").innerHTML = `
    <form class="settings-form" id="profile-form">
      <div class="span-3"><h2>Perfil do casal</h2></div>
      <div class="profile-preview span-3">
        ${personAvatar(state.profile.personOne || "Ele", "one")}
        ${personAvatar(state.profile.personTwo || "Ela", "two")}
      </div>
      ${input("personOne", "Primeira pessoa", "text", state.profile.personOne || "Ele", "", "Nome que aparece nos lançamentos e relatórios.")}
      ${input("salaryOne", "Salário da primeira pessoa", "number", state.profile.salaryOne || 0, "0.01", "Renda mensal usada no dashboard e no 50/30/20.")}
      ${input("salaryDayOne", "Dia que cai", "number", state.profile.salaryDayOne || 5, "1", "O salário só entra no saldo depois desse dia.")}
      ${input("personTwo", "Segunda pessoa", "text", state.profile.personTwo || "Ela", "", "Nome que aparece nos lançamentos e relatórios.")}
      ${input("salaryTwo", "Salário da segunda pessoa", "number", state.profile.salaryTwo || 0, "0.01", "Renda mensal usada no dashboard e no 50/30/20.")}
      ${input("salaryDayTwo", "Dia que cai", "number", state.profile.salaryDayTwo || 5, "1", "O salário só entra no saldo depois desse dia.")}
      <button class="primary form-submit" type="submit">Salvar perfil</button>
    </form>
    <div class="grid-2">
      <div class="panel">
        <h2>Categorias de receitas</h2>
        <div class="list">${state.categoriesIncome.map((item) => categoryRow(item, "Receita")).join("")}</div>
      </div>
      <div class="panel">
        <h2>Categorias de despesas</h2>
        <div class="list">${state.categoriesExpense.map((item) => categoryRow(item, "Despesa")).join("")}</div>
      </div>
    </div>
    <div class="settings-stack">
      <form class="settings-form" id="category-form">
        <div class="span-3"><h2>Nova categoria</h2></div>
        ${select("kind", "Tipo", ["Receita", "Despesa"])}
        ${input("name", "Nova categoria", "text", "")}
        <button class="primary" type="submit">Adicionar</button>
      </form>
      <form class="settings-form" id="budget-form">
        <div class="span-3"><h2>Orçamento por categoria</h2></div>
        ${select("category", "Categoria", state.categoriesExpense)}
        ${input("limit", "Limite mensal", "number", "0", "0.01")}
        <button class="primary form-submit" type="submit">Salvar limite</button>
      </form>
      <div class="panel">
        <h2>Orçamentos salvos</h2>
        <div class="bars">
          ${budgetRowsHtml()}
        </div>
      </div>
      <div class="panel">
        <h2>Backup</h2>
        <p class="mini-status">Último backup: ${localStorage.getItem("duofinLastBackup") || "ainda não exportado"}</p>
        <div class="list">
          <button class="ghost" id="export-data" type="button">Exportar dados</button>
          <label class="field"><span>Importar backup com cuidado</span><input id="import-data" type="file" accept="application/json"></label>
        </div>
      </div>
      <div class="panel">
        <h2>Instalar como app</h2>
        <div class="list">
          <div class="list-item"><div><strong>iPhone</strong><span>Abra no Safari, toque em Compartilhar e depois Adicionar à Tela de Início.</span></div></div>
          <div class="list-item"><div><strong>Android</strong><span>Abra no Chrome e toque em Instalar app ou Adicionar à tela inicial.</span></div></div>
        </div>
      </div>
      <div class="panel danger-zone">
        <h2>Configurações da conta</h2>
        <div class="list">
          <div class="list-item">
            <div><strong>Pessoas conectadas</strong><span>${householdMembers.length || 1} pessoa${(householdMembers.length || 1) === 1 ? "" : "s"} neste cofre financeiro.</span></div>
          </div>
          ${householdMembers.length ? householdMembers.map((member) => `
            <div class="list-item member-row">
              <div><strong>${memberDisplayName(member)}</strong><span>${member.role === "owner" ? "Dono do cofre" : "Membro"} · ${member.user_id === currentUser?.id ? currentUser.email : "acesso compartilhado"}</span></div>
              ${member.user_id !== currentUser?.id ? `<button class="tiny danger" type="button" data-remove-member="${member.user_id}">Remover</button>` : ""}
            </div>
          `).join("") : ""}
          ${inviteCode ? `
            <div class="list-item invite-config">
              <div><strong>Código do cofre</strong><span>${inviteCodeVisible ? inviteCode : "••••••••••"}</span></div>
              <button class="tiny ghost" id="toggle-invite-code" type="button">${inviteCodeVisible ? "Ocultar" : "Mostrar"}</button>
            </div>
            <div class="list-item invite-warning">
              <div><strong>Convite compartilhado</strong><span>Quem entrar com este código participa do mesmo cofre e verá os mesmos dados financeiros.</span></div>
            </div>
            ${inviteCodeVisible ? `<button class="ghost" id="copy-invite" type="button">Copiar código</button>` : ""}
            <button class="ghost" id="rotate-invite-code" type="button">Gerar novo código</button>
          ` : ""}
          <button class="ghost" id="join-by-code" type="button">Entrar com código de outro cofre</button>
          <button class="ghost" id="restart-tour" type="button">Ver primeiros passos de novo</button>
          <button class="ghost" id="logout" type="button">Sair da conta</button>
          <button class="danger" id="reset-data" type="button">Reiniciar controle do zero</button>
        </div>
      </div>
    </div>
  `;
  qs("#profile-form").addEventListener("submit", saveProfile);
  qs("#category-form").addEventListener("submit", addCategory);
  qs("#budget-form").addEventListener("submit", saveBudget);
  qs("#export-data").addEventListener("click", exportData);
  qs("#import-data").addEventListener("change", importData);
  const toggleInviteCode = qs("#toggle-invite-code");
  if (toggleInviteCode) toggleInviteCode.addEventListener("click", () => {
    inviteCodeVisible = !inviteCodeVisible;
    renderSettings();
  });
  const copyInvite = qs("#copy-invite");
  if (copyInvite) copyInvite.addEventListener("click", copyInviteLink);
  const rotateInvite = qs("#rotate-invite-code");
  if (rotateInvite) rotateInvite.addEventListener("click", rotateInviteCode);
  document.querySelectorAll("[data-remove-member]").forEach((button) => {
    button.addEventListener("click", () => removeHouseholdMember(button.dataset.removeMember));
  });
  qs("#join-by-code").addEventListener("click", promptJoinHousehold);
  qs("#restart-tour").addEventListener("click", () => {
    state.tutorialDone = false;
    state.onboardingDone = false;
    tutorialStep = 0;
    commitState();
  });
  qs("#logout").addEventListener("click", signOut);
  qs("#reset-data").addEventListener("click", resetData);
}

function personAvatar(name, tone) {
  return `<div class="person-avatar ${tone}"><b>${String(name || "?").slice(0, 1).toUpperCase()}</b><span>${name}</span></div>`;
}

function categoryRow(item, kind) {
  return `
    <div class="list-item">
      <strong>${item}</strong>
      <span>
        <button class="tiny ghost" data-edit-category="${kind}|${item}">Editar</button>
        <button class="tiny danger" data-delete-category="${kind}|${item}">Excluir</button>
      </span>
    </div>
  `;
}

function budgetRowsHtml() {
  const rows = budgetWarnings(true);
  return rows.length ? rows.map((item) => bar(`${item.category} · ${item.percent}%`, item.spent, Math.max(item.limit, item.spent, 1), item.percent >= 100 ? "#f04438" : item.percent >= 80 ? "#ffb020" : "#00bf7a")).join("") : emptyHtml();
}

function addRecurring(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.recurring.push({
    id: crypto.randomUUID(),
    type: data.type,
    description: data.description,
    value: Number(data.value || 0),
    day: Number(data.day || 1),
    category: data.category,
    person: data.person,
    status: data.type === "Receita" ? "Pago" : "Pendente"
  });
  notify("sync", `Fixo cadastrado: ${data.description}`);
  commitState();
}

function saveBudget(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.budgets[data.category] = Number(data.limit || 0);
  notify("sync", `Orçamento salvo: ${data.category}`);
  commitState();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financas-do-casal-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem("duofinLastBackup", new Date().toLocaleString("pt-BR"));
  showToast("Backup exportado", "success");
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!confirm("Importar backup substitui os dados atuais deste cofre. Continuar?")) {
    event.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = JSON.parse(reader.result);
      ensureStateShape();
      notify("sync", "Backup importado");
      commitState();
    } catch {
      alert("Arquivo inválido.");
    }
  };
  reader.readAsText(file);
}

function resetData() {
  askConfirm(() => {
    state = blankState();
    notify("sync", "Controle reiniciado do zero");
    localStorage.removeItem("coupleFinanceApp");
    commitState();
  });
}

function saveProfile(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.profile = {
    personOne: data.personOne,
    personTwo: data.personTwo,
    salaryOne: Number(data.salaryOne || 0),
    salaryTwo: Number(data.salaryTwo || 0),
    salaryDayOne: Number(data.salaryDayOne || 5),
    salaryDayTwo: Number(data.salaryDayTwo || 5)
  };
  notify("sync", "Perfil do casal atualizado");
  commitState();
}

function addCategory(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const key = data.kind === "Receita" ? "categoriesIncome" : "categoriesExpense";
  if (data.name) state[key].push(data.name);
  notify("sync", `Categoria adicionada: ${data.name}`);
  commitState();
}

function addCard(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.cards.push({
    id: crypto.randomUUID(),
    name: data.name,
    limit: Number(data.limit || 0),
    closeDay: Number(data.closeDay || 20),
    dueDay: Number(data.dueDay || 10),
    color: data.color || "Azul"
  });
  notify("card", `Cartão cadastrado: ${data.name} · limite ${formatMoney(Number(data.limit || 0))}`);
  commitState();
}

function editCard(id) {
  const item = state.cards.find((card) => card.id === id);
  if (!item) return;
  modalMode = { kind: "card", id, fields: [
    { name: "name", label: "Nome", value: item.name },
    { name: "limit", label: "Limite", type: "number", step: "0.01", value: item.limit },
    { name: "closeDay", label: "Fecha dia", type: "number", step: "1", value: item.closeDay || 20 },
    { name: "dueDay", label: "Vence dia", type: "number", step: "1", value: item.dueDay || 10 }
  ] };
  renderModal();
}

function editInstallment(id) {
  const item = state.installments.find((installment) => installment.id === id);
  if (!item) return;
  modalMode = { kind: "installment", id, fields: [
    { name: "date", label: "Data da compra", type: "date", value: item.date },
    { name: "card", label: "Cartão", type: "select", options: cardOptions(), value: item.card, match: "card" },
    { name: "description", label: "Descrição", value: item.description },
    { name: "category", label: "Categoria", type: "select", options: state.categoriesExpense, value: item.category },
    { name: "value", label: "Valor total", type: "number", step: "0.01", value: item.value },
    { name: "parts", label: "Parcelas", type: "number", step: "1", value: item.parts },
    { name: "firstMonth", label: "Primeiro mês", type: "select", options: months, value: item.firstMonth }
  ] };
  renderModal();
}

function editCardRecurring(id) {
  const item = state.cardRecurring.find((fixed) => fixed.id === id);
  if (!item) return;
  modalMode = { kind: "cardRecurring", id, fields: [
    { name: "card", label: "Cartão", type: "select", options: cardOptions(), value: item.card, match: "card" },
    { name: "description", label: "Nome", value: item.description },
    { name: "category", label: "Categoria", type: "select", options: state.categoriesExpense, value: item.category },
    { name: "value", label: "Valor mensal", type: "number", step: "0.01", value: item.value },
    { name: "day", label: "Dia da cobrança", type: "number", step: "1", value: item.day }
  ] };
  renderModal();
}

function labelWithHelp(label, help = "") {
  return `${label}${help ? `<button class="help-dot" type="button" title="${help}" aria-label="${help}">?</button>` : ""}`;
}

function passwordField(label, autocomplete = "current-password") {
  return `
    <label class="field">
      <span>${label}</span>
      <div class="password-wrap">
        <input name="password" type="password" minlength="6" autocomplete="${autocomplete}" placeholder="Mínimo 6 caracteres" required>
        <button class="show-password" type="button" data-toggle-password>Ver</button>
      </div>
    </label>
  `;
}

function input(name, label, type, value = "", step = "", help = "") {
  return `<label class="field"><span>${labelWithHelp(label, help)}</span><input name="${name}" type="${type}" value="${value}" ${step ? `step="${step}"` : ""} required></label>`;
}

function select(name, label, options, selected = "", help = "") {
  return `<label class="field"><span>${labelWithHelp(label, help)}</span><select name="${name}">${options.map((option) => `<option ${option === selected ? "selected" : ""}>${option}</option>`).join("")}</select></label>`;
}

function categoryOptions(type) {
  const categories = type === "Receita" ? state.categoriesIncome : state.categoriesExpense;
  return categories.map((option) => `<option>${option}</option>`).join("");
}

function table(headers, rows) {
  if (!rows.length) return `<div class="table-wrap">${emptyHtml()}</div>`;
  return `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => String(cell).startsWith("<td") ? cell : `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function pill(text, tone) {
  return `<span class="pill ${tone}">${text}</span>`;
}

function emptyHtml() {
  return qs("#empty-state").innerHTML;
}

function navViewFor(view) {
  return ["cards", "accounts", "method", "goals", "settings"].includes(view) ? "more" : view;
}

function setActiveView(view) {
  const navView = navViewFor(view);
  document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.view === navView));
  document.querySelectorAll(".view").forEach((item) => item.classList.toggle("active", item.id === view));
  qs("#page-title").textContent = pageTitle(view);
  document.body.dataset.view = view;
}

document.addEventListener("click", (event) => {
  if (
    notificationsOpen &&
    !event.target.closest("#notifications-panel") &&
    !event.target.closest("#toggle-notifications")
  ) {
    notificationsOpen = false;
    renderNotifications();
  }

  const tab = event.target.closest("[data-view]");
  if (tab) {
    if (tab.dataset.setupWallet) walletTab = tab.dataset.setupWallet;
    setActiveView(tab.dataset.view);
  }

  const notificationButton = event.target.closest("[data-notification-id]");
  if (notificationButton) {
    const id = notificationButton.dataset.notificationId;
    const item = (state.notifications || []).find((notification) => notification.id === id);
    const view = notificationButton.dataset.notificationView || item?.view || notificationTarget(item?.type, item?.text);
    state.notifications = (state.notifications || []).map((notification) => notification.id === id ? markNotificationRead(notification, view) : notification);
    notificationsOpen = false;
    setActiveView(view);
    commitState();
    return;
  }

  if (event.target.dataset.optionsKind) {
    const kind = event.target.dataset.optionsKind;
    const id = event.target.dataset.optionsId;
    const parts = String(id || "").split("|");
    const optionsByKind = {
      entry: [
        actionOption("Editar", "✎", `data-edit-entry="${id}"`),
        actionOption("Excluir", "×", `data-delete-entry="${id}"`)
      ],
      installment: [
        actionOption(parts[3] === "paid" ? "Reabrir parcela" : "Marcar pago", "✓", `data-toggle-card-part="${parts[0]}|${parts[1]}|${parts[2]}"`),
        actionOption("Editar compra", "✎", `data-edit-installment="${parts[0]}"`),
        actionOption("Excluir compra", "×", `data-delete-installment="${parts[0]}"`)
      ],
      cardRecurring: [
        actionOption(parts[1] === "paid" ? "Reabrir" : "Marcar pago", "✓", `data-toggle-card-recurring="${parts[0]}"`),
        actionOption("Editar fixo", "✎", `data-edit-card-recurring="${parts[0]}"`),
        actionOption("Excluir fixo", "×", `data-delete-card-recurring="${parts[0]}"`)
      ],
      cardPayment: [
        actionOption("Editar pagamento", "✎", `data-edit-card-payment="${id}"`),
        actionOption("Excluir pagamento", "×", `data-delete-card-payment="${id}"`)
      ],
      fixed: [
        actionOption(parts[1] === "paid" ? "Marcar pendente" : "Marcar pago", "✓", `data-toggle-fixed="${parts[0]}"`),
        actionOption("Editar conta", "✎", `data-edit-fixed="${parts[0]}"`),
        actionOption("Excluir conta", "×", `data-delete-fixed="${parts[0]}"`)
      ]
    };
    openItemActions(optionsByKind[kind] || []);
    return;
  }

  const deleteMap = [
    ["deleteEntry", "entries", "entry"],
    ["deleteInstallment", "installments", "installment"],
    ["deleteCardRecurring", "cardRecurring", "cardRecurring"],
    ["deleteCardPayment", "cardPayments", "cardPayment"],
    ["deleteAccount", "accounts", "account"],
    ["deleteCard", "cards", "card"],
    ["deleteFixed", "fixedBills", "fixed"],
    ["deleteGoal", "goals", "goal"]
  ];
  for (const [datasetKey, stateKey] of deleteMap) {
    if (event.target.dataset[datasetKey]) {
      const id = event.target.dataset[datasetKey];
      closeModal();
      askConfirm(() => {
        if (datasetKey === "deleteCard") {
          const card = state.cards.find((item) => item.id === id);
          state.cards = state.cards.filter((item) => item.id !== id);
          if (card) {
            state.installments = state.installments.filter((item) => !sameCard(item.card, card.name));
            state.cardRecurring = state.cardRecurring.filter((item) => !sameCard(item.card, card.name));
          }
        } else if (datasetKey === "deleteAccount") {
          const account = state.accounts.find((item) => item.id === id);
          state.accounts = state.accounts.filter((item) => item.id !== id);
          if (account) state.entries = state.entries.map((item) => item.account === account.name ? { ...item, account: accountOptions()[0] || "Carteira" } : item);
        } else {
          state[stateKey] = state[stateKey].filter((item) => item.id !== id);
        }
        notify("sync", "Item removido");
        commitState();
      });
    }
  }

  if (event.target.dataset.editEntry) {
    closeModal();
    editingEntryId = event.target.dataset.editEntry;
    setActiveView("entries");
    renderEntries();
  }

  if (event.target.dataset.toggleFixed) {
    closeModal();
    state.fixedBills = (state.fixedBills || []).map((item) => {
      if (item.id !== event.target.dataset.toggleFixed) return item;
      const paidMonths = new Set(item.paidMonths || []);
      const key = periodKey();
      if (paidMonths.has(key) || paidMonths.has(state.selectedMonth)) {
        paidMonths.delete(key);
        paidMonths.delete(state.selectedMonth);
      } else {
        paidMonths.add(key);
      }
      const updated = { ...item, paidMonths: [...paidMonths] };
      return { ...updated, status: isFixedPaid(updated) ? "Pago" : "Pendente" };
    });
    notify("sync", "Status da conta fixa atualizado");
    commitState();
  }

  if (event.target.dataset.editFixed) { closeModal(); editFixedBill(event.target.dataset.editFixed); }
  if (event.target.dataset.editCard) { closeModal(); editCard(event.target.dataset.editCard); }
  if (event.target.dataset.editInstallment) { closeModal(); editInstallment(event.target.dataset.editInstallment); }
  if (event.target.dataset.editCardRecurring) { closeModal(); editCardRecurring(event.target.dataset.editCardRecurring); }
  if (event.target.dataset.editAccount) { closeModal(); editAccount(event.target.dataset.editAccount); }
  if (event.target.dataset.cardDetail) {
    selectedInvoiceCard = event.target.dataset.cardDetail;
    setActiveView("cards");
    renderCards();
  }
  if (event.target.dataset.editCardPayment) {
    closeModal();
    const item = state.cardPayments.find((payment) => payment.id === event.target.dataset.editCardPayment);
    if (item) {
      modalMode = { kind: "cardPayment", id: item.id, fields: [
        { name: "description", label: "Descrição", value: item.description },
        { name: "value", label: "Valor pago", type: "number", step: "0.01", value: item.value },
        { name: "date", label: "Data do pagamento", type: "date", value: item.date }
      ] };
      renderModal();
    }
  }

  if (event.target.dataset.editCategory) {
    const [kind, oldName] = event.target.dataset.editCategory.split("|");
    modalMode = { kind: "category", id: oldName, extra: { categoryKind: kind, oldName }, fields: [
      { name: "name", label: "Nome da categoria", value: oldName }
    ] };
    renderModal();
  }

  if (event.target.dataset.deleteCategory) {
    const [kind, oldName] = event.target.dataset.deleteCategory.split("|");
    askConfirm(() => {
      const key = kind === "Receita" ? "categoriesIncome" : "categoriesExpense";
      state[key] = state[key].filter((item) => item !== oldName);
      notify("sync", `Categoria removida: ${oldName}`);
      commitState();
    });
  }

  if (event.target.dataset.addGoal) {
    const goal = state.goals.find((item) => item.id === event.target.dataset.addGoal);
    if (!goal) return;
    modalMode = { kind: "goalAdd", id: goal.id, fields: [
      { name: "value", label: "Valor para adicionar", type: "number", step: "0.01", value: 0 }
    ] };
    renderModal();
  }

  if (event.target.dataset.editGoal) {
    const goal = state.goals.find((item) => item.id === event.target.dataset.editGoal);
    if (!goal) return;
    modalMode = { kind: "goal", id: goal.id, fields: [
      { name: "title", label: "Nome", value: goal.title },
      { name: "target", label: "Valor total", type: "number", step: "0.01", value: goal.target },
      { name: "saved", label: "Valor guardado", type: "number", step: "0.01", value: goal.saved },
      { name: "due", label: "Data-alvo", type: "date", value: goal.due || "" },
      { name: "status", label: "Status", value: goal.status }
    ] };
    renderModal();
  }

  const help = event.target.closest(".help-dot");
  if (help) {
    event.preventDefault();
    alert(help.getAttribute("aria-label") || help.title || "Ajuda deste campo.");
  }

  const passwordToggle = event.target.closest("[data-toggle-password]");
  if (passwordToggle) {
    const wrap = passwordToggle.closest(".password-wrap");
    const input = wrap?.querySelector("input");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    passwordToggle.textContent = show ? "Ocultar" : "Ver";
  }

  if (event.target.dataset.payCardMonth) {
    const cardName = event.target.dataset.payCardMonth;
    const openValue = Math.max(0, cardTotals(cardName).month - cardPaymentTotal(cardName));
    if (openValue > 0) addCardPayment(cardName, openValue, "Quitação da fatura");
    state.installments = state.installments.map((item) => {
      if (!sameCard(item.card, cardName)) return item;
      const schedule = getInstallmentSchedule(item);
      if (!schedule.some((part) => part.month === state.selectedMonth && Number(part.year) === Number(state.selectedYear))) return item;
      return { ...item, paidMonths: [...new Set([...(item.paidMonths || []), periodKey()])] };
    });
    state.cardRecurring = state.cardRecurring.map((item) => sameCard(item.card, cardName) ? { ...item, paidMonths: [...new Set([...(item.paidMonths || []), periodKey()])] } : item);
    notify("card", `Fatura marcada como paga: ${cardName} · ${state.selectedMonth}`);
    commitState();
  }

  if (event.target.dataset.partialCardPayment) {
    const cardName = event.target.dataset.partialCardPayment;
    const openValue = Math.max(0, cardTotals(cardName).month - cardPaymentTotal(cardName));
    const typed = prompt(`Quanto foi pago da fatura ${cardName}? Valor aberto: ${formatMoney(openValue)}`, openValue ? String(openValue.toFixed(2)) : "");
    if (typed === null) return;
    const value = Number(String(typed).replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      showToast("Informe um valor válido para o pagamento", "error");
      return;
    }
    addCardPayment(cardName, value, "Pagamento parcial da fatura");
    notify("card", `Pagamento parcial: ${cardName} · ${formatMoney(value)}`);
    commitState();
  }

  if (event.target.dataset.reopenCardMonth) {
    const cardName = event.target.dataset.reopenCardMonth;
    state.installments = state.installments.map((item) => {
      if (!sameCard(item.card, cardName)) return item;
      const schedule = getInstallmentSchedule(item);
      if (!schedule.some((part) => part.month === state.selectedMonth && Number(part.year) === Number(state.selectedYear))) return item;
      return { ...item, paidMonths: (item.paidMonths || []).filter((month) => month !== state.selectedMonth && month !== periodKey()) };
    });
    state.cardRecurring = state.cardRecurring.map((item) => sameCard(item.card, cardName) ? { ...item, paidMonths: (item.paidMonths || []).filter((month) => month !== state.selectedMonth && month !== periodKey()) } : item);
    notify("card", `Fatura reaberta: ${cardName} · ${state.selectedMonth}`);
    commitState();
  }

  if (event.target.dataset.toggleCardPart) {
    closeModal();
    const [id, month, year] = event.target.dataset.toggleCardPart.split("|");
    state.installments = state.installments.map((item) => {
      if (item.id !== id) return item;
      const paidMonths = new Set(item.paidMonths || []);
      const key = periodKey(month, year || state.selectedYear);
      if (paidMonths.has(key) || paidMonths.has(month)) {
        paidMonths.delete(key);
        paidMonths.delete(month);
      } else {
        paidMonths.add(key);
      }
      return { ...item, paidMonths: [...paidMonths] };
    });
    notify("card", "Status da parcela atualizado");
    commitState();
  }

  if (event.target.dataset.toggleCardRecurring) {
    closeModal();
    state.cardRecurring = state.cardRecurring.map((item) => {
      if (item.id !== event.target.dataset.toggleCardRecurring) return item;
      const paidMonths = new Set(item.paidMonths || []);
      const key = periodKey();
      if (paidMonths.has(key) || paidMonths.has(state.selectedMonth)) {
        paidMonths.delete(key);
        paidMonths.delete(state.selectedMonth);
      } else {
        paidMonths.add(key);
      }
      return { ...item, paidMonths: [...paidMonths] };
    });
    notify("card", "Status do fixo no cartão atualizado");
    commitState();
  }
});

qs("#month-filter").addEventListener("change", (event) => {
  state.selectedMonth = event.target.value;
  render();
});

document.addEventListener("change", (event) => {
  if (event.target?.id === "year-filter") {
    state.selectedYear = Number(event.target.value);
    render();
  }
});

function rememberAwayTime() {
  if (!currentUser) return;
  localStorage.setItem("duofinAwayAt", String(Date.now()));
}

async function requireLoginAfterAway() {
  if (!currentUser || !cloud) return;
  const awayAt = Number(localStorage.getItem("duofinAwayAt") || 0);
  if (!awayAt) return;
  if (Date.now() - awayAt >= AUTO_LOCK_MS) {
    localStorage.removeItem("duofinAwayAt");
    await signOut();
    renderGate("Por segurança, entre novamente. O app ficou fechado por mais de 5 minutos.");
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) rememberAwayTime();
  else requireLoginAfterAway();
});

window.addEventListener("pagehide", rememberAwayTime);
window.addEventListener("focus", requireLoginAfterAway);

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

qs("#quick-add").addEventListener("click", openQuickAdd);
initCloud();

