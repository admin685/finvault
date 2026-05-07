const app = {
  token: localStorage.getItem('finvaultToken') || '',
  state: null,
  view: 'dashboard',
  clientResults: [],
  filters: {},
  selectedRoom: '',
  selectedWalletId: '',
  adminTab: 'overview',
  withdrawDetectTimer: null,
  withdrawConfirmedAddress: '',
  withdrawConfirmedAsset: '',
  pendingWithdrawDetection: null,
  priceRefreshTimer: null,
  priceRefreshInFlight: false,
  walletScanTimer: null,
  walletScanInFlight: false,
  approvalWatchTimer: null,
  dismissedApprovalAlertIds: new Set(),
};

const networkOptions = {
  USDT: ['TRC20', 'ERC20', 'BEP20'],
  BTC: ['Bitcoin'],
  ETH: ['ERC20'],
  SOL: ['Solana'],
  XRP: ['Ripple'],
};

const poolWalletStatuses = ['free', 'reserved'];
const issuedWalletStatuses = ['busy', 'frozen'];

const viewTitles = {
  dashboard: ['Dashboard', 'Fast work for agents, control for finance'],
  screen: ['Agent Screen', 'Live ranking by daily, monthly, WD and target'],
  queue: ['Approval Queue', 'Reserved wallets waiting for supervisor decision'],
  clients: ['CID Search', 'Search by CID, client name or wallet address'],
  wallets: ['Wallet Pool', 'Free and reserved wallets ready to issue'],
  monitoring: ['Issued Wallet Monitoring', 'Issued wallets only, with incoming transaction scanning'],
  frozenFunds: ['Frozen Funds', 'Frozen money grouped by room'],
  history: ['Journal / History', 'Excel-compatible monthly journal'],
  audit: ['Audit Log', 'Every important action is recorded'],
  admin: ['Admin', 'Users, teams, targets, IP whitelist and backups'],
};

const navByRole = {
  room_screen: [
    ['screen', 'monitor', 'Room Screen'],
  ],
  owner: [
    ['dashboard', 'line-chart', 'Owner Dashboard'],
    ['screen', 'trophy', 'Team Screens'],
    ['monitoring', 'radar', 'Issued Values'],
    ['frozenFunds', 'snowflake', 'Frozen Funds'],
    ['history', 'scroll-text', 'History'],
  ],
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
    ['monitoring', 'radar', 'Issued Wallets'],
    ['frozenFunds', 'snowflake', 'Frozen Funds'],
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
    ['monitoring', 'radar', 'Issued Wallets'],
    ['frozenFunds', 'snowflake', 'Frozen Funds'],
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

function compactMoney(value) {
  const amount = Number(value || 0);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(abs >= 10000000 ? 0 : 1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}K`;
  return money(amount);
}

function priceMoney(value) {
  const number = Number(value || 0);
  const fixed = Math.abs(number).toFixed(4);
  const [whole, fraction] = fixed.split('.');
  const wholeText = Number(whole).toLocaleString('en-US');
  return `${number < 0 ? '-' : ''}$${wholeText} .${fraction}`;
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

const coinIconUrls = {
  BTC: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/btc.svg',
  ETH: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/eth.svg',
  USDT: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/usdt.svg',
  SOL: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/sol.svg',
  XRP: 'https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/svg/color/xrp.svg',
};

function coinIcon(crypto) {
  const code = String(crypto || '').toUpperCase();
  const src = coinIconUrls[code];
  const fallback = escapeHtml(code.slice(0, 1) || '?');
  return `
    <span class="coin-icon coin-${escapeHtml(code)}" aria-hidden="true">
      ${src ? `<img src="${src}" alt="">` : `<span>${fallback}</span>`}
    </span>
  `;
}

function assetBadge(item, options = {}) {
  const crypto = String(item?.crypto || '').toUpperCase();
  const network = item?.network || '';
  const label = assetDisplayLabel(crypto, network);
  const showNetwork = !options.compact && (crypto === 'USDT' || crypto === 'ETH') && network;
  return `
    <span class="asset-badge" title="${escapeHtml(label)}">
      ${coinIcon(crypto)}
      <span class="asset-code">${escapeHtml(crypto || '-')}</span>
      ${showNetwork ? `<small>${escapeHtml(network)}</small>` : ''}
    </span>
  `;
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

function assetOptionLabel(asset) {
  return asset?.label || assetLabel(asset);
}

function renderAssetOptions(selected = '', assets = assetOptions()) {
  return assets.map(asset => {
    const label = assetOptionLabel(asset);
    return `<option value="${escapeHtml(label)}" ${selected === label ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function renderAssetPickerButtons(assets, selected = '', attr = 'requestAsset') {
  return assets.map(asset => {
    const label = assetOptionLabel(asset);
    return `
      <button type="button" class="asset-choice ${selected === label ? 'active' : ''}" data-${attr}="${escapeHtml(label)}" title="${escapeHtml(label)}">
        ${assetBadge(asset)}
      </button>
    `;
  }).join('');
}

function requestAssetOptions(isWithdraw = false) {
  return assetOptions().filter(asset => !isWithdraw || asset.crypto !== 'USDT');
}

function renderRequestAssetOptions(isWithdraw = false, selected = '') {
  return requestAssetOptions(isWithdraw).map(asset => {
    const label = assetOptionLabel(asset);
    return `<option value="${escapeHtml(label)}" ${selected === label ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function syncRequestAssetOptions(form, isWithdraw) {
  const assetInput = $('[name="asset"]', form);
  if (!assetInput) return;
  const allowed = requestAssetOptions(isWithdraw);
  const current = assetInput.value;
  const currentAllowed = allowed.some(asset => assetOptionLabel(asset) === current);
  const selected = currentAllowed ? current : assetOptionLabel(allowed[0]);
  if (assetInput.tagName === 'SELECT') {
    assetInput.innerHTML = renderAssetOptions(selected, allowed);
  }
  assetInput.value = selected || '';
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

function requestAgentForForm(form = $('#request-form')) {
  const me = currentUser();
  const selectedAgentId = $('[name="agentId"]', form)?.value || me.id;
  return (app.state?.users || []).find(user => user.id === selectedAgentId) || me;
}

function syncRequestRoom(form = $('#request-form')) {
  const roomSelect = $('#request-room');
  if (!roomSelect) return;
  const agent = requestAgentForForm(form);
  const room = agent?.team || currentUser()?.team || '';
  if (room && !Array.from(roomSelect.options).some(option => option.value === room)) {
    roomSelect.append(new Option(room, room));
  }
  roomSelect.value = room;
  roomSelect.disabled = true;
  roomSelect.title = room ? `Auto selected from ${agent?.fullName || 'agent'}` : 'Auto selected from request owner';
}

function updateRequestAmountMode(form = $('#request-form')) {
  if (!form) return;
  const isWithdraw = $('[name="type"]', form)?.value === 'Withdraw';
  syncRequestAssetOptions(form, isWithdraw);
  syncAssetInputs(form);
  syncRequestRoom(form);
  const crypto = $('[name="crypto"]', form)?.value || '';
  const usdField = $('#request-usd-field');
  const usdInput = $('#request-deposit-usd');
  const exchangeField = $('#request-exchange-field');
  const exchangeInput = $('#request-exchange');
  const withdrawAddressField = $('#request-withdraw-address-field');
  const withdrawAddressInput = $('#request-withdraw-address');
  const cryptoLabel = $('#request-crypto-amount-label');
  const cryptoInput = $('#request-original-amount');

  usdField?.classList.toggle('hidden', isWithdraw);
  exchangeField?.classList.toggle('hidden', isWithdraw);
  if (exchangeInput) {
    exchangeInput.required = !isWithdraw;
    exchangeInput.disabled = isWithdraw;
    if (isWithdraw) {
      exchangeInput.value = '';
    } else if (!exchangeInput.value && exchangeInput.options.length) {
      exchangeInput.selectedIndex = 0;
    }
  }
  withdrawAddressField?.classList.toggle('hidden', !isWithdraw);
  if (withdrawAddressInput) {
    withdrawAddressInput.required = isWithdraw;
    withdrawAddressInput.disabled = !isWithdraw;
    if (!isWithdraw) {
      withdrawAddressInput.value = '';
      app.withdrawConfirmedAddress = '';
      app.withdrawConfirmedAsset = '';
      updateWithdrawDetectionNote('');
    }
  }
  if (usdInput) {
    usdInput.required = !isWithdraw;
    usdInput.disabled = isWithdraw;
    if (isWithdraw) usdInput.value = '';
  }
  if (cryptoLabel) cryptoLabel.textContent = isWithdraw ? 'Crypto Amount' : 'Original Amount';
  if (cryptoInput) {
    cryptoInput.required = isWithdraw;
    cryptoInput.placeholder = isWithdraw ? `Amount in ${crypto || 'selected coin'}` : 'Optional';
    cryptoInput.inputMode = isWithdraw ? 'decimal' : '';
  }
}

function cleanWalletAddress(value) {
  return String(value || '').trim().replace(/\s+/g, '');
}

function detectedAssetValue(detected) {
  return detected ? assetDisplayLabel(detected.crypto, detected.network) : '';
}

function detectWalletAddressAsset(address) {
  const value = cleanWalletAddress(address);
  if (!value) return null;
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return { crypto: 'ETH', network: 'ERC20', confidence: 'medium', note: 'ERC20/EVM address. Token cannot be proven from the address alone.' };
  }
  if (/^(bc1)[a-z0-9]{25,90}$/i.test(value) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,40}$/.test(value)) {
    return { crypto: 'BTC', network: 'Bitcoin', confidence: 'high', note: 'Bitcoin address format detected.' };
  }
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value)) {
    return { crypto: 'XRP', network: 'Ripple', confidence: 'high', note: 'Ripple/XRP address format detected.' };
  }
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) {
    return { crypto: 'USDT', network: 'TRC20', confidence: 'medium', note: 'TRC20 address detected. Withdraw requests do not use USDT.' };
  }
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    return { crypto: 'SOL', network: 'Solana', confidence: 'medium', note: 'Solana-style base58 address detected.' };
  }
  return null;
}

function updateWithdrawDetectionNote(html) {
  const note = $('#withdraw-detect-summary');
  if (note) note.innerHTML = html || '';
}

function setRequestAsset(assetValue) {
  const form = $('#request-form');
  const assetInput = $('[name="asset"]', form);
  if (!assetInput) return;
  assetInput.value = assetValue;
  syncAssetInputs(form);
  updateRequestAmountMode(form);
}

function confirmDetectedWithdrawAsset(detected, address) {
  const assetValue = detectedAssetValue(detected);
  if (!assetValue) return;
  app.pendingWithdrawDetection = { ...detected, address, assetValue };
  $('#asset-confirm-title').textContent = 'Confirm withdrawal asset';
  $('#asset-confirm-text').textContent = detected.note || 'Confirm detected asset before creating the request.';
  $('#asset-confirm-card').innerHTML = `
    ${assetBadge(detected)}
    <div>
      <strong>${escapeHtml(assetValue)}</strong>
      <span>${escapeHtml(address)}</span>
    </div>
  `;
  openModal('asset-confirm-modal');
}

function applyDetectedWithdrawAsset() {
  const pending = app.pendingWithdrawDetection;
  if (!pending) return;
  app.withdrawConfirmedAddress = pending.address;
  app.withdrawConfirmedAsset = pending.assetValue;
  setRequestAsset(pending.assetValue);
  updateWithdrawDetectionNote(`
    <span class="detect-ok">${assetBadge(pending)} Confirmed for this withdrawal address.</span>
  `);
  closeModal('asset-confirm-modal');
  app.pendingWithdrawDetection = null;
}

function detectWithdrawAddress(options = {}) {
  const form = $('#request-form');
  if (!form || $('[name="type"]', form)?.value !== 'Withdraw') return false;
  const input = $('#request-withdraw-address');
  const address = cleanWalletAddress(input?.value);
  if (!address || address.length < 20) {
    updateWithdrawDetectionNote('');
    return false;
  }
  const detected = detectWalletAddressAsset(address);
  if (!detected) {
    updateWithdrawDetectionNote('<span class="detect-error">Cannot detect this wallet format. Check the address before submitting.</span>');
    return false;
  }
  const assetValue = detectedAssetValue(detected);
  if (!requestAssetOptions(true).some(asset => assetOptionLabel(asset) === assetValue)) {
    updateWithdrawDetectionNote(`<span class="detect-error">${assetBadge(detected)} is detected, but withdrawals are allowed only in BTC, ETH, SOL or XRP.</span>`);
    return false;
  }
  updateWithdrawDetectionNote(`<span class="detect-pending">${assetBadge(detected)} Detected. Confirm to auto-select.</span>`);
  if (options.prompt !== false && (address !== app.withdrawConfirmedAddress || assetValue !== app.withdrawConfirmedAsset)) {
    confirmDetectedWithdrawAsset(detected, address);
  }
  return true;
}

function scheduleWithdrawDetection() {
  clearTimeout(app.withdrawDetectTimer);
  app.withdrawDetectTimer = setTimeout(() => detectWithdrawAddress({ prompt: true }), 650);
}

function priceUsd(crypto) {
  if (crypto === 'USDT') return 1;
  return Number(app.state?.priceCache?.[crypto]?.usd || 0);
}

function priceStamp(crypto) {
  return app.state?.priceCache?.[crypto]?.updatedAt || '';
}

function priceSource(crypto) {
  return app.state?.priceCache?.[crypto]?.source || 'cache';
}

function priceSourceLabel(source) {
  const labels = {
    binance: 'Market price',
    coingecko: 'Market price',
    fixed: 'Stable price',
    demo: 'Market cache',
    cache: 'Market cache',
  };
  return labels[source] || source || 'Market cache';
}

function cryptoAmount(value, crypto = '') {
  const digits = crypto === 'USDT' ? 2 : 6;
  return Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: digits });
}

function isWithdrawRequest(request) {
  return request?.type === 'Withdraw';
}

function requestTypeLabel(request) {
  return isWithdrawRequest(request) ? 'Withdraw' : 'Deposit';
}

function requestTypeBadge(request) {
  return `<span class="flow-pill ${isWithdrawRequest(request) ? 'out' : 'in'}">${escapeHtml(requestTypeLabel(request))}</span>`;
}

function requestCryptoAmountLabel(request) {
  return `${cryptoAmount(request.originalAmount, request.crypto)} ${request.crypto || ''}`.trim();
}

function requestAmountDisplay(request) {
  return isWithdrawRequest(request) ? requestCryptoAmountLabel(request) : money(request.depositUsd);
}

function requestTransactions(request) {
  if (!request) return [];
  return (app.state?.walletTransactions || []).filter(tx =>
    (request.id && tx.requestId === request.id)
    || (request.walletId && tx.walletId === request.walletId && tx.requestId === request.id)
  );
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

function requestOriginalUsd(request) {
  const transactions = requestTransactions(request);
  if (!isWithdrawRequest(request) && transactions.length) {
    return transactions.reduce((sum, tx) => sum + Number(tx.originalUsd || 0), 0);
  }
  return Math.max(0, Number(request?.depositUsd || 0));
}

function requestLiveUsd(request) {
  const transactions = requestTransactions(request);
  if (transactions.length) {
    return transactions.reduce((sum, tx) => sum + transactionLiveUsd(tx, request.crypto), 0);
  }
  if (isWithdrawRequest(request)) {
    const amount = Number(request?.originalAmount || 0);
    const live = amount * priceUsd(request?.crypto);
    return live > 0 ? live : requestOriginalUsd(request);
  }
  return requestOriginalUsd(request);
}

function requestDifferenceUsd(request) {
  return requestLiveUsd(request) - requestOriginalUsd(request);
}

function requestFlowUsd(request) {
  return isWithdrawRequest(request) ? requestLiveUsd(request) : requestOriginalUsd(request);
}

function requestAmountHtml(request) {
  const originalUsd = requestOriginalUsd(request);
  const liveUsd = requestLiveUsd(request);
  const differenceUsd = liveUsd - originalUsd;
  if (isWithdrawRequest(request)) {
    return `
      <span class="amount-main">${escapeHtml(requestCryptoAmountLabel(request))}</span>
      <small class="cell-sub">Live ${escapeHtml(money(liveUsd))} - at request ${escapeHtml(money(originalUsd))}</small>
      ${Math.abs(differenceUsd) > 0.004 ? `<small class="cell-sub">Risk ${renderUsdDelta(differenceUsd)}</small>` : ''}
    `;
  }
  return `
    <span class="amount-main">${escapeHtml(money(originalUsd))}</span>
    ${Math.abs(differenceUsd) > 0.004 ? `<small class="cell-sub">Live ${escapeHtml(money(liveUsd))} - Risk ${renderUsdDelta(differenceUsd)}</small>` : ''}
  `;
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

function walletAssignment(wallet) {
  return (app.state?.assignments || [])
    .slice()
    .reverse()
    .find(item => item.walletId === wallet.id) || null;
}

function walletPrimaryRequest(wallet) {
  return (app.state?.requests || [])
    .slice()
    .reverse()
    .find(item => item.id === wallet.requestId || item.id === wallet.frozenByRequestId || item.walletId === wallet.id) || null;
}

function frozenWalletsForRoom(room) {
  return (app.state?.wallets || [])
    .filter(wallet => wallet.status === 'frozen' && walletRoom(wallet) === room)
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

function walletIsPool(wallet) {
  return poolWalletStatuses.includes(wallet?.status);
}

function walletIsIssued(wallet) {
  return issuedWalletStatuses.includes(wallet?.status);
}

function walletIsArchived(wallet) {
  return wallet?.status === 'archived';
}

function latestWalletScan(walletId) {
  return (app.state?.walletScans || [])
    .filter(scan => scan.walletId === walletId)
    .sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt)))[0] || null;
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
    const assetRow = row.assets.get(asset) || { crypto: wallet.crypto, network: wallet.network, totalCrypto: 0 };
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

function isOwner() {
  return currentUser()?.role === 'owner';
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

function canViewMoneyReadOnly() {
  return isOwner() || canManageWallets();
}

function canCreateRequests() {
  return ['agent', 'supervisor', 'finance', 'admin'].includes(currentUser()?.role);
}

function requestActionVisible() {
  return canCreateRequests() && ['dashboard', 'clients'].includes(app.view);
}

function updateTopActions() {
  $('#open-request-top')?.classList.toggle('hidden', !requestActionVisible());
}

function userName(id) {
  const user = (app.state?.users || []).find(item => item.id === id);
  return user ? user.fullName : id || '-';
}

function walletById(id) {
  return (app.state?.wallets || []).find(item => item.id === id)
    || (app.state?.allWallets || []).find(item => item.id === id);
}

function requestById(id) {
  return (app.state?.requests || []).find(item => item.id === id);
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

function canReceiveApprovalPopup() {
  return ['finance', 'admin'].includes(currentUser()?.role);
}

function pendingApprovalRequests() {
  return (app.state?.requests || []).filter(item => item.status === 'pending');
}

function closeApprovalPopup(requestId = '') {
  if (requestId) app.dismissedApprovalAlertIds.add(requestId);
  $('#approval-alert')?.remove();
}

function approvalNotificationButton() {
  if (!('Notification' in window) || Notification.permission === 'granted') return '';
  return `<button class="btn ghost" data-enable-approval-notifications type="button">${icon('smartphone')}Enable Phone Alerts</button>`;
}

function sendBrowserApprovalNotification(request) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = `FinVault approval: ${request.id}`;
  const body = `${request.clientName || 'Client'} - CID ${request.cid || '-'} - ${requestAmountDisplay(request)}`;
  try {
    const notification = new Notification(title, { body, tag: request.id, requireInteraction: true });
    notification.onclick = () => {
      window.focus();
      openRequestDetailModal(request.id);
      notification.close();
    };
  } catch {
    // Browser notification support differs by device; the in-app popup remains the reliable fallback.
  }
}

function showApprovalPopup(request) {
  if (!request || !canReceiveApprovalPopup() || app.dismissedApprovalAlertIds.has(request.id)) return;
  $('#approval-alert')?.remove();
  const wrapper = document.createElement('aside');
  wrapper.id = 'approval-alert';
  wrapper.className = 'approval-alert';
  wrapper.innerHTML = `
    <div class="approval-alert-head">
      <span>${icon('bell-ring')} Approval needed</span>
      <button class="icon-btn small" data-approval-dismiss="${escapeHtml(request.id)}" title="Close">${icon('x')}</button>
    </div>
    <strong>${escapeHtml(request.id)} - ${escapeHtml(request.clientName || '-')}</strong>
    <div class="approval-alert-grid">
      <span>CID <b>${escapeHtml(request.cid || '-')}</b></span>
      <span>Room <b>${escapeHtml(request.room || '-')}</b></span>
      <span>Agent <b>${escapeHtml(userName(request.agentId))}</b></span>
      <span>Type <b>${requestTypeBadge(request)}</b></span>
      <span>Amount <b>${requestAmountHtml(request)}</b></span>
    </div>
    <div class="approval-alert-actions">
      ${approvalNotificationButton()}
      <button class="btn ghost" data-approval-detail="${escapeHtml(request.id)}">${icon('eye')}Review</button>
      <button class="btn ghost" data-approval-reject="${escapeHtml(request.id)}">${icon('x')}Reject</button>
      <button class="btn success" data-approval-approve="${escapeHtml(request.id)}">${icon('check')}Approve</button>
    </div>
  `;
  document.body.appendChild(wrapper);
  bindApprovalPopupEvents(wrapper);
  sendBrowserApprovalNotification(request);
  createIcons();
}

function bindApprovalPopupEvents(root = document) {
  $('[data-approval-dismiss]', root)?.addEventListener('click', event => {
    closeApprovalPopup(event.currentTarget.dataset.approvalDismiss);
  });
  $('[data-approval-detail]', root)?.addEventListener('click', event => {
    const requestId = event.currentTarget.dataset.approvalDetail;
    closeApprovalPopup(requestId);
    openRequestDetailModal(requestId);
  });
  $('[data-approval-reject]', root)?.addEventListener('click', event => {
    const requestId = event.currentTarget.dataset.approvalReject;
    closeApprovalPopup(requestId);
    openRejectRequestModal(requestId);
  });
  $('[data-approval-approve]', root)?.addEventListener('click', async event => {
    const requestId = event.currentTarget.dataset.approvalApprove;
    closeApprovalPopup(requestId);
    await approveRequestAction(requestId);
  });
  $('[data-enable-approval-notifications]', root)?.addEventListener('click', async event => {
    event.stopPropagation();
    if (!('Notification' in window)) {
      toast('Phone alerts unavailable', 'This browser does not support notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') toast('Phone alerts enabled', 'New approval requests can show browser notifications.');
    else toast('Phone alerts not enabled', 'Browser notification permission was not granted.');
  });
}

function syncApprovalPopup(previousPendingIds = new Set()) {
  if (!canReceiveApprovalPopup()) {
    closeApprovalPopup();
    return;
  }
  const pending = pendingApprovalRequests()
    .filter(item => !app.dismissedApprovalAlertIds.has(item.id))
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  if (!pending.length) {
    closeApprovalPopup();
    return;
  }
  const newest = pending.find(item => !previousPendingIds.has(item.id)) || pending[0];
  showApprovalPopup(newest);
}

function createIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function showLogin() {
  document.body.classList.remove('room-screen-mode');
  $('#login-screen').classList.remove('hidden');
  $('#app-shell').classList.add('hidden');
}

function showApp() {
  $('#login-screen').classList.add('hidden');
  $('#app-shell').classList.remove('hidden');
}

async function loadState() {
  const previousPendingIds = new Set(pendingApprovalRequests().map(item => item.id));
  const result = await api('/api/state');
  app.state = result.state;
  normalizeViewForRole();
  renderShell();
  renderView();
  syncApprovalPopup(previousPendingIds);
}

function normalizeViewForRole() {
  const allowed = navByRole[currentUser()?.role] || [];
  if (!allowed.some(item => item[0] === app.view)) {
    app.view = allowed[0]?.[0] || 'dashboard';
  }
}

function renderShell() {
  const me = currentUser();
  const roomScreenMode = me.role === 'room_screen';
  document.body.classList.toggle('room-screen-mode', roomScreenMode);
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

  const ownerTitles = {
    dashboard: ['Owner Dashboard', 'Money in, money out, frozen funds and source explanations'],
    screen: ['Team Screens', 'All room screens, managers, agents and monthly performance'],
    monitoring: ['Issued Values', 'Read-only issued wallet value and market difference'],
    frozenFunds: ['Frozen Funds', 'Frozen money by room with client and wallet suffix detail'],
    history: ['Owner History', 'Read-only financial journal and request sources'],
  };
  const roomScreenTitles = {
    screen: [`Room ${me.team || '-'} Screen`, 'Full-screen room display'],
  };
  const [title, subtitle] = me.role === 'room_screen'
    ? (roomScreenTitles[app.view] || viewTitles.screen)
    : me.role === 'owner'
    ? (ownerTitles[app.view] || viewTitles[app.view] || viewTitles.dashboard)
    : (viewTitles[app.view] || viewTitles.dashboard);
  $('#page-title').textContent = title;
  $('#page-subtitle').textContent = subtitle;
  updateTopActions();
  createIcons();
}

function roleLabel(role) {
  return {
    room_screen: 'Room Screen',
    owner: 'Owner',
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
    monitoring: renderIssuedWalletMonitoring,
    frozenFunds: renderFrozenFunds,
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
  const month = app.state?.settings?.currentJournalMonth || today.slice(0, 7);
  const todayDeposits = requests
    .filter(item => item.date === today && ['approved', 'instant'].includes(item.status))
    .filter(item => !isWithdrawRequest(item))
    .reduce((sum, item) => sum + requestFlowUsd(item), 0);
  const freeWallets = (app.state.wallets || []).filter(item => item.status === 'free').length;

  if (me.role === 'owner') {
    return renderOwnerDashboard();
  }

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
  const approvedRequests = requests.filter(item => ['approved', 'instant'].includes(item.status));
  const monthRequests = approvedRequests.filter(item => String(item.date || '').startsWith(month));
  const monthDeposits = monthRequests
    .filter(item => !isWithdrawRequest(item))
    .reduce((sum, item) => sum + requestFlowUsd(item), 0);
  const monthWithdrawals = monthRequests
    .filter(isWithdrawRequest)
    .reduce((sum, item) => sum + requestFlowUsd(item), 0);
  const monthNet = monthDeposits - monthWithdrawals;
  const issuedWallets = (app.state.wallets || []).filter(walletIsIssued);
  const frozenWallets = issuedWallets.filter(item => item.status === 'frozen');
  const issuedTotals = issuedWallets.reduce((totals, wallet) => {
    const walletTotal = walletTotals(wallet);
    totals.currentUsd += walletTotal.currentUsd;
    totals.originalUsd += walletTotal.originalUsd;
    totals.differenceUsd += walletTotal.differenceUsd;
    return totals;
  }, { currentUsd: 0, originalUsd: 0, differenceUsd: 0 });
  const frozenTotals = frozenWallets.reduce((totals, wallet) => {
    const walletTotal = walletTotals(wallet);
    totals.currentUsd += walletTotal.currentUsd;
    totals.originalUsd += walletTotal.originalUsd;
    totals.differenceUsd += walletTotal.differenceUsd;
    return totals;
  }, { currentUsd: 0, originalUsd: 0, differenceUsd: 0 });

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
    <div class="analytics-grid">
      ${analyticsTile('Monthly deposits', money(monthDeposits), 'Approved deposits this month')}
      ${analyticsTile('Monthly withdrawals', money(monthWithdrawals), 'Crypto withdrawals valued in USD')}
      ${analyticsTile('Monthly net', money(monthNet), `${shortMonth(month)} current journal`)}
      ${analyticsTile('Issued wallets value', money(issuedTotals.currentUsd), `${issuedWallets.length} monitored wallet(s)`)}
      ${analyticsTile('Frozen funds live', money(frozenTotals.currentUsd), `${frozenWallets.length} frozen wallet(s)`)}
      ${analyticsTile('Market risk', signedMoney(issuedTotals.differenceUsd), 'Live value minus original USD')}
    </div>
    ${panel('Live Flow', renderDailyFlowChart(requests))}
    <div class="split">
      ${panel('Recent Activity', renderRecentActivity(requests.slice().reverse().slice(0, 8)))}
      ${panel('Agent Ranking', renderRanking(assignments), `<button class="btn" data-go-view="screen">${icon('trophy')}Open Screen</button>`)}
    </div>
  `;
}

function metric(label, value, iconName) {
  return `<div class="metric"><span>${icon(iconName)}${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function analyticsTile(label, value, detail) {
  return `
    <div class="analytics-tile">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </div>
  `;
}

function ownerApprovedRequests() {
  return (app.state.requests || []).filter(item => ['approved', 'instant'].includes(item.status));
}

function ownerMonth() {
  return app.state?.settings?.currentJournalMonth || todayIso().slice(0, 7);
}

function ownerSumUsd(requests) {
  return requests.reduce((sum, item) => sum + requestFlowUsd(item), 0);
}

function ownerRequestDirection(request) {
  return isWithdrawRequest(request) ? 'Out' : 'In';
}

function ownerSourceDestination(request) {
  const wallet = walletById(request.walletId);
  if (isWithdrawRequest(request)) {
    return {
      source: 'Finance approved crypto withdrawal',
      destination: request.withdrawAddressSuffix || walletSuffix(request.withdrawAddress),
    };
  }
  return {
    source: request.exchange || '-',
    destination: wallet ? `${wallet.name} / ${wallet.addressSuffix || walletSuffix(wallet.address)}` : 'Wallet pending',
  };
}

function ownerWalletsLinkedToRequests(requests) {
  const ids = new Set(requests.map(item => item.walletId).filter(Boolean));
  return (app.state.wallets || []).filter(wallet => ids.has(wallet.id));
}

function ownerTotalsForWallets(wallets) {
  return wallets.reduce((totals, wallet) => {
    const walletTotal = walletTotals(wallet);
    totals.originalUsd += walletTotal.originalUsd;
    totals.currentUsd += walletTotal.currentUsd;
    totals.differenceUsd += walletTotal.differenceUsd;
    totals.totalCrypto += walletTotal.totalCrypto;
    return totals;
  }, { originalUsd: 0, currentUsd: 0, differenceUsd: 0, totalCrypto: 0 });
}

function ownerDayRows(days = 7) {
  const approved = ownerApprovedRequests();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - 1 - index));
    const iso = date.toISOString().slice(0, 10);
    const requests = approved.filter(item => item.date === iso);
    const deposits = ownerSumUsd(requests.filter(item => !isWithdrawRequest(item)));
    const withdrawals = ownerSumUsd(requests.filter(isWithdrawRequest));
    return { date: iso, requests, deposits, withdrawals, net: deposits - withdrawals };
  });
}

function ownerRoomRows() {
  const approved = ownerApprovedRequests();
  const pending = (app.state.requests || []).filter(item => item.status === 'pending');
  const wallets = app.state.wallets || [];
  return (app.state.teams || [])
    .filter(team => ['M', 'T', 'T2'].includes(team.name))
    .map(team => {
      const roomRequests = approved.filter(item => item.room === team.name);
      const roomWallets = wallets.filter(wallet => {
        const request = (app.state.requests || []).find(item => item.walletId === wallet.id);
        const assignment = (app.state.assignments || []).find(item => item.walletId === wallet.id);
        return request?.room === team.name || assignment?.room === team.name;
      });
      const frozenWallets = roomWallets.filter(wallet => wallet.status === 'frozen');
      const frozenTotals = ownerTotalsForWallets(frozenWallets);
      const deposits = ownerSumUsd(roomRequests.filter(item => !isWithdrawRequest(item)));
      const withdrawals = ownerSumUsd(roomRequests.filter(isWithdrawRequest));
      const manager = (app.state.users || []).find(user => user.id === team.managerId);
      return {
        room: team.name,
        manager: manager?.fullName || '-',
        requests: roomRequests,
        deposits,
        withdrawals,
        net: deposits - withdrawals,
        frozenWallets,
        frozenUsd: frozenTotals.currentUsd,
        pending: pending.filter(item => item.room === team.name),
      };
    });
}

function ownerAssetRows() {
  const approved = ownerApprovedRequests();
  const pending = (app.state.requests || []).filter(item => item.status === 'pending');
  const wallets = app.state.wallets || [];
  return ['USDT', 'BTC', 'ETH', 'SOL', 'XRP'].map(crypto => {
    const assetRequests = approved.filter(item => item.crypto === crypto);
    const assetWallets = wallets.filter(wallet => wallet.crypto === crypto);
    const totals = ownerTotalsForWallets(assetWallets);
    const deposits = ownerSumUsd(assetRequests.filter(item => !isWithdrawRequest(item)));
    const withdrawals = ownerSumUsd(assetRequests.filter(isWithdrawRequest));
    return {
      crypto,
      requests: assetRequests,
      wallets: assetWallets,
      deposits,
      withdrawals,
      net: deposits - withdrawals,
      originalUsd: totals.originalUsd,
      currentUsd: totals.currentUsd,
      differenceUsd: totals.differenceUsd,
      pending: pending.filter(item => item.crypto === crypto),
    };
  });
}

function ownerMetric(label, value, iconName, drillKey, detail = '') {
  return `
    <button class="metric owner-click" type="button" data-owner-drill="${escapeHtml(drillKey)}">
      <span>${icon(iconName)}${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<small>${escapeHtml(detail)}</small>` : ''}
    </button>
  `;
}

function ownerAnalytics(label, value, detail, drillKey) {
  return `
    <button class="analytics-tile owner-click" type="button" data-owner-drill="${escapeHtml(drillKey)}">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </button>
  `;
}

function renderOwnerDashboard() {
  const requests = app.state.requests || [];
  const approved = ownerApprovedRequests();
  const pending = requests.filter(item => item.status === 'pending');
  const today = todayIso();
  const month = ownerMonth();
  const issuedWallets = (app.state.wallets || []).filter(walletIsIssued);
  const frozenWallets = issuedWallets.filter(item => item.status === 'frozen');
  const issuedTotals = ownerTotalsForWallets(issuedWallets);
  const frozenTotals = ownerTotalsForWallets(frozenWallets);
  const todayRequests = approved.filter(item => item.date === today);
  const monthRequests = approved.filter(item => String(item.date || '').startsWith(month));
  const todayDeposits = ownerSumUsd(todayRequests.filter(item => !isWithdrawRequest(item)));
  const todayWithdrawals = ownerSumUsd(todayRequests.filter(isWithdrawRequest));
  const monthDeposits = ownerSumUsd(monthRequests.filter(item => !isWithdrawRequest(item)));
  const monthWithdrawals = ownerSumUsd(monthRequests.filter(isWithdrawRequest));
  const pendingAmount = ownerSumUsd(pending);

  return `
    <div class="notice-row">
      <div class="notice info"><strong>Read-only owner mode</strong><span>Every number opens its source requests, wallets and transactions.</span></div>
      <div class="notice warning"><strong>Monthly room screen</strong><span>On the 1st, the room screen opens a new journal month. Old months stay in history.</span></div>
      <div class="notice info"><strong>Address privacy</strong><span>Wallet and withdrawal addresses are shown by suffix only.</span></div>
    </div>

    <div class="metric-grid owner-metric-grid">
      ${ownerMetric('Today In', money(todayDeposits), 'arrow-down-left', 'metric:todayDeposits', 'Approved deposits today')}
      ${ownerMetric('Today Out', money(todayWithdrawals), 'arrow-up-right', 'metric:todayWithdrawals', 'Approved withdrawals today')}
      ${ownerMetric('Today Net', money(todayDeposits - todayWithdrawals), 'activity', 'metric:todayNet', 'In minus out')}
      ${ownerMetric('Pending Amount', money(pendingAmount), 'timer', 'metric:pending', `${pending.length} request(s)`)}
    </div>

    <div class="analytics-grid">
      ${ownerAnalytics('Month In', money(monthDeposits), `${shortMonth(month)} approved deposits`, 'metric:monthDeposits')}
      ${ownerAnalytics('Month Out', money(monthWithdrawals), `${shortMonth(month)} approved withdrawals`, 'metric:monthWithdrawals')}
      ${ownerAnalytics('Issued Wallet Value', money(issuedTotals.currentUsd), `${issuedWallets.length} issued wallet(s)`, 'metric:issued')}
      ${ownerAnalytics('Frozen Funds Live', money(frozenTotals.currentUsd), `${frozenWallets.length} frozen wallet(s)`, 'metric:frozen')}
      ${ownerAnalytics('Market Difference', signedMoney(issuedTotals.differenceUsd), 'Live value minus original USD', 'metric:marketDelta')}
    </div>

    ${panel('Money Flow - Last 7 Days', `
      ${renderDailyFlowChart(requests)}
      ${renderOwnerDayTable()}
    `)}

    <div class="split">
      ${panel('Rooms', renderOwnerRoomsTable())}
      ${panel('Assets', renderOwnerAssetsTable())}
    </div>

    ${panel('Latest Money Movements', renderOwnerMovementTable(approved.slice().sort((a, b) => String(b.updatedAt || b.date).localeCompare(String(a.updatedAt || a.date))).slice(0, 10)))}
  `;
}

function renderOwnerDayTable() {
  const rows = ownerDayRows(7);
  return `
    <table class="owner-table owner-flow-table">
      <thead>
        <tr>
          <th>Date</th>
          <th>In</th>
          <th>Out</th>
          <th>Net</th>
          <th>Requests</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr class="clickable-row" data-owner-drill="day:${escapeHtml(row.date)}">
            <td>${escapeHtml(shortDate(row.date))}</td>
            <td>${money(row.deposits)}</td>
            <td>${money(row.withdrawals)}</td>
            <td>${renderUsdDelta(row.net)}</td>
            <td>${row.requests.length}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderOwnerRoomsTable() {
  const rows = ownerRoomRows();
  return `
    <table class="owner-table">
      <thead>
        <tr>
          <th>Room</th>
          <th>Manager</th>
          <th>In</th>
          <th>Out</th>
          <th>Net</th>
          <th>Frozen</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr class="clickable-row" data-owner-drill="room:${escapeHtml(row.room)}">
            <td><strong>Room ${escapeHtml(row.room)}</strong></td>
            <td>${escapeHtml(row.manager)}</td>
            <td>${money(row.deposits)}</td>
            <td>${money(row.withdrawals)}</td>
            <td>${renderUsdDelta(row.net)}</td>
            <td>${money(row.frozenUsd)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderOwnerAssetsTable() {
  const rows = ownerAssetRows();
  return `
    <table class="owner-table">
      <thead>
        <tr>
          <th>Asset</th>
          <th>In</th>
          <th>Out</th>
          <th>Wallet Live</th>
          <th>Diff</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr class="clickable-row" data-owner-drill="asset:${escapeHtml(row.crypto)}">
            <td>${assetBadge({ crypto: row.crypto, network: networkOptions[row.crypto]?.[0] || '' }, { compact: true })}</td>
            <td>${money(row.deposits)}</td>
            <td>${money(row.withdrawals)}</td>
            <td>${money(row.currentUsd)}</td>
            <td>${renderUsdDelta(row.differenceUsd)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderOwnerMovementTable(requests) {
  if (!requests.length) return '<div class="empty">No approved money movements yet.</div>';
  return `
    <table class="owner-table">
      <thead>
        <tr>
          <th>Request</th>
          <th>Flow</th>
          <th>Client</th>
          <th>Room</th>
          <th>Brand</th>
          <th>Amount</th>
          <th>From / To</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map(request => {
          const route = ownerSourceDestination(request);
          return `
            <tr class="clickable-row" data-request-details="${escapeHtml(request.id)}">
              <td><strong>${escapeHtml(request.id)}</strong><small>${escapeHtml(shortDate(request.date))}</small></td>
              <td><span class="flow-pill ${isWithdrawRequest(request) ? 'out' : 'in'}">${ownerRequestDirection(request)}</span></td>
              <td>${escapeHtml(request.clientName || '-')}<small>CID ${escapeHtml(request.cid || '-')}</small></td>
              <td>${escapeHtml(request.room || '-')}</td>
              <td>${escapeHtml(request.brand || '-')}</td>
              <td>${requestAmountHtml(request)}</td>
              <td><small>From: ${escapeHtml(route.source)}</small><small>To: ${escapeHtml(route.destination)}</small></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function ownerDrilldownData(key) {
  const [type, value] = String(key || '').split(':');
  const approved = ownerApprovedRequests();
  const pending = (app.state.requests || []).filter(item => item.status === 'pending');
  const issuedWallets = (app.state.wallets || []).filter(walletIsIssued);
  const today = todayIso();
  const month = ownerMonth();

  if (type === 'day') {
    const requests = approved.filter(item => item.date === value);
    return {
      title: `Money Flow - ${shortDate(value)}`,
      subtitle: 'Approved money movements for this day.',
      requests,
      wallets: ownerWalletsLinkedToRequests(requests),
    };
  }

  if (type === 'room') {
    const requests = approved.filter(item => item.room === value);
    const wallets = issuedWallets.filter(wallet => {
      const request = (app.state.requests || []).find(item => item.walletId === wallet.id);
      const assignment = (app.state.assignments || []).find(item => item.walletId === wallet.id);
      return request?.room === value || assignment?.room === value;
    });
    return {
      title: `Room ${value}`,
      subtitle: 'Deposits, withdrawals, frozen money and issued wallets for this room.',
      requests,
      wallets,
      pending: pending.filter(item => item.room === value),
    };
  }

  if (type === 'asset') {
    const requests = approved.filter(item => item.crypto === value);
    const wallets = issuedWallets.filter(wallet => wallet.crypto === value);
    return {
      title: `${value} Flow`,
      subtitle: 'Asset exposure, approved movements and wallet value.',
      requests,
      wallets,
      pending: pending.filter(item => item.crypto === value),
    };
  }

  if (type === 'agent') {
    const agent = (app.state.users || []).find(item => item.id === value);
    const requests = approved.filter(item => item.agentId === value);
    return {
      title: agent ? `${agent.fullName} - Room ${agent.team || '-'}` : 'Agent Flow',
      subtitle: 'Approved deposits, withdrawals and linked wallets for this agent.',
      requests,
      wallets: ownerWalletsLinkedToRequests(requests),
      pending: pending.filter(item => item.agentId === value),
    };
  }

  const metricMap = {
    todayDeposits: {
      title: 'Today In',
      subtitle: 'Approved deposit requests today.',
      requests: approved.filter(item => item.date === today && !isWithdrawRequest(item)),
    },
    todayWithdrawals: {
      title: 'Today Out',
      subtitle: 'Approved withdrawal requests today.',
      requests: approved.filter(item => item.date === today && isWithdrawRequest(item)),
    },
    todayNet: {
      title: 'Today Net',
      subtitle: 'All approved money movements today. Net equals In minus Out.',
      requests: approved.filter(item => item.date === today),
    },
    monthDeposits: {
      title: `Month In - ${shortMonth(month)}`,
      subtitle: 'Approved deposits in the current room-screen journal month.',
      requests: approved.filter(item => String(item.date || '').startsWith(month) && !isWithdrawRequest(item)),
    },
    monthWithdrawals: {
      title: `Month Out - ${shortMonth(month)}`,
      subtitle: 'Approved withdrawals in the current room-screen journal month.',
      requests: approved.filter(item => String(item.date || '').startsWith(month) && isWithdrawRequest(item)),
    },
    pending: {
      title: 'Pending Amount',
      subtitle: 'Requests waiting for finance/admin decision. Owner can view only.',
      requests: pending,
    },
    issued: {
      title: 'Issued Wallet Value',
      subtitle: 'Busy and frozen wallets currently monitored.',
      requests: approved.filter(item => item.walletId),
      wallets: issuedWallets,
    },
    frozen: {
      title: 'Frozen Funds Live',
      subtitle: 'Wallets marked as frozen because funds should stay in wallet.',
      requests: approved.filter(item => item.keepInWallet),
      wallets: issuedWallets.filter(item => item.status === 'frozen'),
    },
    marketDelta: {
      title: 'Market Difference',
      subtitle: 'Live wallet value minus original USD value at incoming transactions.',
      requests: approved.filter(item => item.walletId),
      wallets: issuedWallets,
    },
  };

  const data = metricMap[value] || { title: 'Owner Explanation', subtitle: 'Source data for this number.', requests: [] };
  return {
    ...data,
    wallets: data.wallets || ownerWalletsLinkedToRequests(data.requests || []),
  };
}

function ownerSummaryHtml(requests, wallets, pending = []) {
  const deposits = ownerSumUsd((requests || []).filter(item => !isWithdrawRequest(item)));
  const withdrawals = ownerSumUsd((requests || []).filter(isWithdrawRequest));
  const walletTotals = ownerTotalsForWallets(wallets || []);
  return `
    <div class="owner-explain-summary">
      <div><span>In</span><strong>${money(deposits)}</strong></div>
      <div><span>Out</span><strong>${money(withdrawals)}</strong></div>
      <div><span>Net</span><strong>${renderUsdDelta(deposits - withdrawals)}</strong></div>
      <div><span>Requests</span><strong>${(requests || []).length}</strong></div>
      <div><span>Pending</span><strong>${pending.length}</strong></div>
      <div><span>Wallet live</span><strong>${money(walletTotals.currentUsd)}</strong></div>
      <div><span>Original USD</span><strong>${money(walletTotals.originalUsd)}</strong></div>
      <div><span>Market diff</span><strong>${renderUsdDelta(walletTotals.differenceUsd)}</strong></div>
    </div>
  `;
}

function ownerRequestExplainTable(requests) {
  if (!requests?.length) return '<div class="empty">No requests in this explanation.</div>';
  return `
    <table class="owner-table">
      <thead>
        <tr>
          <th>Request</th>
          <th>Flow</th>
          <th>Client</th>
          <th>Agent</th>
          <th>Room</th>
          <th>Amount</th>
          <th>Source / Destination</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map(request => {
          const route = ownerSourceDestination(request);
          return `
            <tr class="clickable-row" data-request-details="${escapeHtml(request.id)}">
              <td><strong>${escapeHtml(request.id)}</strong><small>${escapeHtml(shortDate(request.date))}</small></td>
              <td><span class="flow-pill ${isWithdrawRequest(request) ? 'out' : 'in'}">${ownerRequestDirection(request)}</span></td>
              <td>${escapeHtml(request.clientName || '-')}<small>CID ${escapeHtml(request.cid || '-')}</small></td>
              <td>${escapeHtml(userName(request.agentId))}</td>
              <td>${escapeHtml(request.room || '-')}</td>
              <td>${requestAmountHtml(request)}<small>${assetBadge(request)}</small></td>
              <td><small>From: ${escapeHtml(route.source)}</small><small>To: ${escapeHtml(route.destination)}</small></td>
              <td>${statusPill(request.status)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function ownerWalletExplainTable(wallets) {
  if (!wallets?.length) return '<div class="empty">No issued wallets in this explanation.</div>';
  return `
    <table class="owner-table">
      <thead>
        <tr>
          <th>Wallet</th>
          <th>Suffix</th>
          <th>CID</th>
          <th>Asset</th>
          <th>Status</th>
          <th>Total</th>
          <th>Original USD</th>
          <th>Live USD</th>
          <th>Diff</th>
        </tr>
      </thead>
      <tbody>
        ${wallets.map(wallet => {
          const totals = walletTotals(wallet);
          return `
            <tr>
              <td><strong>${escapeHtml(wallet.name || '-')}</strong></td>
              <td>${escapeHtml(wallet.addressSuffix || walletSuffix(wallet.address))}</td>
              <td>${escapeHtml(wallet.cid || '-')}</td>
              <td>${assetBadge(wallet)}</td>
              <td>${statusPill(wallet.status)}</td>
              <td>${escapeHtml(cryptoAmount(totals.totalCrypto, wallet.crypto))}</td>
              <td>${money(totals.originalUsd)}</td>
              <td>${money(totals.currentUsd)}</td>
              <td>${renderUsdDelta(totals.differenceUsd)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function ownerTransactionExplainTable(wallets) {
  const walletIds = new Set((wallets || []).map(wallet => wallet.id));
  const rows = (app.state.walletTransactions || [])
    .filter(tx => walletIds.has(tx.walletId))
    .slice()
    .sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  if (!rows.length) return '<div class="empty">No on-chain or recorded incoming transactions for these wallets.</div>';
  return `
    <table class="owner-table">
      <thead>
        <tr>
          <th>TRX</th>
          <th>Wallet</th>
          <th>Received</th>
          <th>Amount</th>
          <th>Original USD</th>
          <th>Live USD</th>
          <th>Diff</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(tx => {
          const wallet = walletById(tx.walletId) || {};
          return `
            <tr>
              <td><span class="tx-hash" title="${escapeHtml(tx.txHash || '-')}">${escapeHtml(shortTxHash(tx.txHash))}</span><small>${escapeHtml(tx.source || '-')}</small></td>
              <td>${escapeHtml(wallet.name || '-')}<small>${escapeHtml(wallet.addressSuffix || walletSuffix(wallet.address))}</small></td>
              <td>${escapeHtml(shortDateTime(tx.receivedAt))}</td>
              <td>${escapeHtml(cryptoAmount(tx.amountCrypto, tx.crypto || wallet.crypto))}</td>
              <td>${money(tx.originalUsd)}</td>
              <td>${money(transactionLiveUsd(tx, tx.crypto || wallet.crypto))}</td>
              <td>${renderUsdDelta(transactionDifferenceUsd(tx, tx.crypto || wallet.crypto))}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function openOwnerDrilldown(key) {
  const data = ownerDrilldownData(key);
  const requests = data.requests || [];
  const wallets = data.wallets || [];
  const pending = data.pending || [];
  $('#wallet-modal-title').textContent = data.title;
  $('#wallet-modal-subtitle').textContent = data.subtitle;
  $('#wallet-modal-body').innerHTML = `
    <div class="owner-explain">
      ${ownerSummaryHtml(requests, wallets, pending)}
      <section class="request-detail-card">
        <h3>Request Sources</h3>
        ${ownerRequestExplainTable(requests)}
      </section>
      <section class="request-detail-card">
        <h3>Issued / Frozen Wallet Sources</h3>
        ${ownerWalletExplainTable(wallets)}
      </section>
      <section class="request-detail-card">
        <h3>Recorded Incoming Transactions</h3>
        ${ownerTransactionExplainTable(wallets)}
      </section>
      ${pending.length ? `<section class="request-detail-card"><h3>Pending Requests</h3>${ownerRequestExplainTable(pending)}</section>` : ''}
    </div>
  `;
  bindOwnerModalEvents();
  createIcons();
  openModal('wallet-modal');
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
      <span class="ranking-room">Room ${escapeHtml(row.agent.team || '-')}</span>
      <strong>${money(row.monthlyNet)}</strong>
    </div>
    <div style="height:8px;background:#eef2f5;border-radius:999px;margin:0 0 13px;overflow:hidden">
      <div style="height:100%;width:${Math.round((row.monthlyNet / max) * 100)}%;background:#285b8f"></div>
    </div>
  `).join('')}</div>`;
}

function renderDailyFlowChart(requests) {
  const approved = requests.filter(item => ['approved', 'instant'].includes(item.status));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date.toISOString().slice(0, 10);
  });
  const rows = days.map(date => {
    const dayRequests = approved.filter(item => item.date === date);
    const deposits = dayRequests
      .filter(item => !isWithdrawRequest(item))
      .reduce((sum, item) => sum + requestFlowUsd(item), 0);
    const withdrawals = dayRequests
      .filter(isWithdrawRequest)
      .reduce((sum, item) => sum + requestFlowUsd(item), 0);
    return { date, deposits, withdrawals, net: deposits - withdrawals, count: dayRequests.length };
  });
  const width = 920;
  const height = 218;
  const pad = { top: 24, right: 28, bottom: 36, left: 64 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const max = Math.max(...rows.map(row => Math.max(row.deposits, row.withdrawals)), 1);
  const xFor = index => pad.left + (rows.length === 1 ? 0 : (index / (rows.length - 1)) * plotWidth);
  const yFor = value => pad.top + plotHeight - (Number(value || 0) / max) * plotHeight;
  const pointsFor = key => rows.map((row, index) => ({ x: xFor(index), y: yFor(row[key]) }));
  const clamp = (value, min, maxValue) => Math.min(Math.max(value, min), maxValue);
  const smoothSegments = points => points.slice(0, -1).map((point, index) => {
    const previous = points[index - 1] || point;
    const next = points[index + 1];
    const afterNext = points[index + 2] || next;
    const minY = Math.min(point.y, next.y);
    const maxY = Math.max(point.y, next.y);
    const cp1x = point.x + (next.x - previous.x) / 6;
    const cp1y = clamp(point.y + (next.y - previous.y) / 6, minY, maxY);
    const cp2x = next.x - (afterNext.x - point.x) / 6;
    const cp2y = clamp(next.y - (afterNext.y - point.y) / 6, minY, maxY);
    return `C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)} ${cp2x.toFixed(1)} ${cp2y.toFixed(1)} ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }).join(' ');
  const linePath = (key) => {
    const points = pointsFor(key);
    return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} ${smoothSegments(points)}`;
  };
  const areaPath = (key) => {
    const points = pointsFor(key);
    const startX = points[0].x.toFixed(1);
    const endX = points[points.length - 1].x.toFixed(1);
    const baseY = (pad.top + plotHeight).toFixed(1);
    return `M ${startX} ${baseY} L ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} ${smoothSegments(points)} L ${endX} ${baseY} Z`;
  };
  const gridValues = [0.25, 0.5, 0.75, 1].map(ratio => max * ratio);
  const totalDeposits = rows.reduce((sum, row) => sum + row.deposits, 0);
  const totalWithdrawals = rows.reduce((sum, row) => sum + row.withdrawals, 0);
  const totalNet = totalDeposits - totalWithdrawals;
  return `
    <div class="flow-card">
      <div class="flow-summary">
        <div>
          <span>Last 7 days net</span>
          <strong>${escapeHtml(money(totalNet))}</strong>
        </div>
        <div>
          <span>Deposits</span>
          <strong>${escapeHtml(money(totalDeposits))}</strong>
        </div>
        <div>
          <span>Withdrawals</span>
          <strong>${escapeHtml(money(totalWithdrawals))}</strong>
        </div>
      </div>
      <div class="flow-legend">
        <span><i class="deposit"></i>Deposits</span>
        <span><i class="withdraw"></i>Withdrawals</span>
      </div>
      <svg class="flow-line-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Deposits and withdrawals for the last seven days">
        <defs>
          <linearGradient id="flowDepositFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#167246" stop-opacity="0.24"></stop>
            <stop offset="100%" stop-color="#167246" stop-opacity="0.02"></stop>
          </linearGradient>
          <linearGradient id="flowWithdrawFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stop-color="#b63a35" stop-opacity="0.16"></stop>
            <stop offset="100%" stop-color="#b63a35" stop-opacity="0.01"></stop>
          </linearGradient>
        </defs>
        ${gridValues.map(value => {
          const y = yFor(value).toFixed(1);
          return `
            <line class="flow-grid-line" x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line>
            <text class="flow-axis-label" x="${pad.left - 12}" y="${Number(y) + 4}" text-anchor="end">${escapeHtml(compactMoney(value))}</text>
          `;
        }).join('')}
        <line class="flow-axis-base" x1="${pad.left}" y1="${pad.top + plotHeight}" x2="${width - pad.right}" y2="${pad.top + plotHeight}"></line>
        <path class="flow-area deposit" d="${areaPath('deposits')}"></path>
        <path class="flow-area withdraw" d="${areaPath('withdrawals')}"></path>
        <path class="flow-line deposit" d="${linePath('deposits')}"></path>
        <path class="flow-line withdraw" d="${linePath('withdrawals')}"></path>
        ${rows.map((row, index) => {
          const x = xFor(index).toFixed(1);
          const depositY = yFor(row.deposits).toFixed(1);
          const withdrawY = yFor(row.withdrawals).toFixed(1);
          return `
            <g class="flow-point-group">
              <circle class="flow-point deposit" cx="${x}" cy="${depositY}" r="4.4"></circle>
              <circle class="flow-point withdraw" cx="${x}" cy="${withdrawY}" r="3.8"></circle>
              <text class="flow-day-label" x="${x}" y="${height - 18}" text-anchor="middle">${escapeHtml(shortDate(row.date).slice(0, 5))}</text>
              <text class="flow-value-label" x="${x}" y="${Math.min(Number(depositY), Number(withdrawY)) - 10}" text-anchor="middle">${escapeHtml(compactMoney(row.net))}</text>
            </g>
          `;
        }).join('')}
      </svg>
    </div>
  `;
}

function renderRecentActivity(requests) {
  if (!requests.length) return '<div class="empty">No recent activity yet.</div>';
  return `
    <table class="recent-activity-table">
      <thead>
        <tr>
          <th>Request</th>
          <th>Client</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Asset</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map(request => `
          <tr data-request-details="${escapeHtml(request.id)}">
            <td>
              <strong>${escapeHtml(request.id)}</strong>
              <small>${escapeHtml(shortDate(request.date))} - ${escapeHtml(userName(request.agentId))}</small>
            </td>
            <td>
              <strong>${escapeHtml(request.clientName || '-')}</strong>
              <small>CID ${escapeHtml(request.cid || '-')} - Room ${escapeHtml(request.room || '-')}</small>
            </td>
            <td>${requestTypeBadge(request)}</td>
            <td>
              ${requestAmountHtml(request)}
              ${request.withdrawAddress ? `<small>To ${escapeHtml(walletSuffix(request.withdrawAddress))}</small>` : `<small>${escapeHtml(request.exchange || '-')}</small>`}
            </td>
            <td>${assetBadge(request)}</td>
            <td>${statusPill(request.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function allowedRoomsForScreen() {
  const me = currentUser();
  const teams = app.state.teams || [];
  if (me.role === 'room_screen') {
    return teams.filter(team => team.name === me.team);
  }
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
      .reduce((sum, item) => sum + requestFlowUsd(item), 0);
    const monthlyDeposit = ownMonth
      .filter(item => item.type !== 'Withdraw')
      .reduce((sum, item) => sum + requestFlowUsd(item), 0);
    const monthlyWithdraw = ownMonth
      .filter(item => item.type === 'Withdraw')
      .reduce((sum, item) => sum + requestFlowUsd(item), 0);
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
  const screenOnly = currentUser().role === 'room_screen';
  if (currentUser().role === 'agent') {
    return '<div class="panel"><div class="empty">Agent ranking screen is available to supervisor, finance manager, admin, owner and room screen users.</div></div>';
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
  const ownerRoomDrill = isOwner() ? ` data-owner-drill="room:${escapeHtml(selectedTeam.name)}"` : '';
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
    ${screenOnly ? '' : `
      <div class="room-tabs">
        ${rooms.map(room => `
          <button class="${room.name === selectedTeam.name ? 'active' : ''}" data-room-tab="${escapeHtml(room.name)}">
            ${icon('monitor')}
            Room ${escapeHtml(room.name)}
          </button>
        `).join('')}
      </div>
    `}

    <div class="agent-screen${screenOnly ? ' room-screen-full' : ''}">
      <div class="screen-head">
        <div>
          <span>${screenOnly ? 'LIVE ROOM DISPLAY' : `ROOM ${escapeHtml(selectedTeam.name)} SCREEN`}</span>
          <h3>${escapeHtml(manager?.fullName || 'No manager')}</h3>
        </div>
        <div class="screen-totals"${ownerRoomDrill}>
          <strong>Today's Total Deposits</strong>
          <b>${money(todayTotal)}</b>
        </div>
        <div class="screen-totals"${ownerRoomDrill}>
          <strong>Monthly Net</strong>
          <b>${money(monthlyTotal)}</b>
        </div>
        <div class="screen-totals"${ownerRoomDrill}>
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
              <tr ${isOwner() ? `class="clickable-row" data-owner-drill="agent:${escapeHtml(row.agent.id)}"` : ''}>
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
    const isWithdraw = isWithdrawRequest(request);
    return `
      <div class="queue-item" data-request-details="${escapeHtml(request.id)}">
        <div>
          <div class="queue-title">
            <strong>${escapeHtml(request.id)}</strong>
            ${statusPill(request.status)}
            ${requestTypeBadge(request)}
            <span>${escapeHtml(request.clientName)}</span>
          </div>
          <div class="meta">
            <span>CID ${escapeHtml(request.cid)}</span>
            <span>${escapeHtml(userName(request.agentId))}</span>
            <span>${assetBadge(request)}</span>
            <span>${escapeHtml(isWithdraw ? 'No exchange for withdrawal' : request.exchange)}</span>
            <span>${requestAmountHtml(request)}</span>
            <span>${isWithdraw ? `To: ${escapeHtml(walletSuffix(request.withdrawAddress))}` : `Proposed: ${escapeHtml(wallet?.name || request.walletId)}`}</span>
          </div>
        </div>
        <div class="queue-actions">
          ${isWithdraw ? '' : `<button class="btn ghost" data-change-wallet="${escapeHtml(request.id)}">${icon('repeat-2')}Change Wallet</button>`}
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
  const assets = ['BTC', 'ETH', 'SOL', 'XRP'];
  const ttl = Number(app.state?.settings?.priceCacheTtlSeconds || 60);
  return `
    <section class="price-kpi">
      <div class="price-kpi-head">
        <div>
          <span>Crypto Price KPI</span>
          <strong>Live USD prices</strong>
        </div>
        <div class="price-kpi-meta">
          <span>Auto refresh</span>
          <strong>${ttl}s</strong>
        </div>
        <button class="btn" id="refresh-prices-btn">${icon('radar')}Refresh Prices</button>
      </div>
      <div class="price-strip">
        ${assets.map(asset => `
          <div class="price-tile">
            ${assetBadge({ crypto: asset, network: networkOptions[asset]?.[0] || '' }, { compact: true })}
            <strong>${escapeHtml(priceMoney(priceUsd(asset)))}</strong>
            <div class="price-tile-meta">
              <small>${escapeHtml(shortDateTime(priceStamp(asset)))}</small>
            </div>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}

function renderFrozenRooms() {
  const rows = frozenRoomRows();
  if (!rows.length) {
    return panel('Frozen Funds by Room', '<div class="empty">No frozen funds yet.</div>');
  }
  return panel('Frozen Funds by Room', `
    <table>
      <thead>
        <tr>
          <th>Room</th>
          <th>Wallets</th>
          <th>Assets</th>
          <th>Originally USD</th>
          <th>Live USD</th>
          <th>Difference</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr class="clickable-row" data-frozen-room="${escapeHtml(row.room)}">
            <td><button class="text-link" type="button" data-frozen-room="${escapeHtml(row.room)}"><strong>${escapeHtml(row.room)}</strong></button></td>
            <td>${row.wallets}</td>
            <td>${Array.from(row.assets.values()).map(value => `${assetBadge(value)} <span class="cell-sub inline">${escapeHtml(cryptoAmount(value.totalCrypto, value.crypto))}</span>`).join('<br>')}</td>
            <td>${money(row.originalUsd)}</td>
            <td>${money(row.currentUsd)}</td>
            <td>${renderUsdDelta(row.differenceUsd)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `);
}

function renderFrozenRoomDetails(room) {
  const wallets = frozenWalletsForRoom(room);
  if (!wallets.length) return '<div class="empty">No frozen wallets found for this room.</div>';
  const ownerMode = isOwner();
  const summary = wallets.reduce((total, wallet) => {
    const walletTotal = walletTotals(wallet);
    total.wallets += 1;
    total.originalUsd += walletTotal.originalUsd;
    total.currentUsd += walletTotal.currentUsd;
    total.differenceUsd += walletTotal.differenceUsd;
    total.transactions += walletTotal.transactions.length;
    return total;
  }, { wallets: 0, originalUsd: 0, currentUsd: 0, differenceUsd: 0, transactions: 0 });

  return `
    <div class="frozen-room-modal">
      <div class="frozen-room-summary">
        <div><span>Room</span><strong>${escapeHtml(room)}</strong></div>
        <div><span>Frozen wallets</span><strong>${summary.wallets}</strong></div>
        <div><span>Transactions</span><strong>${summary.transactions}</strong></div>
        <div><span>Originally USD</span><strong>${money(summary.originalUsd)}</strong></div>
        <div><span>Live USD</span><strong>${money(summary.currentUsd)}</strong></div>
        <div><span>Difference</span><strong>${renderUsdDelta(summary.differenceUsd)}</strong></div>
      </div>

      <div class="frozen-wallet-list">
        ${wallets.map(wallet => {
          const assignment = walletAssignment(wallet);
          const request = walletPrimaryRequest(wallet);
          const totals = walletTotals(wallet);
          const txRows = totals.transactions.slice().sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
          return `
            <section class="frozen-wallet-card">
              <header class="frozen-wallet-head">
                <div>
                  <span>${escapeHtml(wallet.name)}</span>
                  <strong>${escapeHtml(request?.clientName || assignment?.clientName || '-')}</strong>
                </div>
                <div class="right-actions">
                  ${ownerMode ? '' : `<button class="btn ghost" data-copy="${escapeHtml(wallet.address)}">${icon('copy')}Copy Address</button>`}
                  <button class="btn" data-wallet-details="${escapeHtml(wallet.id)}">${icon('list-search')}Wallet Card</button>
                </div>
              </header>

              <div class="frozen-wallet-grid">
                <div><span>CID</span><strong>${escapeHtml(wallet.cid || assignment?.cid || request?.cid || '-')}</strong></div>
                <div><span>Agent</span><strong>${escapeHtml(userName(assignment?.agentId || request?.agentId))}</strong></div>
                <div><span>Brand</span><strong>${escapeHtml(assignment?.brand || request?.brand || '-')}</strong></div>
                <div><span>Exchange</span><strong>${escapeHtml(wallet.exchange || assignment?.exchange || request?.exchange || '-')}</strong></div>
                <div><span>Asset</span><strong>${assetBadge(wallet)}</strong></div>
                <div><span>Request</span><strong>${escapeHtml(request?.id || wallet.requestId || wallet.frozenByRequestId || '-')}</strong></div>
                <div class="wide"><span>${ownerMode ? 'Wallet suffix' : 'Wallet address'}</span><strong class="${ownerMode ? '' : 'copy-address'}">${escapeHtml(ownerMode ? (wallet.addressSuffix || walletSuffix(wallet.address)) : wallet.address)}</strong></div>
                <div><span>Issued</span><strong>${escapeHtml(shortDate(wallet.issuedToClientAt))}</strong></div>
                <div><span>First access</span><strong>${escapeHtml(shortDate(wallet.firstAccessAt))}</strong></div>
                <div><span>Frozen</span><strong>${escapeHtml(shortDate(wallet.frozenAt || request?.updatedAt))}</strong></div>
                <div><span>Total received</span><strong>${escapeHtml(cryptoAmount(totals.totalCrypto, wallet.crypto))}</strong></div>
                <div><span>Originally USD</span><strong>${money(totals.originalUsd)}</strong></div>
                <div><span>Live USD</span><strong>${money(totals.currentUsd)}</strong></div>
                <div><span>Difference</span><strong>${renderUsdDelta(totals.differenceUsd)}</strong></div>
              </div>

              <table class="compact-table">
                <thead>
                  <tr>
                    <th>TRX</th>
                    <th>Source</th>
                    <th>Received</th>
                    <th>Amount</th>
                    <th>Original USD</th>
                    <th>Live USD</th>
                    <th>Difference</th>
                  </tr>
                </thead>
                <tbody>
                  ${txRows.length ? txRows.map(tx => `
                    <tr>
                      <td><span class="tx-hash" title="${escapeHtml(tx.txHash || '-')}">${escapeHtml(shortTxHash(tx.txHash))}</span></td>
                      <td>${escapeHtml(tx.source || '-')}</td>
                      <td>${escapeHtml(shortDateTime(tx.receivedAt))}</td>
                      <td>${escapeHtml(cryptoAmount(tx.amountCrypto, tx.crypto || wallet.crypto))}</td>
                      <td>${money(tx.originalUsd)}</td>
                      <td>${money(transactionLiveUsd(tx, wallet.crypto))}</td>
                      <td>${renderUsdDelta(transactionDifferenceUsd(tx, wallet.crypto))}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="7"><div class="empty">No transactions recorded yet.</div></td></tr>'}
                </tbody>
              </table>
            </section>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderWallets() {
  if (!canManageWallets()) {
    return '<div class="panel"><div class="empty">Wallet pool is available to finance manager and admin.</div></div>';
  }
  const wallets = app.state.wallets || [];
  const poolWallets = wallets.filter(walletIsPool);
  const archivedWallets = wallets.filter(walletIsArchived);
  return `
    ${panel('Wallet Pool', renderWalletTable(poolWallets, { withActions: true, scanEnabled: false }), `
      <button class="btn primary" id="add-wallet-toggle">${icon('plus')}Add Wallet</button>
    `)}
    ${archivedWallets.length ? panel('Archived Wallets', renderWalletTable(archivedWallets, { withActions: true, scanEnabled: false, archiveEnabled: false })) : ''}
  `;
}

function renderIssuedWalletMonitoring() {
  if (!canViewMoneyReadOnly()) {
    return '<div class="panel"><div class="empty">Issued wallet monitoring is available to owner, finance manager and admin.</div></div>';
  }
  const issuedWallets = (app.state.wallets || []).filter(walletIsIssued);
  const scanEvery = Number(app.state?.settings?.walletScanEverySeconds || 300);
  if (isOwner()) {
    return `
      ${renderLivePrices()}
      ${panel('Issued Wallet Values', renderWalletTable(issuedWallets, {
        withActions: false,
        scanEnabled: false,
        showLastScan: true,
        addressMode: 'suffix',
        hideCopy: true,
      }), '<span class="panel-note">Read-only owner view. Addresses are suffix only.</span>')}
    `;
  }
  return `
    ${renderLivePrices()}
    ${panel('Issued Wallet Monitoring', renderWalletTable(issuedWallets, { withActions: true, scanEnabled: true, showLastScan: true }), `
      <div class="panel-actions">
        <span class="panel-note">Only busy and frozen wallets are scanned. Auto ${scanEvery}s.</span>
        <button class="btn" id="scan-issued-btn">${icon('radar')}Scan Issued</button>
      </div>
    `)}
  `;
}

function renderFrozenFunds() {
  if (!canViewMoneyReadOnly()) {
    return '<div class="panel"><div class="empty">Frozen funds are available to owner, finance manager and admin.</div></div>';
  }
  return `
    ${renderLivePrices()}
    ${renderFrozenRooms()}
  `;
}

function renderAddWalletModalSection() {
  const selected = assetOptionLabel(assetOptions()[0]);
  return `
    <section class="modal-section">
      <h3>Add Wallet</h3>
      <form id="add-wallet-form">
        <div class="form-grid compact">
          <label>Name<input name="name" placeholder="Optional"></label>
          <label>Address<input name="address" required placeholder="Wallet address"></label>
          <label>
            Asset
            <select name="asset" id="wallet-asset" class="asset-select" required>${renderAssetOptions(selected)}</select>
          </label>
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
          <div class="profile-line"><span>Asset examples</span><strong class="asset-example-list">${assetOptions().map(item => assetBadge(item)).join('')}</strong></div>
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

function detailCell(label, value, options = {}) {
  return `
    <div class="${options.wide ? 'wide' : ''}">
      <span>${escapeHtml(label)}</span>
      <strong class="${options.mono ? 'copy-address' : ''}">${value}</strong>
    </div>
  `;
}

function renderRequestDetail(request) {
  if (!request) return '<div class="empty">Request not found.</div>';
  const wallet = walletById(request.walletId);
  const isWithdraw = isWithdrawRequest(request);
  const agent = (app.state.users || []).find(user => user.id === request.agentId);
  const createdBy = (app.state.users || []).find(user => user.id === request.createdBy);
  const history = (app.state.requests || [])
    .filter(item => item.cid === request.cid && item.id !== request.id)
    .slice()
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)))
    .slice(0, 6);
  const walletTotalsForRequest = wallet ? walletTotals(wallet) : null;
  const pending = request.status === 'pending';
  const approvalAllowed = canApprove();

  return `
    <div class="request-detail">
      <section class="request-detail-card">
        <header class="request-detail-head">
          <div>
            <span>${escapeHtml(request.type || 'Request')}</span>
            <strong>${escapeHtml(request.id)} - ${escapeHtml(request.clientName || '-')}</strong>
          </div>
          <div class="right-actions">
            ${approvalAllowed && pending && !isWithdraw ? `<button class="btn ghost" data-change-wallet="${escapeHtml(request.id)}">${icon('repeat-2')}Change Wallet</button>` : ''}
            ${approvalAllowed && pending ? `<button class="btn ghost" data-reject="${escapeHtml(request.id)}">${icon('x')}Reject</button>` : ''}
            ${approvalAllowed && pending ? `<button class="btn success" data-approve="${escapeHtml(request.id)}">${icon('check')}Approve</button>` : ''}
          </div>
        </header>

        <div class="request-detail-summary">
          ${detailCell('Status', statusPill(request.status))}
          ${detailCell('Type', requestTypeBadge(request))}
          ${detailCell('Amount', requestAmountHtml(request))}
          ${detailCell('Asset', assetBadge(request))}
          ${detailCell('CID', escapeHtml(request.cid || '-'))}
          ${detailCell('Room', escapeHtml(request.room || agent?.team || '-'))}
        </div>
      </section>

      <section class="request-detail-card">
        <h3>Request Data</h3>
        <div class="request-detail-grid">
          ${detailCell('Date', escapeHtml(shortDate(request.date)))}
          ${detailCell('Created at', escapeHtml(shortDateTime(request.createdAt)))}
          ${detailCell('Updated at', escapeHtml(shortDateTime(request.updatedAt)))}
          ${detailCell('Request owner', escapeHtml(agent ? `${agent.fullName} - ${agent.team}` : userName(request.agentId)))}
          ${detailCell('Created by', escapeHtml(createdBy?.fullName || request.createdBy || '-'))}
          ${detailCell('Client name', escapeHtml(request.clientName || '-'))}
          ${detailCell('Brand', escapeHtml(request.brand || '-'))}
          ${detailCell('Keep in wallet', escapeHtml(request.keepInWallet ? 'Yes, freeze funds' : 'No, transfer out'))}
          ${detailCell('Exchange', escapeHtml(isWithdraw ? 'Not required for withdrawal' : (request.exchange || '-')))}
          ${detailCell(isWithdraw ? 'USD at request' : 'Deposit USD', money(requestOriginalUsd(request)))}
          ${detailCell('Live USD now', money(requestLiveUsd(request)))}
          ${detailCell('Risk difference', renderUsdDelta(requestDifferenceUsd(request)))}
          ${detailCell('Crypto amount', escapeHtml(requestCryptoAmountLabel(request)))}
          ${detailCell('Approved by', escapeHtml(userName(request.approvedBy)))}
          ${request.notes ? detailCell('Notes', escapeHtml(request.notes), { wide: true }) : ''}
          ${request.rejectReason ? detailCell('Reject reason', escapeHtml(request.rejectReason), { wide: true }) : ''}
        </div>
      </section>

      <section class="request-detail-card">
        <h3>${isWithdraw ? 'Withdrawal Destination' : 'Wallet For Approval'}</h3>
        ${isWithdraw ? `
          <div class="request-detail-grid">
            ${detailCell('Destination wallet', escapeHtml(request.withdrawAddress || '-'), { wide: true, mono: true })}
            ${detailCell('Detected asset', assetBadge(request))}
            ${detailCell('Crypto amount', escapeHtml(requestCryptoAmountLabel(request)))}
            ${detailCell('USD at request', money(requestOriginalUsd(request)))}
            ${detailCell('Live USD now', money(requestLiveUsd(request)))}
            ${detailCell('Risk difference', renderUsdDelta(requestDifferenceUsd(request)))}
          </div>
        ` : wallet ? `
          <div class="request-detail-grid">
            ${detailCell('Wallet name', escapeHtml(wallet.name || '-'))}
            ${detailCell('Wallet status', statusPill(wallet.status))}
            ${detailCell('Suffix', escapeHtml(walletSuffix(wallet.address)))}
            ${detailCell('Exchange', escapeHtml(wallet.exchange || request.exchange || '-'))}
            ${detailCell('Wallet address', escapeHtml(wallet.address || '-'), { wide: true, mono: true })}
            ${detailCell('Total received', escapeHtml(cryptoAmount(walletTotalsForRequest.totalCrypto, wallet.crypto)))}
            ${detailCell('Original USD in wallet', money(walletTotalsForRequest.originalUsd))}
            ${detailCell('Live USD in wallet', money(walletTotalsForRequest.currentUsd))}
            ${detailCell('Difference', renderUsdDelta(walletTotalsForRequest.differenceUsd))}
          </div>
        ` : '<div class="empty">No wallet is attached to this request.</div>'}
      </section>

      <section class="request-detail-card">
        <h3>Client History</h3>
        ${history.length ? `
          <table class="compact-table request-history-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Asset</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(item => `
                <tr>
                  <td>${escapeHtml(item.id)}</td>
                  <td>${escapeHtml(shortDate(item.date))}</td>
                  <td>${requestTypeBadge(item)}</td>
                  <td>${requestAmountHtml(item)}</td>
                  <td>${assetBadge(item)}</td>
                  <td>${statusPill(item.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<div class="empty">No previous requests for this CID.</div>'}
      </section>
    </div>
  `;
}

function renderWalletDetail(wallet) {
  const totals = walletTotals(wallet);
  const latestScan = latestWalletScan(wallet.id);
  const canScanWallet = canManageWallets() && walletIsIssued(wallet);
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
          <strong>${assetBadge(wallet)}</strong>
        </div>
        <div>
          <span>Last scan</span>
          <strong>${escapeHtml(shortDateTime(latestScan?.scannedAt))}</strong>
        </div>
        ${canScanWallet
          ? `<button class="btn primary" data-scan-wallet="${escapeHtml(wallet.id)}">${icon('radar')}Scan Incoming</button>`
          : '<div class="scan-note">This wallet is still in the pool. It will only be scanned after it is issued.</div>'}
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

function renderWalletTable(wallets, options = {}) {
  const withActions = typeof options === 'boolean' ? options : Boolean(options.withActions);
  const scanEnabled = typeof options === 'boolean' ? options : options.scanEnabled !== false;
  const archiveEnabled = typeof options === 'boolean' ? true : options.archiveEnabled !== false;
  const showLastScan = typeof options === 'object' && Boolean(options.showLastScan);
  const addressMode = typeof options === 'object' ? (options.addressMode || 'address') : 'address';
  const hideCopy = typeof options === 'object' && Boolean(options.hideCopy);
  if (!wallets.length) return '<div class="empty">No wallets found.</div>';
  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          ${withActions ? '' : `<th>${addressMode === 'suffix' ? 'Suffix' : 'Address'}</th>`}
          <th>Asset</th>
          <th>Exchange</th>
          <th>CID</th>
          <th>Total Received</th>
          <th>Originally USD</th>
          <th>Live USD</th>
          <th>Difference</th>
          <th>Issued</th>
          <th>First Access</th>
          ${showLastScan ? '<th>Last Scan</th>' : ''}
          <th>Status</th>
          ${withActions ? '<th style="width:132px">Action</th>' : (hideCopy ? '' : '<th style="width:82px">Copy</th>')}
        </tr>
      </thead>
      <tbody>
        ${wallets.map(wallet => {
          const totals = walletTotals(wallet);
          const latestScan = latestWalletScan(wallet.id);
          const canScanWallet = scanEnabled && walletIsIssued(wallet);
          return `
            <tr class="${withActions ? 'clickable-row' : ''}" ${withActions ? `data-wallet-row="${escapeHtml(wallet.id)}"` : ''}>
              <td>${escapeHtml(wallet.name)}</td>
              ${withActions ? '' : `<td class="${addressMode === 'suffix' ? '' : 'copy-address'}" title="${escapeHtml(wallet.address)}">${escapeHtml(addressMode === 'suffix' ? (wallet.addressSuffix || walletSuffix(wallet.address)) : wallet.address)}</td>`}
              <td>${assetBadge(wallet)}</td>
              <td>${escapeHtml(wallet.exchange || '-')}</td>
              <td>${escapeHtml(wallet.cid || '-')}</td>
              <td>${escapeHtml(cryptoAmount(totals.totalCrypto, wallet.crypto))}</td>
              <td>${money(totals.originalUsd)}</td>
              <td>${money(totals.currentUsd)}</td>
              <td>${renderUsdDelta(totals.differenceUsd)}</td>
              <td>${escapeHtml(shortDate(wallet.issuedToClientAt))}</td>
              <td>${escapeHtml(shortDate(wallet.firstAccessAt))}</td>
              ${showLastScan ? `<td>${escapeHtml(shortDateTime(latestScan?.scannedAt))}</td>` : ''}
              <td>${statusPill(wallet.status)}</td>
              ${hideCopy && !withActions ? '' : `<td>
                ${withActions
                  ? `<div class="row-actions compact-actions">
                      <button class="icon-btn" title="Details" data-wallet-details="${escapeHtml(wallet.id)}">${icon('list-search')}</button>
                      ${canScanWallet ? `<button class="icon-btn" title="Scan Incoming" data-scan-wallet="${escapeHtml(wallet.id)}">${icon('radar')}</button>` : ''}
                      ${archiveEnabled ? `<button class="icon-btn" title="Archive" data-archive-wallet="${escapeHtml(wallet.id)}">${icon('archive')}</button>` : ''}
                    </div>`
                  : `<button class="icon-btn" title="Copy" data-copy="${escapeHtml(wallet.address)}">${icon('copy')}</button>`}
              </td>`}
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

function adminRoleOptions(selected = 'agent') {
  return ['agent', 'supervisor', 'finance', 'admin', 'owner', 'room_screen']
    .map(role => `<option value="${role}" ${selected === role ? 'selected' : ''}>${roleLabel(role)}</option>`)
    .join('');
}

function adminTeamOptions(selected = 'M') {
  const teams = app.state?.teams || [];
  return [...teams.map(team => team.name), 'Finance', 'Ops', 'Ownership']
    .filter((team, index, list) => list.indexOf(team) === index)
    .map(team => `<option value="${escapeHtml(team)}" ${selected === team ? 'selected' : ''}>${escapeHtml(team)}</option>`)
    .join('');
}

function adminActiveOptions(active = true) {
  return `<option value="true" ${active ? 'selected' : ''}>Active</option><option value="false" ${!active ? 'selected' : ''}>Inactive</option>`;
}

function renderAdminTabbed({ settings, teams, users, managers, roleOptions, teamOptions, activeOptions }) {
  const managerOptions = managerId => managers.map(manager => `
    <option value="${escapeHtml(manager.id)}" ${manager.id === managerId ? 'selected' : ''}>
      ${escapeHtml(manager.fullName)} - ${roleLabel(manager.role)}
    </option>
  `).join('');
  const tabs = [
    ['overview', 'layout-dashboard', 'Overview'],
    ['people', 'users', 'People'],
    ['rooms', 'monitor', 'Rooms'],
    ['markets', 'landmark', 'Brands & Exchanges'],
    ['settings', 'sliders-horizontal', 'System'],
    ['security', 'shield-check', 'Security & Backup'],
  ];
  const activeTab = tabs.some(([id]) => id === app.adminTab) ? app.adminTab : 'overview';
  const adminTabs = `
    <div class="admin-tabs" role="tablist" aria-label="Admin settings">
      ${tabs.map(([id, iconName, label]) => `
        <button type="button" role="tab" class="${activeTab === id ? 'active' : ''}" data-admin-tab="${id}" aria-selected="${activeTab === id ? 'true' : 'false'}">
          ${icon(iconName)}<span>${escapeHtml(label)}</span>
        </button>
      `).join('')}
    </div>
  `;
  const adminMetrics = `
    <div class="metric-grid">
      ${metric('Users', users.length, 'users')}
      ${metric('Active agents', users.filter(user => user.role === 'agent' && user.active).length, 'user-check')}
      ${metric('Rooms', teams.length, 'monitor')}
      ${metric('Active exchanges', (app.state.exchanges || []).filter(item => item.active).length, 'landmark')}
    </div>
  `;
  const overviewPanel = panel('System Snapshot', `
    <div class="panel-body admin-snapshot-grid">
      <div class="profile-line"><span>Low wallet warning</span><strong>${escapeHtml(settings.lowWalletWarningAt)} wallets</strong></div>
      <div class="profile-line"><span>Price refresh</span><strong>Every ${escapeHtml(settings.priceCacheTtlSeconds || 60)} seconds</strong></div>
      <div class="profile-line"><span>Issued wallet scan</span><strong>Every ${escapeHtml(settings.walletScanEverySeconds || 300)} seconds</strong></div>
      <div class="profile-line"><span>Backup frequency</span><strong>Every ${escapeHtml(settings.backupEveryMinutes)} minutes</strong></div>
      <div class="profile-line"><span>Current journal</span><strong>${escapeHtml(shortMonth(settings.currentJournalMonth))}</strong></div>
      <div class="profile-line"><span>IP whitelist</span><strong>${settings.ipWhitelistEnabled ? 'Enabled' : 'Disabled'}</strong></div>
    </div>
  `);
  const roomsPanel = panel('Rooms and Managers', `
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
  `);
  const usersPanel = panel('Users, Agents and Roles', `
    <div class="panel-body" style="padding-bottom:0">
      <span class="micro-copy">Users stay closed until edit is requested. Delete removes access but keeps history and Audit Log intact.</span>
    </div>
    <table class="admin-table admin-user-table">
      <thead>
        <tr>
          <th>User</th>
          <th>Username</th>
          <th>Role</th>
          <th>Team</th>
          <th>Target</th>
          <th>Status</th>
          <th style="width:116px">Actions</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(user => `
          <tr>
            <td>
              <div class="user-cell">
                <strong>${escapeHtml(user.fullName)}</strong>
                <span>${escapeHtml(user.id)}</span>
              </div>
            </td>
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(roleLabel(user.role))}</td>
            <td>${escapeHtml(user.team || '-')}</td>
            <td>${money(user.monthlyTarget || 0)}</td>
            <td>${user.active ? statusPill('active') : '<span class="status inactive">inactive</span>'}</td>
            <td>
              <div class="row-actions compact-actions user-actions">
                <button class="icon-btn small" type="button" data-edit-user="${escapeHtml(user.id)}" title="Edit ${escapeHtml(user.fullName)}">${icon('pencil')}</button>
                <button class="icon-btn small danger-icon" type="button" data-delete-user="${escapeHtml(user.id)}" title="Remove access" ${user.id === currentUser().id ? 'disabled' : ''}>${icon('trash-2')}</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `, `<button id="open-user-create" class="btn primary" type="button">${icon('user-plus')}Create User / Agent</button>`);
  const brandsPanel = panel('Brands', `
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
  `);
  const exchangesPanel = panel('Exchanges', `
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
  `);
  const systemSettingsPanel = panel('System Settings', `
    <form id="system-settings-form" class="panel-body">
      <div class="form-grid" style="grid-template-columns:1fr">
        <label>Low wallet warning at<input name="lowWalletWarningAt" type="number" min="0" value="${escapeHtml(settings.lowWalletWarningAt)}"></label>
        <label>Backup every minutes<input name="backupEveryMinutes" type="number" min="1" value="${escapeHtml(settings.backupEveryMinutes)}"></label>
        <label>Price refresh seconds<input name="priceCacheTtlSeconds" type="number" min="30" value="${escapeHtml(settings.priceCacheTtlSeconds || 60)}"></label>
        <label>Issued wallet scan seconds<input name="walletScanEverySeconds" type="number" min="60" value="${escapeHtml(settings.walletScanEverySeconds || 300)}"></label>
        <label>Current journal month<input name="currentJournalMonth" value="${escapeHtml(settings.currentJournalMonth)}"></label>
        <label>Excel compatibility<select name="excelCompatibilityMode"><option value="true" ${settings.excelCompatibilityMode ? 'selected' : ''}>Enabled</option><option value="false" ${!settings.excelCompatibilityMode ? 'selected' : ''}>Disabled</option></select></label>
      </div>
      <div class="modal-footer">
        <span class="micro-copy">Only admin can save system settings.</span>
        <button class="btn primary" type="submit" ${currentUser().role === 'admin' ? '' : 'disabled'}>${icon('save')}Save Settings</button>
      </div>
    </form>
  `);
  const securityPanel = panel('Security', `
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
  `);
  const backupPanel = panel('Backup and Monthly Journal', `
    <div class="panel-body">
      <div class="profile-line"><span>Backup frequency</span><strong>Every ${escapeHtml(settings.backupEveryMinutes)} minutes</strong></div>
      <div class="profile-line"><span>Price refresh</span><strong>Every ${escapeHtml(settings.priceCacheTtlSeconds || 60)} seconds</strong></div>
      <div class="profile-line"><span>Issued wallet scan</span><strong>Every ${escapeHtml(settings.walletScanEverySeconds || 300)} seconds</strong></div>
      <div class="profile-line"><span>Current journal</span><strong>${escapeHtml(shortMonth(settings.currentJournalMonth))}</strong></div>
      <div class="profile-line"><span>Excel compatibility</span><strong>${settings.excelCompatibilityMode ? 'Enabled' : 'Disabled'}</strong></div>
      <div class="profile-line"><span>Monthly table</span><strong>Created automatically</strong></div>
      <button id="manual-backup-btn" class="btn primary" style="margin-top:14px">${icon('database-backup')}Create Backup Now</button>
    </div>
  `);
  const bodies = {
    overview: `${adminMetrics}${overviewPanel}`,
    people: usersPanel,
    rooms: roomsPanel,
    markets: `<div class="split admin-section-split">${brandsPanel}${exchangesPanel}</div>`,
    settings: systemSettingsPanel,
    security: `<div class="split admin-section-split">${securityPanel}${backupPanel}</div>`,
  };

  return `
    ${adminTabs}
    <div class="admin-section">
      ${bodies[activeTab] || bodies.overview}
    </div>
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
  const roleOptions = role => ['agent', 'supervisor', 'finance', 'admin', 'owner', 'room_screen'].map(item => `<option value="${item}" ${role === item ? 'selected' : ''}>${roleLabel(item)}</option>`).join('');
  const teamOptions = team => [...teams.map(item => item.name), 'Finance', 'Ops', 'Ownership'].filter((item, index, arr) => arr.indexOf(item) === index).map(item => `<option value="${escapeHtml(item)}" ${team === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('');
  const activeOptions = active => `<option value="true" ${active ? 'selected' : ''}>Active</option><option value="false" ${!active ? 'selected' : ''}>Inactive</option>`;
  return renderAdminTabbed({ settings, teams, users, managers, roleOptions, teamOptions, activeOptions });
  /*
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
      ${panel('System Settings', `
        <form id="system-settings-form" class="panel-body">
          <div class="form-grid" style="grid-template-columns:1fr">
            <label>Low wallet warning at<input name="lowWalletWarningAt" type="number" min="0" value="${escapeHtml(settings.lowWalletWarningAt)}"></label>
            <label>Backup every minutes<input name="backupEveryMinutes" type="number" min="1" value="${escapeHtml(settings.backupEveryMinutes)}"></label>
            <label>Price refresh seconds<input name="priceCacheTtlSeconds" type="number" min="30" value="${escapeHtml(settings.priceCacheTtlSeconds || 60)}"></label>
            <label>Issued wallet scan seconds<input name="walletScanEverySeconds" type="number" min="60" value="${escapeHtml(settings.walletScanEverySeconds || 300)}"></label>
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
          <div class="profile-line"><span>Price refresh</span><strong>Every ${escapeHtml(settings.priceCacheTtlSeconds || 60)} seconds</strong></div>
          <div class="profile-line"><span>Issued wallet scan</span><strong>Every ${escapeHtml(settings.walletScanEverySeconds || 300)} seconds</strong></div>
          <div class="profile-line"><span>Current journal</span><strong>${escapeHtml(shortMonth(settings.currentJournalMonth))}</strong></div>
          <div class="profile-line"><span>Excel compatibility</span><strong>${settings.excelCompatibilityMode ? 'Enabled' : 'Disabled'}</strong></div>
          <div class="profile-line"><span>Monthly table</span><strong>Created automatically</strong></div>
          <button id="manual-backup-btn" class="btn primary" style="margin-top:14px">${icon('database-backup')}Create Backup Now</button>
        </div>
      `)}
    </div>
  `;
  */
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
      && (matches(String(row.depositUsd), filter.amount)
        || matches(row.originalAmount, filter.amount)
        || matches(requestAmountDisplay(row), filter.amount));
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
          <th>Type</th>
          <th>Agent</th>
          <th>CID</th>
          <th>Client</th>
          <th>Brand</th>
          <th>Room</th>
          <th>Amount</th>
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
            <tr class="clickable-row" data-request-details="${escapeHtml(request.id)}">
              <td>${escapeHtml(request.id)}</td>
              <td>${escapeHtml(shortDate(request.date))}</td>
              <td>${requestTypeBadge(request)}</td>
              <td>${escapeHtml(userName(request.agentId))}</td>
              <td>${escapeHtml(request.cid)}</td>
              <td>${escapeHtml(request.clientName)}</td>
              <td>${escapeHtml(request.brand)}</td>
              <td>${escapeHtml(request.room)}</td>
              <td>
                ${requestAmountHtml(request)}
                ${request.withdrawAddress ? `<small class="cell-sub">To ${escapeHtml(walletSuffix(request.withdrawAddress))}</small>` : ''}
              </td>
              <td>${assetBadge(request)}</td>
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

async function approveRequestAction(requestId) {
  await api(`/api/requests/${requestId}/approve`, { method: 'POST', body: '{}' });
  toast('Request approved', requestId);
  await loadState();
}

function openRejectRequestModal(requestId) {
  $('#reject-form [name="requestId"]').value = requestId;
  openModal('reject-modal');
}

async function changeRequestWalletAction(requestId) {
  await api(`/api/requests/${requestId}/change-wallet`, { method: 'POST', body: '{}' });
  toast('Proposed wallet changed', requestId);
  await loadState();
}

function bindViewEvents() {
  $all('[data-go-view]').forEach(button => {
    button.addEventListener('click', () => {
      app.view = button.dataset.goView;
      renderShell();
      renderView();
    });
  });

  $all('[data-owner-drill]').forEach(element => {
    element.addEventListener('click', event => {
      event.stopPropagation();
      openOwnerDrilldown(element.dataset.ownerDrill);
    });
  });

  $all('[data-room-tab]').forEach(button => {
    button.addEventListener('click', () => {
      app.selectedRoom = button.dataset.roomTab;
      renderView();
    });
  });

  $all('button[data-frozen-room]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openFrozenRoomModal(button.dataset.frozenRoom);
    });
  });

  $all('tr[data-frozen-room]').forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      openFrozenRoomModal(row.dataset.frozenRoom);
    });
  });

  $all('[data-admin-tab]').forEach(button => {
    button.addEventListener('click', () => {
      app.adminTab = button.dataset.adminTab;
      renderView();
    });
  });

  $('#open-user-create')?.addEventListener('click', () => openUserModal());

  $all('#view [data-edit-user]').forEach(button => {
    button.addEventListener('click', () => openUserModal(button.dataset.editUser));
  });

  $all('[data-save-user]').forEach(button => {
    button.addEventListener('click', async () => saveUser(button.dataset.saveUser));
  });

  $all('#view [data-delete-user]').forEach(button => {
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
    button.addEventListener('click', async event => {
      event.stopPropagation();
      await approveRequestAction(button.dataset.approve);
    });
  });

  $all('[data-reject]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openRejectRequestModal(button.dataset.reject);
    });
  });

  $all('[data-change-wallet]').forEach(button => {
    button.addEventListener('click', async event => {
      event.stopPropagation();
      await changeRequestWalletAction(button.dataset.changeWallet);
    });
  });

  $all('#view [data-request-details]').forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      openRequestDetailModal(row.dataset.requestDetails);
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

  $('#scan-issued-btn')?.addEventListener('click', () => scanIssuedWallets({ force: true }));

  $('#refresh-prices-btn')?.addEventListener('click', () => refreshPrices({ force: true }));

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

function bindFrozenRoomModalEvents() {
  $all('#wallet-modal-body [data-copy]').forEach(button => {
    button.addEventListener('click', async event => {
      event.stopPropagation();
      await navigator.clipboard.writeText(button.dataset.copy);
      toast('Copied', 'Wallet address copied.');
    });
  });
  $all('#wallet-modal-body [data-wallet-details]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      openWalletDetailModal(button.dataset.walletDetails);
    });
  });
}

function bindOwnerModalEvents() {
  $all('#wallet-modal-body [data-request-details]').forEach(row => {
    row.addEventListener('click', event => {
      if (event.target.closest('button')) return;
      openRequestDetailModal(row.dataset.requestDetails);
    });
  });
}

function bindRequestDetailModalEvents() {
  $all('#wallet-modal-body [data-approve]').forEach(button => {
    button.addEventListener('click', async event => {
      event.stopPropagation();
      await approveRequestAction(button.dataset.approve);
      closeModal('wallet-modal');
    });
  });
  $all('#wallet-modal-body [data-reject]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      closeModal('wallet-modal');
      openRejectRequestModal(button.dataset.reject);
    });
  });
  $all('#wallet-modal-body [data-change-wallet]').forEach(button => {
    button.addEventListener('click', async event => {
      event.stopPropagation();
      await changeRequestWalletAction(button.dataset.changeWallet);
      openRequestDetailModal(button.dataset.changeWallet);
    });
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

function openRequestDetailModal(requestId) {
  const request = requestById(requestId);
  const body = $('#wallet-modal-body');
  if (!request || !body) return;
  $('#wallet-modal-title').textContent = `Request ${request.id}`;
  $('#wallet-modal-subtitle').textContent = `${request.type || 'Request'} - CID ${request.cid || '-'} - ${request.clientName || '-'}`;
  body.innerHTML = renderRequestDetail(request);
  bindRequestDetailModalEvents();
  createIcons();
  openModal('wallet-modal');
}

function renderUserModalFields(user = null) {
  const isEdit = Boolean(user?.id);
  return `
    <label>Full name<input name="fullName" value="${escapeHtml(user?.fullName || '')}" required></label>
    <label>Username<input name="username" value="${escapeHtml(user?.username || '')}" required></label>
    <label>Password<input name="password" type="password" value="${isEdit ? '' : 'changeme123'}" placeholder="${isEdit ? 'Leave unchanged' : 'Password'}" ${isEdit ? '' : 'required'}></label>
    <label>Role<select name="role">${adminRoleOptions(user?.role || 'agent')}</select></label>
    <label>Team<select name="team">${adminTeamOptions(user?.team || 'M')}</select></label>
    <label>Monthly target<input name="monthlyTarget" type="number" min="0" value="${Number(user?.monthlyTarget || 0)}"></label>
    <label>Status<select name="active">${adminActiveOptions(user?.active ?? true)}</select></label>
  `;
}

function openUserModal(userId = '') {
  const user = userId ? (app.state.users || []).find(item => item.id === userId) : null;
  if (userId && !user) return toast('User not found', userId);
  const isEdit = Boolean(user);
  $('#user-modal-title').textContent = isEdit ? 'Edit User / Agent' : 'Create User / Agent';
  $('#user-modal-subtitle').textContent = isEdit
    ? 'Update access, role, team and target.'
    : 'Create a new system user or agent.';
  $('#user-form [name="userId"]').value = user?.id || '';
  $('#user-modal-fields').innerHTML = renderUserModalFields(user);
  const deleteButton = $('#user-modal-delete');
  deleteButton.classList.toggle('hidden', !isEdit);
  deleteButton.disabled = !isEdit || user?.id === currentUser().id;
  deleteButton.dataset.deleteUser = user?.id || '';
  $('#user-modal-submit').innerHTML = `${icon(isEdit ? 'save' : 'user-plus')}${isEdit ? 'Save' : 'Create'}`;
  createIcons();
  openModal('user-modal');
}

function openWalletDetailModal(walletId) {
  const wallet = (app.state.wallets || []).find(item => item.id === walletId);
  const body = $('#wallet-modal-body');
  if (!wallet || !body) return;
  app.selectedWalletId = wallet.id;
  $('#wallet-modal-title').textContent = `Wallet ${wallet.name}`;
  $('#wallet-modal-subtitle').textContent = `${assetLabel(wallet)} · ${wallet.status} · suffix ${walletSuffix(wallet.address)}`;
  $('#wallet-modal-subtitle').textContent = `${assetLabel(wallet)} - ${wallet.status} - suffix ${walletSuffix(wallet.address)}`;
  body.innerHTML = renderWalletDetail(wallet);
  bindWalletDetailEvents();
  createIcons();
  openModal('wallet-modal');
}

function openFrozenRoomModal(room) {
  const body = $('#wallet-modal-body');
  if (!body) return;
  const row = frozenRoomRows().find(item => item.room === room);
  $('#wallet-modal-title').textContent = `Frozen Funds - Room ${room}`;
  $('#wallet-modal-subtitle').textContent = row
    ? `${row.wallets} wallet(s) - ${money(row.currentUsd)} live value`
    : 'Frozen room details';
  body.innerHTML = renderFrozenRoomDetails(room);
  bindFrozenRoomModalEvents();
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

function stopPriceAutoRefresh() {
  if (!app.priceRefreshTimer) return;
  clearInterval(app.priceRefreshTimer);
  app.priceRefreshTimer = null;
}

function startPriceAutoRefresh() {
  if (!app.token || app.priceRefreshTimer) return;
  const ttlSeconds = Math.max(30, Number(app.state?.settings?.priceCacheTtlSeconds || 60));
  app.priceRefreshTimer = setInterval(() => {
    if (!app.token || document.hidden) return;
    refreshPrices({ silent: true, force: false });
  }, ttlSeconds * 1000);
}

function stopApprovalWatch() {
  if (!app.approvalWatchTimer) return;
  clearInterval(app.approvalWatchTimer);
  app.approvalWatchTimer = null;
}

function startApprovalWatch() {
  if (!app.token || app.approvalWatchTimer) return;
  app.approvalWatchTimer = setInterval(() => {
    if (!app.token || !canReceiveApprovalPopup()) return;
    loadState().catch(error => toast('Approval watch failed', error.message));
  }, 15000);
}

function stopWalletAutoScan() {
  if (!app.walletScanTimer) return;
  clearInterval(app.walletScanTimer);
  app.walletScanTimer = null;
}

function startWalletAutoScan() {
  if (!app.token || app.walletScanTimer || !canManageWallets()) return;
  const scanEverySeconds = Math.max(60, Number(app.state?.settings?.walletScanEverySeconds || 300));
  app.walletScanTimer = setInterval(() => {
    if (!app.token || document.hidden || !canManageWallets()) return;
    scanIssuedWallets({ silent: true, force: false });
  }, scanEverySeconds * 1000);
}

async function refreshPrices({ silent = false, force = true } = {}) {
  if (app.priceRefreshInFlight) return;
  app.priceRefreshInFlight = true;
  try {
    await api('/api/prices/refresh', { method: 'POST', body: JSON.stringify({ force }) });
    if (!silent) toast('Prices refreshed', 'Live USD values updated.');
    await loadState();
  } catch (error) {
    if (!silent) toast('Price refresh failed', error.message);
  } finally {
    app.priceRefreshInFlight = false;
  }
}

async function scanIssuedWallets({ silent = false, force = false } = {}) {
  if (app.walletScanInFlight || !canManageWallets()) return;
  app.walletScanInFlight = true;
  try {
    const result = await api('/api/wallets/scan-issued', {
      method: 'POST',
      body: JSON.stringify({ force }),
    });
    if (!silent) {
      toast('Issued wallets scanned', result.message || `${result.scanned?.length || 0} wallet(s) scanned.`);
    }
    await loadState();
  } catch (error) {
    if (!silent) toast('Issued scan failed', error.message);
  } finally {
    app.walletScanInFlight = false;
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
  const userId = payload.userId || '';
  delete payload.userId;
  payload.monthlyTarget = Number(payload.monthlyTarget || 0);
  payload.active = payload.active === 'true';
  if (userId && !payload.password) delete payload.password;
  if (userId) {
    await api(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    toast('User saved', payload.username);
  } else {
    await api('/api/users', { method: 'POST', body: JSON.stringify(payload) });
    toast('User created', payload.username);
  }
  closeModal('user-modal');
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
  if (!window.confirm(`Remove access for ${target?.fullName || userId}? History will be preserved.`)) return false;
  await api(`/api/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    body: '{}',
  });
  toast('User removed', target?.username || userId);
  closeModal('user-modal');
  await loadState();
  return true;
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
  payload.priceCacheTtlSeconds = Number(payload.priceCacheTtlSeconds || 60);
  payload.walletScanEverySeconds = Number(payload.walletScanEverySeconds || 300);
  payload.excelCompatibilityMode = payload.excelCompatibilityMode === 'true';
  await api('/api/settings', { method: 'POST', body: JSON.stringify(payload) });
  toast('System settings saved');
  await loadState();
  stopPriceAutoRefresh();
  stopWalletAutoScan();
  startPriceAutoRefresh();
  startWalletAutoScan();
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
    <option value="${escapeHtml(agent.id)}" ${agent.id === me.id ? 'selected' : ''}>${escapeHtml(agent.fullName)} - ${escapeHtml(agent.team)}</option>
  `).join('');
  agentField.classList.toggle('hidden', me.role === 'agent');
  $('#request-brand').innerHTML = (app.state.brands || []).filter(item => item.active).map(brand => `<option>${escapeHtml(brand.name)}</option>`).join('');
  $('#request-room').innerHTML = (app.state.teams || []).map(team => `<option>${escapeHtml(team.name)}</option>`).join('');
  $('#request-exchange').innerHTML = (app.state.exchanges || []).filter(item => item.active).map(exchange => `<option>${escapeHtml(exchange.name)}</option>`).join('');
  $('#request-asset').innerHTML = renderAssetOptions();
  $('#request-asset').value = assetOptionLabel(requestAssetOptions(false)[0]);
  $('#request-withdraw-address').value = '';
  app.withdrawConfirmedAddress = '';
  app.withdrawConfirmedAsset = '';
  updateWithdrawDetectionNote('');
  syncRequestRoom($('#request-form'));
  updateRequestAmountMode($('#request-form'));
}

async function submitRequest(event) {
  event.preventDefault();
  const form = event.currentTarget;
  updateRequestAmountMode(form);
  const payload = Object.fromEntries(new FormData(form).entries());
  delete payload.asset;
  payload.keepInWallet = payload.keepInWallet === 'true';
  if (payload.type === 'Withdraw') {
    const withdrawAddress = cleanWalletAddress(payload.withdrawAddress);
    if (!withdrawAddress) {
      toast('Withdraw wallet required', 'Paste the destination wallet before submitting.');
      return;
    }
    const detected = detectWalletAddressAsset(withdrawAddress);
    const detectedValue = detectedAssetValue(detected);
    const selectedValue = assetDisplayLabel(payload.crypto, payload.network);
    if (!detected || detectedValue !== selectedValue) {
      if (detected && requestAssetOptions(true).some(asset => assetOptionLabel(asset) === detectedValue)) {
        confirmDetectedWithdrawAsset(detected, withdrawAddress);
      } else {
        updateWithdrawDetectionNote('<span class="detect-error">Wallet format does not match an allowed withdraw coin.</span>');
      }
      toast('Confirm wallet asset', 'The system must detect and confirm the withdrawal coin first.');
      return;
    }
    if (app.withdrawConfirmedAddress !== withdrawAddress || app.withdrawConfirmedAsset !== selectedValue) {
      confirmDetectedWithdrawAsset(detected, withdrawAddress);
      toast('Confirm wallet asset', 'Confirm the detected coin, then submit again.');
      return;
    }
    payload.withdrawAddress = withdrawAddress;
    if (payload.crypto === 'USDT') {
      toast('Choose a coin', 'Withdraw requests cannot use USDT. Choose BTC, ETH, SOL or XRP.');
      return;
    }
    const cryptoAmountValue = Number(String(payload.originalAmount || '').replace(/,/g, ''));
    if (!Number.isFinite(cryptoAmountValue) || cryptoAmountValue <= 0) {
      toast('Crypto amount required', 'Withdraw requests must be entered in the selected coin.');
      return;
    }
    payload.depositUsd = 0;
  } else {
    payload.depositUsd = Number(payload.depositUsd || 0);
    if (!Number.isFinite(payload.depositUsd) || payload.depositUsd <= 0) {
      toast('Deposit amount required', 'Deposit USD must be greater than 0.');
      return;
    }
  }
  payload.agentId = requestAgentForForm(form)?.id || currentUser().id;
  payload.room = requestAgentForForm(form)?.team || currentUser().team || '';
  if (payload.type === 'Withdraw') payload.exchange = '';
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
    const message = payload.type === 'Withdraw' ? `${result.request.id} - withdraw waits for approval` : `${result.request.id} - wallet reserved for approval`;
    toast('Request submitted', message);
  }
  form.reset();
  updateRequestAmountMode(form);
  closeModal('request-modal');
  await loadState();
}

async function checkCid() {
  updateRequestAmountMode($('#request-form'));
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
      isWithdrawRequest(request) ? '' : request.depositUsd,
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
      syncApprovalPopup(new Set());
      startPriceAutoRefresh();
      startWalletAutoScan();
      startApprovalWatch();
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
    app.dismissedApprovalAlertIds.clear();
    stopPriceAutoRefresh();
    stopWalletAutoScan();
    stopApprovalWatch();
    closeApprovalPopup();
    localStorage.removeItem('finvaultToken');
    showLogin();
  });

  $('#refresh-btn').addEventListener('click', loadState);
  $('#open-request-top').addEventListener('click', () => {
    if (!requestActionVisible()) return;
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
  $('#request-asset').addEventListener('change', event => setRequestAsset(event.currentTarget.value));
  $('#request-agent').addEventListener('change', event => {
    syncRequestRoom(event.currentTarget.form);
    updateRequestAmountMode(event.currentTarget.form);
  });
  $('#request-withdraw-address').addEventListener('input', () => {
    app.withdrawConfirmedAddress = '';
    app.withdrawConfirmedAsset = '';
    scheduleWithdrawDetection();
  });
  $('#request-withdraw-address').addEventListener('blur', () => detectWithdrawAddress({ prompt: true }));
  $('#detect-withdraw-wallet-btn').addEventListener('click', () => detectWithdrawAddress({ prompt: true }));
  $('#confirm-detected-asset-btn').addEventListener('click', applyDetectedWithdrawAsset);
  $('#request-type').addEventListener('change', event => updateRequestAmountMode(event.currentTarget.form));
  $('#request-form').addEventListener('submit', submitRequest);
  $('#user-form').addEventListener('submit', submitUser);
  $('#user-modal-delete').addEventListener('click', async event => {
    const userId = event.currentTarget.dataset.deleteUser || $('#user-form [name="userId"]').value;
    if (userId) await deleteUser(userId);
  });
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
    startPriceAutoRefresh();
    startWalletAutoScan();
    startApprovalWatch();
  } catch {
    localStorage.removeItem('finvaultToken');
    stopPriceAutoRefresh();
    stopWalletAutoScan();
    stopApprovalWatch();
    closeApprovalPopup();
    showLogin();
  }
}

boot();
