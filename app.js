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
  notifications: []
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
}

function saveState() {
  localStorage.setItem("coupleFinanceApp", JSON.stringify(state));
  if (cloudReady && householdId) scheduleCloudSave();
}

async function commitState() {
  localStorage.setItem("coupleFinanceApp", JSON.stringify(state));
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
    accounts: "Carteira",
    method: "Método 50/30/20",
    goals: "Metas financeiras",
    settings: "Cadastros"
  }[view];
}

function render() {
  ensureStateShape();
  saveState();
  renderGate();
  if (!currentUser || !cloudReady) return;
  renderCloudPanel();
  renderMonthFilter();
  renderDashboard();
  renderEntries();
  renderCards();
  renderAccounts();
  renderMethod();
  renderGoals();
  renderSettings();
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
  const recentEntries = [...state.entries]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6);
  const categoryTotals = byMonth(state.entries)
    .filter((item) => item.type === "Despesa")
    .reduce((acc, item) => ({ ...acc, [item.category]: (acc[item.category] || 0) + Number(item.value || 0) }), {});
  const maxCategory = Math.max(1, ...Object.values(categoryTotals));
  const people = ["Ele", "Ela", "Ambos"].map((name) => {
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
          <strong>${money.format(summary.balance)}</strong>
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
        <button class="action-chip" data-view="accounts"><b>≋</b><span>Carteira</span></button>
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
              <div><strong>${person.name}</strong><span>Receitas ${money.format(person.income)} · Despesas ${money.format(person.expense)}</span></div>
              <b>${money.format(person.balance)}</b>
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
  return `<article class="metric ${tone}"><span>${label}</span><strong>${money.format(value)}</strong></article>`;
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
      <b class="${isIncome ? "income" : "expense"}">${isIncome ? "+" : "-"}${money.format(item.value)}</b>
    </div>
  `;
}

function bar(label, value, max, color) {
  const width = Math.min(100, Math.round((value / max) * 100));
  return `<div class="bar-row"><span>${label}</span><div class="track"><div class="fill" style="--w:${width}%;--c:${color}"></div></div><strong>${money.format(value)}</strong></div>`;
}

function renderEntries() {
  const isIncome = entryMode === "Receita";
  const isCard = entryMode === "Cartão";
  qs("#entries").innerHTML = `
    <form class="entry-form guided-form" id="entry-form">
      <div class="mode-picker span-3" role="tablist" aria-label="Tipo de lançamento">
        <button class="${entryMode === "Receita" ? "active" : ""}" type="button" data-entry-mode="Receita">Entrada</button>
        <button class="${entryMode === "Despesa" ? "active" : ""}" type="button" data-entry-mode="Despesa">Saída</button>
        <button class="${entryMode === "Cartão" ? "active" : ""}" type="button" data-entry-mode="Cartão">Cartão</button>
      </div>
      ${input("value", isCard ? "Valor da compra" : "Valor", "number", "", "0.01")}
      ${input("date", isCard ? "Data da compra" : "Data", "date", new Date().toISOString().slice(0, 10))}
      ${isCard ? select("card", "Qual cartão?", state.cards.map((item) => item.name)) : ""}
      ${isCard ? input("parts", "Parcelas", "number", "1", "1") : ""}
      ${isCard ? select("firstMonth", "Primeiro mês da fatura", months) : ""}
      ${select("category", isIncome ? "De onde veio?" : "Categoria", isIncome ? state.categoriesIncome : state.categoriesExpense)}
      ${input("description", isIncome ? "Descrição da entrada" : isCard ? "Nome da compra" : "Descrição da saída", "text", "")}
      ${select("person", "Quem?", ["Ele", "Ela", "Ambos"])}
      ${!isCard && !isIncome ? select("payment", "Como foi pago?", state.paymentTypes) : ""}
      ${!isCard ? select("account", isIncome ? "Carteira que recebeu" : "Carteira usada", accountOptions()) : ""}
      ${!isCard && !isIncome ? select("status", "Situação", ["Pago", "Pendente"]) : ""}
      <label class="field span-2"><span>Observação opcional</span><input name="notes"></label>
      <button class="primary span-2" type="submit">Salvar lançamento</button>
    </form>
    ${table(["Data", "Tipo", "Categoria", "Descrição", "Valor", "Quem", "Situação", ""], state.entries.map((item) => [
      dateFmt.format(new Date(`${item.date}T00:00:00Z`)),
      pill(item.type === "Receita" ? "Entrada" : "Saída", item.type.toLowerCase()),
      item.category,
      item.description,
      `<td class="amount">${money.format(item.value)}</td>`,
      pill(item.person, item.person.toLowerCase()),
      pill(item.status, item.status.toLowerCase()),
      `<button class="tiny danger" data-delete-entry="${item.id}">Excluir</button>`
    ]))}
  `;
  qs("#entry-form").addEventListener("submit", addEntry);
  document.querySelectorAll("[data-entry-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      entryMode = button.dataset.entryMode;
      renderEntries();
    });
  });
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
    notify("card", `Compra no cartão: ${data.description || data.card} · ${money.format(Number(data.value || 0))}`);
    commitState();
    return;
  }

  state.entries.unshift({
    id: crypto.randomUUID(),
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
  });
  notify("entry", `${entryMode === "Receita" ? "Entrada" : "Saída"} registrada: ${data.description || data.category} · ${money.format(Number(data.value || 0))}`);
  commitState();
}

function accountOptions() {
  return state.accounts.length ? state.accounts.map((item) => item.name) : ["Carteira"];
}

function renderCards() {
  qs("#cards").innerHTML = `
    <form class="entry-form guided-form" id="new-card-form-main">
      ${input("name", "Nome do cartão", "text", "")}
      ${input("limit", "Limite total", "number", "0", "0.01")}
      ${select("color", "Cor", ["Verde", "Azul", "Roxo", "Dourado", "Preto"])}
      <button class="primary" type="submit">Cadastrar cartão</button>
    </form>
    <form class="entry-form" id="card-form">
      ${select("card", "Cartão", cardOptions())}
      ${input("date", "Data da compra", "date", new Date().toISOString().slice(0, 10))}
      ${input("description", "Descrição", "text", "")}
      ${select("category", "Categoria", state.categoriesExpense)}
      ${input("value", "Valor da compra", "number", "", "0.01")}
      ${input("parts", "Parcelas", "number", "1", "1")}
      ${select("firstMonth", "Primeiro mês", months)}
      <button class="primary" type="submit">Adicionar</button>
    </form>
    <div class="grid-3">
      ${state.cards.map((card) => {
        const totals = cardTotals(card.name);
        const available = Number(card.limit || 0) - totals.used;
        const percent = Math.min(100, Math.round((totals.used / Math.max(card.limit, totals.used, 1)) * 100));
        return `<article class="credit-card ${card.color || "Verde"}">
          <div>
            <span>Crédito</span>
            <strong>${card.name}</strong>
          </div>
          <div class="card-chip"></div>
          <div class="card-lines">
            <span>Limite total</span><b>${money.format(card.limit)}</b>
            <span>Disponível</span><b>${money.format(available)}</b>
            <span>Fatura do mês</span><b>${money.format(totals.month)}</b>
          </div>
          <div class="track card-track"><div class="fill" style="--w:${percent}%;--c:rgba(255,255,255,.88)"></div></div>
          <button class="tiny danger" data-delete-card="${card.id}">Excluir cartão</button>
        </article>`;
      }).join("") || emptyHtml()}
    </div>
    ${table(["Compra", "Cartão", "Categoria", "Valor", "Parcelas", "1º mês", ""], state.installments.map((item) => [
      item.description,
      item.card,
      item.category,
      `<td class="amount">${money.format(item.value)}</td>`,
      item.parts,
      item.firstMonth,
      `<button class="tiny danger" data-delete-installment="${item.id}">Excluir</button>`
    ]))}
  `;
  qs("#new-card-form-main").addEventListener("submit", addCard);
  qs("#card-form").addEventListener("submit", addInstallment);
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
  notify("card", `Compra no cartão: ${data.description || data.card} · ${money.format(Number(data.value || 0))}`);
  commitState();
}

function renderAccounts() {
  qs("#accounts").innerHTML = `
    <form class="entry-form" id="account-form">
      ${input("name", "Nome na carteira", "text", "")}
      ${select("type", "Tipo", ["Corrente", "Poupança", "Digital", "Investimento"])}
      ${select("owner", "Titular", ["Ele", "Ela", "Ambos"])}
      ${input("initial", "Saldo inicial", "number", "0", "0.01")}
      <button class="primary" type="submit">Adicionar à carteira</button>
    </form>
    ${table(["Carteira", "Tipo", "Titular", "Entradas", "Saídas", "Saldo atual", ""], state.accounts.map((account) => {
      const paid = state.entries.filter((item) => item.account === account.name && item.status === "Pago");
      const income = total(paid.filter((item) => item.type === "Receita"));
      const expense = total(paid.filter((item) => item.type === "Despesa"));
      return [
        account.name,
        account.type,
        account.owner,
        money.format(income),
        money.format(expense),
        `<td class="amount">${money.format(Number(account.initial || 0) + income - expense)}</td>`,
        `<button class="tiny danger" data-delete-account="${account.id}">Excluir</button>`
      ];
    }))}
  `;
  qs("#account-form").addEventListener("submit", addAccount);
}

function addAccount(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.accounts.push({ id: crypto.randomUUID(), name: data.name, type: data.type, owner: data.owner, initial: Number(data.initial || 0) });
  notify("account", `Carteira adicionada: ${data.name}`);
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
          <strong>${money.format(value)}</strong>
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
    <div class="progress-meta"><span>${money.format(goal.saved)} de ${money.format(goal.target)}</span><strong>${percent}%</strong></div>
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
    <div class="grid-2">
      <form class="entry-form" id="category-form">
        ${select("kind", "Tipo", ["Receita", "Despesa"])}
        ${input("name", "Nova categoria", "text", "")}
        <button class="primary" type="submit">Adicionar</button>
      </form>
      <form class="entry-form" id="new-card-form">
        ${input("name", "Cartão", "text", "")}
        ${input("limit", "Limite", "number", "0", "0.01")}
        <button class="primary" type="submit">Adicionar</button>
      </form>
    </div>
  `;
  qs("#category-form").addEventListener("submit", addCategory);
  qs("#new-card-form").addEventListener("submit", addCard);
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
  notify("card", `Cartão cadastrado: ${data.name} · limite ${money.format(Number(data.limit || 0))}`);
  commitState();
}

function input(name, label, type, value = "", step = "") {
  return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${value}" ${step ? `step="${step}"` : ""} required></label>`;
}

function select(name, label, options) {
  return `<label class="field"><span>${label}</span><select name="${name}">${options.map((option) => `<option>${option}</option>`).join("")}</select></label>`;
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
      state[stateKey] = state[stateKey].filter((item) => item.id !== event.target.dataset[datasetKey]);
      notify("sync", "Item removido");
      commitState();
    }
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

initCloud();
