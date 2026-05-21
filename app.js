const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SUPABASE_URL = "https://allcnnxedveesyyvqavb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_H1Z7eE29GXki-Txjk2yNTA_IhOiKNpC";
const cloud = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const seed = {
  selectedMonth: "junho",
  categoriesIncome: ["💸 Salário", "💵 Renda Extra", "👜 Venda de Produto", "🔧 Serviços Prestados", "💸 13º Salário", "📆 Férias / Rescisão", "💰 Pix Recebido", "↩ Reembolso / Estorno", "📊 Investimentos / Rendimentos"],
  categoriesExpense: ["🍌 Alimentação", "🍔 Restaurantes / Lanches", "🏠 Aluguel / Condomínio", "⚡ Energia", "💧 Água", "📞 Internet / Celular", "🚓 Transporte", "💳 Cartão de Crédito", "🌍 Lazer / Viagens", "💊 Saúde", "👩‍🎓 Educação", "🥼 Roupas / Calçados", "🎁 Presentes", "🔨 Manutenção da Casa", "🧾 Compras Parceladas", "📈 Impostos / Taxas"],
  paymentTypes: ["Dinheiro", "Cartão de Crédito", "Cartão de Débito", "Pix", "Transferência Bancária", "Boleto", "Débito Automático", "Cheque", "Vale-Alimentação", "Vale-Refeição"],
  accounts: [
    { id: crypto.randomUUID(), name: "Caixa", type: "Poupança", owner: "Ele", initial: 0 },
    { id: crypto.randomUUID(), name: "Brasil", type: "Poupança", owner: "Ela", initial: 0 },
    { id: crypto.randomUUID(), name: "Nubank", type: "Digital", owner: "Ele", initial: 0 }
  ],
  cards: [
    { id: crypto.randomUUID(), name: "NEON WILLIAN", limit: 1300 },
    { id: crypto.randomUUID(), name: "NUBANK", limit: 0 }
  ],
  entries: [
    { id: crypto.randomUUID(), date: "2026-05-21", month: "maio", type: "Despesa", category: "⚡ Energia", description: "bolo", value: 15, person: "Ele", payment: "Pix", account: "Nubank", status: "Pago", notes: "" },
    { id: crypto.randomUUID(), date: "2025-09-01", month: "setembro", type: "Receita", category: "📊 Investimentos / Rendimentos", description: "Salário Empresa", value: 0, person: "Ele", payment: "Transferência Bancária", account: "Caixa", status: "Pago", notes: "" }
  ],
  installments: [
    { id: crypto.randomUUID(), date: "2026-05-21", card: "NEON WILLIAN", description: "PIZZA", category: "🍔 Restaurantes / Lanches", value: 122.3, parts: 1, firstMonth: "junho", paidMonths: [] },
    { id: crypto.randomUUID(), date: "2026-05-21", card: "NEON WILLIAN", description: "BOLO", category: "🍔 Restaurantes / Lanches", value: 15, parts: 1, firstMonth: "junho", paidMonths: [] },
    { id: crypto.randomUUID(), date: "2026-05-21", card: "NEON WILLIAN", description: "Compra parcelada", category: "🧾 Compras Parceladas", value: 376.42, parts: 4, firstMonth: "junho", paidMonths: ["agosto"] }
  ],
  methodIncome: 6350,
  goals: [
    { id: crypto.randomUUID(), title: "Carro novo", target: 50000, saved: 0, due: "2027-12-15", status: "Em progresso" }
  ]
};

let state = loadState();
let currentUser = null;
let householdId = localStorage.getItem("coupleFinanceHouseholdId");
let householdInviteCode = localStorage.getItem("coupleFinanceInviteCode");
let cloudReady = false;
let saveTimer = null;
let loadingCloud = false;

const qs = (selector, root = document) => root.querySelector(selector);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" });

function loadState() {
  const saved = localStorage.getItem("coupleFinanceApp");
  return saved ? JSON.parse(saved) : structuredClone(seed);
}

function saveState() {
  localStorage.setItem("coupleFinanceApp", JSON.stringify(state));
  if (cloudReady && householdId) scheduleCloudSave();
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
    accounts: "Contas bancárias",
    method: "Método 50/30/20",
    goals: "Metas financeiras",
    settings: "Cadastros"
  }[view];
}

function render() {
  saveState();
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

function renderCloudPanel(message = "") {
  const panel = qs("#cloud-panel");
  if (!cloud) {
    panel.innerHTML = `<span class="mini-status">Modo local</span>`;
    return;
  }

  if (!currentUser) {
    panel.innerHTML = `
      <form id="login-form" class="cloud-panel">
        <label class="field"><span>E-mail</span><input name="email" type="email" placeholder="voce@email.com" required></label>
        <button class="primary" type="submit">Entrar</button>
        ${message ? `<span class="mini-status">${message}</span>` : ""}
      </form>
    `;
    qs("#login-form").addEventListener("submit", sendLoginLink);
    return;
  }

  if (!cloudReady) {
    panel.innerHTML = `
      <form id="household-form" class="cloud-panel">
        <label class="field"><span>Código do cofre</span><input name="code" placeholder="Ex: CASAL123"></label>
        <button class="ghost" name="action" value="join" type="submit">Entrar</button>
        <button class="primary" name="action" value="create" type="submit">Criar cofre</button>
        <button class="ghost" id="logout" type="button">Sair</button>
        ${message ? `<span class="mini-status">${message}</span>` : ""}
      </form>
    `;
    qs("#household-form").addEventListener("submit", handleHousehold);
    qs("#logout").addEventListener("click", signOut);
    return;
  }

  panel.innerHTML = `
    <span class="mini-status"><i class="dot"></i> Online · Código: <strong>${householdInviteCode}</strong></span>
    <button class="ghost" id="logout" type="button">Sair</button>
  `;
  qs("#logout").addEventListener("click", signOut);
}

async function sendLoginLink(event) {
  event.preventDefault();
  const email = new FormData(event.target).get("email");
  const { error } = await cloud.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.href.split("#")[0] }
  });
  renderCloudPanel(error ? error.message : "Veja seu e-mail");
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

async function handleHousehold(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const form = new FormData(event.target);
  if (submitter.value === "create") {
    await createHousehold();
  } else {
    await joinHousehold(form.get("code"));
  }
}

function makeInviteCode() {
  return `CASAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function createHousehold() {
  loadingCloud = true;
  renderCloudPanel("Criando...");
  const id = crypto.randomUUID();
  const code = makeInviteCode();
  const { error: householdError } = await cloud.from("households").insert({ id, name: "Finanças do Casal", invite_code: code, created_by: currentUser.id });
  if (householdError) return renderCloudPanel(householdError.message);

  const { error: memberError } = await cloud.from("household_members").insert({ household_id: id, user_id: currentUser.id, role: "owner" });
  if (memberError) return renderCloudPanel(memberError.message);

  householdId = id;
  householdInviteCode = code;
  cloudReady = true;
  localStorage.setItem("coupleFinanceHouseholdId", householdId);
  localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  await saveCloudState();
  loadingCloud = false;
  render();
}

async function joinHousehold(code) {
  if (!code) return renderCloudPanel("Informe o código");
  loadingCloud = true;
  renderCloudPanel("Entrando...");
  const { data, error } = await cloud.rpc("join_household_by_code", { join_code: code });
  if (error) return renderCloudPanel(error.message);
  householdId = data;
  householdInviteCode = code.trim().toUpperCase();
  localStorage.setItem("coupleFinanceHouseholdId", householdId);
  localStorage.setItem("coupleFinanceInviteCode", householdInviteCode);
  await loadCloudState();
  loadingCloud = false;
  render();
}

async function loadExistingHousehold() {
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

async function loadCloudState() {
  const { data, error } = await cloud.from("household_states").select("data").eq("household_id", householdId).single();
  if (!error && data?.data && Object.keys(data.data).length) {
    state = data.data;
    localStorage.setItem("coupleFinanceApp", JSON.stringify(state));
  } else {
    cloudReady = true;
    await saveCloudState();
  }
  cloudReady = true;
}

function scheduleCloudSave() {
  if (loadingCloud) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCloudState, 650);
}

async function saveCloudState() {
  if (!cloudReady || !householdId) return;
  await cloud.from("household_states").upsert({
    household_id: householdId,
    data: state,
    updated_at: new Date().toISOString()
  });
}

async function initCloud() {
  if (!cloud) {
    render();
    return;
  }

  const { data } = await cloud.auth.getSession();
  currentUser = data.session?.user || null;
  cloud.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) loadExistingHousehold();
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
    <div class="summary-grid">
      ${metric("Receitas", summary.income, "good")}
      ${metric("Despesas", summary.expense, "bad")}
      ${metric("Fatura do mês", summary.cardMonth, "info")}
      ${metric("Saldo final", summary.balance, summary.balance >= 0 ? "good" : "bad")}
    </div>
    <div class="grid-2">
      <div class="panel">
        <h2>Despesas por categoria</h2>
        <div class="bars">
          ${Object.entries(categoryTotals).length ? Object.entries(categoryTotals).map(([name, value]) => bar(name, value, maxCategory, "#c2483d")).join("") : emptyHtml()}
        </div>
      </div>
      <div class="panel">
        <h2>Ele, Ela e Ambos</h2>
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
    <div class="grid-3">
      ${state.goals.map(goalCard).join("")}
    </div>
  `;
}

function metric(label, value, tone) {
  return `<article class="metric ${tone}"><span>${label}</span><strong>${money.format(value)}</strong></article>`;
}

function bar(label, value, max, color) {
  const width = Math.min(100, Math.round((value / max) * 100));
  return `<div class="bar-row"><span>${label}</span><div class="track"><div class="fill" style="--w:${width}%;--c:${color}"></div></div><strong>${money.format(value)}</strong></div>`;
}

function renderEntries() {
  qs("#entries").innerHTML = `
    <form class="entry-form" id="entry-form">
      ${input("date", "Data", "date", new Date().toISOString().slice(0, 10))}
      ${select("type", "Tipo", ["Receita", "Despesa"])}
      ${select("category", "Categoria", state.categoriesExpense)}
      ${input("description", "Descrição", "text", "")}
      ${input("value", "Valor", "number", "", "0.01")}
      ${select("person", "Pessoa", ["Ele", "Ela", "Ambos"])}
      ${select("payment", "Pagamento", state.paymentTypes)}
      ${select("account", "Conta", state.accounts.map((item) => item.name))}
      ${select("status", "Status", ["Pago", "Pendente"])}
      <label class="field span-2"><span>Observações</span><input name="notes"></label>
      <button class="primary" type="submit">Adicionar</button>
    </form>
    ${table(["Data", "Tipo", "Categoria", "Descrição", "Valor", "Pessoa", "Status", ""], state.entries.map((item) => [
      dateFmt.format(new Date(`${item.date}T00:00:00Z`)),
      pill(item.type, item.type.toLowerCase()),
      item.category,
      item.description,
      `<td class="amount">${money.format(item.value)}</td>`,
      pill(item.person, item.person.toLowerCase()),
      pill(item.status, item.status.toLowerCase()),
      `<button class="tiny danger" data-delete-entry="${item.id}">Excluir</button>`
    ]))}
  `;
  qs("#entry-form").addEventListener("submit", addEntry);
  qs("#entry-form [name=type]").addEventListener("change", (event) => {
    qs("#entry-form [name=category]").innerHTML = categoryOptions(event.target.value);
  });
}

function addEntry(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.entries.unshift({
    id: crypto.randomUUID(),
    date: data.date,
    month: months[new Date(`${data.date}T00:00:00Z`).getUTCMonth()],
    type: data.type,
    category: data.category,
    description: data.description,
    value: Number(data.value || 0),
    person: data.person,
    payment: data.payment,
    account: data.account,
    status: data.status,
    notes: data.notes
  });
  render();
}

function renderCards() {
  qs("#cards").innerHTML = `
    <form class="entry-form" id="card-form">
      ${select("card", "Cartão", state.cards.map((item) => item.name))}
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
        return `<article class="panel">
          <h2>${card.name}</h2>
          ${metric("Limite", card.limit, "info")}
          ${bar("Usado", totals.used, Math.max(card.limit, totals.used, 1), "#245f9f")}
          ${bar("Disponível", available, Math.max(card.limit, totals.used, 1), available >= 0 ? "#1f7a5b" : "#c2483d")}
        </article>`;
      }).join("")}
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
  qs("#card-form").addEventListener("submit", addInstallment);
}

function addInstallment(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
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
  render();
}

function renderAccounts() {
  qs("#accounts").innerHTML = `
    <form class="entry-form" id="account-form">
      ${input("name", "Banco / conta", "text", "")}
      ${select("type", "Tipo", ["Corrente", "Poupança", "Digital", "Investimento"])}
      ${select("owner", "Titular", ["Ele", "Ela", "Ambos"])}
      ${input("initial", "Saldo inicial", "number", "0", "0.01")}
      <button class="primary" type="submit">Adicionar</button>
    </form>
    ${table(["Banco / conta", "Tipo", "Titular", "Entradas", "Saídas", "Saldo atual", ""], state.accounts.map((account) => {
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
  render();
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
    render();
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
  render();
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
  render();
}

function addCard(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.cards.push({ id: crypto.randomUUID(), name: data.name, limit: Number(data.limit || 0) });
  render();
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
    ["deleteGoal", "goals", "goal"]
  ];
  for (const [datasetKey, stateKey] of deleteMap) {
    if (event.target.dataset[datasetKey]) {
      state[stateKey] = state[stateKey].filter((item) => item.id !== event.target.dataset[datasetKey]);
      render();
    }
  }
});

qs("#month-filter").addEventListener("change", (event) => {
  state.selectedMonth = event.target.value;
  render();
});

qs("#reset-data").addEventListener("click", () => {
  state = structuredClone(seed);
  localStorage.removeItem("coupleFinanceApp");
  render();
});

if ("serviceWorker" in navigator && location.protocol !== "file:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

initCloud();
