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

class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const PRICE_ASSETS = ["USDT", "BTC", "ETH", "SOL", "XRP"];
const ASSET_NETWORKS = {
  USDT: ["TRC20", "ERC20", "BEP20"],
  BTC: ["Bitcoin"],
  ETH: ["ERC20"],
  SOL: ["Solana"],
  XRP: ["Ripple"]
};
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

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function dayStamp(days, time = "11:00:00") {
  return `${daysAgo(days)}T${time}`;
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

function nonNegativeMoney(value) {
  return Math.max(0, roundMoney(value));
}

function roundCrypto(value) {
  return Math.round(toNumber(value) * 100000000) / 100000000;
}

function nonNegativeCrypto(value) {
  return Math.max(0, roundCrypto(value));
}

function parseOriginalAmount(value) {
  return nonNegativeCrypto(toNumber(value, 0));
}

function isWithdrawType(type) {
  return String(type || "").trim().toLowerCase() === "withdraw";
}

function assetAllowedForWithdraw(cryptoName) {
  return cryptoName !== "USDT";
}

function assetCatalog() {
  return Object.entries(ASSET_NETWORKS).flatMap(([cryptoName, networks]) =>
    networks.map(network => ({ crypto: cryptoName, network, label: assetDisplayLabel(cryptoName, network) }))
  );
}

function assetDisplayLabel(cryptoName, network) {
  if (cryptoName === "USDT") return network ? `${cryptoName}-${network}` : cryptoName;
  if (cryptoName === "ETH") return network ? `${cryptoName}-${network}` : cryptoName;
  return cryptoName || "-";
}

function legacyAssetLabel(cryptoName, network) {
  return [cryptoName, network].filter(Boolean).join("-");
}

function assetAllowed(cryptoName, network) {
  return (ASSET_NETWORKS[cryptoName] || []).includes(network);
}

function assertAllowedAsset(cryptoName, network) {
  if (!assetAllowed(cryptoName, network)) throw new Error(`Unsupported asset: ${cryptoName}-${network}.`);
}

function normalizedRow(row = {}) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [String(key || "").trim().toLowerCase(), value])
  );
}

function parseAssetText(assetText) {
  const clean = String(assetText || "").trim().toUpperCase();
  if (!clean) return null;
  return assetCatalog().find(item =>
    item.label.toUpperCase() === clean
    || legacyAssetLabel(item.crypto, item.network).toUpperCase() === clean
  ) || null;
}

function cleanWalletAddress(value) {
  return String(value || "").trim().replace(/\s+/g, "");
}

function detectWalletAddressAsset(address) {
  const value = cleanWalletAddress(address);
  if (!value) return null;
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return { crypto: "ETH", network: "ERC20", confidence: "medium" };
  if (/^(bc1)[a-z0-9]{25,90}$/i.test(value) || /^[13][a-km-zA-HJ-NP-Z1-9]{25,40}$/.test(value)) return { crypto: "BTC", network: "Bitcoin", confidence: "high" };
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(value)) return { crypto: "XRP", network: "Ripple", confidence: "high" };
  if (/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value)) return { crypto: "USDT", network: "TRC20", confidence: "medium" };
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) return { crypto: "SOL", network: "Solana", confidence: "medium" };
  return null;
}

function defaultDb() {
  const createdAt = now();
  const db = {
    settings: {
      nextRequestNumber: 2403,
      nextWalletNumber: 9,
      ipWhitelistEnabled: false,
      allowedIps: ["*"],
      backupEveryMinutes: 60,
      lowWalletWarningAt: 2,
      currentJournalMonth: currentMonth(),
      excelCompatibilityMode: true,
      priceCacheTtlSeconds: 60,
      walletScanEverySeconds: 300
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
      { id: "user-owner", username: "owner", password: "owner123", fullName: "Business Owner", role: "owner", team: "Ownership", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-finance", username: "finance", password: "finance123", fullName: "Finance Manager", role: "finance", team: "Finance", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-supervisor", username: "supervisor", password: "supervisor123", fullName: "Room M Manager", role: "supervisor", team: "M", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-supervisor-t", username: "supervisor_t", password: "supervisor123", fullName: "Room T Manager", role: "supervisor", team: "T", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-supervisor-t2", username: "supervisor_t2", password: "supervisor123", fullName: "Room T2 Manager", role: "supervisor", team: "T2", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-screen-m", username: "screen_m", password: "screen123", fullName: "Room M Screen", role: "room_screen", team: "M", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-screen-t", username: "screen_t", password: "screen123", fullName: "Room T Screen", role: "room_screen", team: "T", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-screen-t2", username: "screen_t2", password: "screen123", fullName: "Room T2 Screen", role: "room_screen", team: "T2", active: true, monthlyTarget: 0, brandAccess: ["All"] },
      { id: "user-daniel", username: "daniel", password: "agent123", fullName: "Daniel Reed", role: "agent", team: "M", active: true, monthlyTarget: 100000, brandAccess: ["All"] },
      { id: "user-olivia", username: "olivia", password: "agent123", fullName: "Olivia Hart", role: "agent", team: "M", active: true, monthlyTarget: 90000, brandAccess: ["All"] },
      { id: "user-ethan", username: "ethan", password: "agent123", fullName: "Ethan Cole", role: "agent", team: "M", active: true, monthlyTarget: 95000, brandAccess: ["All"] },
      { id: "user-anna", username: "anna", password: "agent123", fullName: "Anna Cohen", role: "agent", team: "T", active: true, monthlyTarget: 100000, brandAccess: ["All"] },
      { id: "user-mia", username: "mia", password: "agent123", fullName: "Mia Foster", role: "agent", team: "T", active: true, monthlyTarget: 90000, brandAccess: ["All"] },
      { id: "user-lucas", username: "lucas", password: "agent123", fullName: "Lucas Grant", role: "agent", team: "T", active: true, monthlyTarget: 110000, brandAccess: ["All"] },
      { id: "user-michael", username: "michael", password: "agent123", fullName: "Michael Stone", role: "agent", team: "T2", active: true, monthlyTarget: 100000, brandAccess: ["All"] },
      { id: "user-ava", username: "ava", password: "agent123", fullName: "Ava Price", role: "agent", team: "T2", active: true, monthlyTarget: 90000, brandAccess: ["All"] },
      { id: "user-james", username: "james", password: "agent123", fullName: "James Walker", role: "agent", team: "T2", active: true, monthlyTarget: 95000, brandAccess: ["All"] }
    ],
    clients: [
      { cid: "884019", name: "Mark Stevens", brand: "Goldy AU", createdAt },
      { cid: "773104", name: "George Hall", brand: "Prime Desk", createdAt },
      { cid: "991204", name: "Liam Brooks", brand: "Goldy EU", createdAt },
      { cid: "552901", name: "Sofia Turner", brand: "Goldy AU", createdAt },
      { cid: "662118", name: "Noah Miller", brand: "Prime Desk", createdAt }
    ],
    wallets: [
      { id: "w-usdt-trx-071", name: "FK-1", address: "TJ7x94jK5wG5RXqLeN9bKqKqD1vB7V9aK2", crypto: "USDT", network: "TRC20", status: "frozen", cid: "884019", exchange: "Binance", requestId: "REQ-2398", issuedToClientAt: createdAt, firstAccessAt: createdAt, frozenAt: createdAt, frozenByRequestId: "REQ-2398", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-eth-erc-022", name: "FK-2", address: "0x7f2b2f621e9d51c03a9f3f0f5d4f1c8b7a0192c1", crypto: "ETH", network: "ERC20", status: "busy", cid: "773104", exchange: "Client's Wallet", requestId: "REQ-2399", issuedToClientAt: createdAt, firstAccessAt: createdAt, archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-usdt-trx-118", name: "FK-3", address: "TP9m44V7cbQqfR9snQw3vRy7LxxHqAKxQ", crypto: "USDT", network: "TRC20", status: "free", cid: "", exchange: "", requestId: "", issuedToClientAt: "", firstAccessAt: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-usdt-trx-119", name: "FK-4", address: "TQ8m44V7cbQqfR9snQw3vRy7LxxHqALp9", crypto: "USDT", network: "TRC20", status: "free", cid: "", exchange: "", requestId: "", issuedToClientAt: "", firstAccessAt: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-btc-034", name: "FK-5", address: "bc1q52t7nw0uv5q9x2p7r8kdllgk4x7u4319pk", crypto: "BTC", network: "Bitcoin", status: "frozen", cid: "991204", exchange: "Kraken", requestId: "REQ-2400", issuedToClientAt: createdAt, firstAccessAt: createdAt, frozenAt: createdAt, frozenByRequestId: "REQ-2400", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-eth-erc-188", name: "FK-6", address: "0xb9e917a099cf67183f6b904d7b6e2c873f9217a0", crypto: "ETH", network: "ERC20", status: "free", cid: "", exchange: "", requestId: "", issuedToClientAt: "", firstAccessAt: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-sol-044", name: "FK-7", address: "7nV2tKFc9jYqAcJ3kYq4bj73MX9bAVd86kMszxj3aGkP", crypto: "SOL", network: "Solana", status: "busy", cid: "552901", exchange: "OKX", requestId: "REQ-2401", issuedToClientAt: createdAt, firstAccessAt: createdAt, archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-xrp-009", name: "FK-8", address: "rN8kP7mA9U2J4Vj3tV6nHhTq6x4Xx42p", crypto: "XRP", network: "Ripple", status: "frozen", cid: "662118", exchange: "Gate.io", requestId: "REQ-2402", issuedToClientAt: createdAt, firstAccessAt: createdAt, frozenAt: createdAt, frozenByRequestId: "REQ-2402", archivedReason: "", archivedBy: "", archivedAt: "", createdAt }
    ],
    assignments: [
      { id: "as-001", cid: "884019", clientName: "Mark Stevens", brand: "Goldy AU", room: "M", agentId: "user-daniel", walletId: "w-usdt-trx-071", crypto: "USDT", network: "TRC20", exchange: "Binance", depositUsd: 8400, requestId: "REQ-2398", assignedAt: createdAt },
      { id: "as-002", cid: "773104", clientName: "George Hall", brand: "Prime Desk", room: "T2", agentId: "user-michael", walletId: "w-eth-erc-022", crypto: "ETH", network: "ERC20", exchange: "Client's Wallet", depositUsd: 4375, requestId: "REQ-2399", assignedAt: createdAt },
      { id: "as-003", cid: "991204", clientName: "Liam Brooks", brand: "Goldy EU", room: "T", agentId: "user-anna", walletId: "w-btc-034", crypto: "BTC", network: "Bitcoin", exchange: "Kraken", depositUsd: 8330, requestId: "REQ-2400", assignedAt: createdAt },
      { id: "as-004", cid: "552901", clientName: "Sofia Turner", brand: "Goldy AU", room: "T", agentId: "user-anna", walletId: "w-sol-044", crypto: "SOL", network: "Solana", exchange: "OKX", depositUsd: 8625, requestId: "REQ-2401", assignedAt: createdAt },
      { id: "as-005", cid: "662118", clientName: "Noah Miller", brand: "Prime Desk", room: "M", agentId: "user-daniel", walletId: "w-xrp-009", crypto: "XRP", network: "Ripple", exchange: "Gate.io", depositUsd: 2746, requestId: "REQ-2402", assignedAt: createdAt }
    ],
    requests: [
      { id: "REQ-2398", status: "approved", date: today(), agentId: "user-daniel", createdBy: "user-daniel", clientName: "Mark Stevens", cid: "884019", brand: "Goldy AU", room: "M", type: "Deposit", keepInWallet: true, crypto: "USDT", network: "TRC20", exchange: "Binance", originalAmount: "", depositUsd: 8400, notes: "", walletId: "w-usdt-trx-071", rejectReason: "", approvedBy: "user-finance", createdAt, updatedAt: createdAt },
      { id: "REQ-2399", status: "instant", date: today(), agentId: "user-michael", createdBy: "user-michael", clientName: "George Hall", cid: "773104", brand: "Prime Desk", room: "T2", type: "Deposit", keepInWallet: false, crypto: "ETH", network: "ERC20", exchange: "Client's Wallet", originalAmount: "1.35", depositUsd: 4375, notes: "", walletId: "w-eth-erc-022", rejectReason: "", approvedBy: "", createdAt, updatedAt: createdAt },
      { id: "REQ-2400", status: "approved", date: today(), agentId: "user-anna", createdBy: "user-anna", clientName: "Liam Brooks", cid: "991204", brand: "Goldy EU", room: "T", type: "Deposit", keepInWallet: true, crypto: "BTC", network: "Bitcoin", exchange: "Kraken", originalAmount: "0.105", depositUsd: 8330, notes: "Demo BTC incoming split into two TRX records.", walletId: "w-btc-034", rejectReason: "", approvedBy: "user-finance", createdAt, updatedAt: createdAt },
      { id: "REQ-2401", status: "approved", date: today(), agentId: "user-anna", createdBy: "user-anna", clientName: "Sofia Turner", cid: "552901", brand: "Goldy AU", room: "T", type: "Deposit", keepInWallet: false, crypto: "SOL", network: "Solana", exchange: "OKX", originalAmount: "75", depositUsd: 8625, notes: "Demo SOL incoming split into two TRX records.", walletId: "w-sol-044", rejectReason: "", approvedBy: "user-finance", createdAt, updatedAt: createdAt },
      { id: "REQ-2402", status: "approved", date: today(), agentId: "user-daniel", createdBy: "user-daniel", clientName: "Noah Miller", cid: "662118", brand: "Prime Desk", room: "M", type: "Deposit", keepInWallet: true, crypto: "XRP", network: "Ripple", exchange: "Gate.io", originalAmount: "5300", depositUsd: 2746, notes: "Demo XRP incoming split into two TRX records.", walletId: "w-xrp-009", rejectReason: "", approvedBy: "user-finance", createdAt, updatedAt: createdAt },
      { id: "REQ-2380", status: "approved", date: daysAgo(6), agentId: "user-olivia", createdBy: "user-olivia", clientName: "Demo Client 2380", cid: "730180", brand: "Goldy AU", room: "M", type: "Deposit", keepInWallet: false, crypto: "USDT", network: "TRC20", exchange: "Binance", originalAmount: "18500", depositUsd: 18500, notes: "Demo flow history.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(6, "10:05:00"), updatedAt: dayStamp(6, "10:22:00") },
      { id: "REQ-2381", status: "approved", date: daysAgo(6), agentId: "user-ethan", createdBy: "user-ethan", clientName: "Demo WD 2381", cid: "730181", brand: "Goldy EU", room: "M", type: "Withdraw", keepInWallet: false, crypto: "BTC", network: "Bitcoin", exchange: "", originalAmount: "0.022", depositUsd: 1800, withdrawAddress: "bc1qdemo2381withdrawflow000000000000000001", notes: "Demo withdrawal flow.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(6, "14:10:00"), updatedAt: dayStamp(6, "14:26:00") },
      { id: "REQ-2382", status: "approved", date: daysAgo(5), agentId: "user-anna", createdBy: "user-anna", clientName: "Demo Client 2382", cid: "730182", brand: "Goldy EU", room: "T", type: "Deposit", keepInWallet: false, crypto: "ETH", network: "ERC20", exchange: "Kraken", originalAmount: "10.18", depositUsd: 24200, notes: "Demo flow history.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(5, "09:40:00"), updatedAt: dayStamp(5, "10:01:00") },
      { id: "REQ-2383", status: "approved", date: daysAgo(5), agentId: "user-mia", createdBy: "user-mia", clientName: "Demo WD 2383", cid: "730183", brand: "Prime Desk", room: "T", type: "Withdraw", keepInWallet: false, crypto: "SOL", network: "Solana", exchange: "", originalAmount: "35.2", depositUsd: 3100, withdrawAddress: "7nV2tKFc9jYqAcJ3kYq4bj73MX9bAVd86kMszflow5", notes: "Demo withdrawal flow.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(5, "16:35:00"), updatedAt: dayStamp(5, "16:44:00") },
      { id: "REQ-2384", status: "approved", date: daysAgo(4), agentId: "user-lucas", createdBy: "user-lucas", clientName: "Demo Client 2384", cid: "730184", brand: "Goldy AU", room: "T", type: "Deposit", keepInWallet: false, crypto: "USDT", network: "ERC20", exchange: "OKX", originalAmount: "21800", depositUsd: 21800, notes: "Demo flow history.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(4, "11:20:00"), updatedAt: dayStamp(4, "11:41:00") },
      { id: "REQ-2385", status: "approved", date: daysAgo(4), agentId: "user-michael", createdBy: "user-michael", clientName: "Demo WD 2385", cid: "730185", brand: "Prime Desk", room: "T2", type: "Withdraw", keepInWallet: false, crypto: "ETH", network: "ERC20", exchange: "", originalAmount: "1.09", depositUsd: 2600, withdrawAddress: "0x1111111111111111111111111111111111232385", notes: "Demo withdrawal flow.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(4, "15:50:00"), updatedAt: dayStamp(4, "16:04:00") },
      { id: "REQ-2386", status: "approved", date: daysAgo(3), agentId: "user-ava", createdBy: "user-ava", clientName: "Demo Client 2386", cid: "730186", brand: "Goldy EU", room: "T2", type: "Deposit", keepInWallet: false, crypto: "BTC", network: "Bitcoin", exchange: "Bybit", originalAmount: "0.343", depositUsd: 28000, notes: "Demo flow history.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(3, "10:12:00"), updatedAt: dayStamp(3, "10:28:00") },
      { id: "REQ-2387", status: "approved", date: daysAgo(3), agentId: "user-james", createdBy: "user-james", clientName: "Demo WD 2387", cid: "730187", brand: "Goldy AU", room: "T2", type: "Withdraw", keepInWallet: false, crypto: "XRP", network: "Ripple", exchange: "", originalAmount: "4400", depositUsd: 4400, withdrawAddress: "rN8kP7mA9U2J4Vj3tV6nHhTq6x4Xx2387", notes: "Demo withdrawal flow.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(3, "17:05:00"), updatedAt: dayStamp(3, "17:20:00") },
      { id: "REQ-2388", status: "approved", date: daysAgo(2), agentId: "user-daniel", createdBy: "user-daniel", clientName: "Demo Client 2388", cid: "730188", brand: "Prime Desk", room: "M", type: "Deposit", keepInWallet: false, crypto: "USDT", network: "BEP20", exchange: "KuCoin", originalAmount: "25900", depositUsd: 25900, notes: "Demo flow history.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(2, "09:30:00"), updatedAt: dayStamp(2, "09:51:00") },
      { id: "REQ-2389", status: "approved", date: daysAgo(2), agentId: "user-olivia", createdBy: "user-olivia", clientName: "Demo WD 2389", cid: "730189", brand: "Goldy EU", room: "M", type: "Withdraw", keepInWallet: false, crypto: "SOL", network: "Solana", exchange: "", originalAmount: "34.1", depositUsd: 3000, withdrawAddress: "7nV2tKFc9jYqAcJ3kYq4bj73MX9bAVd86kMszflow2", notes: "Demo withdrawal flow.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(2, "14:45:00"), updatedAt: dayStamp(2, "15:02:00") },
      { id: "REQ-2390", status: "approved", date: daysAgo(1), agentId: "user-ethan", createdBy: "user-ethan", clientName: "Demo Client 2390", cid: "730190", brand: "Goldy AU", room: "M", type: "Deposit", keepInWallet: false, crypto: "ETH", network: "ERC20", exchange: "Gate.io", originalAmount: "13.13", depositUsd: 31200, notes: "Demo flow history.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(1, "10:55:00"), updatedAt: dayStamp(1, "11:09:00") },
      { id: "REQ-2391", status: "approved", date: daysAgo(1), agentId: "user-mia", createdBy: "user-mia", clientName: "Demo WD 2391", cid: "730191", brand: "Prime Desk", room: "T", type: "Withdraw", keepInWallet: false, crypto: "BTC", network: "Bitcoin", exchange: "", originalAmount: "0.067", depositUsd: 5500, withdrawAddress: "bc1qdemo2391withdrawflow000000000000000001", notes: "Demo withdrawal flow.", walletId: "", rejectReason: "", approvedBy: "user-finance", createdAt: dayStamp(1, "18:15:00"), updatedAt: dayStamp(1, "18:29:00") }
    ],
    priceCache: {
      USDT: { usd: 1, updatedAt: createdAt, source: "fixed" },
      BTC: { usd: 81530, updatedAt: createdAt, source: "demo" },
      ETH: { usd: 2376, updatedAt: createdAt, source: "demo" },
      SOL: { usd: 88, updatedAt: createdAt, source: "demo" },
      XRP: { usd: 1, updatedAt: createdAt, source: "demo" }
    },
    walletTransactions: [
      { id: "tx-001", walletId: "w-usdt-trx-071", txHash: "TRX-USDT-REQ-2398-A", amountCrypto: 8400, crypto: "USDT", network: "TRC20", priceUsdAtTx: 1, originalUsd: 8400, receivedAt: createdAt, source: "request", requestId: "REQ-2398", createdAt },
      { id: "tx-002", walletId: "w-usdt-trx-071", txHash: "TRX-USDT-SCAN-884019-B", amountCrypto: 1200, crypto: "USDT", network: "TRC20", priceUsdAtTx: 1, originalUsd: 1200, receivedAt: createdAt, source: "scan:tronscan", requestId: "", createdAt },
      { id: "tx-003", walletId: "w-eth-erc-022", txHash: "0xeth2399a7b6e2c873f9217a0c03a9f3f0f5d4f1c8b", amountCrypto: 1, crypto: "ETH", network: "ERC20", priceUsdAtTx: 3250, originalUsd: 3250, receivedAt: createdAt, source: "request", requestId: "REQ-2399", createdAt },
      { id: "tx-004", walletId: "w-eth-erc-022", txHash: "0xeth2399b099cf67183f6b904d7b6e2c873f9217a0", amountCrypto: 0.35, crypto: "ETH", network: "ERC20", priceUsdAtTx: 3214.29, originalUsd: 1125, receivedAt: createdAt, source: "scan:etherscan", requestId: "", createdAt },
      { id: "tx-005", walletId: "w-btc-034", txHash: "btc2399d52t7nw0uv5q9x2p7r8kdllgk4x7u4319a", amountCrypto: 0.08, crypto: "BTC", network: "Bitcoin", priceUsdAtTx: 78500, originalUsd: 6280, receivedAt: createdAt, source: "request", requestId: "REQ-2400", createdAt },
      { id: "tx-006", walletId: "w-btc-034", txHash: "btc2400b52t7nw0uv5q9x2p7r8kdllgk4x7u4319b", amountCrypto: 0.025, crypto: "BTC", network: "Bitcoin", priceUsdAtTx: 82000, originalUsd: 2050, receivedAt: createdAt, source: "scan:blockstream", requestId: "", createdAt },
      { id: "tx-007", walletId: "w-sol-044", txHash: "sol2401Fc9jYqAcJ3kYq4bj73MX9bAVd86kMszxjA", amountCrypto: 60, crypto: "SOL", network: "Solana", priceUsdAtTx: 120, originalUsd: 7200, receivedAt: createdAt, source: "request", requestId: "REQ-2401", createdAt },
      { id: "tx-008", walletId: "w-sol-044", txHash: "sol2401Fc9jYqAcJ3kYq4bj73MX9bAVd86kMszxjB", amountCrypto: 15, crypto: "SOL", network: "Solana", priceUsdAtTx: 95, originalUsd: 1425, receivedAt: createdAt, source: "scan:solscan", requestId: "", createdAt },
      { id: "tx-009", walletId: "w-xrp-009", txHash: "xrp2402P7mA9U2J4Vj3tV6nHhTq6x4Xx42pA", amountCrypto: 4500, crypto: "XRP", network: "Ripple", priceUsdAtTx: 0.5, originalUsd: 2250, receivedAt: createdAt, source: "request", requestId: "REQ-2402", createdAt },
      { id: "tx-010", walletId: "w-xrp-009", txHash: "xrp2402P7mA9U2J4Vj3tV6nHhTq6x4Xx42pB", amountCrypto: 800, crypto: "XRP", network: "Ripple", priceUsdAtTx: 0.62, originalUsd: 496, receivedAt: createdAt, source: "scan:xrpscan", requestId: "", createdAt }
    ],
    walletScans: [],
    audit: [
      { id: "audit-001", time: createdAt, userId: "system", userName: "System", role: "system", action: "system_initialized", cid: "", walletId: "", requestId: "", details: "FinVault database created", ip: "system" }
    ],
    alerts: [],
    journals: [{ month: currentMonth(), status: "open", createdAt }]
  };
  seedWorkingDemoData(db, createdAt);
  return db;
}

function seedWorkingDemoData(db, createdAt) {
  db.settings.nextRequestNumber = Math.max(Number(db.settings.nextRequestNumber || 0), 2406);
  db.settings.nextWalletNumber = Math.max(Number(db.settings.nextWalletNumber || 0), 34);

  const demoClients = [
    ["730180", "Demo Client 2380", "Goldy AU"],
    ["730181", "Demo WD 2381", "Goldy EU"],
    ["730182", "Demo Client 2382", "Goldy EU"],
    ["730183", "Demo WD 2383", "Prime Desk"],
    ["730184", "Demo Client 2384", "Goldy AU"],
    ["730185", "Demo WD 2385", "Prime Desk"],
    ["730186", "Demo Client 2386", "Goldy EU"],
    ["730187", "Demo WD 2387", "Goldy AU"],
    ["730188", "Demo Client 2388", "Prime Desk"],
    ["730189", "Demo WD 2389", "Goldy EU"],
    ["730190", "Demo Client 2390", "Goldy AU"],
    ["730191", "Demo WD 2391", "Prime Desk"],
    ["730203", "Pending Mark AU", "Goldy AU"],
    ["730204", "Pending Lina EU", "Goldy EU"],
    ["730205", "Pending Victor WD", "Prime Desk"],
    ["730192", "Rejected Nina Fox", "Goldy AU"]
  ];
  for (const [cid, name, brand] of demoClients) {
    if (!db.clients.some(client => client.cid === cid)) db.clients.push({ cid, name, brand, createdAt });
  }

  const issuedDemoWallets = [
    {
      requestId: "REQ-2380",
      wallet: { id: "w-demo-2380", name: "FK-9", address: "TDEMO2380USDTTRC20FLOW000000000000000A", crypto: "USDT", network: "TRC20", status: "busy" },
      tx: { txHash: "TRX-DEMO-2380-SCAN-B", amountCrypto: 1400, priceUsdAtTx: 1, originalUsd: 1400, source: "scan:tronscan" }
    },
    {
      requestId: "REQ-2382",
      wallet: { id: "w-demo-2382", name: "FK-10", address: "0x2382000000000000000000000000000000002382", crypto: "ETH", network: "ERC20", status: "frozen" },
      tx: { txHash: "0xscan23820000000000000000000000000000000000", amountCrypto: 0.42, priceUsdAtTx: 2420, originalUsd: 1016.4, source: "scan:etherscan" }
    },
    {
      requestId: "REQ-2384",
      wallet: { id: "w-demo-2384", name: "FK-11", address: "0x2384000000000000000000000000000000002384", crypto: "USDT", network: "ERC20", status: "busy" },
      tx: { txHash: "0xscan23840000000000000000000000000000000000", amountCrypto: 900, priceUsdAtTx: 1, originalUsd: 900, source: "scan:etherscan" }
    },
    {
      requestId: "REQ-2386",
      wallet: { id: "w-demo-2386", name: "FK-12", address: "bc1qdemo2386issuedwallet00000000000000000001", crypto: "BTC", network: "Bitcoin", status: "frozen" },
      tx: { txHash: "btc-demo-2386-scan-b", amountCrypto: 0.018, priceUsdAtTx: 80500, originalUsd: 1449, source: "scan:blockstream" }
    },
    {
      requestId: "REQ-2388",
      wallet: { id: "w-demo-2388", name: "FK-13", address: "0x2388000000000000000000000000000000002388", crypto: "USDT", network: "BEP20", status: "busy" },
      tx: { txHash: "bep20-demo-2388-scan-b", amountCrypto: 2200, priceUsdAtTx: 1, originalUsd: 2200, source: "scan:bscscan" }
    },
    {
      requestId: "REQ-2390",
      wallet: { id: "w-demo-2390", name: "FK-14", address: "0x2390000000000000000000000000000000002390", crypto: "ETH", network: "ERC20", status: "frozen" },
      tx: { txHash: "0xscan23900000000000000000000000000000000000", amountCrypto: 0.64, priceUsdAtTx: 2375, originalUsd: 1520, source: "scan:etherscan" }
    }
  ];

  for (const item of issuedDemoWallets) {
    const request = db.requests.find(entry => entry.id === item.requestId);
    if (!request) continue;
    request.walletId = item.wallet.id;
    request.keepInWallet = item.wallet.status === "frozen";
    item.wallet.cid = request.cid;
    item.wallet.exchange = request.exchange;
    item.wallet.requestId = request.id;
    item.wallet.issuedToClientAt = request.updatedAt || request.createdAt || createdAt;
    item.wallet.firstAccessAt = request.updatedAt || request.createdAt || createdAt;
    item.wallet.frozenAt = item.wallet.status === "frozen" ? item.wallet.issuedToClientAt : "";
    item.wallet.frozenByRequestId = item.wallet.status === "frozen" ? request.id : "";
    item.wallet.archivedReason = "";
    item.wallet.archivedBy = "";
    item.wallet.archivedAt = "";
    item.wallet.createdAt = request.createdAt || createdAt;
    if (!db.wallets.some(wallet => wallet.id === item.wallet.id)) db.wallets.push(item.wallet);
    if (!db.assignments.some(assignment => assignment.requestId === request.id)) {
      db.assignments.push({
        id: `as-${request.id.toLowerCase()}`,
        cid: request.cid,
        clientName: request.clientName,
        brand: request.brand,
        room: request.room,
        agentId: request.agentId,
        walletId: item.wallet.id,
        crypto: request.crypto,
        network: request.network,
        exchange: request.exchange,
        depositUsd: request.depositUsd,
        requestId: request.id,
        assignedAt: request.updatedAt || request.createdAt || createdAt
      });
    }
    if (!db.walletTransactions.some(tx => tx.walletId === item.wallet.id && tx.txHash === item.tx.txHash)) {
      db.walletTransactions.push({
        id: `tx-${request.id.toLowerCase()}-scan`,
        walletId: item.wallet.id,
        txHash: item.tx.txHash,
        amountCrypto: item.tx.amountCrypto,
        crypto: request.crypto,
        network: request.network,
        priceUsdAtTx: item.tx.priceUsdAtTx,
        originalUsd: item.tx.originalUsd,
        receivedAt: request.updatedAt || request.createdAt || createdAt,
        source: item.tx.source,
        requestId: "",
        createdAt: request.updatedAt || request.createdAt || createdAt
      });
    }
    if (!db.walletScans.some(scan => scan.walletId === item.wallet.id)) {
      db.walletScans.push({
        id: `scan-${request.id.toLowerCase()}`,
        walletId: item.wallet.id,
        provider: item.tx.source.replace("scan:", ""),
        status: "completed",
        found: 2,
        added: 1,
        message: `Demo scan found 2 transfer(s), added 1 for ${item.wallet.name}.`,
        scannedBy: "user-finance",
        scannedAt: request.updatedAt || request.createdAt || createdAt
      });
    }
  }

  const moreWallets = [
    { id: "w-reserved-2403", name: "FK-15", address: "TRES2403USDTTRC20FLOW000000000000000A", crypto: "USDT", network: "TRC20", status: "reserved", cid: "730203", exchange: "Binance", requestId: "REQ-2403" },
    { id: "w-reserved-2404", name: "FK-16", address: "0x2404000000000000000000000000000000002404", crypto: "ETH", network: "ERC20", status: "reserved", cid: "730204", exchange: "Kraken", requestId: "REQ-2404" },
    { id: "w-free-usdt-erc-017", name: "FK-17", address: "0xfree170000000000000000000000000000000017", crypto: "USDT", network: "ERC20", status: "free", cid: "", exchange: "", requestId: "" },
    { id: "w-free-usdt-bep-018", name: "FK-18", address: "0xfree180000000000000000000000000000000018", crypto: "USDT", network: "BEP20", status: "free", cid: "", exchange: "", requestId: "" },
    { id: "w-free-btc-019", name: "FK-19", address: "bc1qfree019walletpool0000000000000000000001", crypto: "BTC", network: "Bitcoin", status: "free", cid: "", exchange: "", requestId: "" },
    { id: "w-free-sol-020", name: "FK-20", address: "7FreeSolWallet020Flow00000000000000000000001", crypto: "SOL", network: "Solana", status: "free", cid: "", exchange: "", requestId: "" },
    { id: "w-free-xrp-021", name: "FK-21", address: "rFreeXrpWallet021Flow000000000000000001", crypto: "XRP", network: "Ripple", status: "free", cid: "", exchange: "", requestId: "" }
  ];
  for (const wallet of moreWallets) {
    const fullWallet = {
      issuedToClientAt: "",
      firstAccessAt: "",
      frozenAt: "",
      frozenByRequestId: "",
      archivedReason: "",
      archivedBy: "",
      archivedAt: "",
      createdAt,
      ...wallet
    };
    if (!db.wallets.some(entry => entry.id === fullWallet.id)) db.wallets.push(fullWallet);
  }

  const liveRequests = [
    { id: "REQ-2403", status: "pending", date: today(), agentId: "user-daniel", createdBy: "user-daniel", clientName: "Pending Mark AU", cid: "730203", brand: "Goldy AU", room: "M", type: "Deposit", keepInWallet: true, crypto: "USDT", network: "TRC20", exchange: "Binance", originalAmount: "9100", depositUsd: 9100, notes: "Pending wallet request: reserved wallet awaits finance approval.", walletId: "w-reserved-2403", rejectReason: "", approvedBy: "", createdAt: dayStamp(0, "09:18:00"), updatedAt: dayStamp(0, "09:18:00") },
    { id: "REQ-2404", status: "pending", date: today(), agentId: "user-lucas", createdBy: "user-supervisor-t", clientName: "Pending Lina EU", cid: "730204", brand: "Goldy EU", room: "T", type: "Deposit", keepInWallet: false, crypto: "ETH", network: "ERC20", exchange: "Kraken", originalAmount: "6.31", depositUsd: 15000, notes: "Supervisor created this request for Lucas.", walletId: "w-reserved-2404", rejectReason: "", approvedBy: "", createdAt: dayStamp(0, "10:36:00"), updatedAt: dayStamp(0, "10:36:00") },
    { id: "REQ-2405", status: "pending", date: today(), agentId: "user-ava", createdBy: "user-ava", clientName: "Pending Victor WD", cid: "730205", brand: "Prime Desk", room: "T2", type: "Withdraw", keepInWallet: false, crypto: "BTC", network: "Bitcoin", exchange: "", originalAmount: "0.041", depositUsd: 3343, withdrawAddress: "bc1qpending2405withdrawflow000000000000000001", notes: "Pending crypto withdrawal request.", walletId: "", rejectReason: "", approvedBy: "", createdAt: dayStamp(0, "11:05:00"), updatedAt: dayStamp(0, "11:05:00") },
    { id: "REQ-2392", status: "rejected", date: daysAgo(1), agentId: "user-james", createdBy: "user-james", clientName: "Rejected Nina Fox", cid: "730192", brand: "Goldy AU", room: "T2", type: "Deposit", keepInWallet: false, crypto: "SOL", network: "Solana", exchange: "OKX", originalAmount: "95", depositUsd: 8360, notes: "Rejected demo request.", walletId: "", rejectReason: "Wrong client confirmation document.", approvedBy: "", createdAt: dayStamp(1, "12:20:00"), updatedAt: dayStamp(1, "12:44:00") }
  ];
  for (const request of liveRequests) {
    if (!db.requests.some(entry => entry.id === request.id)) db.requests.push(request);
  }

  const auditItems = [
    ["audit-010", dayStamp(6, "10:22:00"), "user-finance", "Finance Manager", "finance", "request_approved_wallet_assigned", "Approved demo wallet request for Room M.", "730180", "w-demo-2380", "REQ-2380"],
    ["audit-011", dayStamp(5, "10:01:00"), "user-finance", "Finance Manager", "finance", "request_approved_wallet_assigned", "Approved and froze demo wallet for Room T.", "730182", "w-demo-2382", "REQ-2382"],
    ["audit-012", dayStamp(4, "16:04:00"), "user-finance", "Finance Manager", "finance", "withdraw_request_approved", "Approved demo crypto withdrawal.", "730185", "", "REQ-2385"],
    ["audit-013", dayStamp(2, "15:02:00"), "user-finance", "Finance Manager", "finance", "withdraw_request_approved", "Approved demo crypto withdrawal.", "730189", "", "REQ-2389"],
    ["audit-014", dayStamp(1, "12:44:00"), "user-finance", "Finance Manager", "finance", "request_rejected", "Rejected demo request: wrong confirmation document.", "730192", "", "REQ-2392"],
    ["audit-015", dayStamp(0, "09:18:00"), "user-daniel", "Daniel Reed", "agent", "request_created_wallet_reserved", "Reserved FK-15 for approval.", "730203", "w-reserved-2403", "REQ-2403"],
    ["audit-016", dayStamp(0, "10:36:00"), "user-supervisor-t", "Room T Manager", "supervisor", "request_created_wallet_reserved", "Supervisor reserved FK-16 for Lucas.", "730204", "w-reserved-2404", "REQ-2404"],
    ["audit-017", dayStamp(0, "11:05:00"), "user-ava", "Ava Price", "agent", "withdraw_request_created", "Created pending BTC withdrawal request.", "730205", "", "REQ-2405"]
  ];
  for (const [id, time, userId, userName, role, action, details, cid, walletId, requestId] of auditItems) {
    if (!db.audit.some(item => item.id === id)) db.audit.push({ id, time, userId, userName, role, action, cid, walletId, requestId, details, ip: "demo" });
  }

  const alerts = [
    { id: "alert-demo-001", level: "warning", title: "2 wallet requests pending", message: "Room M and Room T have reserved wallets waiting for finance approval.", targetRoles: ["finance", "admin"], createdAt: dayStamp(0, "10:36:00"), read: false },
    { id: "alert-demo-002", level: "danger", title: "BTC withdrawal pending", message: "Room T2 has a BTC withdrawal waiting for approval.", targetRoles: ["finance", "admin"], createdAt: dayStamp(0, "11:05:00"), read: false },
    { id: "alert-demo-003", level: "warning", title: "ETH ERC20 pool low", message: "Only a small number of free ETH-ERC20 wallets remain after current reservations.", targetRoles: ["finance", "admin"], createdAt: dayStamp(0, "11:12:00"), read: false }
  ];
  for (const alert of alerts) {
    if (!db.alerts.some(item => item.id === alert.id)) db.alerts.push(alert);
  }
}

function normalizeDb(db) {
  db.settings = db.settings || {};
  if (!db.settings.priceCacheTtlSeconds) db.settings.priceCacheTtlSeconds = 60;
  if (!db.settings.walletScanEverySeconds) db.settings.walletScanEverySeconds = 300;
  db.wallets = db.wallets || [];
  db.assignments = db.assignments || [];
  db.requests = db.requests || [];
  db.users = db.users || [];
  const requiredDemoUsers = [
    { id: "user-owner", username: "owner", password: "owner123", fullName: "Business Owner", role: "owner", team: "Ownership", active: true, monthlyTarget: 0, brandAccess: ["All"] },
    { id: "user-screen-m", username: "screen_m", password: "screen123", fullName: "Room M Screen", role: "room_screen", team: "M", active: true, monthlyTarget: 0, brandAccess: ["All"] },
    { id: "user-screen-t", username: "screen_t", password: "screen123", fullName: "Room T Screen", role: "room_screen", team: "T", active: true, monthlyTarget: 0, brandAccess: ["All"] },
    { id: "user-screen-t2", username: "screen_t2", password: "screen123", fullName: "Room T2 Screen", role: "room_screen", team: "T2", active: true, monthlyTarget: 0, brandAccess: ["All"] }
  ];
  for (const requiredUser of requiredDemoUsers) {
    if (db.users.some(user => user.id === requiredUser.id || user.username === requiredUser.username)) continue;
    const firstAgentIndex = db.users.findIndex(user => user.role === "agent");
    const insertAt = requiredUser.role === "owner"
      ? Math.min(1, db.users.length)
      : (firstAgentIndex >= 0 ? firstAgentIndex : db.users.length);
    db.users.splice(insertAt, 0, requiredUser);
  }
  db.priceCache = db.priceCache || {};
  db.walletTransactions = db.walletTransactions || [];
  db.walletScans = db.walletScans || [];
  db.priceCache.USDT = { usd: 1, updatedAt: db.priceCache.USDT?.updatedAt || now(), source: "fixed" };
  const legacyDemoWalletNames = {
    "w-usdt-trx-071": "FK-1",
    "w-eth-erc-022": "FK-2",
    "w-usdt-trx-118": "FK-3",
    "w-usdt-trx-119": "FK-4",
    "w-btc-034": "FK-5",
    "w-eth-erc-188": "FK-6",
    "w-sol-044": "FK-7",
    "w-xrp-009": "FK-8"
  };
  db.wallets.forEach(wallet => {
    wallet.address = String(wallet.address || "").trim();
    if (legacyDemoWalletNames[wallet.id]) wallet.name = legacyDemoWalletNames[wallet.id];
    const validWalletStatuses = new Set(["free", "reserved", "busy", "frozen", "archived"]);
    if (!validWalletStatuses.has(wallet.status)) {
      wallet.status = "free";
      wallet.cid = "";
      wallet.exchange = "";
      wallet.requestId = "";
    }
    const assignment = db.assignments.find(item =>
      item.walletId === wallet.id && (item.requestId === wallet.requestId || item.cid === wallet.cid)
    ) || db.assignments.find(item => item.walletId === wallet.id);
    const wasIssued = ["busy", "frozen", "archived"].includes(wallet.status) && (wallet.cid || assignment);
    const issuedFallback = wasIssued ? (assignment?.assignedAt || wallet.createdAt || "") : "";
    if (wallet.issuedToClientAt === undefined) wallet.issuedToClientAt = issuedFallback;
    if (wallet.firstAccessAt === undefined) wallet.firstAccessAt = issuedFallback;
    if (wallet.frozenAt === undefined) wallet.frozenAt = "";
    if (wallet.frozenByRequestId === undefined) wallet.frozenByRequestId = "";
    const frozenRequest = db.requests.find(request =>
      request.walletId === wallet.id && request.keepInWallet && ["approved", "instant"].includes(request.status)
    );
    if (wallet.status === "busy" && frozenRequest) {
      wallet.status = "frozen";
      wallet.frozenAt = wallet.frozenAt || frozenRequest.updatedAt || frozenRequest.createdAt || "";
      wallet.frozenByRequestId = wallet.frozenByRequestId || frozenRequest.id;
    }
  });
  db.requests.forEach(request => {
    request.depositUsd = nonNegativeMoney(request.depositUsd || 0);
    if (request.originalAmount !== undefined && toNumber(request.originalAmount, 0) < 0) request.originalAmount = String(Math.abs(toNumber(request.originalAmount, 0)));
    if (request.withdrawAddress === undefined) request.withdrawAddress = "";
  });
  db.assignments.forEach(assignment => {
    assignment.depositUsd = nonNegativeMoney(assignment.depositUsd || 0);
  });
  const highestFkNumber = db.wallets.reduce((max, wallet) => {
    const match = String(wallet.name || "").match(/^FK-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const currentNextWalletNumber = Number(db.settings.nextWalletNumber);
  if (!Number.isFinite(currentNextWalletNumber) || currentNextWalletNumber <= highestFkNumber || currentNextWalletNumber > 200) {
    db.settings.nextWalletNumber = Math.max(9, highestFkNumber + 1);
  }
  db.walletTransactions.forEach(tx => {
    tx.amountCrypto = nonNegativeCrypto(tx.amountCrypto);
    tx.priceUsdAtTx = nonNegativeMoney(tx.priceUsdAtTx);
    tx.originalUsd = nonNegativeMoney(tx.originalUsd);
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

  const amountCrypto = nonNegativeCrypto(tx.amountCrypto);
  if (amountCrypto <= 0) return null;
  const priceUsdAtTx = nonNegativeMoney(tx.priceUsdAtTx || livePriceUsd(db, wallet.crypto));
  const originalUsd = nonNegativeMoney(tx.originalUsd || (priceUsdAtTx > 0 ? amountCrypto * priceUsdAtTx : 0));
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
  if (isWithdrawType(request.type)) return null;
  const amountCrypto = amountFromRequest(db, request);
  if (amountCrypto <= 0) return null;
  const originalUsd = nonNegativeMoney(request.depositUsd || 0);
  const priceUsdAtTx = nonNegativeMoney(originalUsd / amountCrypto);
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
    if (["busy", "frozen"].includes(wallet.status) && !wallet.cid) {
      throw new SafetyError(`Wallet safety check failed: ${wallet.status} wallet ${wallet.name || wallet.id} has no CID.`);
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
    if (["busy", "frozen"].includes(wallet.status) && !(db.assignments || []).some(assignment => assignment.walletId === wallet.id)) {
      throw new SafetyError(`Wallet safety check failed: ${wallet.status} wallet ${wallet.name || wallet.id} has no assignment record.`);
    }
  }

  for (const assignment of db.assignments || []) {
    if (!assignment.walletId) throw new SafetyError("Wallet safety check failed: assignment without wallet.");
    const wallet = db.wallets.find(item => item.id === assignment.walletId);
    if (!wallet) throw new SafetyError(`Wallet safety check failed: assignment points to missing wallet ${assignment.walletId}.`);
    if (!["busy", "frozen", "archived"].includes(wallet.status)) {
      throw new SafetyError(`Wallet safety check failed: assignment points to wallet ${wallet.name || wallet.id} with status ${wallet.status}.`);
    }

    const key = [assignment.cid, assignment.crypto, assignment.network, assignment.exchange].join("|");
    const previous = assignmentByWallet.get(assignment.walletId);
    if (previous && previous.key !== key) {
      throw new SafetyError(`Wallet safety check failed: wallet ${wallet.name || wallet.id} is assigned to more than one client/exchange combination.`);
    }
    assignmentByWallet.set(assignment.walletId, { key, assignment });

    if (["busy", "frozen"].includes(wallet.status) && (wallet.cid !== assignment.cid || wallet.exchange !== assignment.exchange)) {
      throw new SafetyError(`Wallet safety check failed: ${wallet.status} wallet ${wallet.name || wallet.id} does not match its assignment.`);
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

function markWalletFrozen(wallet, request, stamp = now()) {
  if (!wallet || !request?.keepInWallet) return;
  wallet.status = "frozen";
  wallet.frozenAt = wallet.frozenAt || stamp;
  wallet.frozenByRequestId = wallet.frozenByRequestId || request.id;
}

function walletIssuedForMonitoring(wallet) {
  return ["busy", "frozen"].includes(wallet?.status);
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
  if (!["fixed", "binance", "coingecko"].includes(price.source)) return false;
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
  const sources = { USDT: "fixed" };
  const results = await Promise.allSettled(
    PRICE_ASSETS
      .filter(asset => asset !== "USDT")
      .map(async asset => [asset, await fetchBinancePrice(asset)])
  );
  for (const result of results) {
    if (result.status === "fulfilled" && result.value?.[1] > 0) {
      updates[result.value[0]] = result.value[1];
      sources[result.value[0]] = "binance";
    }
  }

  const missing = PRICE_ASSETS.filter(asset => !updates[asset]);
  if (missing.length) {
    try {
      const fallbackPrices = await fetchCoinGeckoPrices();
      for (const asset of missing) {
        if (fallbackPrices[asset] > 0) {
          updates[asset] = fallbackPrices[asset];
          sources[asset] = "coingecko";
        }
      }
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
        source: sources[asset] || db.priceCache[asset]?.source || "cache"
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

function addressSuffix(address) {
  const text = String(address || "");
  return text ? text.slice(-5) : "";
}

function maskedAddress(address) {
  const suffix = addressSuffix(address);
  return suffix ? `...${suffix}` : "";
}

function ownerSafeWallet(wallet) {
  return {
    ...wallet,
    address: maskedAddress(wallet.address),
    addressSuffix: addressSuffix(wallet.address)
  };
}

function ownerSafeRequest(request) {
  return {
    ...request,
    withdrawAddress: maskedAddress(request.withdrawAddress),
    withdrawAddressSuffix: addressSuffix(request.withdrawAddress)
  };
}

function ownerSafeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    role: user.role,
    team: user.team,
    monthlyTarget: user.monthlyTarget || 0,
    active: Boolean(user.active)
  };
}

function roomScreenSafeRequest(request) {
  if (!request) return null;
  return {
    id: request.id,
    status: request.status,
    date: request.date,
    agentId: request.agentId,
    type: request.type,
    depositUsd: Number(request.depositUsd || 0),
    room: request.room || "",
    createdAt: request.createdAt || "",
    updatedAt: request.updatedAt || ""
  };
}

function getUser(db, id) {
  return db.users.find(user => user.id === id);
}

function getUserByLogin(db, username, password) {
  return db.users.find(user => user.username === username && user.password === password && user.active);
}

function requestRoom(db, request) {
  return request?.room || getUser(db, request?.agentId)?.team || "";
}

function assignmentRoom(db, assignment) {
  return assignment?.room || getUser(db, assignment?.agentId)?.team || "";
}

function canAccessRequest(db, user, request) {
  if (!request || !user) return false;
  if (user.role === "owner") return true;
  if (["finance", "admin"].includes(user.role)) return true;
  if (user.role === "supervisor") return requestRoom(db, request) === user.team;
  if (user.role === "agent") return request.agentId === user.id || request.createdBy === user.id;
  return false;
}

function assertCanAccessRequest(db, user, request, action = "use") {
  if (!canAccessRequest(db, user, request)) {
    throw new ApiError(`You can only ${action} requests from your own room.`, 403);
  }
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
    return ["busy", "frozen"].includes(wallet?.status) && wallet.cid === cid && wallet.exchange === exchange;
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

function scopedData(db, user) {
  let requests = db.requests;
  let assignments = db.assignments;
  let wallets = db.wallets;
  let walletTransactions = db.walletTransactions || [];
  let walletScans = db.walletScans || [];
  let audit = db.audit;
  let users = db.users;
  let teams = db.teams;
  let clients = db.clients;

  if (user.role === "agent") {
    requests = requests.filter(item => item.agentId === user.id || item.createdBy === user.id);
    assignments = assignments.filter(item => item.agentId === user.id);
    const walletIds = new Set([...assignments.map(item => item.walletId), ...requests.map(item => item.walletId)].filter(Boolean));
    wallets = wallets.filter(item => walletIds.has(item.id));
    walletTransactions = walletTransactions.filter(item => walletIds.has(item.walletId));
    walletScans = walletScans.filter(item => walletIds.has(item.walletId));
    users = users.filter(item => item.id === user.id);
    teams = teams.filter(item => item.name === user.team);
    const cids = new Set([...requests.map(item => item.cid), ...assignments.map(item => item.cid)].filter(Boolean));
    clients = clients.filter(item => cids.has(item.cid));
    audit = [];
  } else if (user.role === "supervisor") {
    const room = user.team || "";
    requests = requests.filter(item => requestRoom(db, item) === room);
    assignments = assignments.filter(item => assignmentRoom(db, item) === room);
    const walletIds = new Set([...assignments.map(item => item.walletId), ...requests.map(item => item.walletId)].filter(Boolean));
    const requestIds = new Set(requests.map(item => item.id));
    const cids = new Set([...requests.map(item => item.cid), ...assignments.map(item => item.cid)].filter(Boolean));
    wallets = wallets.filter(item => walletIds.has(item.id));
    walletTransactions = walletTransactions.filter(item => walletIds.has(item.walletId));
    walletScans = walletScans.filter(item => walletIds.has(item.walletId));
    users = users.filter(item => item.id === user.id || (item.role === "agent" && item.team === room));
    teams = teams.filter(item => item.name === room || item.managerId === user.id);
    clients = clients.filter(item => cids.has(item.cid));
    audit = audit.filter(item =>
      (item.requestId && requestIds.has(item.requestId))
      || (item.walletId && walletIds.has(item.walletId))
      || (item.cid && cids.has(item.cid))
      || item.userId === user.id
    );
  } else if (user.role === "room_screen") {
    const room = user.team || "";
    requests = requests.filter(item => requestRoom(db, item) === room);
    users = users.filter(item =>
      item.id === user.id
      || (item.role === "agent" && item.team === room)
      || (item.role === "supervisor" && item.team === room)
    );
    teams = teams.filter(item => item.name === room);
    assignments = [];
    wallets = [];
    walletTransactions = [];
    walletScans = [];
    clients = [];
    audit = [];
  } else if (user.role === "owner") {
    wallets = wallets.filter(walletIssuedForMonitoring);
    const walletIds = new Set(wallets.map(item => item.id));
    const cids = new Set([...requests.map(item => item.cid), ...assignments.map(item => item.cid)].filter(Boolean));
    walletTransactions = walletTransactions.filter(item => walletIds.has(item.walletId));
    walletScans = walletScans.filter(item => walletIds.has(item.walletId));
    users = users.filter(item => ["agent", "supervisor", "owner"].includes(item.role));
    clients = clients.filter(item => cids.has(item.cid));
    audit = [];
  }
  return { requests, assignments, wallets, walletTransactions, walletScans, audit, users, teams, clients };
}

function buildState(db, user) {
  ensureJournal(db);
  const scoped = scopedData(db, user);
  const ownerRole = user.role === "owner";
  const roomScreenRole = user.role === "room_screen";
  const alerts = roomScreenRole ? [] : db.alerts.filter(alert => alert.targetRoles?.includes(user.role) || user.role === "admin");
  return {
    me: safeUser(user),
    settings: db.settings,
    users: (ownerRole || roomScreenRole) ? scoped.users.map(ownerSafeUser) : scoped.users.map(safeUser),
    teams: scoped.teams,
    brands: roomScreenRole ? [] : db.brands,
    exchanges: roomScreenRole ? [] : db.exchanges,
    assets: roomScreenRole ? [] : assetCatalog(),
    wallets: ownerRole ? scoped.wallets.map(ownerSafeWallet) : scoped.wallets,
    walletTransactions: scoped.walletTransactions,
    walletScans: scoped.walletScans,
    priceCache: roomScreenRole ? {} : (db.priceCache || {}),
    assignments: scoped.assignments,
    requests: ownerRole ? scoped.requests.map(ownerSafeRequest) : (roomScreenRole ? scoped.requests.map(roomScreenSafeRequest) : scoped.requests),
    audit: scoped.audit,
    alerts,
    journals: roomScreenRole ? {} : db.journals
  };
}

function createRequest(db, body, user, ip) {
  if (!["agent", "supervisor", "finance", "admin"].includes(user.role)) {
    throw new ApiError("You do not have request creation permission.", 403);
  }
  const agentId = user.role === "agent" ? user.id : (body.agentId || user.id);
  const agent = getUser(db, agentId);
  if (!agent || agent.role !== "agent") throw new Error("Request owner must be an active agent.");
  if (user.role === "supervisor" && agent.team !== user.team) {
    throw new ApiError("Supervisor can create requests only for agents in their own room.", 403);
  }

  const cid = String(body.cid || "").trim();
  const cryptoName = String(body.crypto || "").trim();
  const network = String(body.network || "").trim();
  const requestType = String(body.type || "Deposit").trim() || "Deposit";
  const withdrawRequest = isWithdrawType(requestType);
  const exchange = withdrawRequest ? "" : String(body.exchange || "").trim();
  if (!cid || !cryptoName || !network || (!withdrawRequest && !exchange)) {
    throw new Error(withdrawRequest ? "CID and asset are required." : "CID, asset and exchange are required.");
  }
  assertAllowedAsset(cryptoName, network);
  const cryptoAmount = parseOriginalAmount(body.originalAmount);
  let depositUsd = nonNegativeMoney(body.depositUsd || 0);
  const withdrawAddress = cleanWalletAddress(body.withdrawAddress);
  if (withdrawRequest) {
    if (!assetAllowedForWithdraw(cryptoName)) {
      throw new ApiError("Withdraw requests cannot use USDT. Choose BTC, ETH, SOL or XRP.", 400);
    }
    if (cryptoAmount <= 0) throw new ApiError("Withdraw requests must include the amount in the selected crypto.", 400);
    if (!withdrawAddress) throw new ApiError("Withdraw requests must include the destination wallet.", 400);
    const detected = detectWalletAddressAsset(withdrawAddress);
    if (!detected) throw new ApiError("Destination wallet format cannot be detected.", 400);
    if (detected.crypto !== cryptoName || detected.network !== network) {
      throw new ApiError(`Destination wallet looks like ${assetDisplayLabel(detected.crypto, detected.network)}, not ${assetDisplayLabel(cryptoName, network)}.`, 400);
    }
    const price = livePriceUsd(db, cryptoName);
    if (price <= 0) throw new ApiError(`Live price is unavailable for ${cryptoName}. Try again after prices refresh.`, 503);
    depositUsd = nonNegativeMoney(cryptoAmount * price);
  } else if (depositUsd <= 0) {
    throw new ApiError("Deposit USD must be greater than 0. Deposits cannot be negative or zero.", 400);
  }

  const requestCreatedAt = now();
  const requestId = `REQ-${db.settings.nextRequestNumber}`;
  db.settings.nextRequestNumber = Number(db.settings.nextRequestNumber || 2401) + 1;
  const existing = withdrawRequest ? null : findExistingAssignment(db, cid, cryptoName, network, exchange);
  let walletId = "";
  let status = "pending";

  if (existing) {
    walletId = existing.walletId;
    status = "instant";
  } else if (!withdrawRequest) {
    const wallet = findFreeWallet(db, cryptoName, network);
    if (!wallet) {
      addAlert(db, "danger", `${cryptoName} ${network} empty`, `Agent ${agent.fullName} requested ${cryptoName} ${network} for CID ${cid}, but no free wallet exists.`, ["finance", "admin"]);
      addAudit(db, user, "request_no_wallet_available", `No free wallet for ${cryptoName} ${network}`, { cid, requestId, ip });
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
    room: agent.team || "",
    type: requestType,
    keepInWallet: Boolean(body.keepInWallet),
    crypto: cryptoName,
    network,
    exchange,
    originalAmount: body.originalAmount || "",
    depositUsd,
    withdrawAddress: isWithdrawType(requestType) ? withdrawAddress : "",
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
    markWalletFrozen(wallet, request, requestCreatedAt);
    recordTransactionFromRequest(db, request, wallet, requestCreatedAt);
    addAudit(db, user, "wallet_returned_instantly", "Existing wallet returned for CID + crypto + network + exchange.", { cid, walletId, requestId, ip });
  }
  else {
    if (withdrawRequest) {
      addAudit(db, user, "withdraw_request_created", `Withdraw request created to ${withdrawAddress}.`, { cid, requestId, ip });
    } else {
      addAudit(db, user, "request_created_wallet_reserved", "New request created and wallet reserved for approval.", { cid, walletId, requestId, ip });
      checkLowWallets(db, cryptoName, network);
    }
  }
  return { ok: true, status, request, wallet };
}

function approveRequest(db, requestId, user, ip) {
  if (!canApprove(user)) throw new ApiError("You do not have approval permission.", 403);
  const request = db.requests.find(item => item.id === requestId);
  if (!request) throw new Error("Request not found.");
  assertCanAccessRequest(db, user, request, "approve");
  if (request.status !== "pending") throw new Error("Only pending requests can be approved.");
  if (isWithdrawType(request.type)) {
    const approvedAt = now();
    request.status = "approved";
    request.approvedBy = user.id;
    request.updatedAt = approvedAt;
    addAudit(db, user, "withdraw_request_approved", `Withdraw approved to ${request.withdrawAddress || "-"}.`, { cid: request.cid, requestId: request.id, ip });
    return { ok: true, request, wallet: null };
  }
  const wallet = db.wallets.find(item => item.id === request.walletId);
  if (!wallet || wallet.status !== "reserved" || wallet.requestId !== request.id) throw new Error("Wallet is not reserved for this request.");

  const approvedAt = now();
  wallet.status = request.keepInWallet ? "frozen" : "busy";
  wallet.cid = request.cid;
  wallet.exchange = request.exchange;
  markWalletIssued(wallet, approvedAt);
  markWalletFrozen(wallet, request, approvedAt);
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
  if (!canApprove(user)) throw new ApiError("You do not have rejection permission.", 403);
  if (!reason) throw new Error("Reject reason is required.");
  const request = db.requests.find(item => item.id === requestId);
  if (!request) throw new Error("Request not found.");
  assertCanAccessRequest(db, user, request, "reject");
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
  assertCanAccessRequest(db, user, request, "change");
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
  if (!canManageWallets(user)) throw new ApiError("Only finance manager or admin can add wallets.", 403);
  const address = String(body.address || "").trim();
  if (!address) throw new Error("Wallet address is required.");
  assertAllowedAsset(String(body.crypto || "").trim(), String(body.network || "").trim());
  const addressKey = walletAddressKey(address);
  if (db.wallets.some(item => walletAddressKey(item.address) === addressKey)) throw new Error("Wallet address already exists.");
  const name = String(body.name || "").trim() || `FK-${db.settings.nextWalletNumber++}`;
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
    frozenAt: "",
    frozenByRequestId: "",
    archivedReason: "",
    archivedBy: "",
    archivedAt: "",
    createdAt: now()
  };
  db.wallets.push(wallet);
  addAudit(db, user, "wallet_added", `Wallet added to pool: ${name}`, { walletId: wallet.id, ip });
  return { ok: true, wallet };
}

function bulkAddWallets(db, body, user, ip) {
  if (!canManageWallets(user)) throw new ApiError("Only finance manager or admin can add wallets.", 403);
  const rows = Array.isArray(body.wallets) ? body.wallets : [];
  if (!rows.length) throw new Error("Bulk upload file has no wallet rows.");

  const knownAddresses = new Set(db.wallets.map(wallet => walletAddressKey(wallet.address)));
  const batchAddresses = new Set();
  const errors = [];
  const prepared = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const mapped = normalizedRow(row);
    const address = String(mapped.address || mapped.wallet || mapped["wallet address"] || "").trim();
    const assetText = String(mapped.asset || "").trim();
    const parsedAsset = parseAssetText(assetText);
    const cryptoName = String(mapped.crypto || parsedAsset?.crypto || "").trim();
    const network = String(mapped.network || parsedAsset?.network || "").trim();
    const name = String(mapped.name || "").trim();

    if (!address) {
      errors.push(`Row ${rowNumber}: Address is required.`);
      return;
    }
    const addressKey = walletAddressKey(address);
    if (knownAddresses.has(addressKey)) {
      errors.push(`Row ${rowNumber}: Wallet address already exists.`);
      return;
    }
    if (batchAddresses.has(addressKey)) {
      errors.push(`Row ${rowNumber}: Duplicate address inside file.`);
      return;
    }
    if (!assetAllowed(cryptoName, network)) {
      errors.push(`Row ${rowNumber}: Unsupported asset ${cryptoName}-${network}.`);
      return;
    }
    batchAddresses.add(addressKey);
    prepared.push({ name, address, crypto: cryptoName, network });
  });

  const added = prepared.map(row => {
    const name = row.name || `FK-${db.settings.nextWalletNumber++}`;
    const wallet = {
      id: `w-${crypto.randomUUID().slice(0, 10)}`,
      name,
      address: row.address,
      crypto: row.crypto,
      network: row.network,
      status: "free",
      cid: "",
      exchange: "",
      requestId: "",
      issuedToClientAt: "",
      firstAccessAt: "",
      frozenAt: "",
      frozenByRequestId: "",
      archivedReason: "",
      archivedBy: "",
      archivedAt: "",
      createdAt: now()
    };
    db.wallets.push(wallet);
    knownAddresses.add(walletAddressKey(wallet.address));
    return wallet;
  });

  addAudit(db, user, "wallets_bulk_added", `Bulk wallet upload: ${added.length} added, ${errors.length} skipped.`, { ip });
  return { ok: true, added, errors };
}

function archiveWallet(db, walletId, reason, user, ip) {
  if (!canManageWallets(user)) throw new ApiError("Only finance manager or admin can archive wallets.", 403);
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

function latestWalletScan(db, walletId) {
  return (db.walletScans || [])
    .filter(scan => scan.walletId === walletId)
    .sort((a, b) => String(b.scannedAt).localeCompare(String(a.scannedAt)))[0] || null;
}

function walletScanIsDue(db, wallet, force = false) {
  if (force) return true;
  const latest = latestWalletScan(db, wallet.id);
  if (!latest?.scannedAt) return true;
  const latestMs = Date.parse(`${latest.scannedAt}Z`);
  if (!Number.isFinite(latestMs)) return true;
  const scanEveryMs = Number(db.settings?.walletScanEverySeconds || 300) * 1000;
  return Date.now() - latestMs >= scanEveryMs;
}

async function runWalletScan(db, wallet, user, ip) {
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

async function scanWallet(db, walletId, user, ip) {
  if (!canManageWallets(user)) throw new ApiError("Only finance manager or admin can scan wallets.", 403);
  const wallet = db.wallets.find(item => item.id === walletId);
  if (!wallet) throw new Error("Wallet not found.");
  if (!walletIssuedForMonitoring(wallet)) {
    throw new ApiError("Only issued wallets can be scanned. Free, reserved and archived wallets stay in the pool and are not scanned.", 400);
  }
  await refreshLivePrices(db);
  return runWalletScan(db, wallet, user, ip);
}

async function scanIssuedWallets(db, body, user, ip) {
  if (!canManageWallets(user)) throw new ApiError("Only finance manager or admin can scan wallets.", 403);
  const force = Boolean(body?.force);
  const issuedWallets = db.wallets.filter(walletIssuedForMonitoring);
  await refreshLivePrices(db);

  const scanned = [];
  const skipped = [];
  const failed = [];
  let addedCount = 0;
  for (const wallet of issuedWallets) {
    if (!walletScanIsDue(db, wallet, force)) {
      skipped.push({ walletId: wallet.id, name: wallet.name, reason: "fresh" });
      continue;
    }
    try {
      const result = await runWalletScan(db, wallet, user, ip);
      scanned.push({ walletId: wallet.id, name: wallet.name, scan: result.scan });
      addedCount += result.added?.length || 0;
    } catch (error) {
      failed.push({ walletId: wallet.id, name: wallet.name, error: error.message });
    }
  }

  addAudit(
    db,
    user,
    "issued_wallets_scanned",
    `Issued wallet monitoring scanned ${scanned.length}, skipped ${skipped.length}, failed ${failed.length}, added ${addedCount} transaction(s).`,
    { ip }
  );
  return {
    ok: true,
    scanned,
    skipped,
    failed,
    addedCount,
    message: `${scanned.length} issued wallet(s) scanned, ${skipped.length} fresh, ${failed.length} failed.`
  };
}

function clientSearch(db, query, user, ip) {
  query = String(query || "").trim().toLowerCase();
  if (!query) throw new Error("Search query is required.");
  const scoped = scopedData(db, user);
  const walletCidMatches = scoped.wallets.filter(item => item.address.toLowerCase().includes(query)).map(item => item.cid);
  const clients = scoped.clients.filter(item => item.cid.toLowerCase().includes(query) || item.name.toLowerCase().includes(query) || walletCidMatches.includes(item.cid));
  const results = clients.map(client => {
    const assignments = scoped.assignments.filter(item => item.cid === client.cid);
    const walletIds = new Set(assignments.map(item => item.walletId));
    const wallets = scoped.wallets.filter(item => walletIds.has(item.id));
    const history = scoped.requests.filter(item => item.cid === client.cid);
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
  if (!canManagePeople(user)) throw new ApiError("Only finance manager or admin can manage users.", 403);
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
    active: body.active !== undefined ? Boolean(body.active) : true,
    monthlyTarget: Number(body.monthlyTarget || 0),
    brandAccess: ["All"]
  };
  db.users.push(newUser);
  addAudit(db, user, "user_created", `Created user ${username} with role ${newUser.role}.`, { ip });
  return { ok: true, user: safeUser(newUser) };
}

function updateUser(db, userId, body, user, ip) {
  if (!canManagePeople(user)) throw new ApiError("Only finance manager or admin can manage users.", 403);
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
  if (!canManagePeople(user)) throw new ApiError("Only finance manager or admin can remove users.", 403);
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
  if (!canManagePeople(user)) throw new ApiError("Only finance manager or admin can manage rooms.", 403);
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
  if (!canManagePeople(user)) throw new ApiError("Only finance manager or admin can manage brands.", 403);
  const name = String(body.name || "").trim();
  if (!name) throw new Error("Brand name is required.");
  if (db.brands.some(item => item.name.toLowerCase() === name.toLowerCase())) throw new Error("Brand already exists.");
  const brand = { id: `brand-${crypto.randomUUID().slice(0, 8)}`, name, active: true };
  db.brands.push(brand);
  addAudit(db, user, "brand_added", `Added brand ${name}.`, { ip });
  return { ok: true, brand };
}

function updateBrand(db, brandId, body, user, ip) {
  if (!canManagePeople(user)) throw new ApiError("Only finance manager or admin can manage brands.", 403);
  const brand = db.brands.find(item => item.id === brandId);
  if (!brand) throw new Error("Brand not found.");
  if (body.name !== undefined) brand.name = String(body.name || "").trim() || brand.name;
  if (body.active !== undefined) brand.active = Boolean(body.active);
  addAudit(db, user, "brand_updated", `Updated brand ${brand.name}.`, { ip });
  return { ok: true, brand };
}

function addExchange(db, body, user, ip) {
  if (!canManagePeople(user)) throw new ApiError("Only finance manager or admin can manage exchanges.", 403);
  const name = String(body.name || "").trim();
  if (!name) throw new Error("Exchange name is required.");
  if (db.exchanges.some(item => item.name.toLowerCase() === name.toLowerCase())) throw new Error("Exchange already exists.");
  const exchange = { id: `ex-${crypto.randomUUID().slice(0, 8)}`, name, active: true };
  db.exchanges.push(exchange);
  addAudit(db, user, "exchange_added", `Added exchange ${name}.`, { ip });
  return { ok: true, exchange };
}

function updateExchange(db, exchangeId, body, user, ip) {
  if (!canManagePeople(user)) throw new ApiError("Only finance manager or admin can manage exchanges.", 403);
  const exchange = db.exchanges.find(item => item.id === exchangeId);
  if (!exchange) throw new Error("Exchange not found.");
  if (body.name !== undefined) exchange.name = String(body.name || "").trim() || exchange.name;
  if (body.active !== undefined) exchange.active = Boolean(body.active);
  addAudit(db, user, "exchange_updated", `Updated exchange ${exchange.name}.`, { ip });
  return { ok: true, exchange };
}

function updateSettings(db, body, user, ip) {
  if (user.role !== "admin") throw new ApiError("Only admin can change system settings.", 403);
  if (body.lowWalletWarningAt !== undefined) db.settings.lowWalletWarningAt = Number(body.lowWalletWarningAt || 0);
  if (body.backupEveryMinutes !== undefined) db.settings.backupEveryMinutes = Number(body.backupEveryMinutes || 60);
  if (body.priceCacheTtlSeconds !== undefined) db.settings.priceCacheTtlSeconds = Number(body.priceCacheTtlSeconds || 60);
  if (body.walletScanEverySeconds !== undefined) db.settings.walletScanEverySeconds = Number(body.walletScanEverySeconds || 300);
  if (body.excelCompatibilityMode !== undefined) db.settings.excelCompatibilityMode = Boolean(body.excelCompatibilityMode);
  if (body.currentJournalMonth !== undefined) db.settings.currentJournalMonth = String(body.currentJournalMonth || db.settings.currentJournalMonth);
  addAudit(db, user, "system_settings_updated", "System settings updated.", { ip });
  return { ok: true, settings: db.settings };
}

function updateSecurity(db, body, user, ip) {
  if (!canManageSecurity(user)) throw new ApiError("Only admin can change security settings.", 403);
  if (body.ipWhitelistEnabled !== undefined) db.settings.ipWhitelistEnabled = Boolean(body.ipWhitelistEnabled);
  if (body.allowedIps !== undefined) db.settings.allowedIps = body.allowedIps;
  addAudit(db, user, "security_settings_updated", "IP whitelist settings updated.", { ip });
  return { ok: true, settings: db.settings };
}

function resetDemo(db, user, ip) {
  if (user.role !== "admin") throw new ApiError("Only admin can reset demo data.", 403);
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
    await refreshLivePrices(db);
    addAudit(db, user, "login", "User logged in.", { ip });
    return { status: 200, body: { ok: true, token: signToken(user.id), state: buildState(db, user) } };
  }

  const userId = verifyToken(req.headers["x-finvault-token"]);
  const user = getUser(db, userId);
  if (!user) return { status: 401, persist: false, body: { ok: false, error: "Authentication required." } };

  let result;
  if (path === "state" && method === "GET") {
    await refreshLivePrices(db);
    result = { ok: true, state: buildState(db, user) };
  }
  else if (path === "prices" && method === "GET") result = { ok: true, prices: await refreshLivePrices(db) };
  else if (path === "prices/refresh" && method === "POST") result = { ok: true, prices: await refreshLivePrices(db, req.body?.force !== false) };
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
  else if (path === "wallets/bulk" && method === "POST") result = bulkAddWallets(db, req.body || {}, user, ip);
  else if (path === "wallets/scan-issued" && method === "POST") result = await scanIssuedWallets(db, req.body || {}, user, ip);
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
    const status = error.status || (error instanceof SafetyError ? 409 : 500);
    return res.status(status).json({ ok: false, error: error.message });
  }
}
