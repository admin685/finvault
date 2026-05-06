import crypto from "node:crypto";
import { Pool } from "pg";

let pool;
let memoryDb;

function now() {
  return new Date().toISOString().slice(0, 19);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
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
      excelCompatibilityMode: true
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
      { id: "w-usdt-trx-071", name: "USDT-TRX-071", address: "TJ7x94jK5wG5RXqLeN9bKqKqD1vB7V9aK2", crypto: "USDT", network: "TRC20", status: "busy", cid: "884019", exchange: "Binance", requestId: "REQ-2398", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-eth-erc-022", name: "ETH-ERC-022", address: "0x7f2b2f621e9d51c03a9f3f0f5d4f1c8b7a0192c1", crypto: "ETH", network: "ERC20", status: "busy", cid: "773104", exchange: "Client's Wallet", requestId: "REQ-2399", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-usdt-trx-118", name: "USDT-TRX-118", address: "TP9m44V7cbQqfR9snQw3vRy7LxxHqAKxQ", crypto: "USDT", network: "TRC20", status: "free", cid: "", exchange: "", requestId: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-usdt-trx-119", name: "USDT-TRX-119", address: "TQ8m44V7cbQqfR9snQw3vRy7LxxHqALp9", crypto: "USDT", network: "TRC20", status: "free", cid: "", exchange: "", requestId: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-btc-034", name: "BTC-AU-034", address: "bc1q52t7nw0uv5q9x2p7r8kdllgk4x7u4319pk", crypto: "BTC", network: "Bitcoin", status: "free", cid: "", exchange: "", requestId: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-eth-erc-188", name: "ETH-ERC-188", address: "0xb9e917a099cf67183f6b904d7b6e2c873f9217a0", crypto: "ETH", network: "ERC20", status: "free", cid: "", exchange: "", requestId: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-sol-044", name: "SOL-044", address: "7nV2tKFc9jYqAcJ3kYq4bj73MX9bAVd86kMszxj3aGkP", crypto: "SOL", network: "Solana", status: "free", cid: "", exchange: "", requestId: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt },
      { id: "w-xrp-009", name: "XRP-RPL-009", address: "rN8kP7mA9U2J4Vj3tV6nHhTq6x4Xx42p", crypto: "XRP", network: "Ripple", status: "blocked", cid: "", exchange: "", requestId: "", archivedReason: "", archivedBy: "", archivedAt: "", createdAt }
    ],
    assignments: [
      { id: "as-001", cid: "884019", clientName: "Mark Stevens", brand: "Goldy AU", room: "M", agentId: "user-daniel", walletId: "w-usdt-trx-071", crypto: "USDT", network: "TRC20", exchange: "Binance", depositUsd: 8400, requestId: "REQ-2398", assignedAt: createdAt },
      { id: "as-002", cid: "773104", clientName: "George Hall", brand: "Prime Desk", room: "T2", agentId: "user-michael", walletId: "w-eth-erc-022", crypto: "ETH", network: "ERC20", exchange: "Client's Wallet", depositUsd: 3250, requestId: "REQ-2399", assignedAt: createdAt }
    ],
    requests: [
      { id: "REQ-2398", status: "approved", date: today(), agentId: "user-daniel", createdBy: "user-daniel", clientName: "Mark Stevens", cid: "884019", brand: "Goldy AU", room: "M", type: "Deposit", keepInWallet: false, crypto: "USDT", network: "TRC20", exchange: "Binance", originalAmount: "", depositUsd: 8400, notes: "", walletId: "w-usdt-trx-071", rejectReason: "", approvedBy: "user-finance", createdAt, updatedAt: createdAt },
      { id: "REQ-2399", status: "instant", date: today(), agentId: "user-michael", createdBy: "user-michael", clientName: "George Hall", cid: "773104", brand: "Prime Desk", room: "T2", type: "Deposit", keepInWallet: false, crypto: "ETH", network: "ERC20", exchange: "Client's Wallet", originalAmount: "", depositUsd: 3250, notes: "", walletId: "w-eth-erc-022", rejectReason: "", approvedBy: "", createdAt, updatedAt: createdAt }
    ],
    audit: [
      { id: "audit-001", time: createdAt, userId: "system", userName: "System", role: "system", action: "system_initialized", cid: "", walletId: "", requestId: "", details: "FinVault database created", ip: "system" }
    ],
    alerts: [],
    journals: [{ month: currentMonth(), status: "open", createdAt }]
  };
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

async function loadDb() {
  const dbPool = getPool();
  if (!dbPool) {
    if (!memoryDb) memoryDb = defaultDb();
    return structuredClone(memoryDb);
  }
  await dbPool.query(`
    create table if not exists finvault_store (
      id text primary key,
      data jsonb not null,
      updated_at timestamptz not null default now()
    )
  `);
  const result = await dbPool.query("select data from finvault_store where id = $1", ["main"]);
  if (!result.rows.length) {
    const db = defaultDb();
    await dbPool.query("insert into finvault_store (id, data) values ($1, $2::jsonb)", ["main", JSON.stringify(db)]);
    return db;
  }
  return result.rows[0].data;
}

async function saveDb(db) {
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
  return db.assignments.find(item => item.cid === cid && item.crypto === cryptoName && item.network === network && item.exchange === exchange);
}

function findFreeWallet(db, cryptoName, network) {
  return db.wallets.find(item => item.status === "free" && item.crypto === cryptoName && item.network === network);
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
  let audit = db.audit;
  if (user.role === "agent") {
    requests = requests.filter(item => item.agentId === user.id || item.createdBy === user.id);
    assignments = assignments.filter(item => item.agentId === user.id);
    const walletIds = new Set([...assignments.map(item => item.walletId), ...requests.map(item => item.walletId)].filter(Boolean));
    wallets = wallets.filter(item => walletIds.has(item.id));
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
  if (!client) db.clients.push({ cid, name: clientName, brand: body.brand || "", createdAt: now() });
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
    createdAt: now(),
    updatedAt: now()
  };
  db.requests.push(request);

  const wallet = db.wallets.find(item => item.id === walletId);
  if (status === "instant") addAudit(db, user, "wallet_returned_instantly", "Existing wallet returned for CID + crypto + network + exchange.", { cid, walletId, requestId, ip });
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

  wallet.status = "busy";
  wallet.cid = request.cid;
  wallet.exchange = request.exchange;
  request.status = "approved";
  request.approvedBy = user.id;
  request.updatedAt = now();
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
    assignedAt: now()
  });
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
  }
  newWallet.status = "reserved";
  newWallet.cid = request.cid;
  newWallet.exchange = request.exchange;
  newWallet.requestId = request.id;
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
  if (db.wallets.some(item => item.address === address)) throw new Error("Wallet address already exists.");
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
  wallet.status = "archived";
  wallet.archivedReason = reason;
  wallet.archivedBy = user.id;
  wallet.archivedAt = now();
  addAudit(db, user, "wallet_archived", `Reason: ${reason}. CID: ${wallet.cid}. Exchange: ${wallet.exchange}.`, { cid: wallet.cid, walletId: wallet.id, requestId: wallet.requestId, ip });
  return { ok: true, wallet };
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
  const fresh = defaultDb();
  addAudit(fresh, user, "demo_reset", "Demo data reset.", { ip });
  return fresh;
}

export default async function handler(req, res) {
  const path = Array.isArray(req.query.path) ? req.query.path.join("/") : "";
  const method = req.method;
  const ip = clientIp(req);
  let db = await loadDb();
  try {
    if (!ipAllowed(db, ip)) return res.status(403).json({ ok: false, error: "IP is not whitelisted.", ip });

    if (path === "health" && method === "GET") {
      return res.status(200).json({ ok: true, app: "FinVault", time: now(), storage: process.env.DATABASE_URL ? "postgres" : "memory" });
    }

    if (path === "login" && method === "POST") {
      const { username = "", password = "" } = req.body || {};
      const user = getUserByLogin(db, String(username).trim().toLowerCase(), String(password));
      if (!user) return res.status(401).json({ ok: false, error: "Invalid login or password." });
      addAudit(db, user, "login", "User logged in.", { ip });
      await saveDb(db);
      return res.status(200).json({ ok: true, token: signToken(user.id), state: buildState(db, user) });
    }

    const userId = verifyToken(req.headers["x-finvault-token"]);
    const user = getUser(db, userId);
    if (!user) return res.status(401).json({ ok: false, error: "Authentication required." });

    let result;
    if (path === "state" && method === "GET") result = { ok: true, state: buildState(db, user) };
    else if (path === "requests" && method === "POST") result = createRequest(db, req.body || {}, user, ip);
    else if (path.match(/^requests\/[^/]+\/approve$/) && method === "POST") result = approveRequest(db, path.split("/")[1], user, ip);
    else if (path.match(/^requests\/[^/]+\/reject$/) && method === "POST") result = rejectRequest(db, path.split("/")[1], req.body?.reason || "", user, ip);
    else if (path.match(/^requests\/[^/]+\/change-wallet$/) && method === "POST") result = changeRequestWallet(db, path.split("/")[1], user, ip);
    else if (path === "wallets" && method === "POST") result = addWallet(db, req.body || {}, user, ip);
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
      db = resetDemo(db, user, ip);
      result = { ok: true, message: "Demo reset." };
    } else {
      return res.status(404).json({ ok: false, error: "API route not found." });
    }
    await saveDb(db);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
}
