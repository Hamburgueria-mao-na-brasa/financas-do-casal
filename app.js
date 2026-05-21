const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SUPABASE_URL = "https://allcnnxedveesyyvqavb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_H1Z7eE29GXki-Txjk2yNTA_IhOiKNpC";
const cloud = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const seed = {
  selectedMonth: "junho",
  categoriesIncome: ["💸 Salário", "💵 Renda Extra", "👜 Venda de Produto", "🔧 Serviços Prestados", "💸 13º Salário", "📆 Férias / Rescisão", "💰 Pix Recebido", "↩ Reembolso / Estorno", "📊 Investimentos / Rendimentos"],
  categoriesExpense: ["🍌 Alimentação", "🍔 Restaurantes / Lanches", "🏠 Aluguel / Condomínio", "⚡ Energia", "💧 Água", "📞 Internet / Celular", "🚓 Transporte", "💳 Cartão de Crédito", "🌍 Lazer / Viagens", "💊 Saúde", "👩‍🎓 Educação", "🥼 Roupas / Calçados", "🎁 Presentes", "🔨 Manutenção da Casa", "🧾 Compras Parceladas", "📈 Impostos / Taxas"],
  paymentTypes: ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Pix", "Transferência Bancária", "Boleto", "Débito Automático", "Cheque", "Vale-Alimentação", "Vale-Refeição"],
  accounts: [],
  cards: [],
  entries: [],
  installments: [],
  methodIncome: 0,
  goals: [],
  notifications: [],
  profile: { personOne: "Ele", personTwo: "Ela" },
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

const tutorialSteps = [
  ["Visão geral", "Veja saldo do mês, entradas, saídas, faturas, alertas e o resumo inteligente."],
  ["Lançamentos", "Registre entradas, saídas e compras no cartão. Use o botão + para lançar rápido."],
  ["Nossa Carteira", "Cadastre contas, cartões e rendas como salário. É a base do controle."],
  ["Cartões", "Acompanhe compras parceladas, fatura atual e próxima fatura."],
  ["50/30/20", "Planeje renda entre essenciais, investimentos e desejos."],
  ["Metas", "Acompanhe objetivos do casal, como carro, viagem ou reserva."],
  ["Cadastros", "Ajuste nomes, categorias, recorrências, orçamento e backup."]
];

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
  return fresh;
}

function ensureStateShape() {
  state.notifications ||= [];
  state.accounts ||= [];
  state.cards ||= [];
  state.entries ||= [];
  state.installments ||= [];
  state.goals ||= [];
  state.profile ||= { personOne: "Ele", personTwo: "Ela" };
  state.recurring ||= [];
  state.budgets ||= {};
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
  render();
}

function byMonth(items, month = state.selectedMonth) {
  return items.filter((item) => item.month === month);
}

function total(items) {
  return items.reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function monthIndex(month) {
  return months.indexOf(month.toLowerCase());
}

function getInstallmentSchedule(item) {
  const start = monthIndex(item.firstMonth);
  const perPart = Number(item.value || 0) / Number(item.parts || 1);
  return Array.from({ length: Number(item.parts || 1) }, (_, index) => ({
    month: months[(start + index) % 12],
    value: perPart,
    paid: item.paidMonths.includes(months[(start + index) % 12])
  }));
}

function cardTotals(cardName) {
  const scheduled = state.installments
    .filter((item) => item.card === cardName)
    .flatMap(getInstallmentSchedule);
  const open = scheduled.filter((part) => !part.paid);
  const monthOpen = open.filter((part) => part.month === state.selectedMonth);
  return {
    used: total(open),
    month: total(monthOpen),
    next: total(open.filter((part) => part.month === months[(monthIndex(state.selectedMonth) + 1) % 12]))
  };
}

function currentSummary() {
  const entries = byMonth(state.entries);
  const income = total(entries.filter((item) => item.type === "Receita"));
  const expense = total(entries.filter((item) => item.type === "Despesa"));
  const cardMonth = total(state.cards.map((card) => ({ value: cardTotals(card.name).month })));
  const cardDebt = total(state.cards.map((card) => ({ value: cardTotals(card.name).used })));
  return { income, expense, cardMonth, cardDebt, balance: income - expense - cardMonth };
}

function pageTitle(view) {
  return {
    dashboard: "Visão geral",
    entries: "Lançamentos",
    cards: "Cartões",
    accounts: "Nossa Carteira",
    method: "Método 50/30/20",
    goals: "Metas financeiras",
    settings: "Cadastros"
  }[view];
}

function render() {
  ensureStateShape();
  saveState(false);
  renderGate();
  if (!currentUser || !cloudReady) return;
  renderCloudPanel();
  renderMonthFilter();
  renderDashboard();
  renderOnboarding();
  renderEntries();
  renderCards();
  renderAccounts();
  renderMethod();
  renderGoals();
  renderSettings();
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
    auth.innerHTML = `
      <div class="auth-card fintech-login">
        <div class="login-hero">
          <div class="brand">
            <span class="brand-mark">FC</span>
            <div><strong>Finanças do Casal</strong><small>Conta compartilhada</small></div>
          </div>
          <div class="login-balance-preview">
            <span>Saldo organizado</span>
            <strong>R$ 0,00</strong>
          </div>
        </div>
        <h1>${isForgot ? "Definir nova senha" : isSignup ? "Criar conta" : "Entrar na sua conta"}</h1>
        <p>${isForgot ? "Informe seu e-mail para receber um link seguro e criar uma senha." : isSignup ? "Crie sua conta e comece com tudo zerado. Depois convide seu companheiro para compartilhar os mesmos dados." : "Acesse seu painel financeiro do casal com segurança."}</p>
        <form id="login-form" class="auth-actions">
          <label class="field"><span>E-mail</span><input name="email" type="email" placeholder="voce@email.com" required></label>
          ${isForgot ? "" : `<label class="field"><span>Senha</span><input name="password" type="password" minlength="6" placeholder="Mínimo 6 caracteres" required></label>`}
          <button class="primary" type="submit">${isForgot ? "Enviar link para senha" : isSignup ? "Criar conta" : "Entrar"}</button>
          ${isForgot ? `<button class="ghost" id="toggle-auth" type="button">Voltar para entrar</button>` : `<button class="ghost" id="toggle-auth" type="button">${isSignup ? "Já tenho conta" : "Criar uma conta nova"}</button>`}
          ${isSignup || isForgot ? "" : `<button class="ghost" id="forgot-password" type="button">Definir ou recuperar senha</button>`}
        </form>
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
          <span class="brand-mark">FC</span>
          <div><strong>Finanças do Casal</strong><small>${currentUser.email}</small></div>
        </div>
        <h1>Criar nova senha</h1>
        <p>Defina uma senha para entrar direto na sua conta das próximas vezes.</p>
        <form id="new-password-form" class="auth-actions">
          <label class="field"><span>Nova senha</span><input name="password" type="password" minlength="6" placeholder="Mínimo 6 caracteres" required></label>
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
          <span class="brand-mark">FC</span>
          <div><strong>Finanças do Casal</strong><small>${currentUser.email}</small></div>
        </div>
        ${invite ? `
          <h1>Confirmar convite</h1>
          <p>Você foi convidado para compartilhar as finanças do casal. Confirme para entrar no mesmo cofre.</p>
          <div class="auth-actions">
            <button class="primary" id="accept-invite" type="button">Aceitar convite</button>
            <button class="ghost" id="logout" type="button">Usar outro e-mail</button>
          </div>
        ` : `
          <h1>Preparando sua conta</h1>
          <p>Estamos criando seu espaço financeiro vazio para você começar do zero.</p>
        `}
        ${message ? `<p class="mini-status">${message}</p>` : ""}
      </div>
    `;
    const logout = qs("#logout");
    if (logout) logout.addEventListener("click", signOut);
    const accept = qs("#accept-invite");
    if (accept) accept.addEventListener("click", () => joinHousehold(invite));
    return;
  }

  setAppReady(true);
}

function renderCloudPanel(message = "") {
  const panel = qs("#cloud-panel");
  const inviteLink = getInviteLink();

  if (!cloud) {
    panel.innerHTML = `<span class="mini-status">Modo local</span>`;
    return;
  }

  if (!currentUser || !cloudReady) {
    panel.innerHTML = "";
    return;
  }

  panel.innerHTML = `
    <button class="notif-button" id="toggle-notifications" type="button" title="Notificações">🔔${unreadCount() ? `<b>${unreadCount()}</b>` : ""}</button>
    <button class="notif-button" id="toggle-privacy" type="button" title="Ocultar valores">${state.privacyMode ? "🙈" : "👁"}</button>
    <span class="mini-status"><i class="dot"></i> Online</span>
    ${syncStatus ? `<span class="mini-status">${syncStatus}</span>` : ""}
    ${inviteLink ? `<span class="mini-status invite-link" title="${inviteLink}">Convite do companheiro</span>` : ""}
    <button class="ghost" id="copy-invite" type="button">Adicionar companheiro</button>
    <button class="ghost" id="logout" type="button">Sair</button>
    ${message ? `<span class="mini-status">${message}</span>` : ""}
  `;
  qs("#toggle-notifications").addEventListener("click", () => {
    notificationsOpen = !notificationsOpen;
    renderNotifications();
  });
  qs("#toggle-privacy").addEventListener("click", () => {
    state.privacyMode = !state.privacyMode;
    commitState();
  });
  qs("#logout").addEventListener("click", signOut);
  qs("#copy-invite").addEventListener("click", copyInviteLink);
  renderNotifications();
}

function unreadCount() {
  return (state.notifications || []).filter((item) => !item.read).length;
}

function currentActor() {
  return currentUser?.email?.split("@")[0] || "Alguém";
}

function notify(type, text) {
  ensureStateShape();
  state.notifications.unshift({
    id: crypto.randomUUID(),
    type,
    text,
    actor: currentActor(),
    at: new Date().toISOString(),
    read: false
  });
  state.notifications = state.notifications.slice(0, 30);
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
    state.notifications = state.notifications.map((item) => ({ ...item, read: true }));
    commitState();
    notificationsOpen = true;
    renderNotifications();
  });
}

function renderTutorial() {
  const modal = qs("#app-modal");
  if (state.tutorialDone || modalMode) return;
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
}

function finishTutorial() {
  state.tutorialDone = true;
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
  qs("#app-modal").classList.remove("open");
  qs("#app-modal").innerHTML = "";
}

function renderModal() {
  const modal = qs("#app-modal");
  if (!modalMode) return closeModal();
  modal.classList.add("open");
  modal.innerHTML = `
    <div class="modal-card">
      <div class="modal-head">
        <strong>Lançamento rápido</strong>
        <button class="ghost tiny" id="close-modal" type="button">Fechar</button>
      </div>
      <form class="auth-actions" id="quick-form">
        ${select("type", "Tipo", ["Saída", "Entrada", "Cartão"])}
        ${input("value", "Valor", "number", "", "0.01")}
        ${input("description", "Descrição", "text", "")}
        ${select("person", "Quem?", appPeople())}
        <button class="primary" type="submit">Salvar rápido</button>
      </form>
    </div>
  `;
  qs("#close-modal").addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  }, { once: true });
  qs("#quick-form").addEventListener("submit", saveQuickEntry);
}

function saveQuickEntry(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const type = data.type === "Entrada" ? "Receita" : data.type === "Cartão" ? "Cartão" : "Despesa";
  const today = new Date().toISOString().slice(0, 10);
  if (type === "Cartão") {
    state.installments.unshift({
      id: crypto.randomUUID(),
      date: today,
      card: state.cards[0]?.name || "Cartão",
      description: data.description || "Compra no cartão",
      category: state.categoriesExpense[0] || "Cartão",
      value: Number(data.value || 0),
      parts: 1,
      firstMonth: months[new Date().getMonth()],
      paidMonths: []
    });
    notify("card", `Compra rápida no cartão · ${formatMoney(Number(data.value || 0))}`);
  } else {
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
  }
  closeModal();
  commitState();
}

function notificationItem(item) {
  const time = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(item.at));
  return `
    <article class="notification-item ${item.read ? "" : "unread"}">
      <span>${notificationIcon(item.type)}</span>
      <div><strong>${item.text}</strong><small>${item.actor} · ${time}</small></div>
    </article>
  `;
}

function notificationIcon(type) {
  return { entry: "＋", card: "▣", account: "≋", goal: "◇", invite: "↗", sync: "✓" }[type] || "•";
}

async function copyInviteLink() {
  const inviteLink = getInviteLink();
  if (!inviteLink) return;
  try {
    await navigator.clipboard.writeText(inviteLink);
    notify("invite", "Link de convite copiado");
    await commitState();
    renderCloudPanel("Link copiado");
  } catch {
    renderCloudPanel(inviteLink);
  }
}

async function handlePasswordAuth(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const email = form.get("email");
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
  if (householdError) return renderGate(householdError.message);

  const { error: memberError } = await cloud.from("household_members").insert({ household_id: id, user_id: currentUser.id, role: "owner" });
  if (memberError) return renderGate(memberError.message);

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
  if (!code) return renderGate("Convite inválido");
  loadingCloud = true;
  renderGate("Confirmando convite...");
  const { data, error } = await cloud.rpc("join_household_by_code", { join_code: code });
  if (error) return renderGate(error.message);
  householdId = data;
  householdInviteCode = code.trim().toUpperCase();
  localStorage.setItem("coupleFinanceHouseholdId", householdId);
  localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  await loadCloudState();
  history.replaceState({}, "", location.pathname);
  loadingCloud = false;
  render();
}

async function loadExistingHousehold() {
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
    if (getInviteParam()) {
      cloudReady = false;
      render();
      return;
    }
    await createHousehold();
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
  select.innerHTML = months.map((month) => `<option ${month === state.selectedMonth ? "selected" : ""}>${month}</option>`).join("");
}

function renderDashboard() {
  const summary = currentSummary();
  const insights = dashboardInsights(summary);
  const pending = state.entries
    .filter((item) => item.status === "Pendente")
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 5);
  const budgetAlerts = budgetWarnings();
  const attentionHtml = [
    ...budgetAlerts.map((item) => `<div class="list-item"><div><strong>${item.category}</strong><span>${item.percent}% do orçamento usado</span></div><b>${formatMoney(item.spent)} / ${formatMoney(item.limit)}</b></div>`),
    ...pending.map((item) => `<div class="list-item"><div><strong>${item.description || item.category}</strong><span>${dateFmt.format(new Date(`${item.date}T00:00:00Z`))} · ${item.category}</span></div><b>${formatMoney(item.value)}</b></div>`)
  ].join("");
  const recentEntries = [...state.entries]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);
  const categoryTotals = byMonth(state.entries)
    .filter((item) => item.type === "Despesa")
    .reduce((acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + Number(item.value || 0) }), {});
  const maxCategory = Math.max(1, ...Object.values(categoryTotals));
  const people = appPeople().map((name) => {
    const personEntries = byMonth(state.entries).filter((item) => item.person === name);
    const income = total(personEntries.filter((item) => item.type === "Receita"));
    const expense = total(personEntries.filter((item) => item.type === "Despesa"));
    return { name, income, expense, balance: income - expense };
  });

  qs("#dashboard").innerHTML = `
    <section class="bank-home">
      <div class="balance-card">
        <div>
          <span>Saldo do mês</span>
          <strong>${formatMoney(summary.balance)}</strong>
          <small>${state.selectedMonth} · Conta compartilhada</small>
        </div>
        ${coupleIllustration(summary.balance)}
        <div class="balance-ring">
          <span>${summary.balance >= 0 ? "OK" : "!"}</span>
        </div>
      </div>
      <div class="quick-actions">
        <button class="action-chip" data-view="entries"><b>＋</b><span>Lançamento</span></button>
        <button class="action-chip" data-view="cards"><b>▣</b><span>Cartão</span></button>
        <button class="action-chip" data-view="goals"><b>◇</b><span>Meta</span></button>
        <button class="action-chip" data-view="accounts"><b>≋</b><span>Nossa Carteira</span></button>
      </div>
    </section>
    <div class="summary-grid bank-metrics">
      ${metric("Entradas", summary.income, "good")}
      ${metric("Saídas", summary.expense, "bad")}
      ${metric("Cartões", summary.cardMonth, "info")}
      ${metric("Saldo devedor", summary.cardDebt, "warn")}
    </div>
    <div class="grid-2">
      <div class="panel">
        <h2>Resumo inteligente</h2>
        <div class="insight-grid">
          ${insights.map((item) => `<div class="insight-card"><span>${item.label}</span><strong>${item.value}</strong><small>${item.note}</small></div>`).join("")}
        </div>
      </div>
      <div class="panel">
        <h2>Atenção</h2>
        <div class="list">
          ${attentionHtml || emptyHtml()}
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <h2>Extrato recente</h2>
        <div class="statement-list">
          ${recentEntries.length ? recentEntries.map(statementItem).join("") : emptyHtml()}
        </div>
      </div>
      <div class="panel">
        <h2>Conta do casal</h2>
        <div class="list">
          ${people.map((person) => `
            <div class="list-item">
              <div><strong>${person.name}</strong><span>Receitas ${formatMoney(person.income)} · Despesas ${formatMoney(person.expense)}</span></div>
              <b>${formatMoney(person.balance)}</b>
            </div>
          `).join("")}
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div class="panel">
        <h2>Despesas por categoria</h2>
        <div class="bars">
          ${Object.entries(categoryTotals).length ? Object.entries(categoryTotals).map(([name, value]) => bar(name, value, maxCategory, "#e04f3f")).join("") : emptyHtml()}
        </div>
      </div>
      <div class="panel">
        <h2>Metas em andamento</h2>
        <div class="compact-goals">
          ${state.goals.length ? state.goals.slice(0, 3).map(goalCard).join("") : emptyHtml()}
        </div>
      </div>
    </div>
  `;
}

function budgetWarnings() {
  const monthExpenses = byMonth(state.entries).filter((item) => item.type === "Despesa");
  return Object.entries(state.budgets || {}).map(([category, limit]) => {
    const spent = total(monthExpenses.filter((item) => item.category === category));
    return { category, limit, spent, percent: Math.round((spent / Math.max(1, limit)) * 100) };
  }).filter((item) => item.limit > 0 && item.percent >= 80);
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
      ${onboardingStep(state.accounts.length, "Adicionar dinheiro na carteira")}
      ${onboardingStep(state.cards.length, "Cadastrar um cartão")}
      ${onboardingStep(state.entries.length || state.installments.length, "Fazer o primeiro lançamento")}
      ${onboardingStep(householdInviteCode, "Convidar companheiro")}
    </div>
    <button class="ghost" id="finish-onboarding" type="button">Ocultar checklist</button>
  `;
  dashboard.prepend(box);
  qs("#finish-onboarding").addEventListener("click", () => {
    state.onboardingDone = true;
    notify("sync", "Checklist inicial concluído");
    commitState();
  });
}

function onboardingStep(done, text) {
  return `<span class="${done ? "done" : ""}">${done ? "✓" : "•"} ${text}</span>`;
}

function coupleIllustration(balance) {
  const happy = balance >= 0;
  const mouth = happy ? "M 30 48 Q 40 58 50 48" : "M 30 56 Q 40 46 50 56";
  const secondMouth = happy ? "M 94 48 Q 104 58 114 48" : "M 94 56 Q 104 46 114 56";
  return `
    <div class="couple-widget ${happy ? "happy" : "sad"}" aria-label="${happy ? "Casal feliz com dinheiro sobrando" : "Casal preocupado com saldo negativo"}">
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
        ${happy ? `<text class="mood-text" x="75" y="132" text-anchor="middle">sobrou</text>` : `<text class="mood-text" x="75" y="132" text-anchor="middle">atenção</text>`}
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
  const isIncome = entryMode === "Receita";
  const isCard = entryMode === "Cartão";
  qs("#entries").innerHTML = `
    <form class="entry-form guided-form" id="entry-form">
      <div class="mode-picker span-3" role="tablist" aria-label="Tipo de lançamento">
        <button class="${entryMode === "Receita" ? "active" : ""}" type="button" data-entry-mode="Receita">Entrada</button>
        <button class="${entryMode === "Despesa" ? "active" : ""}" type="button" data-entry-mode="Despesa">Saída</button>
        <button class="${entryMode === "Cartão" ? "active" : ""}" type="button" data-entry-mode="Cartão">Cartão</button>
      </div>
      ${input("value", isCard ? "Valor da compra" : "Valor", "number", editing?.value || "", "0.01", "Valor total da entrada, saída ou compra.")}
      ${input("date", isCard ? "Data da compra" : "Data", "date", editing?.date || new Date().toISOString().slice(0, 10), "", "Data em que aconteceu ou deve acontecer.")}
      ${isCard ? select("card", "Qual cartão?", state.cards.map((item) => item.name), "", "Cartão onde essa compra entrou.") : ""}
      ${isCard ? input("parts", "Parcelas", "number", "1", "1", "Quantidade de parcelas da compra.") : ""}
      ${isCard ? select("firstMonth", "Primeiro mês da fatura", months, "", "Mês em que a primeira parcela aparece na fatura.") : ""}
      ${select("category", isIncome ? "De onde veio?" : "Categoria", isIncome ? state.categoriesIncome : state.categoriesExpense, "", "Ajuda o app a organizar o resumo por tipo.")}
      ${input("description", isIncome ? "Descrição da entrada" : isCard ? "Nome da compra" : "Descrição da saída", "text", editing?.description || "", "", "Nome curto para reconhecer depois.")}
      ${select("person", "Quem?", appPeople(), editing?.person, "Quem recebeu, pagou ou é responsável.")}
      ${!isCard && !isIncome ? select("payment", "Como foi pago?", state.paymentTypes, "", "Forma de pagamento usada nessa saída.") : ""}
      ${!isCard ? select("account", isIncome ? "Conta que recebeu" : "Conta de onde saiu", accountOptions(), "", "Conta/carteira onde o dinheiro entrou ou saiu.") : ""}
      ${!isCard && !isIncome ? select("status", "Situação", ["Pago", "Pendente"], "", "Pago já saiu da conta. Pendente ainda está para pagar.") : ""}
      <label class="field span-2"><span>Observação opcional</span><input name="notes"></label>
      <button class="primary span-2" type="submit">${editing ? "Salvar alterações" : "Salvar lançamento"}</button>
      ${editing ? `<button class="ghost" id="cancel-edit" type="button">Cancelar edição</button>` : ""}
    </form>
    <div class="panel">
      <h2>Fixos do mês</h2>
      <div class="list">
        ${state.recurring.length ? state.recurring.map((item) => `<div class="list-item"><div><strong>${item.description}</strong><span>${item.type === "Receita" ? "Entrada" : "Saída"} · dia ${item.day} · ${item.category}</span></div><b>${formatMoney(item.value)}</b></div>`).join("") : emptyHtml()}
      </div>
      <button class="ghost" id="generate-recurring" type="button">Gerar fixos deste mês</button>
    </div>
    ${table(["Data", "Tipo", "Categoria", "Descrição", "Valor", "Quem", "Situação", ""], state.entries.map((item) => [
      dateFmt.format(new Date(`${item.date}T00:00:00Z`)),
      pill(item.type === "Receita" ? "Entrada" : "Saída", item.type.toLowerCase()),
      item.category,
      item.description,
      `<td class="amount">${formatMoney(item.value)}</td>`,
      pill(item.person, item.person.toLowerCase()),
      pill(item.status, item.status.toLowerCase()),
      `<button class="tiny ghost" data-edit-entry="${item.id}">Editar</button> <button class="tiny danger" data-delete-entry="${item.id}">Excluir</button>`
    ]))}
  `;
  qs("#entry-form").addEventListener("submit", addEntry);
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
}

function generateRecurring() {
  const year = new Date().getFullYear();
  const month = new Date().getMonth();
  const monthName = months[month];
  let created = 0;
  state.recurring.forEach((item) => {
    const date = new Date(year, month, Math.min(Number(item.day || 1), 28)).toISOString().slice(0, 10);
    const exists = state.entries.some((entry) => entry.recurringId === item.id && entry.month === monthName);
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
  notify("sync", `${created} fixos gerados para ${monthName}`);
  commitState();
}

function addEntry(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (entryMode === "Cartão") {
    state.installments.unshift({
      id: crypto.randomUUID(),
      date: data.date,
      card: data.card,
      description: data.description,
      category: data.category,
      value: Number(data.value || 0),
      parts: Number(data.parts || 1),
      firstMonth: data.firstMonth,
      paidMonths: []
    });
    notify("card", `Compra no cartão: ${data.description || data.card} · ${formatMoney(Number(data.value || 0))}`);
    commitState();
    return;
  }

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

function renderCards() {
  qs("#cards").innerHTML = `
    <div class="panel helper-panel">
      <h2>Compras no cartão</h2>
      <p>Use esta tela para lançar compras parceladas e acompanhar as faturas. Para criar ou alterar cartões, vá em <strong>Nossa Carteira</strong>.</p>
    </div>
    <form class="entry-form" id="card-form">
      ${select("card", "Cartão", cardOptions(), "", "Cartão onde a compra será lançada.")}
      ${input("date", "Data da compra", "date", new Date().toISOString().slice(0, 10), "", "Dia em que você fez a compra.")}
      ${input("description", "Descrição", "text", "", "", "Ex: mercado, farmácia, presente.")}
      ${select("category", "Categoria", state.categoriesExpense, "", "Categoria da compra para relatórios.")}
      ${input("value", "Valor da compra", "number", "", "0.01", "Valor total, antes de dividir em parcelas.")}
      ${input("parts", "Parcelas", "number", "1", "1", "Quantidade de parcelas. Use 1 para compra à vista no cartão.")}
      ${select("firstMonth", "Primeiro mês", months, "", "Mês em que a primeira parcela entra na fatura.")}
      <button class="primary" type="submit">Adicionar</button>
    </form>
    <div class="grid-3">
      ${state.cards.map(cardSummary).join("") || emptyHtml()}
    </div>
    <div class="panel">
      <h2>Faturas por cartão</h2>
      <div class="list">
        ${state.cards.length ? state.cards.map(cardInvoiceRow).join("") : emptyHtml()}
      </div>
    </div>
    ${table(["Compra", "Cartão", "Categoria", "Valor", "Parcelas", "1º mês", ""], state.installments.map((item) => [
      item.description,
      item.card,
      item.category,
      `<td class="amount">${formatMoney(item.value)}</td>`,
      item.parts,
      item.firstMonth,
      `<button class="tiny danger" data-delete-installment="${item.id}">Excluir</button>`
    ]))}
  `;
  qs("#card-form").addEventListener("submit", addInstallment);
}

function cardInvoiceRow(card) {
  const totals = cardTotals(card.name);
  const nextMonth = months[(monthIndex(state.selectedMonth) + 1) % 12];
  return `
    <div class="list-item">
      <div>
        <strong>${card.name}</strong>
        <span>Atual ${formatMoney(totals.month)} · Próxima ${formatMoney(totals.next)} (${nextMonth})</span>
      </div>
      <button class="tiny ghost" data-pay-card-month="${card.name}">Marcar fatura paga</button>
    </div>
  `;
}

function cardSummary(card) {
  const totals = cardTotals(card.name);
  const available = Number(card.limit || 0) - totals.used;
  const percent = Math.min(100, Math.round((totals.used / Math.max(card.limit, totals.used, 1)) * 100));
  return `<article class="credit-card ${card.color || "Verde"}">
    <div>
      <span>Cartão de crédito</span>
      <strong>${card.name}</strong>
    </div>
    <div class="card-chip"></div>
    <div class="card-lines">
      <span>Limite total</span><b>${formatMoney(card.limit)}</b>
      <span>Disponível</span><b>${formatMoney(available)}</b>
      <span>Fatura do mês</span><b>${formatMoney(totals.month)}</b>
    </div>
    <div class="track card-track"><div class="fill" style="--w:${percent}%;--c:rgba(255,255,255,.88)"></div></div>
    <button class="tiny danger" data-delete-card="${card.id}">Excluir cartão</button>
  </article>`;
}

function cardOptions() {
  return state.cards.length ? state.cards.map((item) => item.name) : ["Cadastre um cartão primeiro"];
}

function addInstallment(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  if (!state.cards.length) return;
  state.installments.unshift({
    id: crypto.randomUUID(),
    date: data.date,
    card: data.card,
    description: data.description,
    category: data.category,
    value: Number(data.value || 0),
    parts: Number(data.parts || 1),
    firstMonth: data.firstMonth,
    paidMonths: []
  });
  notify("card", `Compra no cartão: ${data.description || data.card} · ${formatMoney(Number(data.value || 0))}`);
  commitState();
}

function renderAccounts() {
  qs("#accounts").innerHTML = `
    <div class="panel helper-panel">
      <h2>Nossa Carteira</h2>
      <p>Cadastre as contas onde o dinheiro fica e os cartões usados nas compras do casal.</p>
    </div>
    <div class="mode-picker wallet-tabs" role="tablist" aria-label="Carteira">
      <button class="${walletTab === "money" ? "active" : ""}" type="button" data-wallet-tab="money">Dinheiro</button>
      <button class="${walletTab === "cards" ? "active" : ""}" type="button" data-wallet-tab="cards">Cartões</button>
    </div>
    <div class="${walletTab === "money" ? "" : "hidden"}">
    <form class="entry-form guided-form" id="account-form">
      <div class="span-3"><h2>Adicionar conta</h2></div>
      ${input("name", "Nome da conta", "text", "", "", "Ex: Nubank, Itaú, Caixa, Dinheiro em casa.")}
      ${select("type", "Tipo", ["Corrente", "Poupança", "Digital", "Investimento", "Dinheiro"], "", "Ajuda a identificar que tipo de dinheiro é esse.")}
      ${select("owner", "Titular", appPeople(), "", "Quem é responsável por essa conta ou carteira.")}
      ${input("initial", "Saldo inicial", "number", "0", "0.01", "Quanto já tinha nessa conta antes de começar a usar o app.")}
      <button class="primary" type="submit">Salvar conta</button>
    </form>
    <form class="entry-form guided-form" id="income-form">
      <div class="span-3"><h2>Adicionar renda</h2></div>
      ${select("category", "Tipo de renda", state.categoriesIncome, "", "Ex: salário, renda extra, pix recebido.")}
      ${input("description", "Descrição", "text", "Salário", "", "Nome fácil para reconhecer essa renda.")}
      ${input("value", "Valor", "number", "0", "0.01", "Valor que entra na conta.")}
      ${select("person", "Quem recebe?", appPeople(), "", "Pessoa que recebeu essa renda.")}
      ${select("account", "Conta que recebeu", accountOptions(), "", "Onde o dinheiro entrou.")}
      ${input("day", "Dia do mês", "number", "5", "1", "Se for recorrente, esse é o dia em que costuma cair.")}
      ${select("recurring", "Repetir todo mês?", ["Sim", "Não"], "Sim", "Use Sim para salário e rendas fixas.")}
      <button class="primary" type="submit">Salvar renda</button>
    </form>
    </div>
    <div class="${walletTab === "cards" ? "" : "hidden"}">
    <form class="entry-form guided-form" id="new-card-form-main">
      <div class="span-3"><h2>Adicionar cartão de crédito</h2></div>
      ${input("name", "Nome do cartão", "text", "", "", "Ex: Nubank, Neon, Inter, cartão do mercado.")}
      ${input("limit", "Limite total", "number", "0", "0.01", "Limite aprovado no cartão de crédito.")}
      ${select("color", "Cor", ["Verde", "Azul", "Roxo", "Dourado", "Preto"], "", "Só muda a aparência do cartão no app.")}
      <button class="primary" type="submit">Adicionar cartão</button>
    </form>
    </div>
    <div>
      <div class="panel ${walletTab === "money" ? "" : "hidden"}">
        <h2>Contas cadastradas</h2>
        <div class="wallet-list">
          ${state.accounts.length ? state.accounts.map(accountCard).join("") : emptyHtml()}
        </div>
      </div>
      <div class="panel ${walletTab === "cards" ? "" : "hidden"}">
        <h2>Cartões de crédito</h2>
        <div class="wallet-cards">${state.cards.map(cardSummary).join("") || emptyHtml()}</div>
      </div>
    </div>
  `;
  qs("#account-form").addEventListener("submit", addAccount);
  qs("#income-form").addEventListener("submit", addIncome);
  qs("#new-card-form-main").addEventListener("submit", addCard);
  document.querySelectorAll("[data-wallet-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      walletTab = button.dataset.walletTab;
      renderAccounts();
    });
  });
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
      <button class="tiny danger" data-delete-account="${account.id}">Excluir</button>
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
  const income = Number(state.methodIncome || 0);
  const rows = [
    ["50%", "Essenciais", income * .5, "#245f9f"],
    ["30%", "Guardar e investir", income * .3, "#1f7a5b"],
    ["20%", "Desejos e flexíveis", income * .2, "#af7b20"]
  ];
  qs("#method").innerHTML = `
    <form class="entry-form" id="method-form">
      ${input("methodIncome", "Total de rendas", "number", state.methodIncome, "0.01")}
      <button class="primary" type="submit">Atualizar</button>
    </form>
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
  qs("#method-form").addEventListener("submit", (event) => {
    event.preventDefault();
    state.methodIncome = Number(new FormData(event.target).get("methodIncome") || 0);
    notify("sync", "Método 50/30/20 atualizado");
    commitState();
  });
}

function renderGoals() {
  qs("#goals").innerHTML = `
    <form class="entry-form" id="goal-form">
      ${input("title", "Objetivo", "text", "")}
      ${input("target", "Valor da meta", "number", "", "0.01")}
      ${input("saved", "Valor acumulado", "number", "0", "0.01")}
      ${input("due", "Data-alvo", "date", "")}
      ${select("status", "Status", ["Em progresso", "Concluído", "Pausado"])}
      <button class="primary" type="submit">Adicionar</button>
    </form>
    <div class="grid-3">${state.goals.length ? state.goals.map(goalCard).join("") : emptyHtml()}</div>
  `;
  qs("#goal-form").addEventListener("submit", addGoal);
}

function goalCard(goal) {
  const percent = Math.min(100, Math.round((Number(goal.saved || 0) / Math.max(1, Number(goal.target || 0))) * 100));
  return `<article class="panel progress-line">
    <h2>${goal.title}</h2>
    <div class="progress-meta"><span>${formatMoney(goal.saved)} de ${formatMoney(goal.target)}</span><strong>${percent}%</strong></div>
    <div class="track"><div class="fill" style="--w:${percent}%;--c:${percent >= 100 ? "#1f7a5b" : "#af7b20"}"></div></div>
    <div class="progress-meta"><span>${goal.due ? dateFmt.format(new Date(`${goal.due}T00:00:00Z`)) : "Sem data"}</span>${pill(goal.status, goal.status === "Concluído" ? "done" : "")}</div>
    <button class="tiny danger" data-delete-goal="${goal.id}">Excluir</button>
  </article>`;
}

function addGoal(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.goals.push({ id: crypto.randomUUID(), title: data.title, target: Number(data.target || 0), saved: Number(data.saved || 0), due: data.due, status: data.status });
  notify("goal", `Meta criada: ${data.title}`);
  commitState();
}

function renderSettings() {
  qs("#settings").innerHTML = `
    <form class="settings-form" id="profile-form">
      <div class="span-3"><h2>Perfil do casal</h2></div>
      ${input("personOne", "Primeira pessoa", "text", state.profile.personOne || "Ele")}
      ${input("personTwo", "Segunda pessoa", "text", state.profile.personTwo || "Ela")}
      <button class="primary" type="submit">Salvar nomes</button>
    </form>
    <div class="grid-2">
      <div class="panel">
        <h2>Categorias de receitas</h2>
        <div class="list">${state.categoriesIncome.map((item) => `<div class="list-item"><strong>${item}</strong></div>`).join("")}</div>
      </div>
      <div class="panel">
        <h2>Categorias de despesas</h2>
        <div class="list">${state.categoriesExpense.map((item) => `<div class="list-item"><strong>${item}</strong></div>`).join("")}</div>
      </div>
    </div>
    <div class="settings-stack">
      <form class="settings-form" id="category-form">
        <div class="span-3"><h2>Nova categoria</h2></div>
        ${select("kind", "Tipo", ["Receita", "Despesa"])}
        ${input("name", "Nova categoria", "text", "")}
        <button class="primary" type="submit">Adicionar</button>
      </form>
      <form class="settings-form" id="recurring-form">
        <div class="span-3"><h2>Receitas e despesas fixas</h2></div>
        ${select("type", "Tipo", ["Despesa", "Receita"])}
        ${input("description", "Descrição", "text", "")}
        ${input("value", "Valor", "number", "0", "0.01")}
        ${input("day", "Dia do mês", "number", "1", "1")}
        ${select("category", "Categoria", [...state.categoriesExpense, ...state.categoriesIncome])}
        ${select("person", "Quem?", appPeople())}
        <button class="primary form-submit" type="submit">Salvar fixo</button>
      </form>
      <form class="settings-form" id="budget-form">
        <div class="span-3"><h2>Orçamento por categoria</h2></div>
        ${select("category", "Categoria", state.categoriesExpense)}
        ${input("limit", "Limite mensal", "number", "0", "0.01")}
        <button class="primary form-submit" type="submit">Salvar limite</button>
      </form>
      <div class="panel">
        <h2>Backup</h2>
        <div class="list">
          <button class="ghost" id="export-data" type="button">Exportar dados</button>
          <label class="field"><span>Importar backup</span><input id="import-data" type="file" accept="application/json"></label>
        </div>
      </div>
    </div>
  `;
  qs("#profile-form").addEventListener("submit", saveProfile);
  qs("#category-form").addEventListener("submit", addCategory);
  qs("#recurring-form").addEventListener("submit", addRecurring);
  qs("#budget-form").addEventListener("submit", saveBudget);
  qs("#export-data").addEventListener("click", exportData);
  qs("#import-data").addEventListener("change", importData);
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
}

function importData(event) {
  const file = event.target.files?.[0];
  if (!file) return;
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

function saveProfile(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.profile = { personOne: data.personOne, personTwo: data.personTwo };
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
  state.cards.push({ id: crypto.randomUUID(), name: data.name, limit: Number(data.limit || 0), color: data.color || "Verde" });
  notify("card", `Cartão cadastrado: ${data.name} · limite ${formatMoney(Number(data.limit || 0))}`);
  commitState();
}

function labelWithHelp(label, help = "") {
  return `${label}${help ? `<button class="help-dot" type="button" title="${help}" aria-label="${help}">?</button>` : ""}`;
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

document.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-view]");
  if (tab) {
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === tab));
    document.querySelectorAll(".view").forEach((item) => item.classList.toggle("active", item.id === tab.dataset.view));
    qs("#page-title").textContent = pageTitle(tab.dataset.view);
  }

  const deleteMap = [
    ["deleteEntry", "entries", "entry"],
    ["deleteInstallment", "installments", "installment"],
    ["deleteAccount", "accounts", "account"],
    ["deleteCard", "cards", "card"],
    ["deleteGoal", "goals", "goal"]
  ];
  for (const [datasetKey, stateKey] of deleteMap) {
    if (event.target.dataset[datasetKey]) {
      if (!confirm("Tem certeza que deseja excluir este item?")) return;
      state[stateKey] = state[stateKey].filter((item) => item.id !== event.target.dataset[datasetKey]);
      notify("sync", "Item removido");
      commitState();
    }
  }

  if (event.target.dataset.editEntry) {
    editingEntryId = event.target.dataset.editEntry;
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item.dataset.view === "entries"));
    document.querySelectorAll(".view").forEach((item) => item.classList.toggle("active", item.id === "entries"));
    qs("#page-title").textContent = pageTitle("entries");
    renderEntries();
  }

  if (event.target.dataset.payCardMonth) {
    const cardName = event.target.dataset.payCardMonth;
    state.installments = state.installments.map((item) => {
      if (item.card !== cardName) return item;
      const schedule = getInstallmentSchedule(item);
      if (!schedule.some((part) => part.month === state.selectedMonth)) return item;
      return { ...item, paidMonths: [...new Set([...(item.paidMonths || []), state.selectedMonth])] };
    });
    notify("card", `Fatura marcada como paga: ${cardName} · ${state.selectedMonth}`);
    commitState();
  }
});

qs("#month-filter").addEventListener("change", (event) => {
  state.selectedMonth = event.target.value;
  render();
});

qs("#reset-data").addEventListener("click", () => {
  state = blankState();
  notify("sync", "Controle reiniciado do zero");
  localStorage.removeItem("coupleFinanceApp");
  commitState();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

qs("#quick-add").addEventListener("click", openQuickAdd);
initCloud();

