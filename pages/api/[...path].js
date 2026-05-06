import crypto from "node:crypto";
import { Pool } from "pg";

let pool;
let memoryDb;

class SafetyError extends Error {
  constructor(message) {
    super(message);
    this.name = "SafetyError";
  }
}

const PRICE_ASSETS = ["USDT", "BTC", "ETH", "SOL", "XRP"];
const BINANCE_SYMBOLS = {
  BTC: "BTCUSDT",
  ETH: "ETHUSDT",
  SOL: "SOLUSDT",
  XRP: "XRPUSDT"
};
const COINGECKO_IDS = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  USDT: "tether"
};
const TRON_USDT_CONTRACT = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const ETH_USDT_CONTRACT = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

function now() {
  return new Date().toISOString().slice(0, 19);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function toNumber(value, fallback = 0) {
  const normalized = typeof value === "string" ? value.replace(/,/g, "").replace(/[^0-9.-]/g, "") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : fallback;
}

function roundMoney(value) {
  return Math.round(toNumber(value) * 100) / 100;
}

function roundCrypto(value) {
  return Math.round(toNumber(value) * 100000000) / 100000000;
}

function parseOriginalAmount(value) {
  return roundCrypto(toNumber(value, 0));
}

function defaultDb() {
  const createdAt = now();
  return {
    settings: {
      nextRequestNumber: 2401,
      nextWalletNumber: 300,
      ipWhitelistEnabled: false,
      allowedIps: ["*"],
      backupEveryMinutes: 60,
      lowWalletWarningAt: 2,
      currentJournalMonth: currentMonth(),
      excelCompatibilityMode: true,
      priceCacheTtlSeconds: 60
    },
    teams: [
      { id: "team-m", name: "M", description: "Room M", managerId: "user-supervisor" },
      { id: "team-t", name: "T", description: "Room T", managerId: "user-supervisor-t" },
      { id: "team-t2", name: "T2", description: "Room T2", managerId: "user-supervisor-t2" }
    ],
    brands: [
      { id: "brand-goldy-au", name: "Goldy AU", active: true },
      { id: "brand-goldy-eu", name: "Goldy EU", active: true },
      { id: "brand-prime", name: "Prime Desk", active: true }
    ],
    exchanges: [
      "Binance", "Kraken", "Bybit", "OKX", "KuCoin", "Bitfinex", "Gemini",
      "Crypto.com", "Gate.io", "Client's Wallet", "ATM", "TR", "CoinSpot",
      "Coinbase", "BlockEarner", "Strike"
    ].map(name => ({ id: `ex-${name.replace(/[^a-z0-9]/gi, "").toLowerCase()}`, name, active: true })),
    users: [
      { id: "user-admin", username: "admin", password: "admin123", fullName: "System Admin", role: "admin", team: "Ops", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-finance", username: "finance", password: "finance123", fullName: "Finance Manager", role: "finance", team: "Finance", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-supervisor", username: "supervisor", password: "supervisor123", fullName: "Room M Manager", role: "supervisor", team: "M", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-supervisor-t", username: "supervisor_t", password: "supervisor123", fullName: "Room T Manager", role: "supervisor", team: "T", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-supervisor-t2", username: "supervisor_t2", password: "supervisor123", fullName: "Room T2 Manager", role: "supervisor", team: "T2", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-daniel", username: "daniel", password: "agent123", fullName: "Daniel Reed", role: "agent", team: "M", active: true, monthlyTarget: 100000, brandAccess: ["All"] },
      { id: "user-anna", username: "anna", password: "agent123", fullName: "Anna Cohen", role: "agent", team: "T", active: true, monthlyTarget: 100000, brandAccess: ["All"] },
      { id: "user-michael", username: "michael", password: "agent123", fullName: "Michael Stone", role: "agent", team: "T2", active: true, monthlyTarget: 100000, brandAccess: ["All"] }
    ],
    clients: [
      { cid: "884019", name: "Mark Stevens", brand: "Goldy AU", createdAt },
      { cid: "773104", name: "George Hall", brand: "Prime Desk", createdAt }
    ],
    wallets: [
      { id: "w-usdt-trx-071", name: "USDT-TRX-071", address: "TJ7x94jK5wG5RXqLeN9bKqKqD1vB7V9aK2", crypto: "USDT", network: "TRC20", status: "busy", cid: "884019", exchange: "Binance", requestId: "REQ-2398", issuedToClientAt: createdAt, firstAccessAt: createdAt, archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-eth-erc-022", name: "ETH-ERC-022", address: "0x7f2b2f621e9d51c03a9f3f0f5d4f1c8b7a0192c1", crypto: "ETH", network: "ERC20", status: "busy", cid: "773104", exchange: "Client's Wallet", requestId: "REQ-2399", issuedToClientAt: createdAt, firstAccessAt: createdAt, archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-usdt-trx-118", name: "USDT-TRX-118", address: "TP9m44V7cbQqfR9snQw3vRy7LxxHqAKxQ", crypto: "USDT", network: "TRC20", status: "free", cid: "", exchange: "", requestId: "", issuedToClientAt: "", firstAccessAt: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-usdt-trx-119", name: "USDT-TRX-119", address: "TQ8m44V7cbQqfR9snQw3vRy7LxxHqALp9", crypto: "USDT", network: "TRC20", status: "free", cid: "", exchange: "", requestId: "", issuedToClientAt: "", firstAccessAt: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-btc-034", name: "BTC-AU-034", address: "bc1q52t7nw0uv5q9x2p7r8kdllgk4x7u4319pk", crypto: "BTC", network: "Bitcoin", status: "free", cid: "", exchange: "", requestId: "", issuedToClientAt: "", firstAccessAt: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-eth-erc-188", name: "ETH-ERC-188", address: "0xb9e917a099cf67183f6b904d7b6e2c873f9217a0", crypto: "ETH", network: "ERC20", status: "free", cid: "", exchange: "", requestId: "", issuedToClientAt: "", firstAccessAt: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-sol-044", name: "SOL-044", address: "7nV2tKFc9jYqAcJ3kYq4bj73MX9bAVd86kMszxj3aGkP", crypto: "SOL", network: "Solana", status: "free", cid: "", exchange: "", requestId: "", issuedToClientAt: "", firstAccessAt: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-xrp-009", name: "XRP-RPL-009", address: "rN8kP7mA9U2J4Vj3tV6nHhTq6x4Xx42p", crypto: "XRP", network: "Ripple", status: "blocked", cid: "", exchange: "", requestId: "", issuedToClientAt: "", firstAccessAt: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt }
    ],
    assignments: [
      { id: "as-001", cid: "884019", clientName: "Mark Stevens", brand: "Goldy AU", room: "M", agentId: "user-daniel", walletId: "w-usdt-trx-071", crypto: "USDT", network: "TRC20", exchange: "Binance", depositUsd: 8400, requestId: "REQ-2398", assignedAt: createdAt },
      { id: "as-002", cid: "773104", clientName: "George Hall", brand: "Prime Desk", room: "T2", agentId: "user-michael", walletId: "w-eth-erc-022", crypto: "ETH", network: "ERC20", exchange: "Client's Wallet", depositUsd: 3250, requestId: "REQ-2399", assignedAt: createdAt }
    ],
    requests: [
      { id: "REQ-2398", status: "approved", date: today(), agentId: "user-daniel", createdBy: "user-daniel", clientName: "Mark Stevens", cid: "884019", brand: "Goldy AU", room: "M", type: "Deposit", keepInWallet: false, crypto: "USDT", network: "TRC20", exchange: "Binance", originalAmount: "", depositUsd: 8400, notes: "", walletId: "w-usdt-trx-071", rejectReason: "", approvedBy: "user-finance", createdAt, updatedAt: createdAt },
      { id: "REQ-2399", status: "instant", date: today(), agentId: "user-michael", createdBy: "user-michael", clientName: "George Hall", cid: "773104", brand: "Prime Desk", room: "T2", type: "Deposit", keepInWallet: false, crypto: "ETH", network: "ERC20", exchange: "Client's Wallet", originalAmount: "", depositUsd: 3250, notes: "", walletId: "w-eth-erc-022", rejectReason: "", approvedBy: "", createdAt, updatedAt: createdAt }
    ],
    priceCache: {
      USDT: { usd: 1, updatedAt: createdAt, source: "fixed" }
    },
    walletTransactions: [
      { id: "tx-001", walletId: "w-usdt-trx-071", txHash: "request:REQ-2398", amountCrypto: 8400, crypto: "USDT", network: "TRC20", priceUsdAtTx: 1, originalUsd: 8400, receivedAt: createdAt, source: "request", requestId: "REQ-2398", createdAt },
      { id: "tx-002", walletId: "w-eth-erc-022", txHash: "request:REQ-2399", amountCrypto: 1, crypto: "ETH", network: "ERC20", priceUsdAtTx: 3250, originalUsd: 3250, receivedAt: createdAt, source: "request", requestId: "REQ-2399", createdAt }
    ],
    walletScans: [],
    audit: [
      { id: "audit-001", time: createdAt, userId: "system", userName: "System", role: "system", action: "system_initialized", cid: "", walletId: "", requestId: "", details: "FinVault database created", ip: "system" }
    ],
    alerts: [],
    journals: [{ month: currentMonth(), status: "open", createdAt }]
  };
}

function normalizeDb(db) {
  db.settings = db.settings || {};
  if (!db.settings.priceCacheTtlSeconds) db.settings.priceCacheTtlSeconds = 60;
  db.wallets = db.wallets || [];
  db.assignments = db.assignments || [];
  db.requests = db.requests || [];
  db.priceCache = db.priceCache || {};
  db.walletTransactions = db.walletTransactions || [];
  db.walletScans = db.walletScans || [];
  db.priceCache.USDT = { usd: 1, updatedAt: db.priceCache.USDT?.updatedAt || now(), source: "fixed" };
  db.wallets.forEach(wallet => {
    wallet.address = String(wallet.address || "").trim();
    const assignment = db.assignments.find(item =>
      item.walletId === wallet.id && (item.requestId === wallet.requestId || item.cid === wallet.cid)
    ) || db.assignments.find(item => item.walletId === wallet.id);
    const wasIssued = ["busy", "archived"].includes(wallet.status) && (wallet.cid || assignment);
    const issuedFallback = wasIssued ? (assignment?.assignedAt || wallet.createdAt || "") : "";
    if (wallet.issuedToClientAt === undefined) wallet.issuedToClientAt = issuedFallback;
    if (wallet.firstAccessAt === undefined) wallet.firstAccessAt = issuedFallback;
  });
  db.walletTransactions.forEach(tx => {
    tx.amountCrypto = roundCrypto(tx.amountCrypto);
    tx.priceUsdAtTx = roundMoney(tx.priceUsdAtTx);
    tx.originalUsd = roundMoney(tx.originalUsd);
  });
  ensureTransactionsForExistingRequests(db);
  return db;
}

function walletAddressKey(address) {
  return String(address || "").trim().replace(/\s+/g, "").toLowerCase();
}

function livePriceUsd(db, cryptoName) {
  if (cryptoName === "USDT") return 1;
  return roundMoney(db.priceCache?.[cryptoName]?.usd || 0);
}

function amountFromRequest(db, request) {
  const original = parseOriginalAmount(request.originalAmount);
  if (original > 0) return original;
  const price = livePriceUsd(db, request.crypto);
  if (price > 0) return roundCrypto(Number(request.depositUsd || 0) / price);
  return request.crypto === "USDT" ? roundCrypto(request.depositUsd || 0) : 0;
}

function addWalletTransaction(db, wallet, tx) {
  db.walletTransactions = db.walletTransactions || [];
  const txHash = String(tx.txHash || "").trim();
  if (!wallet || !txHash) return null;
  const existing = db.walletTransactions.find(item =>
    item.walletId === wallet.id && String(item.txHash || "").toLowerCase() === txHash.toLowerCase()
  );
  if (existing) return existing;

  const amountCrypto = roundCrypto(tx.amountCrypto);
  if (amountCrypto <= 0) return null;
  const priceUsdAtTx = roundMoney(tx.priceUsdAtTx || livePriceUsd(db, wallet.crypto));
  const originalUsd = roundMoney(tx.originalUsd || (priceUsdAtTx > 0 ? amountCrypto * priceUsdAtTx : 0));
  const record = {
    id: `tx-${crypto.randomUUID().slice(0, 10)}`,
    walletId: wallet.id,
    txHash,
    amountCrypto,
    crypto: tx.crypto || wallet.crypto,
    network: tx.network || wallet.network,
    priceUsdAtTx,
    originalUsd,
    receivedAt: tx.receivedAt || now(),
    source: tx.source || "manual",
    requestId: tx.requestId || "",
    createdAt: now()
  };
  db.walletTransactions.push(record);
  return record;
}

function recordTransactionFromRequest(db, request, wallet, stamp = now()) {
  if (!wallet || !request || !["approved", "instant"].includes(request.status)) return null;
  const amountCrypto = amountFromRequest(db, request);
  if (amountCrypto <= 0) return null;
  const originalUsd = roundMoney(request.depositUsd || 0);
  const priceUsdAtTx = roundMoney(originalUsd / amountCrypto);
  return addWalletTransaction(db, wallet, {
    txHash: `request:${request.id}`,
    amountCrypto,
    priceUsdAtTx,
    originalUsd,
    receivedAt: request.updatedAt || request.createdAt || stamp,
    source: "request",
    requestId: request.id
  });
}

function ensureTransactionsForExistingRequests(db) {
  for (const request of db.requests || []) {
    if (!["approved", "instant"].includes(request.status)) continue;
    if ((db.walletTransactions || []).some(tx => tx.requestId === request.id || tx.txHash === `request:${request.id}`)) continue;
    const wallet = (db.wallets || []).find(item => item.id === request.walletId);
    recordTransactionFromRequest(db, request, wallet, request.updatedAt || request.createdAt || now());
  }
}

function assertDbSafety(db) {
  const walletIds = new Set();
  const walletAddresses = new Map();
  const pendingByWallet = new Map();
  const assignmentByWallet = new Map();
  const requestIds = new Set();
  const txKeys = new Set();

  for (const wallet of db.wallets || []) {
    if (!wallet.id) throw new SafetyError("Wallet safety check failed: wallet without ID.");
    if (walletIds.has(wallet.id)) throw new SafetyError(`Wallet safety check failed: duplicate wallet ID ${wallet.id}.`);
    walletIds.add(wallet.id);

    const addressKey = walletAddressKey(wallet.address);
    if (!addressKey) throw new SafetyError(`Wallet safety check failed: wallet ${wallet.name || wallet.id} has empty address.`);
    if (walletAddresses.has(addressKey)) {
      const existing = walletAddresses.get(addressKey);
      throw new SafetyError(`Wallet safety check failed: duplicate wallet address in ${existing.name || existing.id} and ${wallet.name || wallet.id}.`);
    }
    walletAddresses.set(addressKey, wallet);

    if (wallet.status === "reserved" && !wallet.requestId) {
      throw new SafetyError(`Wallet safety check failed: reserved wallet ${wallet.name || wallet.id} has no request.`);
    }
    if (wallet.status === "busy" && !wallet.cid) {
      throw new SafetyError(`Wallet safety check failed: busy wallet ${wallet.name || wallet.id} has no CID.`);
    }
  }

  for (const request of db.requests || []) {
    if (!request.id) throw new SafetyError("Wallet safety check failed: request without ID.");
    if (requestIds.has(request.id)) throw new SafetyError(`Wallet safety check failed: duplicate request ID ${request.id}.`);
    requestIds.add(request.id);

    if (request.status === "pending" && request.walletId) {
      if (pendingByWallet.has(request.walletId)) {
        throw new SafetyError(`Wallet safety check failed: wallet ${request.walletId} is reserved by more than one pending request.`);
      }
      pendingByWallet.set(request.walletId, request);
    }
  }

  for (const [walletId, request] of pendingByWallet) {
    const wallet = db.wallets.find(item => item.id === walletId);
    if (!wallet) throw new SafetyError(`Wallet safety check failed: pending request ${request.id} points to missing wallet ${walletId}.`);
    if (wallet.status !== "reserved" || wallet.requestId !== request.id) {
      throw new SafetyError(`Wallet safety check failed: pending request ${request.id} is not the only reservation owner for wallet ${wallet.name || wallet.id}.`);
    }
  }

  for (const wallet of db.wallets || []) {
    if (wallet.status === "reserved") {
      const request = pendingByWallet.get(wallet.id);
      if (!request || request.id !== wallet.requestId) {
        throw new SafetyError(`Wallet safety check failed: reserved wallet ${wallet.name || wallet.id} has no matching pending request.`);
      }
    }
    if (wallet.status === "busy" && !(db.assignments || []).some(assignment => assignment.walletId === wallet.id)) {
      throw new SafetyError(`Wallet safety check failed: busy wallet ${wallet.name || wallet.id} has no assignment record.`);
    }
  }

  for (const assignment of db.assignments || []) {
    if (!assignment.walletId) throw new SafetyError("Wallet safety check failed: assignment without wallet.");
    const wallet = db.wallets.find(item => item.id === assignment.walletId);
    if (!wallet) throw new SafetyError(`Wallet safety check failed: assignment points to missing wallet ${assignment.walletId}.`);
    if (!["busy", "archived"].includes(wallet.status)) {
      throw new SafetyError(`Wallet safety check failed: assignment points to wallet ${wallet.name || wallet.id} with status ${wallet.status}.`);
    }

    const key = [assignment.cid, assignment.crypto, assignment.network, assignment.exchange].join("|");
    const previous = assignmentByWallet.get(assignment.walletId);
    if (previous && previous.key !== key) {
      throw new SafetyError(`Wallet safety check failed: wallet ${wallet.name || wallet.id} is assigned to more than one client/exchange combination.`);
    }
    assignmentByWallet.set(assignment.walletId, { key, assignment });

    if (wallet.status === "busy" && (wallet.cid !== assignment.cid || wallet.exchange !== assignment.exchange)) {
      throw new SafetyError(`Wallet safety check failed: busy wallet ${wallet.name || wallet.id} does not match its assignment.`);
    }
  }

  for (const tx of db.walletTransactions || []) {
    if (!tx.walletId) throw new SafetyError("Wallet safety check failed: transaction without wallet.");
    if (!walletIds.has(tx.walletId)) throw new SafetyError(`Wallet safety check failed: transaction points to missing wallet ${tx.walletId}.`);
    const txKey = `${tx.walletId}|${String(tx.txHash || "").toLowerCase()}`;
    if (txKeys.has(txKey)) throw new SafetyError(`Wallet safety check failed: duplicate transaction ${tx.txHash} for wallet ${tx.walletId}.`);
    txKeys.add(txKey);
  }
}

function recordWalletFirstAccess(wallet, stamp = now()) {
  if (wallet && !wallet.firstAccessAt) wallet.firstAccessAt = stamp;
}

function markWalletIssued(wallet, stamp = now()) {
  if (!wallet) return;
  wallet.issuedToClientAt = stamp;
  recordWalletFirstAccess(wallet, stamp);
}

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.POSTGRES_SSL === "false" ? false : { rejectUnauthorized: false }
    });
  }
  return pool;
}

async function ensureStoreTable(client) {
  await client.query(`
    create table if not exists finvault_store (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
}

async function readStore(client, lock = false) {
  await ensureStoreTable(client);
  await client.query(
    "insert into finvault_store (id, data) values ($1, $2::jsonb) on conflict (id) do nothing",
    ["main", JSON.stringify(normalizeDb(defaultDb()))]
  );
  const result = await client.query(`select data from finvault_store where id = $1${lock ? " for update" : ""}`, ["main"]);
  const db = normalizeDb(result.rows[0].data);
  assertDbSafety(db);
  return db;
}

async function loadDb() {
  const dbPool = getPool();
  if (!dbPool) {
    if (!memoryDb) memoryDb = normalizeDb(defaultDb());
    const db = structuredClone(normalizeDb(memoryDb));
    assertDbSafety(db);
    return db;
  }
  return readStore(dbPool, false);
}

async function saveDb(db) {
  assertDbSafety(db);
  const dbPool = getPool();
  if (!dbPool) {
    memoryDb = structuredClone(db);
    return;
  }
  await dbPool.query(
    "update finvault_store set data = $2::jsonb, updated_at = now() where id = $1",
    ["main", JSON.stringify(db)]
  );
}

async function withLockedDb(work) {
  const dbPool = getPool();
  if (!dbPool) {
    const db = await loadDb();
    const response = await work(db);
    if (response.persist !== false && response.status < 400) await saveDb(db);
    return response;
  }

  const client = await dbPool.connect();
  try {
    await client.query("begin");
    const db = await readStore(client, true);
    const response = await work(db);
    if (response.persist !== false && response.status < 400) {
      assertDbSafety(db);
      await client.query(
        "update finvault_store set data = $2::jsonb, updated_at = now() where id = $1",
        ["main", JSON.stringify(db)]
      );
    }
    await client.query("commit");
    return response;
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function fetchJson(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function priceIsFresh(price, ttlSeconds) {
  if (!price?.usd) return false;
  const updatedMs = Date.parse(`${price.updatedAt || ""}Z`);
  return Number.isFinite(updatedMs) && Date.now() - updatedMs < Number(ttlSeconds || 60) * 1000;
}

async function fetchBinancePrice(asset) {
  const symbol = BINANCE_SYMBOLS[asset];
  if (!symbol) return null;
  const data = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
  const price = roundMoney(data?.price);
  return price > 0 ? price : null;
}

async function fetchCoinGeckoPrices() {
  const ids = PRICE_ASSETS.map(asset => COINGECKO_IDS[asset]).filter(Boolean).join(",");
  const data = await fetchJson(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
  const prices = {};
  for (const asset of PRICE_ASSETS) {
    const id = COINGECKO_IDS[asset];
    const price = roundMoney(data?.[id]?.usd);
    if (price > 0) prices[asset] = price;
  }
  return prices;
}

async function refreshLivePrices(db, force = false) {
  db.priceCache = db.priceCache || {};
  db.priceCache.USDT = { usd: 1, updatedAt: now(), source: "fixed" };
  const ttl = Number(db.settings?.priceCacheTtlSeconds || 60);
  const needsRefresh = PRICE_ASSETS.some(asset => !priceIsFresh(db.priceCache[asset], ttl));
  if (!force && !needsRefresh) return db.priceCache;

  const stamp = now();
  const updates = { USDT: 1 };
  const results = await Promise.allSettled(
    PRICE_ASSETS
      .filter(asset => asset !== "USDT")
      .map(async asset => [asset, await fetchBinancePrice(asset)])
  );
  for (const result of results) {
    if (result.status === "fulfilled" && result.value?.[1] > 0) {
      updates[result.value[0]] = result.value[1];
    }
  }

  const missing = PRICE_ASSETS.filter(asset => !updates[asset]);
  if (missing.length) {
    try {
      Object.assign(updates, await fetchCoinGeckoPrices());
    } catch {
      // Cached prices remain usable when both live providers are temporarily unavailable.
    }
  }

  for (const asset of PRICE_ASSETS) {
    const price = roundMoney(updates[asset]);
    if (price > 0) {
      db.priceCache[asset] = {
        usd: price,
        updatedAt: stamp,
        source: asset === "USDT" ? "fixed" : (BINANCE_SYMBOLS[asset] ? "binance" : "coingecko")
      };
    }
  }
  return db.priceCache;
}

async function historicalPriceUsd(db, cryptoName, receivedAt) {
  if (cryptoName === "USDT") return 1;
  const symbol = BINANCE_SYMBOLS[cryptoName];
  if (!symbol || !receivedAt) return livePriceUsd(db, cryptoName);
  const start = Date.parse(receivedAt);
  if (!Number.isFinite(start)) return livePriceUsd(db, cryptoName);
  try {
    const data = await fetchJson(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&startTime=${start}&limit=1`);
    const close = roundMoney(data?.[0]?.[4]);
    return close > 0 ? close : livePriceUsd(db, cryptoName);
  } catch {
    return livePriceUsd(db, cryptoName);
  }
}

async function scanBitcoinIncoming(wallet) {
  const txs = await fetchJson(`https://blockstream.info/api/address/${encodeURIComponent(wallet.address)}/txs`);
  return (Array.isArray(txs) ? txs : []).map(tx => {
    const sats = (tx.vout || [])
      .filter(out => out.scriptpubkey_address === wallet.address)
      .reduce((sum, out) => sum + Number(out.value || 0), 0);
    if (sats <= 0) return null;
    return {
      txHash: tx.txid,
      amountCrypto: sats / 100000000,
      crypto: "BTC",
      network: "Bitcoin",
      receivedAt: tx.status?.block_time ? new Date(tx.status.block_time * 1000).toISOString().slice(0, 19) : now(),
      source: "scan:blockstream"
    };
  }).filter(Boolean);
}

async function scanTrc20UsdtIncoming(wallet) {
  const headers = process.env.TRONGRID_API_KEY ? { "TRON-PRO-API-KEY": process.env.TRONGRID_API_KEY } : {};
  const data = await fetchJson(
    `https://api.trongrid.io/v1/accounts/${encodeURIComponent(wallet.address)}/transactions/trc20?limit=50&only_confirmed=true&contract_address=${TRON_USDT_CONTRACT}`,
    { headers }
  );
  return (Array.isArray(data?.data) ? data.data : []).map(tx => {
    if (String(tx.to || "").toLowerCase() !== wallet.address.toLowerCase()) return null;
    const decimals = Number(tx.token_info?.decimals || 6);
    const amount = Number(tx.value || 0) / (10 ** decimals);
    if (amount <= 0) return null;
    return {
      txHash: tx.transaction_id || tx.txID,
      amountCrypto: amount,
      crypto: "USDT",
      network: "TRC20",
      receivedAt: tx.block_timestamp ? new Date(Number(tx.block_timestamp)).toISOString().slice(0, 19) : now(),
      source: "scan:trongrid"
    };
  }).filter(Boolean);
}

async function scanErc20Incoming(wallet) {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    return {
      unsupported: true,
      message: `Set ETHERSCAN_API_KEY to scan ${wallet.crypto}-${wallet.network}.`
    };
  }
  const address = wallet.address.toLowerCase();
  const action = wallet.crypto === "USDT" ? "tokentx" : "txlist";
  const contract = wallet.crypto === "USDT" ? `&contractaddress=${ETH_USDT_CONTRACT}` : "";
  const data = await fetchJson(
    `https://api.etherscan.io/api?module=account&action=${action}&address=${encodeURIComponent(wallet.address)}${contract}&sort=desc&page=1&offset=50&apikey=${apiKey}`
  );
  const rows = Array.isArray(data?.result) ? data.result : [];
  return rows.map(tx => {
    if (String(tx.to || "").toLowerCase() !== address) return null;
    if (tx.isError && tx.isError !== "0") return null;
    const decimals = wallet.crypto === "USDT" ? Number(tx.tokenDecimal || 6) : 18;
    const amount = Number(tx.value || 0) / (10 ** decimals);
    if (amount <= 0) return null;
    return {
      txHash: tx.hash,
      amountCrypto: amount,
      crypto: wallet.crypto,
      network: wallet.network,
      receivedAt: tx.timeStamp ? new Date(Number(tx.timeStamp) * 1000).toISOString().slice(0, 19) : now(),
      source: "scan:etherscan"
    };
  }).filter(Boolean);
}

async function scanSolanaIncoming(wallet) {
  const signatures = await fetchJson("https://api.mainnet-beta.solana.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "finvault-signatures",
      method: "getSignaturesForAddress",
      params: [wallet.address, { limit: 20 }]
    })
  });
  const rows = Array.isArray(signatures?.result) ? signatures.result : [];
  const transfers = [];
  for (const row of rows) {
    const tx = await fetchJson("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "finvault-transaction",
        method: "getTransaction",
        params: [row.signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]
      })
    });
    const meta = tx?.result?.meta;
    const message = tx?.result?.transaction?.message;
    const keys = (message?.accountKeys || []).map(key => typeof key === "string" ? key : key.pubkey);
    const index = keys.findIndex(key => key === wallet.address);
    if (index < 0 || !meta?.preBalances || !meta?.postBalances) continue;
    const lamports = Number(meta.postBalances[index] || 0) - Number(meta.preBalances[index] || 0);
    if (lamports <= 0) continue;
    transfers.push({
      txHash: row.signature,
      amountCrypto: lamports / 1000000000,
      crypto: "SOL",
      network: "Solana",
      receivedAt: row.blockTime ? new Date(Number(row.blockTime) * 1000).toISOString().slice(0, 19) : now(),
      source: "scan:solana-rpc"
    });
  }
  return transfers;
}

async function scanXrpIncoming(wallet) {
  const data = await fetchJson("https://xrplcluster.com", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      method: "account_tx",
      params: [{
        account: wallet.address,
        ledger_index_min: -1,
        ledger_index_max: -1,
        binary: false,
        limit: 20
      }]
    })
  });
  const rows = Array.isArray(data?.result?.transactions) ? data.result.transactions : [];
  return rows.map(row => {
    const tx = row.tx_json || row.tx || {};
    const meta = row.meta || {};
    if (tx.TransactionType !== "Payment" || tx.Destination !== wallet.address) return null;
    if (meta.TransactionResult && meta.TransactionResult !== "tesSUCCESS") return null;
    if (typeof tx.Amount !== "string") return null;
    const amount = Number(tx.Amount || 0) / 1000000;
    if (amount <= 0) return null;
    return {
      txHash: tx.hash || row.hash,
      amountCrypto: amount,
      crypto: "XRP",
      network: "Ripple",
      receivedAt: tx.date ? new Date((Number(tx.date) + 946684800) * 1000).toISOString().slice(0, 19) : now(),
      source: "scan:xrpl"
    };
  }).filter(Boolean);
}

async function fetchIncomingTransfers(wallet) {
  if (wallet.crypto === "BTC" && wallet.network === "Bitcoin") {
    return { provider: "Blockstream", transfers: await scanBitcoinIncoming(wallet) };
  }
  if (wallet.crypto === "USDT" && wallet.network === "TRC20") {
    return { provider: "TronGrid", transfers: await scanTrc20UsdtIncoming(wallet) };
  }
  if (wallet.network === "ERC20" && ["ETH", "USDT"].includes(wallet.crypto)) {
    const result = await scanErc20Incoming(wallet);
    return result.unsupported ? { provider: "Etherscan", transfers: [], ...result } : { provider: "Etherscan", transfers: result };
  }
  if (wallet.crypto === "SOL" && wallet.network === "Solana") {
    return { provider: "Solana RPC", transfers: await scanSolanaIncoming(wallet) };
  }
  if (wallet.crypto === "XRP" && wallet.network === "Ripple") {
    return { provider: "XRPL", transfers: await scanXrpIncoming(wallet) };
  }
  return {
    provider: "",
    transfers: [],
    unsupported: true,
    message: `Scanner provider is not configured for ${wallet.crypto}-${wallet.network}.`
  };
}

function tokenSecret() {
  return process.env.AUTH_SECRET || "change-this-secret-in-vercel";
}

function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({ userId, iat: Date.now() })).toString("base64url");
  const sig = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  const expected = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).userId;
  } catch {
    return null;
  }
}

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return String(forwarded).split(",")[0].trim();
  return req.socket?.remoteAddress || "";
}

function ipAllowed(db, ip) {
  if (!db.settings.ipWhitelistEnabled) return true;
  return (db.settings.allowedIps || []).some(rule => {
    if (rule === "*" || rule === ip) return true;
    if (String(rule).endsWith("*")) return ip.startsWith(String(rule).slice(0, -1));
    return false;
  });
}

function safeUser(user) {
  if (!user) return null;
  const { password, ...rest } = user;
  return rest;
}

function getUser(db, id) {
  return db.users.find(user => user.id === id);
}

function getUserByLogin(db, username, password) {
  return db.users.find(user => user.username === username && user.password === password && user.active);
}

function canApprove(user) {
  return ["supervisor", "finance", "admin"].includes(user.role);
}

function canManageWallets(user) {
  return ["finance", "admin"].includes(user.role);
}

function canManagePeople(user) {
  return ["finance", "admin"].includes(user.role);
}

function canManageSecurity(user) {
  return user.role === "admin";
}

function addAudit(db, user, action, details, { cid = "", walletId = "", requestId = "", ip = "" } = {}) {
  db.audit.push({
    id: `audit-${crypto.randomUUID().slice(0, 10)}`,
    time: now(),
    userId: user?.id || "system",
    userName: user?.fullName || "System",
    role: user?.role || "system",
    action,
    cid,
    walletId,
    requestId,
    details,
    ip
  });
}

function addAlert(db, level, title, message, targetRoles) {
  db.alerts.push({
    id: `alert-${crypto.randomUUID().slice(0, 10)}`,
    level,
    title,
    message,
    targetRoles,
    createdAt: now(),
    read: false
  });
}

function ensureJournal(db) {
  const month = currentMonth();
  if (db.settings.currentJournalMonth !== month) {
    db.settings.currentJournalMonth = month;
    db.journals.push({ month, status: "open", createdAt: now() });
    addAudit(db, null, "journal_opened", `New monthly journal opened: ${month}`);
  }
}

function findExistingAssignment(db, cid, cryptoName, network, exchange) {
  return db.assignments.find(item => {
    if (item.cid !== cid || item.crypto !== cryptoName || item.network !== network || item.exchange !== exchange) return false;
    const wallet = db.wallets.find(walletItem => walletItem.id === item.walletId);
    return wallet?.status === "busy" && wallet.cid === cid && wallet.exchange === exchange;
  });
}

function findFreeWallet(db, cryptoName, network) {
  return db.wallets.find(item =>
    item.status === "free"
    && item.crypto === cryptoName
    && item.network === network
    && !db.requests.some(request => request.status === "pending" && request.walletId === item.id)
    && !db.assignments.some(assignment => assignment.walletId === item.id)
  );
}

function checkLowWallets(db, cryptoName, network) {
  const count = db.wallets.filter(item => item.status === "free" && item.crypto === cryptoName && item.network === network).length;
  const threshold = Number(db.settings.lowWalletWarningAt || 2);
  if (count === 0) addAlert(db, "danger", `${cryptoName} ${network} empty`, `No free wallets left for ${cryptoName} ${network}.`, ["finance", "admin"]);
  else if (count <= threshold) addAlert(db, "warning", `${cryptoName} ${network} low`, `${count} free wallet(s) left for ${cryptoName} ${network}.`, ["finance", "admin"]);
}

function buildState(db, user) {
  ensureJournal(db);
  let requests = db.requests;
  let assignments = db.assignments;
  let wallets = db.wallets;
  let walletTransactions = db.walletTransactions || [];
  let walletScans = db.walletScans || [];
  let audit = db.audit;
  if (user.role === "agent") {
    requests = requests.filter(item => item.agentId === user.id || item.createdBy === user.id);
    assignments = assignments.filter(item => item.agentId === user.id);
    const walletIds = new Set([...assignments.map(item => item.walletId), ...requests.map(item => item.walletId)].filter(Boolean));
    wallets = wallets.filter(item => walletIds.has(item.id));
    walletTransactions = walletTransactions.filter(item => walletIds.has(item.walletId));
    walletScans = walletScans.filter(item => walletIds.has(item.walletId));
    audit = [];
  }
  const alerts = db.alerts.filter(alert => alert.targetRoles?.includes(user.role) || user.role === "admin");
  return {
    me: safeUser(user),
    settings: db.settings,
    users: db.users.map(safeUser),
    teams: db.teams,
    brands: db.brands,
    exchanges: db.exchanges,
    wallets,
    walletTransactions,
    walletScans,
    priceCache: db.priceCache || {},
    assignments,
    requests,
    audit,
    alerts,
    journals: db.journals
  };
}

function createRequest(db, body, user, ip) {
  const agentId = user.role === "agent" ? user.id : (body.agentId || user.id);
  const agent = getUser(db, agentId);
  if (!agent || agent.role !== "agent") throw new Error("Request owner must be an active agent.");

  const cid = String(body.cid || "").trim();
  const cryptoName = String(body.crypto || "").trim();
  const network = String(body.network || "").trim();
  const exchange = String(body.exchange || "").trim();
  if (!cid || !cryptoName || !network || !exchange) throw new Error("CID, cryptocurrency, network and exchange are required.");

  const requestCreatedAt = now();
  const requestId = `REQ-${db.settings.nextRequestNumber}`;
  db.settings.nextRequestNumber = Number(db.settings.nextRequestNumber || 2401) + 1;
  const existing = findExistingAssignment(db, cid, cryptoName, network, exchange);
  let walletId = "";
  let status = "pending";

  if (existing) {
    walletId = existing.walletId;
    status = "instant";
  } else {
    const wallet = findFreeWallet(db, cryptoName, network);
    if (!wallet) {
      addAlert(db, "danger", `${cryptoName} ${network} empty`, `Agent ${agent.fullName} requested ${cryptoName} ${network} for CID ${cid}, but no free wallet exists.`, ["finance", "admin"]);
      addAudit(db, user, "request_blocked_no_wallet", `No free wallet for ${cryptoName} ${network}`, { cid, requestId, ip });
      return { ok: false, code: "NO_WALLET", message: `No free wallet for ${cryptoName} ${network}. Finance manager and admin were notified.` };
    }
    wallet.status = "reserved";
    wallet.cid = cid;
    wallet.exchange = exchange;
    wallet.requestId = requestId;
    walletId = wallet.id;
  }

  const clientName = String(body.clientName || "").trim();
  const client = db.clients.find(item => item.cid === cid);
  if (!client) db.clients.push({ cid, name: clientName, brand: body.brand || "", createdAt: requestCreatedAt });
  else if (clientName) client.name = clientName;

  const request = {
    id: requestId,
    status,
    date: today(),
    agentId,
    createdBy: user.id,
    clientName,
    cid,
    brand: body.brand || "",
    room: body.room || agent.team || "",
    type: body.type || "Deposit",
    keepInWallet: Boolean(body.keepInWallet),
    crypto: cryptoName,
    network,
    exchange,
    originalAmount: body.originalAmount || "",
    depositUsd: Number(body.depositUsd || 0),
    notes: body.notes || "",
    walletId,
    rejectReason: "",
    approvedBy: "",
    createdAt: requestCreatedAt,
    updatedAt: requestCreatedAt
  };
  db.requests.push(request);

  const wallet = db.wallets.find(item => item.id === walletId);
  if (status === "instant") {
    if (wallet && !wallet.issuedToClientAt) wallet.issuedToClientAt = existing?.assignedAt || requestCreatedAt;
    recordWalletFirstAccess(wallet, requestCreatedAt);
    recordTransactionFromRequest(db, request, wallet, requestCreatedAt);
    addAudit(db, user, "wallet_returned_instantly", "Existing wallet returned for CID + crypto + network + exchange.", { cid, walletId, requestId, ip });
  }
  else {
    addAudit(db, user, "request_created_wallet_reserved", "New request created and wallet reserved for approval.", { cid, walletId, requestId, ip });
    checkLowWallets(db, cryptoName, network);
  }
  return { ok: true, status, request, wallet };
}

function approveRequest(db, requestId, user, ip) {
  if (!canApprove(user)) throw new Error("You do not have approval permission.");
  const request = db.requests.find(item => item.id === requestId);
  if (!request) throw new Error("Request not found.");
  if (request.status !== "pending") throw new Error("Only pending requests can be approved.");
  const wallet = db.wallets.find(item => item.id === request.walletId);
  if (!wallet || wallet.status !== "reserved" || wallet.requestId !== request.id) throw new Error("Wallet is not reserved for this request.");

  const approvedAt = now();
  wallet.status = "busy";
  wallet.cid = request.cid;
  wallet.exchange = request.exchange;
  markWalletIssued(wallet, approvedAt);
  request.status = "approved";
  request.approvedBy = user.id;
  request.updatedAt = approvedAt;
  db.assignments.push({
    id: `as-${crypto.randomUUID().slice(0, 8)}`,
    cid: request.cid,
    clientName: request.clientName,
    brand: request.brand,
    room: request.room,
    agentId: request.agentId,
    walletId: wallet.id,
    crypto: request.crypto,
    network: request.network,
    exchange: request.exchange,
    depositUsd: request.depositUsd,
    requestId: request.id,
    assignedAt: approvedAt
  });
  recordTransactionFromRequest(db, request, wallet, approvedAt);
  addAudit(db, user, "request_approved_wallet_assigned", "Wallet assigned permanently.", { cid: request.cid, walletId: wallet.id, requestId: request.id, ip });
  return { ok: true, request, wallet };
}

function rejectRequest(db, requestId, reason, user, ip) {
  if (!canApprove(user)) throw new Error("You do not have rejection permission.");
  if (!reason) throw new Error("Reject reason is required.");
  const request = db.requests.find(item => item.id === requestId);
  if (!request) throw new Error("Request not found.");
  if (request.status !== "pending") throw new Error("Only pending requests can be rejected.");
  const wallet = db.wallets.find(item => item.id === request.walletId);
  if (wallet && wallet.status === "reserved" && wallet.requestId === request.id) {
    wallet.status = "free";
    wallet.cid = "";
    wallet.exchange = "";
    wallet.requestId = "";
    wallet.issuedToClientAt = "";
    wallet.firstAccessAt = "";
  }
  request.status = "rejected";
  request.rejectReason = reason;
  request.updatedAt = now();
  addAudit(db, user, "request_rejected", `Reason: ${reason}`, { cid: request.cid, walletId: request.walletId, requestId: request.id, ip });
  return { ok: true, request };
}

function changeRequestWallet(db, requestId, user, ip) {
  if (!canApprove(user)) throw new Error("Only supervisor, finance manager or admin can change proposed wallet.");
  const request = db.requests.find(item => item.id === requestId);
  if (!request) throw new Error("Request not found.");
  if (request.status !== "pending") throw new Error("Only pending requests can change wallet.");
  const oldWallet = db.wallets.find(item => item.id === request.walletId);
  const newWallet = db.wallets.find(item => item.status === "free" && item.crypto === request.crypto && item.network === request.network && item.id !== request.walletId);
  if (!newWallet) throw new Error(`No alternative free wallet is available for ${request.crypto} ${request.network}.`);
  if (oldWallet && oldWallet.status === "reserved" && oldWallet.requestId === request.id) {
    oldWallet.status = "free";
    oldWallet.cid = "";
    oldWallet.exchange = "";
    oldWallet.requestId = "";
    oldWallet.issuedToClientAt = "";
    oldWallet.firstAccessAt = "";
  }
  newWallet.status = "reserved";
  newWallet.cid = request.cid;
  newWallet.exchange = request.exchange;
  newWallet.requestId = request.id;
  newWallet.issuedToClientAt = "";
  newWallet.firstAccessAt = "";
  request.walletId = newWallet.id;
  request.updatedAt = now();
  addAudit(db, user, "request_wallet_changed", `Proposed wallet changed from ${oldWallet?.name || "-"} to ${newWallet.name}.`, { cid: request.cid, walletId: newWallet.id, requestId: request.id, ip });
  checkLowWallets(db, request.crypto, request.network);
  return { ok: true, request, wallet: newWallet };
}

function addWallet(db, body, user, ip) {
  if (!canManageWallets(user)) throw new Error("Only finance manager or admin can add wallets.");
  const address = String(body.address || "").trim();
  if (!address) throw new Error("Wallet address is required.");
  const addressKey = walletAddressKey(address);
  if (db.wallets.some(item => walletAddressKey(item.address) === addressKey)) throw new Error("Wallet address already exists.");
  const name = String(body.name || "").trim() || `${body.crypto}-${body.network}-${db.settings.nextWalletNumber++}`;
  const wallet = {
    id: `w-${crypto.randomUUID().slice(0, 10)}`,
    name,
    address,
    crypto: body.crypto || "",
    network: body.network || "",
    status: "free",
    cid: "",
    exchange: "",
    requestId: "",
    issuedToClientAt: "",
    firstAccessAt: "",
    archivedReason: "",
    archivedBy: "",
    archivedAt: "",
    createdAt: now()
  };
  db.wallets.push(wallet);
  addAudit(db, user, "wallet_added", `Wallet added to pool: ${name}`, { walletId: wallet.id, ip });
  return { ok: true, wallet };
}

function archiveWallet(db, walletId, reason, user, ip) {
  if (!canManageWallets(user)) throw new Error("Only finance manager or admin can archive wallets.");
  if (!reason) throw new Error("Archive reason is required.");
  const wallet = db.wallets.find(item => item.id === walletId);
  if (!wallet) throw new Error("Wallet not found.");
  if (wallet.status === "reserved") throw new Error("Reserved wallet cannot be archived. Approve, reject or change the request first.");
  wallet.status = "archived";
  wallet.archivedReason = reason;
  wallet.archivedBy = user.id;
  wallet.archivedAt = now();
  addAudit(db, user, "wallet_archived", `Reason: ${reason}. CID: ${wallet.cid}. Exchange: ${wallet.exchange}.`, { cid: wallet.cid, walletId: wallet.id, requestId: wallet.requestId, ip });
  return { ok: true, wallet };
}

async function scanWallet(db, walletId, user, ip) {
  if (!canManageWallets(user)) throw new Error("Only finance manager or admin can scan wallets.");
  const wallet = db.wallets.find(item => item.id === walletId);
  if (!wallet) throw new Error("Wallet not found.");
  await refreshLivePrices(db);

  const scanStartedAt = now();
  const result = await fetchIncomingTransfers(wallet);
  const added = [];
  for (const transfer of result.transfers || []) {
    const priceUsdAtTx = await historicalPriceUsd(db, transfer.crypto || wallet.crypto, transfer.receivedAt);
    const tx = addWalletTransaction(db, wallet, {
      ...transfer,
      priceUsdAtTx,
      originalUsd: roundMoney(Number(transfer.amountCrypto || 0) * priceUsdAtTx)
    });
    if (tx && tx.createdAt >= scanStartedAt) added.push(tx);
  }

  const scan = {
    id: `scan-${crypto.randomUUID().slice(0, 10)}`,
    walletId: wallet.id,
    provider: result.provider || "",
    status: result.unsupported ? "unsupported" : "completed",
    found: (result.transfers || []).length,
    added: added.length,
    message: result.message || `Found ${(result.transfers || []).length}, added ${added.length}.`,
    scannedBy: user.id,
    scannedAt: now()
  };
  db.walletScans.push(scan);
  addAudit(db, user, "wallet_scanned", scan.message, { cid: wallet.cid, walletId: wallet.id, requestId: wallet.requestId, ip });
  return { ok: true, scan, added, transactions: db.walletTransactions.filter(item => item.walletId === wallet.id) };
}

function clientSearch(db, query, user, ip) {
  query = String(query || "").trim().toLowerCase();
  if (!query) throw new Error("Search query is required.");
  const walletCidMatches = db.wallets.filter(item => item.address.toLowerCase().includes(query)).map(item => item.cid);
  const clients = db.clients.filter(item => item.cid.toLowerCase().includes(query) || item.name.toLowerCase().includes(query) || walletCidMatches.includes(item.cid));
  const results = clients.map(client => {
    const assignments = db.assignments.filter(item => item.cid === client.cid);
    const walletIds = new Set(assignments.map(item => item.walletId));
    const wallets = db.wallets.filter(item => walletIds.has(item.id));
    let history = db.requests.filter(item => item.cid === client.cid);
    if (user.role === "agent") history = history.filter(item => item.agentId === user.id || item.createdBy === user.id);
    return {
      client,
      wallets,
      history,
      totalDeposits: assignments.reduce((sum, item) => sum + Number(item.depositUsd || 0), 0),
      totalWallets: wallets.length,
      lastActivity: history.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]?.updatedAt || ""
    };
  });
  addAudit(db, user, "client_search", `Search: ${query}`, { ip });
  return { ok: true, results };
}

function addUser(db, body, user, ip) {
  if (!canManagePeople(user)) throw new Error("Only finance manager or admin can manage users.");
  const username = String(body.username || "").trim().toLowerCase();
  if (!username) throw new Error("Username is required.");
  if (db.users.some(item => item.username === username)) throw new Error("Username already exists.");
  const newUser = {
    id: `user-${crypto.randomUUID().slice(0, 8)}`,
    username,
    password: body.password || "changeme123",
    fullName: body.fullName || username,
    role: body.role || "agent",
    team: body.team || "M",
    active: true,
    monthlyTarget: Number(body.monthlyTarget || 0),
    brandAccess: ["All"]
  };
  db.users.push(newUser);
  addAudit(db, user, "user_created", `Created user ${username} with role ${newUser.role}.`, { ip });
  return { ok: true, user: safeUser(newUser) };
}

function updateUser(db, userId, body, user, ip) {
  if (!canManagePeople(user)) throw new Error("Only finance manager or admin can manage users.");
  const target = getUser(db, userId);
  if (!target) throw new Error("User not found.");
  const before = { ...target };
  if (body.fullName !== undefined) target.fullName = String(body.fullName || "").trim() || target.fullName;
  if (body.username !== undefined) {
    const username = String(body.username || "").trim().toLowerCase();
    if (!username) throw new Error("Username is required.");
    if (db.users.some(item => item.id !== userId && item.username === username)) throw new Error("Username already exists.");
    target.username = username;
  }
  if (body.password) target.password = String(body.password);
  if (body.role !== undefined) target.role = String(body.role);
  if (body.team !== undefined) target.team = String(body.team);
  if (body.monthlyTarget !== undefined) target.monthlyTarget = Number(body.monthlyTarget || 0);
  if (body.active !== undefined) target.active = Boolean(body.active);
  if (body.brandAccess !== undefined) target.brandAccess = Array.isArray(body.brandAccess) ? body.brandAccess : ["All"];
  addAudit(db, user, "user_updated", `Updated user ${before.username}.`, { ip });
  return { ok: true, user: safeUser(target) };
}

function deactivateUser(db, userId, user, ip) {
  if (!canManagePeople(user)) throw new Error("Only finance manager or admin can remove users.");
  const target = getUser(db, userId);
  if (!target) throw new Error("User not found.");
  if (target.id === user.id) throw new Error("You cannot remove your own active account.");
  target.active = false;
  target.deletedAt = now();
  target.deletedBy = user.id;
  addAudit(db, user, "user_deactivated", `Removed access for ${target.username}. Historical records were preserved.`, { ip });
  return { ok: true, user: safeUser(target) };
}

function updateTeam(db, teamId, body, user, ip) {
  if (!canManagePeople(user)) throw new Error("Only finance manager or admin can manage rooms.");
  const team = db.teams.find(item => item.id === teamId);
  if (!team) throw new Error("Room not found.");
  if (body.name !== undefined) team.name = String(body.name || "").trim() || team.name;
  if (body.description !== undefined) team.description = String(body.description || "");
  if (body.managerId !== undefined) {
    const manager = getUser(db, body.managerId);
    if (!manager || !["supervisor", "finance", "admin"].includes(manager.role)) throw new Error("Room manager must be supervisor, finance manager or admin.");
    team.managerId = body.managerId;
    if (manager.role === "supervisor") manager.team = team.name;
  }
  addAudit(db, user, "room_updated", `Updated room ${team.name}.`, { ip });
  return { ok: true, team };
}

function addBrand(db, body, user, ip) {
  if (!canManagePeople(user)) throw new Error("Only finance manager or admin can manage brands.");
  const name = String(body.name || "").trim();
  if (!name) throw new Error("Brand name is required.");
  if (db.brands.some(item => item.name.toLowerCase() === name.toLowerCase())) throw new Error("Brand already exists.");
  const brand = { id: `brand-${crypto.randomUUID().slice(0, 8)}`, name, active: true };
  db.brands.push(brand);
  addAudit(db, user, "brand_added", `Added brand ${name}.`, { ip });
  return { ok: true, brand };
}

function updateBrand(db, brandId, body, user, ip) {
  if (!canManagePeople(user)) throw new Error("Only finance manager or admin can manage brands.");
  const brand = db.brands.find(item => item.id === brandId);
  if (!brand) throw new Error("Brand not found.");
  if (body.name !== undefined) brand.name = String(body.name || "").trim() || brand.name;
  if (body.active !== undefined) brand.active = Boolean(body.active);
  addAudit(db, user, "brand_updated", `Updated brand ${brand.name}.`, { ip });
  return { ok: true, brand };
}

function addExchange(db, body, user, ip) {
  if (!canManagePeople(user)) throw new Error("Only finance manager or admin can manage exchanges.");
  const name = String(body.name || "").trim();
  if (!name) throw new Error("Exchange name is required.");
  if (db.exchanges.some(item => item.name.toLowerCase() === name.toLowerCase())) throw new Error("Exchange already exists.");
  const exchange = { id: `ex-${crypto.randomUUID().slice(0, 8)}`, name, active: true };
  db.exchanges.push(exchange);
  addAudit(db, user, "exchange_added", `Added exchange ${name}.`, { ip });
  return { ok: true, exchange };
}

function updateExchange(db, exchangeId, body, user, ip) {
  if (!canManagePeople(user)) throw new Error("Only finance manager or admin can manage exchanges.");
  const exchange = db.exchanges.find(item => item.id === exchangeId);
  if (!exchange) throw new Error("Exchange not found.");
  if (body.name !== undefined) exchange.name = String(body.name || "").trim() || exchange.name;
  if (body.active !== undefined) exchange.active = Boolean(body.active);
  addAudit(db, user, "exchange_updated", `Updated exchange ${exchange.name}.`, { ip });
  return { ok: true, exchange };
}

function updateSettings(db, body, user, ip) {
  if (user.role !== "admin") throw new Error("Only admin can change system settings.");
  if (body.lowWalletWarningAt !== undefined) db.settings.lowWalletWarningAt = Number(body.lowWalletWarningAt || 0);
  if (body.backupEveryMinutes !== undefined) db.settings.backupEveryMinutes = Number(body.backupEveryMinutes || 60);
  if (body.excelCompatibilityMode !== undefined) db.settings.excelCompatibilityMode = Boolean(body.excelCompatibilityMode);
  if (body.currentJournalMonth !== undefined) db.settings.currentJournalMonth = String(body.currentJournalMonth || db.settings.currentJournalMonth);
  addAudit(db, user, "system_settings_updated", "System settings updated.", { ip });
  return { ok: true, settings: db.settings };
}

function updateSecurity(db, body, user, ip) {
  if (!canManageSecurity(user)) throw new Error("Only admin can change security settings.");
  if (body.ipWhitelistEnabled !== undefined) db.settings.ipWhitelistEnabled = Boolean(body.ipWhitelistEnabled);
  if (body.allowedIps !== undefined) db.settings.allowedIps = body.allowedIps;
  addAudit(db, user, "security_settings_updated", "IP whitelist settings updated.", { ip });
  return { ok: true, settings: db.settings };
}

function resetDemo(db, user, ip) {
  if (user.role !== "admin") throw new Error("Only admin can reset demo data.");
  const fresh = normalizeDb(defaultDb());
  addAudit(fresh, user, "demo_reset", "Demo data reset.", { ip });
  Object.keys(db).forEach(key => delete db[key]);
  Object.assign(db, fresh);
  return { ok: true, message: "Demo reset." };
}

async function routeRequest(db, req, path, method, ip) {
  if (!ipAllowed(db, ip)) {
    return { status: 403, persist: false, body: { ok: false, error: "IP is not whitelisted.", ip } };
  }

  if (path === "health" && method === "GET") {
    return { status: 200, persist: false, body: { ok: true, app: "FinVault", time: now(), storage: process.env.DATABASE_URL ? "postgres" : "memory" } };
  }

  if (path === "login" && method === "POST") {
    const { username = "", password = "" } = req.body || {};
    const user = getUserByLogin(db, String(username).trim().toLowerCase(), String(password));
    if (!user) return { status: 401, persist: false, body: { ok: false, error: "Invalid login or password." } };
    addAudit(db, user, "login", "User logged in.", { ip });
    return { status: 200, body: { ok: true, token: signToken(user.id), state: buildState(db, user) } };
  }

  const userId = verifyToken(req.headers["x-finvault-token"]);
  const user = getUser(db, userId);
  if (!user) return { status: 401, persist: false, body: { ok: false, error: "Authentication required." } };

  let result;
  if (path === "state" && method === "GET") result = { ok: true, state: buildState(db, user) };
  else if (path === "prices" && method === "GET") result = { ok: true, prices: db.priceCache || {} };
  else if (path === "prices/refresh" && method === "POST") result = { ok: true, prices: await refreshLivePrices(db, true) };
  else if (path === "requests" && method === "POST") {
    await refreshLivePrices(db);
    result = createRequest(db, req.body || {}, user, ip);
  }
  else if (path.match(/^requests\/[^/]+\/approve$/) && method === "POST") {
    await refreshLivePrices(db);
    result = approveRequest(db, path.split("/")[1], user, ip);
  }
  else if (path.match(/^requests\/[^/]+\/reject$/) && method === "POST") result = rejectRequest(db, path.split("/")[1], req.body?.reason || "", user, ip);
  else if (path.match(/^requests\/[^/]+\/change-wallet$/) && method === "POST") result = changeRequestWallet(db, path.split("/")[1], user, ip);
  else if (path === "wallets" && method === "POST") result = addWallet(db, req.body || {}, user, ip);
  else if (path.match(/^wallets\/[^/]+\/scan$/) && method === "POST") result = await scanWallet(db, path.split("/")[1], user, ip);
  else if (path.match(/^wallets\/[^/]+\/archive$/) && method === "POST") result = archiveWallet(db, path.split("/")[1], req.body?.reason || "", user, ip);
  else if (path === "client-search" && method === "POST") result = clientSearch(db, req.body?.query || "", user, ip);
  else if (path === "users" && method === "POST") result = addUser(db, req.body || {}, user, ip);
  else if (path.match(/^users\/[^/]+$/) && method === "PATCH") result = updateUser(db, path.split("/")[1], req.body || {}, user, ip);
  else if (path.match(/^users\/[^/]+$/) && method === "DELETE") result = deactivateUser(db, path.split("/")[1], user, ip);
  else if (path.match(/^teams\/[^/]+$/) && method === "PATCH") result = updateTeam(db, path.split("/")[1], req.body || {}, user, ip);
  else if (path === "brands" && method === "POST") result = addBrand(db, req.body || {}, user, ip);
  else if (path.match(/^brands\/[^/]+$/) && method === "PATCH") result = updateBrand(db, path.split("/")[1], req.body || {}, user, ip);
  else if (path === "exchanges" && method === "POST") result = addExchange(db, req.body || {}, user, ip);
  else if (path.match(/^exchanges\/[^/]+$/) && method === "PATCH") result = updateExchange(db, path.split("/")[1], req.body || {}, user, ip);
  else if (path === "settings" && method === "POST") result = updateSettings(db, req.body || {}, user, ip);
  else if (path === "security" && method === "POST") result = updateSecurity(db, req.body || {}, user, ip);
  else if (path === "backup" && method === "POST") {
    addAudit(db, user, "backup_requested", "Vercel version stores data in Postgres; use database backups from provider.", { ip });
    result = { ok: true, message: "Use your Postgres provider backups on Vercel." };
  } else if (path === "reset-demo" && method === "POST") {
    result = resetDemo(db, user, ip);
  } else {
    return { status: 404, persist: false, body: { ok: false, error: "API route not found." } };
  }

  return { status: 200, body: result };
}

export default async function handler(req, res) {
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : "";
  const method = req.method;
  const ip = clientIp(req);

  try {
    const response = method === "GET"
      ? await routeRequest(await loadDb(), req, path, method, ip)
      : await withLockedDb(db => routeRequest(db, req, path, method, ip));
    return res.status(response.status).json(response.body);
  } catch (error) {
    const status = error instanceof SafetyError ? 409 : 500;
    return res.status(status).json({ ok: false, error: error.message });
  }
}
