const app = {
  token: localStorage.getItem('finvaultToken') || '',
  state: null,
  view: 'dashboard',
  clientResults: [],
  filters: {},
  selectedRoom: '',
  selectedWalletId: '',
};

const networkOptions = {
  USDT: ['TRC20', 'ERC20', 'BEP20'],
  BTC: ['Bitcoin'],
  ETH: ['ERC20'],
  SOL: ['Solana'],
  XRP: ['Ripple'],
};

const viewTitles = {
  dashboard: ['Dashboard', 'Fast work for agents, control for finance'],
  screen: ['Agent Screen', 'Live ranking by daily, monthly, WD and target'],
  queue: ['Approval Queue', 'Reserved wallets waiting for supervisor decision'],
  clients: ['CID Search', 'Search by CID, client name or wallet address'],
  wallets: ['Wallet Pool', 'Free, reserved, busy, frozen and archived wallets'],
  history: ['Journal / History', 'Excel-compatible monthly journal'],
  audit: ['Audit Log', 'Every important action is recorded'],
  admin: ['Admin', 'Users, teams, targets, IP whitelist and backups'],
};

const navByRole = {
  agent: [
    ['dashboard', 'layout-dashboard', 'My Work'],
    ['clients', 'search', 'CID Search'],
  ],
  supervisor: [
    ['dashboard', 'layout-dashboard', 'Dashboard'],
    ['screen', 'trophy', 'Agent Screen'],
    ['queue', 'inbox', 'Queue'],
    ['clients', 'search', 'CID Search'],
    ['history', 'scroll-text', 'History'],
  ],
  finance: [
    ['dashboard', 'layout-dashboard', 'Dashboard'],
    ['screen', 'trophy', 'Agent Screen'],
    ['queue', 'inbox', 'Queue'],
    ['clients', 'search', 'CID Search'],
    ['wallets', 'wallet-cards', 'Wallet Pool'],
    ['history', 'scroll-text', 'History'],
    ['audit', 'shield-check', 'Audit Log'],
    ['admin', 'settings', 'Admin'],
  ],
  admin: [
    ['dashboard', 'layout-dashboard', 'Dashboard'],
    ['screen', 'trophy', 'Agent Screen'],
    ['queue', 'inbox', 'Queue'],
    ['clients', 'search', 'CID Search'],
    ['wallets', 'wallet-cards', 'Wallet Pool'],
    ['history', 'scroll-text', 'History'],
    ['audit', 'shield-check', 'Audit Log'],
    ['admin', 'settings', 'Admin'],
  ],
};

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function signedMoney(value) {
  const amount = Number(value || 0);
  const abs = money(Math.abs(amount));
  if (amount > 0) return `+${abs}`;
  if (amount < 0) return `-${abs}`;
  return abs;
}

function deltaClass(value) {
  const amount = Number(value || 0);
  if (amount > 0.004) return 'positive';
  if (amount < -0.004) return 'negative';
  return 'neutral';
}

function renderUsdDelta(value) {
  return `<span class="usd-delta ${deltaClass(value)}">${escapeHtml(signedMoney(value))}</span>`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function shortDate(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}.${match[2]}.${match[1].slice(-2)}`;
  return text;
}

function shortDateTime(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  const time = text.match(/[T ](\d{2}:\d{2})/);
  return time ? `${shortDate(text)} ${time[1]}` : shortDate(text);
}

function shortMonth(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})/);
  return match ? `${match[2]}.${match[1].slice(-2)}` : shortDate(value);
}

function walletSuffix(address) {
  const text = String(address || '');
  return text ? text.slice(-5) : '-';
}

function shortTxHash(value) {
  const text = String(value || '');
  if (!text) return '-';
  return text.length > 22 ? `${text.slice(0, 10)}...${text.slice(-6)}` : text;
}

function assetDisplayLabel(crypto, network) {
  if (!crypto) return '-';
  if (crypto === 'USDT') return network ? `${crypto}-${network}` : crypto;
  if (crypto === 'ETH') return network ? `${crypto}-${network}` : crypto;
  return crypto;
}

function legacyAssetLabel(item) {
  return [item?.crypto || '', item?.network || ''].filter(Boolean).join('-') || '-';
}

function assetLabel(item) {
  return assetDisplayLabel(item?.crypto || '', item?.network || '');
}

function assetOptions() {
  const source = app.state?.assets?.length
    ? app.state.assets
    : Object.entries(networkOptions).flatMap(([crypto, networks]) =>
      networks.map(network => ({ crypto, network }))
    );
  return source.map(asset => ({ ...asset, label: assetDisplayLabel(asset.crypto, asset.network) }));
}

function renderAssetOptions(selected = '') {
  return assetOptions().map(asset => {
    const label = asset.label || assetLabel(asset);
    return `<option value="${escapeHtml(label)}" ${selected === label ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function splitAssetValue(value) {
  const clean = String(value || '').trim().toUpperCase();
  const asset = assetOptions().find(item => {
    const labels = [item.label, assetLabel(item), legacyAssetLabel(item)].map(label => String(label || '').toUpperCase());
    return labels.includes(clean);
  });
  if (asset) return { crypto: asset.crypto, network: asset.network };
  const [crypto, ...networkParts] = String(value || '').split('-');
  return { crypto: crypto || '', network: networkParts.join('-') };
}

function syncAssetInputs(form) {
  const assetInput = $('[name="asset"]', form);
  if (!assetInput) return;
  const { crypto, network } = splitAssetValue(assetInput.value);
  $('[name="crypto"]', form).value = crypto;
  $('[name="network"]', form).value = network;
}

function priceUsd(crypto) {
  if (crypto === 'USDT') return 1;
  return Number(app.state?.priceCache?.[crypto]?.usd || 0);
}

function priceStamp(crypto) {
  return app.state?.priceCache?.[crypto]?.updatedAt || '';
}

function cryptoAmount(value, crypto = '') {
  const digits = crypto === 'USDT' ? 2 : 6;
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function walletTransactions(walletId) {
  return (app.state?.walletTransactions || []).filter(item => item.walletId === walletId);
}

function transactionLiveUsd(tx, fallbackCrypto = '') {
  return Number(tx.amountCrypto || 0) * priceUsd(tx.crypto || fallbackCrypto);
}

function transactionDifferenceUsd(tx, fallbackCrypto = '') {
  return transactionLiveUsd(tx, fallbackCrypto) - Number(tx.originalUsd || 0);
}

function walletTotals(wallet) {
  const transactions = walletTransactions(wallet.id);
  const totalCrypto = transactions.reduce((sum, tx) => sum + Number(tx.amountCrypto || 0), 0);
  const originalUsd = transactions.reduce((sum, tx) => sum + Number(tx.originalUsd || 0), 0);
  const currentUsd = transactions.reduce((sum, tx) => sum + transactionLiveUsd(tx, wallet.crypto), 0);
  const differenceUsd = currentUsd - originalUsd;
  return { transactions, totalCrypto, originalUsd, currentUsd, differenceUsd };
}

function walletRoom(wallet) {
  const request = (app.state?.requests || [])
    .slice()
    .reverse()
    .find(item => item.walletId === wallet.id);
  const assignment = (app.state?.assignments || [])
    .slice()
    .reverse()
    .find(item => item.walletId === wallet.id);
  return request?.room || assignment?.room || '-';
}

function frozenRoomRows() {
  const grouped = new Map();
  (app.state?.wallets || []).filter(wallet => wallet.status === 'frozen').forEach(wallet => {
    const room = walletRoom(wallet);
    const totals = walletTotals(wallet);
    const row = grouped.get(room) || { room, wallets: 0, originalUsd: 0, currentUsd: 0, differenceUsd: 0, assets: new Map() };
    row.wallets += 1;
    row.originalUsd += totals.originalUsd;
    row.currentUsd += totals.currentUsd;
    row.differenceUsd += totals.differenceUsd;
    const asset = assetLabel(wallet);
    const assetRow = row.assets.get(asset) || { crypto: wallet.crypto, totalCrypto: 0 };
    assetRow.totalCrypto += totals.totalCrypto;
    row.assets.set(asset, assetRow);
    grouped.set(room, row);
  });
  return Array.from(grouped.values()).sort((a, b) => a.room.localeCompare(b.room));
}

function icon(name) {
  return `<i data-lucide="${name}"></i>`;
}

function statusPill(status) {
  return `<span class="status ${escapeHtml(status)}">${escapeHtml(status)}</span>`;
}

function currentUser() {
  return app.state?.me;
}

function canApprove() {
  return ['supervisor', 'finance', 'admin'].includes(currentUser()?.role);
}

function canManageWallets() {
  return ['finance', 'admin'].includes(currentUser()?.role);
}

function canManagePeople() {
  return ['finance', 'admin'].includes(currentUser()?.role);
}

function canManageSecurity() {
  return currentUser()?.role === 'admin';
}

function userName(id) {
  const user = (app.state?.users || []).find(item => item.id === id);
  return user ? user.fullName : id || '-';
}

function walletById(id) {
  return (app.state?.wallets || []).find(item => item.id === id)
    || (app.state?.allWallets || []).find(item => item.id === id);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(app.token ? { 'X-Finvault-Token': app.token } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({ ok: false, error: 'Invalid server response.' }));
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || data.message || `Request failed: ${response.status}`);
  }
  return data;
}

function toast(title, message = '') {
  const stack = $('#toast-stack');
  if (!stack) return;
  const node = document.createElement('div');
  node.className = 'toast';
  node.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(message)}</span>`;
  stack.appendChild(node);
  setTimeout(() => node.remove(), 4500);
}

function createIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showLogin() {
  $('#login-screen').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
}

function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
}

async function loadState() {
  const result = await api('/api/state');
  app.state = result.state;
  normalizeViewForRole();
  renderShell();
  renderView();
}

function normalizeViewForRole() {
  const allowed = navByRole[currentUser()?.role] || [];
  if (!allowed.some(item => item[0] === app.view)) {
    app.view = 'dashboard';
  }
}

function renderShell() {
  const me = currentUser();
  $('#current-role').textContent = roleLabel(me.role);
  $('#current-user').textContent = me.fullName;
  $('#current-team').textContent = `Team: ${me.team || '-'}`;
  const nav = $('#nav');
  nav.innerHTML = (navByRole[me.role] || []).map(([view, iconName, label]) => `
    <button class="${app.view === view ? 'active' : ''}" data-nav="${view}">
      ${icon(iconName)}
      ${escapeHtml(label)}
    </button>
  `).join('');

  $all('[data-nav]').forEach(button => {
    button.addEventListener('click', () => {
      app.view = button.dataset.nav;
      renderShell();
      renderView();
    });
  });

  const [title, subtitle] = viewTitles[app.view] || viewTitles.dashboard;
  $('#page-title').textContent = title;
  $('#page-subtitle').textContent = subtitle;
  createIcons();
}

function roleLabel(role) {
  return {
    agent: 'Agent',
    supervisor: 'Supervisor',
    finance: 'Finance Manager',
    admin: 'Admin',
  }[role] || role;
}

function renderView() {
  const view = $('#view');
  const renderers = {
    dashboard: renderDashboard,
    screen: renderAgentScreen,
    queue: renderQueue,
    clients: renderClients,
    wallets: renderWallets,
    history: renderHistory,
    audit: renderAudit,
    admin: renderAdmin,
  };
  view.innerHTML = (renderers[app.view] || renderDashboard)();
  bindViewEvents();
  createIcons();
}

function renderDashboard() {
  const me = currentUser();
  const requests = app.state.requests || [];
  const assignments = app.state.assignments || [];
  const pending = requests.filter(item => item.status === 'pending');
  const today = todayIso();
  const todayDeposits = requests
    .filter(item => item.date === today && ['approved', 'instant'].includes(item.status))
    .reduce((sum, item) => sum + Number(item.depositUsd || 0), 0);
  const freeWallets = (app.state.wallets || []).filter(item => item.status === 'free').length;

  if (me.role === 'agent') {
    return `
      <div class="notice-row">
        <div class="notice info"><strong>Simple agent flow</strong><span>Open request popup, check CID, submit.</span></div>
        <div class="notice warning"><strong>Own data only</strong><span>You see your requests and safe CID lookup results.</span></div>
        <div class="notice info"><strong>Copy address</strong><span>Full wallet address is visible after instant return or approval.</span></div>
      </div>
      <div class="metric-grid">
        ${metric('My requests', requests.length, 'list-checks')}
        ${metric('Pending', pending.length, 'timer')}
        ${metric('Approved', requests.filter(item => item.status === 'approved').length, 'check')}
        ${metric('Instant returns', requests.filter(item => item.status === 'instant').length, 'zap')}
      </div>
      ${panel('My Recent Requests', renderRequestTable(requests.slice().reverse().slice(0, 8), true))}
    `;
  }

  const alerts = app.state.alerts || [];
  return `
    ${alerts.length ? `<div class="notice-row">${alerts.slice(-3).map(alert => `
      <div class="notice ${alert.level}">
        <strong>${escapeHtml(alert.title)}</strong>
        <span>${escapeHtml(alert.message)}</span>
      </div>
    `).join('')}</div>` : ''}
    <div class="metric-grid">
      ${metric('Total requests', requests.length, 'list-checks')}
      ${metric('Today deposits', money(todayDeposits), 'calendar-days')}
      ${metric('Pending approval', pending.length, 'timer')}
      ${metric('Free wallets', freeWallets, 'wallet')}
    </div>
    <div class="split">
      ${panel('Recent Activity', renderRequestTable(requests.slice().reverse().slice(0, 8), false))}
      ${panel('Agent Ranking', renderRanking(assignments), `<button class="btn" data-go-view="screen">${icon('trophy')}Open Screen</button>`)}
    </div>
  `;
}

function metric(label, value, iconName) {
  return `<div class="metric"><span>${icon(iconName)}${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function panel(title, body, actions = '') {
  return `<section class="panel"><header class="panel-header"><h3>${escapeHtml(title)}</h3>${actions}</header>${body}</section>`;
}

function renderRanking(assignments) {
  const rows = buildAgentScreenRows().slice(0, 5);
  if (!rows.length) return '<div class="empty">No approved assignments yet.</div>';
  const max = Math.max(...rows.map(row => row.monthlyNet), 1);
  return `<div class="panel-body">${rows.map(row => `
    <div class="profile-line">
      <span>#${row.rank} ${escapeHtml(row.agent.fullName)} · ${row.count} assignment(s)</span>
      <strong>${money(row.monthlyNet)}</strong>
    </div>
    <div style="height:8px;background:#eef2f5;border-radius:999px;margin:0 0 13px;overflow:hidden">
      <div style="height:100%;width:${Math.round((row.monthlyNet / max) * 100)}%;background:#285b8f"></div>
    </div>
  `).join('')}</div>`;
}

function allowedRoomsForScreen() {
  const me = currentUser();
  const teams = app.state.teams || [];
  if (me.role === 'supervisor') {
    return teams.filter(team => team.managerId === me.id || team.name === me.team);
  }
  return teams.filter(team => ['M', 'T', 'T2'].includes(team.name));
}

function getRoomManager(team) {
  if (!team) return null;
  return (app.state.users || []).find(user => user.id === team.managerId)
    || (app.state.users || []).find(user => user.role === 'supervisor' && user.team === team.name)
    || null;
}

function buildAgentScreenRows(roomName = '') {
  const today = todayIso();
  const month = app.state?.settings?.currentJournalMonth || today.slice(0, 7);
  const requests = (app.state.requests || []).filter(item => ['approved', 'instant'].includes(item.status));
  const agents = (app.state.users || []).filter(user => user.role === 'agent' && user.active && (!roomName || user.team === roomName));
  const rows = agents.map(agent => {
    const own = requests.filter(item => item.agentId === agent.id);
    const ownToday = own.filter(item => item.date === today);
    const ownMonth = own.filter(item => String(item.date || '').startsWith(month));
    const dailyDeposit = ownToday
      .filter(item => item.type !== 'Withdraw')
      .reduce((sum, item) => sum + Number(item.depositUsd || 0), 0);
    const monthlyDeposit = ownMonth
      .filter(item => item.type !== 'Withdraw')
      .reduce((sum, item) => sum + Number(item.depositUsd || 0), 0);
    const monthlyWithdraw = ownMonth
      .filter(item => item.type === 'Withdraw')
      .reduce((sum, item) => sum + Number(item.depositUsd || 0), 0);
    const monthlyNet = monthlyDeposit - monthlyWithdraw;
    const target = Number(agent.monthlyTarget || 0);
    const targetPercent = target > 0 ? Math.round((monthlyNet / target) * 100) : 0;
    return {
      agent,
      dailyDeposit,
      monthlyDeposit,
      monthlyWithdraw,
      monthlyNet,
      target,
      targetPercent,
      count: ownMonth.length,
    };
  }).sort((a, b) => b.monthlyNet - a.monthlyNet);
  rows.forEach((row, index) => row.rank = index + 1);
  return rows;
}

function renderAgentScreen() {
  if (currentUser().role === 'agent') {
    return '<div class="panel"><div class="empty">Agent ranking screen is available to supervisor, finance manager and admin.</div></div>';
  }

  const rooms = allowedRoomsForScreen();
  if (!rooms.length) {
    return '<div class="panel"><div class="empty">No rooms available for this user.</div></div>';
  }

  if (!app.selectedRoom || !rooms.some(room => room.name === app.selectedRoom)) {
    app.selectedRoom = rooms[0].name;
  }

  const selectedTeam = rooms.find(room => room.name === app.selectedRoom);
  const manager = getRoomManager(selectedTeam);
  const rows = buildAgentScreenRows(selectedTeam.name);
  const today = todayIso();
  const todayTotal = rows.reduce((sum, row) => sum + row.dailyDeposit, 0);
  const monthlyTotal = rows.reduce((sum, row) => sum + row.monthlyNet, 0);
  const newFtd = (app.state.requests || []).filter(item => {
    const agent = (app.state.users || []).find(user => user.id === item.agentId);
    return item.date === today
      && ['approved', 'instant'].includes(item.status)
      && item.type !== 'Withdraw'
      && agent?.team === selectedTeam.name;
  }).length;

  return `
    <div class="room-tabs">
      ${rooms.map(room => `
        <button class="${room.name === selectedTeam.name ? 'active' : ''}" data-room-tab="${escapeHtml(room.name)}">
          ${icon('monitor')}
          Room ${escapeHtml(room.name)}
        </button>
      `).join('')}
    </div>

    <div class="agent-screen">
      <div class="screen-head">
        <div>
          <span>ROOM ${escapeHtml(selectedTeam.name)} SCREEN</span>
          <h3>${escapeHtml(manager?.fullName || 'No manager')}</h3>
        </div>
        <div class="screen-totals">
          <strong>Today's Total Deposits</strong>
          <b>${money(todayTotal)}</b>
        </div>
        <div class="screen-totals">
          <strong>Monthly Net</strong>
          <b>${money(monthlyTotal)}</b>
        </div>
        <div class="screen-totals">
          <strong>New FTD</strong>
          <b>${newFtd}</b>
        </div>
      </div>

      <div class="room-summary">
        <div><span>Manager</span><strong>${escapeHtml(manager?.fullName || '-')}</strong></div>
        <div><span>Room</span><strong>${escapeHtml(selectedTeam.name)}</strong></div>
        <div><span>Agents</span><strong>${rows.length}</strong></div>
        <div><span>Journal</span><strong>${escapeHtml(shortMonth(app.state.settings.currentJournalMonth))}</strong></div>
      </div>

      <div class="screen-table-wrap">
        <table class="screen-table">
          <thead>
            <tr>
              <th style="width:76px">Rank</th>
              <th>Agent</th>
              <th>Daily</th>
              <th>Monthly</th>
              <th>WD</th>
              <th>Target</th>
              <th>% From Target</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(row => `
              <tr>
                <td><span class="rank-badge">${row.rank}</span></td>
                <td><strong>${escapeHtml(row.agent.fullName)}</strong><span>${escapeHtml(row.agent.team)}</span></td>
                <td>${money(row.dailyDeposit)}</td>
                <td>${money(row.monthlyNet)}</td>
                <td>${money(row.monthlyWithdraw)}</td>
                <td>${money(row.target)}</td>
                <td>
                  <div class="target-cell">
                    <b>${row.targetPercent}%</b>
                    <div><span style="width:${Math.min(Math.max(row.targetPercent, 0), 100)}%"></span></div>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderQueue() {
  const pending = (app.state.requests || []).filter(item => item.status === 'pending');
  if (!canApprove()) {
    return '<div class="panel"><div class="empty">Approval queue is available to supervisor, finance manager and admin.</div></div>';
  }
  if (!pending.length) {
    return '<div class="panel"><div class="empty">No pending requests. Clean queue, clean mind.</div></div>';
  }
  return `<div class="queue-list">${pending.map(request => {
    const wallet = (app.state.wallets || []).find(item => item.id === request.walletId);
    return `
      <div class="queue-item">
        <div>
          <div class="queue-title">
            <strong>${escapeHtml(request.id)}</strong>
            ${statusPill(request.status)}
            <span class="status reserved">reserved</span>
            <span>${escapeHtml(request.clientName)}</span>
          </div>
          <div class="meta">
            <span>CID ${escapeHtml(request.cid)}</span>
            <span>${escapeHtml(userName(request.agentId))}</span>
            <span>${escapeHtml(assetLabel(request))}</span>
            <span>${escapeHtml(request.exchange)}</span>
            <span>${money(request.depositUsd)}</span>
            <span>Proposed: ${escapeHtml(wallet?.name || request.walletId)}</span>
          </div>
        </div>
        <div class="queue-actions">
          <button class="btn ghost" data-change-wallet="${escapeHtml(request.id)}">${icon('repeat-2')}Change Wallet</button>
          <button class="btn ghost" data-reject="${escapeHtml(request.id)}">${icon('x')}Reject</button>
          <button class="btn success" data-approve="${escapeHtml(request.id)}">${icon('check')}Approve</button>
        </div>
      </div>
    `;
  }).join('')}</div>`;
}

function renderClients() {
  return `
    <div class="search-row">
      <input id="client-search-input" placeholder="Search by CID, client name or wallet address">
      <button id="client-search-btn" class="btn primary">${icon('search')}Search</button>
    </div>
    <div id="client-results">
      ${renderClientResults()}
    </div>
  `;
}

function renderClientResults() {
  if (!app.clientResults.length) {
    return '<div class="panel"><div class="empty">Search a CID to see client wallets, visible history and copy buttons.</div></div>';
  }
  return app.clientResults.map(result => {
    const client = result.client;
    return `
      <div class="client-result">
        <div class="client-card">
          <div class="profile-line"><span>CID</span><strong>${escapeHtml(client.cid)}</strong></div>
          <div class="profile-line"><span>Name</span><strong>${escapeHtml(client.name)}</strong></div>
          <div class="profile-line"><span>Brand</span><strong>${escapeHtml(client.brand)}</strong></div>
          <div class="profile-line"><span>Total wallets</span><strong>${result.totalWallets || 0}</strong></div>
          <div class="profile-line"><span>Total deposits</span><strong>${money(result.totalDeposits)}</strong></div>
          <div class="profile-line"><span>Last activity</span><strong>${escapeHtml(shortDate(result.lastActivity))}</strong></div>
        </div>
        ${panel('Wallets', renderWalletTable(result.wallets || [], false))}
      </div>
    `;
  }).join('');
}

function renderLivePrices() {
  const assets = ['USDT', 'BTC', 'ETH', 'SOL', 'XRP'];
  return `<div class="price-strip">
    ${assets.map(asset => `
      <div class="price-tile">
        <span>${escapeHtml(asset)}</span>
        <strong>${money(priceUsd(asset))}</strong>
        <small>${escapeHtml(shortDate(priceStamp(asset)))}</small>
      </div>
    `).join('')}
    <button class="btn" id="refresh-prices-btn">${icon('radar')}Refresh Prices</button>
  </div>`;
}

function renderFrozenRooms() {
  const rows = frozenRoomRows();
  if (!rows.length) {
    return panel('Frozen Wallets by Room', '<div class="empty">No frozen wallets yet.</div>');
  }
  return panel('Frozen Wallets by Room', `
    <table>
      <thead>
        <tr>
          <th>Room</th>
          <th>Frozen wallets</th>
          <th>Assets</th>
          <th>Originally USD</th>
          <th>Live USD</th>
          <th>Difference</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            <td><strong>${escapeHtml(row.room)}</strong></td>
            <td>${row.wallets}</td>
            <td>${Array.from(row.assets.entries()).map(([asset, value]) => `${escapeHtml(asset)}: ${escapeHtml(cryptoAmount(value.totalCrypto, value.crypto))}`).join('<br>')}</td>
            <td>${money(row.originalUsd)}</td>
            <td>${money(row.currentUsd)}</td>
            <td>${renderUsdDelta(row.differenceUsd)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `);
}

function renderWallets() {
  if (!canManageWallets()) {
    return '<div class="panel"><div class="empty">Wallet pool is available to finance manager and admin.</div></div>';
  }
  const wallets = app.state.wallets || [];
  return `
    ${renderLivePrices()}
    ${panel('Wallet Pool', renderWalletTable(wallets, true), `
      <button class="btn primary" id="add-wallet-toggle">${icon('plus')}Add Wallet</button>
    `)}
    ${renderFrozenRooms()}
  `;
}

function renderAddWalletModalSection() {
  return `
    <section class="modal-section">
      <h3>Add Wallet</h3>
      <form id="add-wallet-form">
        <div class="form-grid compact">
          <label>Name<input name="name" placeholder="Optional"></label>
          <label>Address<input name="address" required placeholder="Wallet address"></label>
          <label>Asset<select name="asset" id="wallet-asset" required>${renderAssetOptions()}</select></label>
          <input type="hidden" name="crypto">
          <input type="hidden" name="network">
        </div>
        <div class="modal-footer">
          <button class="btn primary" type="submit">${icon('plus')}Add Wallet</button>
        </div>
      </form>
    </section>
  `;
}

function renderBulkWalletUploadSection() {
  return `
    <section class="modal-section">
      <h3>Bulk Wallet Upload</h3>
      <div class="bulk-upload-grid">
        <div>
          <div class="profile-line"><span>Required columns</span><strong>Name, Address, Asset</strong></div>
          <div class="profile-line"><span>Asset examples</span><strong>${escapeHtml(assetOptions().map(item => item.label || assetLabel(item)).join(', '))}</strong></div>
          <div class="profile-line"><span>Status after upload</span><strong>free</strong></div>
        </div>
        <div>
          <label>Excel or CSV file<input id="bulk-wallet-file" type="file" accept=".xlsx,.xls,.csv"></label>
          <div class="row-actions" style="margin-top:12px">
            <button class="btn" id="download-wallet-template" type="button">${icon('download')}Template</button>
            <button class="btn primary" id="upload-wallet-bulk" type="button">${icon('upload')}Upload Wallets</button>
          </div>
        </div>
      </div>
      <div id="bulk-wallet-result" class="scan-note"></div>
    </section>
  `;
}

function renderWalletDetail(wallet) {
  const totals = walletTotals(wallet);
  const latestScan = (app.state.walletScans || [])
    .filter(scan => scan.walletId === wallet.id)
    .sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt)))[0];
  return `
    <div class="wallet-ledger">
      <div class="wallet-ledger-head">
        <div>
          <span>Name</span>
          <strong>${escapeHtml(wallet.name)}</strong>
        </div>
        <div>
          <span>Suffix</span>
          <strong>${escapeHtml(walletSuffix(wallet.address))}</strong>
        </div>
        <div>
          <span>wallet</span>
          <strong class="copy-address">${escapeHtml(wallet.address)}</strong>
        </div>
        <div>
          <span>Asset</span>
          <strong>${escapeHtml(assetLabel(wallet))}</strong>
        </div>
        <div>
          <span>Last scan</span>
          <strong>${escapeHtml(shortDateTime(latestScan?.scannedAt))}</strong>
        </div>
        <button class="btn primary" data-scan-wallet="${escapeHtml(wallet.id)}">${icon('radar')}Scan Incoming</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>TRX</th>
            <th>Received</th>
            <th>Amount</th>
            <th>Originally in USD</th>
            <th>Live value in USD</th>
            <th>Difference</th>
          </tr>
        </thead>
        <tbody>
          <tr class="ledger-total">
            <td>Total Received</td>
            <td>-</td>
            <td>-</td>
            <td>${escapeHtml(cryptoAmount(totals.totalCrypto, wallet.crypto))}</td>
            <td>${money(totals.originalUsd)}</td>
            <td>${money(totals.currentUsd)}</td>
            <td>${renderUsdDelta(totals.differenceUsd)}</td>
          </tr>
          ${totals.transactions.length ? totals.transactions.slice().sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt))).map((tx, index) => {
            const currentValue = transactionLiveUsd(tx, wallet.crypto);
            return `
              <tr>
                <td>${index + 1}. ${escapeHtml(tx.source || 'tx')}</td>
                <td><span class="tx-hash" title="${escapeHtml(tx.txHash || '-')}">${escapeHtml(shortTxHash(tx.txHash))}</span></td>
                <td>${escapeHtml(shortDate(tx.receivedAt))}</td>
                <td>${escapeHtml(cryptoAmount(tx.amountCrypto, tx.crypto || wallet.crypto))}</td>
                <td>${money(tx.originalUsd)}</td>
                <td>${money(currentValue)}</td>
                <td>${renderUsdDelta(transactionDifferenceUsd(tx, wallet.crypto))}</td>
              </tr>
            `;
          }).join('') : `
            <tr><td colspan="7"><div class="empty">No incoming transactions recorded yet.</div></td></tr>
          `}
        </tbody>
      </table>
      ${latestScan?.message ? `<div class="scan-note">${escapeHtml(latestScan.message)}</div>` : ''}
    </div>
  `;
}

function renderWalletTable(wallets, withActions) {
  if (!wallets.length) return '<div class="empty">No wallets found.</div>';
  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          ${withActions ? '' : '<th>Address</th>'}
          <th>Asset</th>
          <th>Exchange</th>
          <th>CID</th>
          <th>Total Received</th>
          <th>Originally USD</th>
          <th>Live USD</th>
          <th>Difference</th>
          <th>Issued</th>
          <th>First Access</th>
          <th>Status</th>
          ${withActions ? '<th style="width:132px">Action</th>' : '<th style="width:82px">Copy</th>'}
        </tr>
      </thead>
      <tbody>
        ${wallets.map(wallet => {
          const totals = walletTotals(wallet);
          return `
            <tr class="${withActions ? 'clickable-row' : ''}" ${withActions ? `data-wallet-row="${escapeHtml(wallet.id)}"` : ''}>
              <td>${escapeHtml(wallet.name)}</td>
              ${withActions ? '' : `<td class="copy-address" title="${escapeHtml(wallet.address)}">${escapeHtml(wallet.address)}</td>`}
              <td>${escapeHtml(assetLabel(wallet))}</td>
              <td>${escapeHtml(wallet.exchange || '-')}</td>
              <td>${escapeHtml(wallet.cid || '-')}</td>
              <td>${escapeHtml(cryptoAmount(totals.totalCrypto, wallet.crypto))}</td>
              <td>${money(totals.originalUsd)}</td>
              <td>${money(totals.currentUsd)}</td>
              <td>${renderUsdDelta(totals.differenceUsd)}</td>
              <td>${escapeHtml(shortDate(wallet.issuedToClientAt))}</td>
              <td>${escapeHtml(shortDate(wallet.firstAccessAt))}</td>
              <td>${statusPill(wallet.status)}</td>
              <td>
                ${withActions
                  ? `<div class="row-actions compact-actions">
                      <button class="icon-btn" title="Details" data-wallet-details="${escapeHtml(wallet.id)}">${icon('list-search')}</button>
                      <button class="icon-btn" title="Scan Incoming" data-scan-wallet="${escapeHtml(wallet.id)}">${icon('radar')}</button>
                      <button class="icon-btn" title="Archive" data-archive-wallet="${escapeHtml(wallet.id)}">${icon('archive')}</button>
                    </div>`
                  : `<button class="icon-btn" title="Copy" data-copy="${escapeHtml(wallet.address)}">${icon('copy')}</button>`}
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function renderHistory() {
  const rows = filteredRequests(app.state.requests || []);
  return `
    ${renderFilters('history')}
    ${panel(`Journal ${escapeHtml(shortMonth(app.state.settings.currentJournalMonth))}`, renderRequestTable(rows, false), `
      <button class="btn" id="export-csv-btn">${icon('file-spreadsheet')}Legacy CSV</button>
    `)}
  `;
}

function renderAudit() {
  if (!['finance', 'admin'].includes(currentUser().role)) {
    return '<div class="panel"><div class="empty">Audit Log is available to finance manager and admin.</div></div>';
  }
  const rows = filteredAudit(app.state.audit || []);
  return `
    ${renderFilters('audit')}
    ${panel('Audit Log', `
      <table>
        <thead>
          <tr>
            <th style="width:150px">Time</th>
            <th>User</th>
            <th>Role</th>
            <th>Action</th>
            <th>CID</th>
            <th>Wallet</th>
            <th>Request</th>
            <th>Details</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          ${rows.slice().reverse().map(item => `
            <tr>
              <td>${escapeHtml(shortDateTime(item.time))}</td>
              <td>${escapeHtml(item.userName)}</td>
              <td>${escapeHtml(item.role)}</td>
              <td>${escapeHtml(item.action)}</td>
              <td>${escapeHtml(item.cid || '-')}</td>
              <td>${escapeHtml(item.walletId || '-')}</td>
              <td>${escapeHtml(item.requestId || '-')}</td>
              <td>${escapeHtml(item.details)}</td>
              <td>${escapeHtml(item.ip)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `)}
  `;
}

function renderAdmin() {
  if (!canManagePeople()) {
    return '<div class="panel"><div class="empty">Admin page is available to finance manager and admin.</div></div>';
  }
  const settings = app.state.settings;
  const teams = app.state.teams || [];
  const users = app.state.users || [];
  const managers = users.filter(user => ['supervisor', 'finance', 'admin'].includes(user.role) && user.active);
  const roleOptions = role => ['agent', 'supervisor', 'finance', 'admin'].map(item => `<option value="${item}" ${role === item ? 'selected' : ''}>${roleLabel(item)}</option>`).join('');
  const teamOptions = team => [...teams.map(item => item.name), 'Finance', 'Ops'].filter((item, index, arr) => arr.indexOf(item) === index).map(item => `<option value="${escapeHtml(item)}" ${team === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('');
  const activeOptions = active => `<option value="true" ${active ? 'selected' : ''}>Active</option><option value="false" ${!active ? 'selected' : ''}>Inactive</option>`;
  const managerOptions = managerId => managers.map(manager => `<option value="${escapeHtml(manager.id)}" ${manager.id === managerId ? 'selected' : ''}>${escapeHtml(manager.fullName)} · ${roleLabel(manager.role)}</option>`).join('');

  return `
    <div class="metric-grid">
      ${metric('Users', users.length, 'users')}
      ${metric('Active agents', users.filter(user => user.role === 'agent' && user.active).length, 'user-check')}
      ${metric('Rooms', teams.length, 'monitor')}
      ${metric('Active exchanges', (app.state.exchanges || []).filter(item => item.active).length, 'landmark')}
    </div>

    ${panel('Rooms and Managers', `
      <table>
        <thead>
          <tr><th style="width:90px">Room</th><th>Manager</th><th>Agents</th><th>Description</th><th style="width:92px">Action</th></tr>
        </thead>
        <tbody>
          ${(app.state.teams || []).filter(team => ['M', 'T', 'T2'].includes(team.name)).map(team => {
            const agents = (app.state.users || []).filter(user => user.role === 'agent' && user.team === team.name);
            return `
              <tr data-team-row="${escapeHtml(team.id)}">
                <td><strong>Room ${escapeHtml(team.name)}</strong></td>
                <td><select data-field="managerId">${managerOptions(team.managerId)}</select></td>
                <td>${agents.map(agent => escapeHtml(agent.fullName)).join(', ') || '-'}</td>
                <td><input data-field="description" value="${escapeHtml(team.description || '')}"></td>
                <td><button class="btn primary" data-save-team="${escapeHtml(team.id)}">${icon('save')}Save</button></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `)}

    ${panel('Users, Agents and Roles', `
      <div class="panel-body" style="padding-bottom:0">
        <span class="micro-copy">Delete removes access but keeps history and Audit Log intact.</span>
      </div>
      <table class="admin-table">
        <thead>
          <tr>
            <th>Full name</th>
            <th>Username</th>
            <th>Role</th>
            <th>Team</th>
            <th>Target</th>
            <th>Password</th>
            <th>Status</th>
            <th style="width:172px">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(user => `
            <tr data-user-row="${escapeHtml(user.id)}">
              <td><input data-field="fullName" value="${escapeHtml(user.fullName)}"></td>
              <td><input data-field="username" value="${escapeHtml(user.username)}"></td>
              <td><select data-field="role">${roleOptions(user.role)}</select></td>
              <td><select data-field="team">${teamOptions(user.team)}</select></td>
              <td><input data-field="monthlyTarget" type="number" value="${Number(user.monthlyTarget || 0)}"></td>
              <td><input data-field="password" type="password" placeholder="Leave unchanged"></td>
              <td><select data-field="active">${activeOptions(user.active)}</select></td>
              <td>
                <div class="row-actions">
                  <button class="btn primary" data-save-user="${escapeHtml(user.id)}">${icon('save')}Save</button>
                  <button class="btn danger" data-delete-user="${escapeHtml(user.id)}" ${user.id === currentUser().id ? 'disabled' : ''}>${icon('trash-2')}Delete</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `)}

    <div class="split" style="margin-top:18px">
      ${panel('Create User / Agent', `
        <form id="add-user-form" class="panel-body">
          <div class="form-grid" style="grid-template-columns:1fr">
            <label>Full name<input name="fullName" required></label>
            <label>Username<input name="username" required></label>
            <label>Password<input name="password" value="changeme123" required></label>
            <label>Role<select name="role"><option value="agent">Agent</option><option value="supervisor">Supervisor</option><option value="finance">Finance Manager</option><option value="admin">Admin</option></select></label>
            <label>Team<select name="team">${teamOptions('M')}</select></label>
            <label>Monthly target<input name="monthlyTarget" type="number" value="100000"></label>
          </div>
          <div class="modal-footer"><button class="btn primary" type="submit">${icon('user-plus')}Create User</button></div>
        </form>
      `)}

      ${panel('System Settings', `
        <form id="system-settings-form" class="panel-body">
          <div class="form-grid" style="grid-template-columns:1fr">
            <label>Low wallet warning at<input name="lowWalletWarningAt" type="number" min="0" value="${escapeHtml(settings.lowWalletWarningAt)}"></label>
            <label>Backup every minutes<input name="backupEveryMinutes" type="number" min="1" value="${escapeHtml(settings.backupEveryMinutes)}"></label>
            <label>Current journal month<input name="currentJournalMonth" value="${escapeHtml(settings.currentJournalMonth)}"></label>
            <label>Excel compatibility<select name="excelCompatibilityMode"><option value="true" ${settings.excelCompatibilityMode ? 'selected' : ''}>Enabled</option><option value="false" ${!settings.excelCompatibilityMode ? 'selected' : ''}>Disabled</option></select></label>
          </div>
          <div class="modal-footer">
            <span class="micro-copy">Only admin can save system settings.</span>
            <button class="btn primary" type="submit" ${currentUser().role === 'admin' ? '' : 'disabled'}>${icon('save')}Save Settings</button>
          </div>
        </form>
      `)}
    </div>

    <div class="split" style="margin-top:18px">
      ${panel('Brands', `
        <form id="add-brand-form" class="panel-body admin-add-row">
          <input name="name" placeholder="New brand name" required>
          <button class="btn primary" type="submit">${icon('plus')}Add Brand</button>
        </form>
        <table class="admin-table">
          <thead>
            <tr><th>Name</th><th>Status</th><th style="width:92px">Action</th></tr>
          </thead>
          <tbody>
            ${(app.state.brands || []).map(brand => `
              <tr data-brand-row="${escapeHtml(brand.id)}">
                <td><input data-field="name" value="${escapeHtml(brand.name)}"></td>
                <td><select data-field="active">${activeOptions(brand.active)}</select></td>
                <td><button class="btn primary" data-save-brand="${escapeHtml(brand.id)}">${icon('save')}Save</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `)}

      ${panel('Exchanges', `
        <form id="add-exchange-form" class="panel-body admin-add-row">
          <input name="name" placeholder="New exchange name" required>
          <button class="btn primary" type="submit">${icon('plus')}Add Exchange</button>
        </form>
        <table class="admin-table">
          <thead>
            <tr><th>Name</th><th>Status</th><th style="width:92px">Action</th></tr>
          </thead>
          <tbody>
            ${(app.state.exchanges || []).map(exchange => `
              <tr data-exchange-row="${escapeHtml(exchange.id)}">
                <td><input data-field="name" value="${escapeHtml(exchange.name)}"></td>
                <td><select data-field="active">${activeOptions(exchange.active)}</select></td>
                <td><button class="btn primary" data-save-exchange="${escapeHtml(exchange.id)}">${icon('save')}Save</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `)}
    </div>

    <div class="split" style="margin-top:18px">
      ${panel('Security', `
        <form id="security-form" class="panel-body">
          <label>
            IP whitelist
            <select name="ipWhitelistEnabled" ${canManageSecurity() ? '' : 'disabled'}>
              <option value="true" ${settings.ipWhitelistEnabled ? 'selected' : ''}>Enabled</option>
              <option value="false" ${!settings.ipWhitelistEnabled ? 'selected' : ''}>Disabled</option>
            </select>
          </label>
          <label style="margin-top:12px">
            Allowed IPs
            <textarea name="allowedIps" ${canManageSecurity() ? '' : 'disabled'}>${escapeHtml((settings.allowedIps || []).join('\n'))}</textarea>
          </label>
          <div class="modal-footer">
            <span class="micro-copy">${canManageSecurity() ? 'Only admin can save security changes.' : 'Finance can view security; admin changes it.'}</span>
            <button class="btn primary" type="submit" ${canManageSecurity() ? '' : 'disabled'}>${icon('save')}Save Security</button>
          </div>
        </form>
      `)}

      ${panel('Backup and Monthly Journal', `
        <div class="panel-body">
          <div class="profile-line"><span>Backup frequency</span><strong>Every ${escapeHtml(settings.backupEveryMinutes)} minutes</strong></div>
          <div class="profile-line"><span>Current journal</span><strong>${escapeHtml(shortMonth(settings.currentJournalMonth))}</strong></div>
          <div class="profile-line"><span>Excel compatibility</span><strong>${settings.excelCompatibilityMode ? 'Enabled' : 'Disabled'}</strong></div>
          <div class="profile-line"><span>Monthly table</span><strong>Created automatically</strong></div>
          <button id="manual-backup-btn" class="btn primary" style="margin-top:14px">${icon('database-backup')}Create Backup Now</button>
        </div>
      `)}
    </div>
  `;
}

function renderFilters(scope) {
  const filter = app.filters[scope] || {};
  return `
    <div class="filter-grid" data-filter-scope="${scope}">
      <input data-filter="date" placeholder="Date 06.05.26" value="${escapeHtml(filter.date || '')}">
      <input data-filter="agent" placeholder="Agent / user" value="${escapeHtml(filter.agent || '')}">
      <input data-filter="cid" placeholder="CID" value="${escapeHtml(filter.cid || '')}">
      <select data-filter="exchange">
        <option value="">Exchange</option>
        ${(app.state.exchanges || []).map(exchange => `<option ${filter.exchange === exchange.name ? 'selected' : ''}>${escapeHtml(exchange.name)}</option>`).join('')}
      </select>
      <select data-filter="status">
        <option value="">Status</option>
        ${['pending', 'approved', 'rejected', 'instant', 'free', 'busy', 'frozen', 'reserved', 'archived'].map(status => `<option ${filter.status === status ? 'selected' : ''}>${status}</option>`).join('')}
      </select>
      <select data-filter="asset"><option value="">Asset</option>${assetOptions().map(asset => {
        const label = asset.label || assetLabel(asset);
        return `<option value="${escapeHtml(label)}" ${filter.asset === label ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      }).join('')}</select>
      <select data-filter="room"><option value="">Room</option>${(app.state.teams || []).map(team => `<option ${filter.room === team.name ? 'selected' : ''}>${escapeHtml(team.name)}</option>`).join('')}</select>
      <select data-filter="brand"><option value="">Brand</option>${(app.state.brands || []).map(brand => `<option ${filter.brand === brand.name ? 'selected' : ''}>${escapeHtml(brand.name)}</option>`).join('')}</select>
      <input data-filter="amount" placeholder="Amount" value="${escapeHtml(filter.amount || '')}">
    </div>
  `;
}

function filteredRequests(rows) {
  const filter = app.filters.history || {};
  return rows.filter(row => {
    return (matches(row.date, filter.date) || matches(shortDate(row.date), filter.date))
      && matches(userName(row.agentId), filter.agent)
      && matches(row.cid, filter.cid)
      && matches(row.exchange, filter.exchange)
      && matches(row.status, filter.status)
      && matches(assetLabel(row), filter.asset)
      && matches(row.room, filter.room)
      && matches(row.brand, filter.brand)
      && matches(String(row.depositUsd), filter.amount);
  });
}

function filteredAudit(rows) {
  const filter = app.filters.audit || {};
  const assetText = String(filter.asset || '');
  return rows.filter(row => {
    return (matches(row.time, filter.date) || matches(shortDateTime(row.time), filter.date))
      && matches(row.userName, filter.agent)
      && matches(row.cid, filter.cid)
      && matches(row.action, filter.status)
      && matches(row.details, filter.exchange)
      && (!assetText || matches(row.details, assetText) || matches(row.details, assetText.replaceAll('-', ' ')))
      && matches(row.details, filter.room)
      && matches(row.details, filter.brand)
      && matches(row.details, filter.amount);
  });
}

function matches(value, filter) {
  if (!filter) return true;
  return String(value || '').toLowerCase().includes(String(filter).toLowerCase());
}

function renderRequestTable(requests, showCopy) {
  if (!requests.length) return '<div class="empty">No requests found.</div>';
  return `
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Date</th>
          <th>Agent</th>
          <th>CID</th>
          <th>Client</th>
          <th>Brand</th>
          <th>Room</th>
          <th>USD</th>
          <th>Asset</th>
          <th>Exchange</th>
          <th>Status</th>
          ${showCopy ? '<th style="width:82px">Copy</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${requests.map(request => {
          const wallet = (app.state.wallets || []).find(item => item.id === request.walletId);
          return `
            <tr>
              <td>${escapeHtml(request.id)}</td>
              <td>${escapeHtml(shortDate(request.date))}</td>
              <td>${escapeHtml(userName(request.agentId))}</td>
              <td>${escapeHtml(request.cid)}</td>
              <td>${escapeHtml(request.clientName)}</td>
              <td>${escapeHtml(request.brand)}</td>
              <td>${escapeHtml(request.room)}</td>
              <td>${money(request.depositUsd)}</td>
              <td>${escapeHtml(assetLabel(request))}</td>
              <td>${escapeHtml(request.exchange)}</td>
              <td>${statusPill(request.status)}</td>
              ${showCopy ? `<td>${wallet ? `<button class="icon-btn" data-copy="${escapeHtml(wallet.address)}">${icon('copy')}</button>` : '-'}</td>` : ''}
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function bindViewEvents() {
  $all('[data-go-view]').forEach(button => {
    button.addEventListener('click', () => {
      app.view = button.dataset.goView;
      renderShell();
      renderView();
    });
  });

  $all('[data-room-tab]').forEach(button => {
    button.addEventListener('click', () => {
      app.selectedRoom = button.dataset.roomTab;
      renderView();
    });
  });

  $all('[data-save-user]').forEach(button => {
    button.addEventListener('click', async () => saveUser(button.dataset.saveUser));
  });

  $all('[data-delete-user]').forEach(button => {
    button.addEventListener('click', async () => deleteUser(button.dataset.deleteUser));
  });

  $all('[data-save-team]').forEach(button => {
    button.addEventListener('click', async () => saveTeam(button.dataset.saveTeam));
  });

  $all('[data-save-brand]').forEach(button => {
    button.addEventListener('click', async () => saveBrand(button.dataset.saveBrand));
  });

  $all('[data-save-exchange]').forEach(button => {
    button.addEventListener('click', async () => saveExchange(button.dataset.saveExchange));
  });

  $all('[data-approve]').forEach(button => {
    button.addEventListener('click', async () => {
      await api(`/api/requests/${button.dataset.approve}/approve`, { method: 'POST', body: '{}' });
      toast('Request approved', button.dataset.approve);
      await loadState();
    });
  });

  $all('[data-reject]').forEach(button => {
    button.addEventListener('click', () => {
      $('#reject-form [name="requestId"]').value = button.dataset.reject;
      openModal('reject-modal');
    });
  });

  $all('[data-change-wallet]').forEach(button => {
    button.addEventListener('click', async () => {
      await api(`/api/requests/${button.dataset.changeWallet}/change-wallet`, { method: 'POST', body: '{}' });
      toast('Proposed wallet changed', button.dataset.changeWallet);
      await loadState();
    });
  });

  $all('[data-wallet-details]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openWalletDetailModal(button.dataset.walletDetails);
    });
  });

  $all('[data-wallet-row]').forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      openWalletDetailModal(row.dataset.walletRow);
    });
  });

  $all('[data-scan-wallet]').forEach(button => {
    button.addEventListener('click', async () => scanWallet(button.dataset.scanWallet));
  });

  $('#refresh-prices-btn')?.addEventListener('click', refreshPrices);

  $all('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      await navigator.clipboard.writeText(button.dataset.copy);
      toast('Copied', 'Wallet address copied.');
    });
  });

  $all('[data-archive-wallet]').forEach(button => {
    button.addEventListener('click', () => {
      $('#archive-form [name="walletId"]').value = button.dataset.archiveWallet;
      openModal('archive-modal');
    });
  });

  $all('[data-filter-scope]').forEach(container => {
    const scope = container.dataset.filterScope;
    $all('[data-filter]', container).forEach(input => {
      input.addEventListener('input', () => updateFilter(scope, input));
      input.addEventListener('change', () => updateFilter(scope, input));
    });
  });

  $('#client-search-btn')?.addEventListener('click', runClientSearch);
  $('#client-search-input')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') runClientSearch();
  });
  $('#add-wallet-toggle')?.addEventListener('click', openWalletModal);
  $('#add-user-form')?.addEventListener('submit', submitUser);
  $('#add-brand-form')?.addEventListener('submit', submitBrand);
  $('#add-exchange-form')?.addEventListener('submit', submitExchange);
  $('#system-settings-form')?.addEventListener('submit', submitSystemSettings);
  $('#security-form')?.addEventListener('submit', submitSecurity);
  $('#manual-backup-btn')?.addEventListener('click', createBackup);
  $('#export-csv-btn')?.addEventListener('click', exportLegacyCsv);
}

function bindWalletModalEvents() {
  $('#add-wallet-form')?.addEventListener('submit', submitWallet);
  $('#wallet-asset')?.addEventListener('change', event => syncAssetInputs(event.currentTarget.form));
  if ($('#wallet-asset')) syncAssetInputs($('#add-wallet-form'));
  $('#download-wallet-template')?.addEventListener('click', downloadWalletTemplate);
  $('#upload-wallet-bulk')?.addEventListener('click', uploadBulkWallets);
}

function bindWalletDetailEvents() {
  $all('#wallet-modal-body [data-scan-wallet]').forEach(button => {
    button.addEventListener('click', async () => scanWallet(button.dataset.scanWallet));
  });
}

function openWalletModal() {
  const body = $('#wallet-modal-body');
  if (!body) return;
  $('#wallet-modal-title').textContent = 'Add Wallet';
  $('#wallet-modal-subtitle').textContent = 'Add one wallet or upload a prepared wallet file.';
  body.innerHTML = `${renderAddWalletModalSection()}${renderBulkWalletUploadSection()}`;
  bindWalletModalEvents();
  createIcons();
  openModal('wallet-modal');
}

function openWalletDetailModal(walletId) {
  const wallet = (app.state.wallets || []).find(item => item.id === walletId);
  const body = $('#wallet-modal-body');
  if (!wallet || !body) return;
  app.selectedWalletId = wallet.id;
  $('#wallet-modal-title').textContent = `Wallet ${wallet.name}`;
  $('#wallet-modal-subtitle').textContent = `${assetLabel(wallet)} · ${wallet.status} · suffix ${walletSuffix(wallet.address)}`;
  body.innerHTML = renderWalletDetail(wallet);
  bindWalletDetailEvents();
  createIcons();
  openModal('wallet-modal');
}

function updateFilter(scope, input) {
  app.filters[scope] = app.filters[scope] || {};
  app.filters[scope][input.dataset.filter] = input.value;
  renderView();
}

async function runClientSearch() {
  const query = $('#client-search-input').value.trim();
  if (!query) return toast('Enter CID, name or wallet address');
  const data = await api('/api/client-search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  app.clientResults = data.results || [];
  renderView();
}

async function refreshPrices() {
  try {
    await api('/api/prices/refresh', { method: 'POST', body: '{}' });
    toast('Prices refreshed', 'Live USD values updated.');
    await loadState();
  } catch (error) {
    toast('Price refresh failed', error.message);
  }
}

async function scanWallet(walletId) {
  try {
    app.selectedWalletId = walletId;
    const result = await api(`/api/wallets/${encodeURIComponent(walletId)}/scan`, { method: 'POST', body: '{}' });
    toast('Wallet scan complete', result.scan?.message || `${result.added?.length || 0} new transaction(s).`);
    await loadState();
    if (!$('#wallet-modal')?.classList.contains('hidden')) openWalletDetailModal(walletId);
  } catch (error) {
    toast('Wallet scan failed', error.message);
  }
}

async function submitWallet(event) {
  event.preventDefault();
  const form = event.currentTarget;
  syncAssetInputs(form);
  const payload = Object.fromEntries(new FormData(form).entries());
  delete payload.asset;
  try {
    await api('/api/wallets', { method: 'POST', body: JSON.stringify(payload) });
    toast('Wallet added', payload.name || payload.address);
    form.reset();
    syncAssetInputs(form);
    await loadState();
  } catch (error) {
    toast('Wallet not added', error.message);
  }
}

function downloadTextFile(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadWalletTemplate() {
  const exampleAsset = assetOptions()[0]?.label || 'USDT-TRC20';
  const csv = [
    ['Name', 'Address', 'Asset'],
    [`${exampleAsset}-001`, 'Paste wallet address here', exampleAsset],
  ].map(row => row.map(csvCell).join(',')).join('\r\n');
  downloadTextFile('finvault-wallet-upload-template.csv', csv);
}

function normalizeBulkRow(row) {
  const mapped = {};
  Object.entries(row || {}).forEach(([key, value]) => {
    mapped[String(key || '').trim().toLowerCase()] = value;
  });
  return {
    name: mapped.name || '',
    address: mapped.address || mapped.wallet || mapped['wallet address'] || '',
    asset: mapped.asset || '',
    crypto: mapped.crypto || '',
    network: mapped.network || '',
  };
}

function parseCsv(text) {
  const rows = [];
  let current = '';
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      if (row.some(cell => String(cell).trim())) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  row.push(current);
  if (row.some(cell => String(cell).trim())) rows.push(row);
  const headers = (rows.shift() || []).map(item => String(item || '').trim());
  return rows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] || ''])));
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function parseWalletUploadFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'csv') {
    return parseCsv(await readFileAsText(file)).map(normalizeBulkRow);
  }
  if (!window.XLSX) throw new Error('Excel parser is still loading. Try again in a few seconds or upload CSV.');
  const workbook = window.XLSX.read(await readFileAsArrayBuffer(file), { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return window.XLSX.utils.sheet_to_json(sheet, { defval: '' }).map(normalizeBulkRow);
}

async function uploadBulkWallets() {
  const file = $('#bulk-wallet-file')?.files?.[0];
  if (!file) return toast('Choose file first', 'Upload Excel or CSV wallet template.');
  try {
    const wallets = (await parseWalletUploadFile(file)).filter(row => row.address || row.asset || row.crypto || row.network);
    const result = await api('/api/wallets/bulk', {
      method: 'POST',
      body: JSON.stringify({ wallets }),
    });
    $('#bulk-wallet-result').textContent = `${result.added?.length || 0} added. ${(result.errors || []).length} skipped. ${(result.errors || []).slice(0, 5).join(' ')}`;
    toast('Bulk upload complete', `${result.added?.length || 0} wallet(s) added.`);
    await loadState();
  } catch (error) {
    toast('Bulk upload failed', error.message);
  }
}

async function submitUser(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.monthlyTarget = Number(payload.monthlyTarget || 0);
  await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
  toast('User created', payload.username);
  event.currentTarget.reset();
  await loadState();
}

function rowPayload(selector, id) {
  const row = $(`${selector}="${CSS.escape(id)}"]`);
  const payload = {};
  $all('[data-field]', row).forEach(input => {
    if (input.value === '' && input.dataset.field === 'password') return;
    payload[input.dataset.field] = input.value;
  });
  if (payload.active !== undefined) payload.active = payload.active === 'true';
  if (payload.monthlyTarget !== undefined) payload.monthlyTarget = Number(payload.monthlyTarget || 0);
  return payload;
}

async function saveUser(userId) {
  const payload = rowPayload('[data-user-row', userId);
  await api(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  toast('User saved', payload.username || userId);
  await loadState();
}

async function deleteUser(userId) {
  const target = (app.state.users || []).find(user => user.id === userId);
  if (!window.confirm(`Remove access for ${target?.fullName || userId}? History will be preserved.`)) return;
  await api(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    body: '{}',
  });
  toast('User removed', target?.username || userId);
  await loadState();
}

async function saveTeam(teamId) {
  const payload = rowPayload('[data-team-row', teamId);
  await api(`/api/teams/${encodeURIComponent(teamId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  toast('Room saved', teamId);
  await loadState();
}

async function submitBrand(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  await api('/api/brands', { method: 'POST', body: JSON.stringify(payload) });
  toast('Brand added', payload.name);
  event.currentTarget.reset();
  await loadState();
}

async function saveBrand(brandId) {
  const payload = rowPayload('[data-brand-row', brandId);
  await api(`/api/brands/${encodeURIComponent(brandId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  toast('Brand saved', payload.name || brandId);
  await loadState();
}

async function submitExchange(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  await api('/api/exchanges', { method: 'POST', body: JSON.stringify(payload) });
  toast('Exchange added', payload.name);
  event.currentTarget.reset();
  await loadState();
}

async function saveExchange(exchangeId) {
  const payload = rowPayload('[data-exchange-row', exchangeId);
  await api(`/api/exchanges/${encodeURIComponent(exchangeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  toast('Exchange saved', payload.name || exchangeId);
  await loadState();
}

async function submitSystemSettings(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.lowWalletWarningAt = Number(payload.lowWalletWarningAt || 0);
  payload.backupEveryMinutes = Number(payload.backupEveryMinutes || 60);
  payload.excelCompatibilityMode = payload.excelCompatibilityMode === 'true';
  await api('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
  toast('System settings saved');
  await loadState();
}

async function submitSecurity(event) {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
  payload.ipWhitelistEnabled = payload.ipWhitelistEnabled === 'true';
  payload.allowedIps = payload.allowedIps.split(/\r?\n|,/).map(item => item.trim()).filter(Boolean);
  await api('/api/security', { method: 'POST', body: JSON.stringify(payload) });
  toast('Security saved', 'IP whitelist updated.');
  await loadState();
}

async function createBackup() {
  await api('/api/backup', { method: 'POST', body: '{}' });
  toast('Backup created', 'Database backup written to backups folder.');
  await loadState();
}

function openModal(id) {
  $(`#${id}`).classList.remove('hidden');
  createIcons();
}

function closeModal(id) {
  $(`#${id}`).classList.add('hidden');
}

function populateRequestModal() {
  $('#request-date').value = shortDate(todayIso());
  const me = currentUser();
  const agents = (app.state.users || []).filter(user => user.role === 'agent' && user.active);
  const agentField = $('[data-supervisor-field]');
  $('#request-agent').innerHTML = agents.map(agent => `
    <option value="${escapeHtml(agent.id)}" ${agent.id === me.id ? 'selected' : ''}>${escapeHtml(agent.fullName)} · ${escapeHtml(agent.team)}</option>
  `).join('');
  agentField.classList.toggle('hidden', me.role === 'agent');
  $('#request-brand').innerHTML = (app.state.brands || []).filter(item => item.active).map(brand => `<option>${escapeHtml(brand.name)}</option>`).join('');
  $('#request-room').innerHTML = (app.state.teams || []).map(team => `<option>${escapeHtml(team.name)}</option>`).join('');
  $('#request-exchange').innerHTML = (app.state.exchanges || []).filter(item => item.active).map(exchange => `<option>${escapeHtml(exchange.name)}</option>`).join('');
  $('#request-asset').innerHTML = renderAssetOptions();
  syncAssetInputs($('#request-form'));
}

async function submitRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  syncAssetInputs(form);
  const payload = Object.fromEntries(new FormData(form).entries());
  delete payload.asset;
  payload.keepInWallet = payload.keepInWallet === 'true';
  payload.depositUsd = Number(payload.depositUsd || 0);
  if (currentUser().role === 'agent') payload.agentId = currentUser().id;
  const result = await api('/api/requests', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (result.code === 'NO_WALLET') {
    toast('No wallet available', result.message);
    return;
  }
  if (result.status === 'instant') {
    toast('Existing wallet returned', result.wallet?.address || '');
  } else {
    toast('Request submitted', `${result.request.id} · wallet reserved for approval`);
  }
  form.reset();
  closeModal('request-modal');
  await loadState();
}

async function checkCid() {
  syncAssetInputs($('#request-form'));
  const cid = $('#request-form [name="cid"]').value.trim();
  if (!cid) return toast('Enter CID first');
  const result = await api('/api/client-search', {
    method: 'POST',
    body: JSON.stringify({ query: cid }),
  });
  if (!result.results?.length) {
    toast('CID not found', 'New wallet request will need approval.');
    return;
  }
  const wallets = result.results.flatMap(item => item.wallets || []);
  if (!wallets.length) {
    toast('Client found', 'No wallets assigned for this CID yet.');
    return;
  }
  toast('Existing client wallet(s)', `${wallets.length} wallet(s) found. Exact combo returns instantly.`);
}

async function submitReject(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  const reason = [data.reasonPreset, data.reasonComment].filter(Boolean).join(': ');
  await api(`/api/requests/${data.requestId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  closeModal('reject-modal');
  toast('Request rejected', data.requestId);
  await loadState();
}

async function submitArchive(event) {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  try {
    await api(`/api/wallets/${data.walletId}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason: data.reason }),
    });
    closeModal('archive-modal');
    toast('Wallet archived', 'Full memory saved in Audit Log.');
    await loadState();
  } catch (error) {
    toast('Wallet not archived', error.message);
  }
}

function exportLegacyCsv() {
  const columns = [
    'ID', 'Agent', 'CID', "Client's name", 'Date', 'Brand', 'Room',
    'Deposit (USD)', 'Net Deposit', 'Asset', 'Exchange',
    'Original Amount', 'Wallet / Bank', 'Rate', 'Source',
    'Deposit \\ Withdraw \\ Refund', 'Wallet Name', 'Attach To', '18% Fee'
  ];
  const rows = filteredRequests(app.state.requests || []).map(request => {
    const wallet = (app.state.wallets || []).find(item => item.id === request.walletId) || {};
    return [
      request.id,
      userName(request.agentId),
      request.cid,
      request.clientName,
      shortDate(request.date),
      request.brand,
      request.room,
      request.depositUsd,
      '',
      assetLabel(request),
      request.exchange,
      request.originalAmount,
      wallet.name || '',
      '',
      '',
      request.type,
      wallet.name || '',
      '',
      '',
    ];
  });
  const csv = [columns, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
  downloadTextFile(`FinVault-${app.state.settings.currentJournalMonth}-legacy.csv`, csv);
}

function csvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

function bootEvents() {
  $('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const username = $('#login-username').value;
      const password = $('#login-password').value;
      const data = await api('/api/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      app.token = data.token;
      app.state = data.state;
      localStorage.setItem('finvaultToken', app.token);
      showApp();
      normalizeViewForRole();
      renderShell();
      renderView();
    } catch (error) {
      alert(error.message);
    }
  });

  $all('[data-demo-login]').forEach(button => {
    button.addEventListener('click', () => {
      const [username, password] = button.dataset.demoLogin.split('|');
      $('#login-username').value = username;
      $('#login-password').value = password;
    });
  });

  $('#logout-btn').addEventListener('click', () => {
    app.token = '';
    app.state = null;
    localStorage.removeItem('finvaultToken');
    showLogin();
  });

  $('#refresh-btn').addEventListener('click', loadState);
  $('#open-request-top').addEventListener('click', () => {
    populateRequestModal();
    openModal('request-modal');
  });
  $all('[data-close-modal]').forEach(button => {
    button.addEventListener('click', () => closeModal(button.dataset.closeModal));
  });
  $all('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', event => {
      if (event.target === backdrop) closeModal(backdrop.id);
    });
  });
  $('#request-asset').addEventListener('change', event => syncAssetInputs(event.currentTarget.form));
  $('#request-form').addEventListener('submit', submitRequest);
  $('#check-cid-btn').addEventListener('click', checkCid);
  $('#reject-form').addEventListener('submit', submitReject);
  $('#archive-form').addEventListener('submit', submitArchive);
}

async function boot() {
  bootEvents();
  createIcons();
  if (!app.token) {
    showLogin();
    return;
  }
  try {
    await loadState();
    showApp();
  } catch {
    localStorage.removeItem('finvaultToken');
    showLogin();
  }
}

boot();
