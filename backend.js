process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    if (msg.includes('Execution context was destroyed')) {
        console.log('[Puppeteer] Navigation context handled smoothly.');
        return;
    }
    console.warn('[Process] Handled async rejection:', msg);
});
process.on('uncaughtException', (err) => {
    console.error('[Process] Handled uncaught exception:', err.message);
});
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const whatsapp_web_js_1 = require("whatsapp-web.js");
const puppeteer_1 = __importDefault(require("puppeteer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
const crypto_1 = __importDefault(require("crypto"));
const https_1 = __importDefault(require("https"));
const ChatbotRagEngine = require("./chatbot_rag");
const port = 3001;
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Enable CORS and increase JSON limit for Base64 media
app.use((0, cors_1.default)({
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' }));
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    }
});
// ─── Chrome detection ────────────────────────────────────────────────────────
function findChrome() {
    if (process.env.CHROME_PATH && fs_1.default.existsSync(process.env.CHROME_PATH)) {
        console.log("Using CHROME_PATH:", process.env.CHROME_PATH);
        return process.env.CHROME_PATH;
    }
    const candidates = [
        process.env.LOCALAPPDATA && path_1.default.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe"),
        process.env.PROGRAMFILES && path_1.default.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
        process.env["PROGRAMFILES(X86)"] && path_1.default.join(process.env["PROGRAMFILES(X86)"], "Google", "Chrome", "Application", "chrome.exe"),
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        process.env.PROGRAMFILES && path_1.default.join(process.env.PROGRAMFILES, "Microsoft", "Edge", "Application", "msedge.exe"),
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].filter(Boolean);
    for (const candidate of candidates) {
        if (fs_1.default.existsSync(candidate)) {
            console.log("Found browser at:", candidate);
            return candidate;
        }
    }
    console.warn("No Chrome/Edge found! WhatsApp may fail to initialize.");
    return undefined;
}
const chromePath = findChrome();
// ─── Machine Identification ──────────────────────────────────────────────────
function getMachineId() {
    const rawId = `${os_1.default.hostname()}-${os_1.default.platform()}-${os_1.default.arch()}-${os_1.default.cpus().length}`;
    // Create a stable hash
    return crypto_1.default.createHash("sha256").update(rawId).digest("hex").slice(0, 16).toUpperCase();
}
const MACHINE_ID = getMachineId();
const DATA_DIR = process.env.WAPP_DATA_PATH || process.cwd();
const LICENSE_PATH = path_1.default.join(DATA_DIR, "license.json");
const botEngine = new ChatbotRagEngine(DATA_DIR);

function killStaleBrowserProcesses() {
    if (process.platform === 'win32') {
        try {
            const { execSync } = require('child_process');
            execSync('wmic process where "name=\'chrome.exe\' and commandline like \'%.wwebjs_auth%\'" call terminate', { stdio: 'ignore' });
        } catch (e) {}
    }
}

function cleanChromiumLocks() {
    killStaleBrowserProcesses();
    const authPath = process.env.WWEBJS_DATA_PATH || path_1.default.join(process.cwd(), ".wwebjs_auth");
    if (!fs_1.default.existsSync(authPath)) return;

    function removeLocksRecursively(currentDir) {
        try {
            const entries = fs_1.default.readdirSync(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path_1.default.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    removeLocksRecursively(fullPath);
                } else if (["SingletonLock", "SingletonCookie", "SingletonSocket", "LOCK", "LOG.old"].includes(entry.name)) {
                    try {
                        fs_1.default.unlinkSync(fullPath);
                        console.log(`[Watchdog] Removed stale Chromium lock: ${fullPath}`);
                    } catch (e) {}
                }
            }
        } catch (e) {}
    }
    removeLocksRecursively(authPath);
}

function safeClearFolder(dirPath, maxRetries = 5, delayMs = 500) {
    if (!fs_1.default.existsSync(dirPath)) return true;
    for (let i = 0; i < maxRetries; i++) {
        try {
            fs_1.default.rmSync(dirPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
            console.log(`[Watchdog] Cleared directory: ${dirPath}`);
            return true;
        } catch (err) {
            console.warn(`[Watchdog] Attempt ${i + 1} to remove ${dirPath} failed (${err.message}), retrying...`);
            const end = Date.now() + delayMs;
            while (Date.now() < end) {}
        }
    }
    return false;
}

function getStoredLicense() {
    if (fs_1.default.existsSync(LICENSE_PATH)) {
        try {
            return JSON.parse(fs_1.default.readFileSync(LICENSE_PATH, "utf8"));
        }
        catch {
            return null;
        }
    }
    return null;
}
// ─── Shared puppeteer args (tuned for fast startup and stability) ────────────
const PUPPETEER_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-blink-features=AutomationControlled",
    "--safebrowsing-disable-auto-update",
    // Performance & Keep-alive: keep renderer alive even when backgrounded/minimized
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-features=CalculateNativeWinOcclusion",
    "--disable-breakpad",
    "--disable-client-side-phishing-detection",
    // Reduce memory overhead
    "--disable-ipc-flooding-protection",
    "--memory-pressure-off",
    "--disable-hang-monitor",
    "--disable-prompt-on-repost",
    "--disable-translate",
    "--metrics-recording-only",
    "--mute-audio",
    "--no-default-browser-check",
];
// ─── State ────────────────────────────────────────────────────────────────────
let qrCodeData = "";
let isReady = false;
let isAuthenticated = false;
// Track current active client so we can destroy it when switching modes
let activeClient = null;
let reconnectTimer = null;
let isReconnecting = false;
let heartbeatInterval = null;
let authStallTimer = null;
// Campaign state
let isBulkRunning = false;
let currentBulkResults = [];
// ─── Auto-Reply State ─────────────────────────────────────────────────────────
const AUTO_RESPONSES_PATH = path_1.default.join(DATA_DIR, "auto_responses.json");
let autoResponses = [];
function loadAutoResponses() {
    if (fs_1.default.existsSync(AUTO_RESPONSES_PATH)) {
        try {
            autoResponses = JSON.parse(fs_1.default.readFileSync(AUTO_RESPONSES_PATH, "utf8"));
        }
        catch (e) {
            console.error("Failed to load auto responses", e);
        }
    }
}
loadAutoResponses();
// ─── Client factory ───────────────────────────────────────────────────────────
/**
 * Build shared Client options (auth + puppeteer).
 * Pass `pairWithPhoneNumber` to enable phone-pairing mode.
 *
 * SPEED: webVersionCache caches the WhatsApp Web HTML locally so subsequent
 * starts skip the remote download (saves 3–8 seconds per launch).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildClientOptions(pairWithPhoneNumber) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const opts = {
        authStrategy: new whatsapp_web_js_1.LocalAuth({
            dataPath: process.env.WWEBJS_DATA_PATH || "./.wwebjs_auth",
        }),
        // Cache disabled to avoid getting stuck during authentication
        webVersionCache: {
            type: 'none',
        },
        // Raise auth timeout so slow machines don't give up early
        authTimeoutMs: 60000,
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
        evalOnNewDoc: () => {
            try {
                // Strip webdriver automation flag
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                // Provide realistic mock of window.chrome
                window.chrome = {
                    runtime: {},
                    loadTimes: function () {},
                    csi: function () {},
                    app: {}
                };
                // Realistic languages and plugins
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en', 'fr'] });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            } catch (_) {}
        },
        puppeteer: {
            headless: true,
            dumpio: false,
            executablePath: chromePath,
            args: PUPPETEER_ARGS,
            ignoreDefaultArgs: ['--enable-automation'],
            bypassCSP: true,
        },
    };
    if (pairWithPhoneNumber) {
        opts.pairWithPhoneNumber = pairWithPhoneNumber;
    }
    return opts;
}
/**
 * Destroy the active client cleanly, reset shared state.
 * @param skipLogout - Set true when switching modes (logout is slow, ~3s). Only use full logout on reset.
 */
/**
 * Destroy the active client cleanly, reset shared state.
 * @param skipLogout - Set true when switching modes (logout is slow, ~3s). Only use full logout on reset.
 */
async function destroyActiveClient(skipLogout = false) {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
    if (authStallTimer) {
        clearTimeout(authStallTimer);
        authStallTimer = null;
    }
    const c = activeClient;
    activeClient = null;
    isReady = false;
    isAuthenticated = false;
    qrCodeData = "";
    if (!c)
        return;
    if (!skipLogout) {
        try {
            await Promise.race([
                c.logout(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Logout timeout")), 2000))
            ]);
        }
        catch { /* ignore */ }
    }
    try {
        await Promise.race([
            c.destroy(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Destroy timeout")), 2500))
        ]);
    }
    catch (e) {
        console.warn("[Watchdog] Notice on client destroy:", e.message);
    }
    await new Promise(r => setTimeout(r, 800));
}

function scheduleAutoReconnect(delayMs = 5000) {
    if (isReconnecting) return;
    isReconnecting = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    console.log(`[Watchdog] Scheduling auto-reconnect in ${delayMs / 1000}s...`);
    io.emit("reconnecting", { delayMs });
    reconnectTimer = setTimeout(async () => {
        try {
            console.log(`[Watchdog] Attempting automatic reconnection...`);
            await destroyActiveClient(true);
            cleanChromiumLocks();
            await new Promise(r => setTimeout(r, 1000));
            createAndStartQRClient();
        } catch (err) {
            console.error("[Watchdog] Auto-reconnect failed:", err);
        } finally {
            isReconnecting = false;
        }
    }, delayMs);
}

function startWatchdogHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(async () => {
        if (!activeClient || !isReady) return;
        try {
            const state = await Promise.race([
                activeClient.getState(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Heartbeat timeout")), 10000))
            ]);
            if (!state || state === "CONFLICT" || state === "UNPAIRED") {
                console.warn(`[Watchdog] Abnormal WhatsApp state: ${state}. Auto-reconnecting...`);
                scheduleAutoReconnect(3000);
            }
        } catch (err) {
            console.warn(`[Watchdog] Heartbeat check issue:`, err.message);
        }
    }, 30000);
}

/**
 * Create, register event listeners, and initialize a QR-mode client.
 * This is the normal startup path.
 */
function createAndStartQRClient() {
    cleanChromiumLocks();
    const client = new whatsapp_web_js_1.Client(buildClientOptions());
    activeClient = client;
    registerClientEvents(client);
    client.initialize().catch(err => {
        console.warn("[Watchdog] WhatsApp initialize notice:", err?.stack || err);
    });
    return client;
}
/**
 * Register all WhatsApp event listeners onto a client.
 * All socket.io broadcasts happen here.
 */
function registerClientEvents(client) {
    client.on("qr", (qr) => {
        console.log("QR RECEIVED");
        qrCodeData = qr;
        isAuthenticated = false; // Must be false when QR arrives!
        isReady = false;
        if (authStallTimer) {
            clearInterval(authStallTimer);
            authStallTimer = null;
        }
        io.emit("qr", qr);
    });
    client.on("ready", () => {
        console.log("Client is ready!");
        if (authStallTimer) {
            clearInterval(authStallTimer);
            authStallTimer = null;
        }
        isReady = true;
        isAuthenticated = true;
        qrCodeData = ""; // clear QR once ready
        io.emit("ready", true);
        startWatchdogHeartbeat();
    });
    client.on("authenticated", () => {
        console.log("Authenticated - Synchronizing session chats...");
        isAuthenticated = true;
        qrCodeData = "";
        io.emit("authenticated", true);

        // Active DOM Watchdog: Monitor WhatsApp Web UI directly in Chromium
        // NEVER destructively wipe the session while authenticated!
        if (authStallTimer) clearInterval(authStallTimer);
        let checks = 0;
        authStallTimer = setInterval(async () => {
            checks++;
            if (isReady || activeClient !== client) {
                clearInterval(authStallTimer);
                authStallTimer = null;
                return;
            }
            try {
                if (client.pupPage && !client.pupPage.isClosed()) {
                    const uiReady = await client.pupPage.evaluate(() => {
                        const hasPane = !!document.querySelector('#pane-side, [data-testid="chat-list"], [data-testid="chat-list-search"], header');
                        const hasStore = typeof window.Store !== 'undefined' && !!(window.Store.Conn || window.Store.User);
                        return hasPane || hasStore;
                    }).catch(() => false);

                    if (uiReady && !isReady) {
                        console.log("[Watchdog] WhatsApp Web UI confirmed ready in Chromium! Transitioning to READY.");
                        clearInterval(authStallTimer);
                        authStallTimer = null;
                        isReady = true;
                        isAuthenticated = true;
                        qrCodeData = "";
                        io.emit("ready", true);
                        startWatchdogHeartbeat();
                        return;
                    }
                }
            } catch (err) {
                // Ignore transient frame navigation context errors
            }

            // Large account progress notification (keep session intact!)
            if (checks === 60) {
                console.log("[Watchdog] Chat sync is ongoing for large account, keeping session intact...");
                io.emit("loading_screen", { percent: 99, message: "Synchronizing chat history... Keep WhatsApp open on phone." });
            }
        }, 1500);
    });
    client.on("disconnected", (reason) => {
        console.log("Client was logged out or disconnected:", reason);
        if (authStallTimer) {
            clearInterval(authStallTimer);
            authStallTimer = null;
        }
        if (client === activeClient) {
            isReady = false;
            isAuthenticated = false;
            qrCodeData = "";
            io.emit("disconnected", reason);
            if (reason === "LOGOUT") {
                console.log("[Watchdog] Logged out by WhatsApp server. Cleaning session folder for fresh QR...");
                const authPath = process.env.WWEBJS_DATA_PATH || path_1.default.join(process.cwd(), ".wwebjs_auth");
                safeClearFolder(authPath);
                cleanChromiumLocks();
                scheduleAutoReconnect(1000);
            } else if (reason !== "manual_reset") {
                console.log(`[Watchdog] Unexpected disconnect (${reason}). Triggering auto-reconnect...`);
                scheduleAutoReconnect(3000);
            }
        }
    });
    client.on("auth_failure", (msg) => {
        console.error("AUTHENTICATION FAILURE", msg);
        if (authStallTimer) {
            clearInterval(authStallTimer);
            authStallTimer = null;
        }
        isReady = false;
        isAuthenticated = false;
        qrCodeData = "";
        io.emit("auth_failure", msg);
        scheduleAutoReconnect(3000);
    });
    client.on("loading_screen", (percent, message) => {
        console.log("LOADING SCREEN", percent, message);
        io.emit("loading_screen", { percent, message });
    });
    // Phone-pairing mode: emit the code received event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client.on("code", (code) => {
        console.log("Pairing code received:", code);
        io.emit("pairing_code", { code });
    });
    client.on("message", async (msg) => {
        // Broadcast incoming message for the Chat UI
        try {
            const contact = await msg.getContact();
            io.emit("incoming_message", {
                id: msg.id._serialized,
                from: msg.from,
                number: contact.number,
                name: contact.pushname || contact.name || "Unknown",
                body: msg.body,
                timestamp: msg.timestamp * 1000,
                isGroup: msg.from.includes("@g.us")
            });
        }
        catch (e) {
            console.error("Error emitting incoming message", e);
        }

        // Auto-reply and self-learning logic (skip groups to avoid spam)
        if (msg.from.includes("@g.us"))
            return;

        // 1. Record incoming message for self-learning
        botEngine.recordIncoming(msg.from, msg.body);

        const lowerBody = msg.body.toLowerCase().trim();
        let replied = false;

        // 2. Check exact / contains keyword rules first
        for (const rule of autoResponses) {
            if (rule.exactMatch) {
                if (lowerBody === rule.keyword.toLowerCase().trim()) {
                    await msg.reply(rule.response);
                    replied = true;
                    break;
                }
            }
            else {
                if (lowerBody.includes(rule.keyword.toLowerCase().trim())) {
                    await msg.reply(rule.response);
                    replied = true;
                    break;
                }
            }
        }

        // 3. If no rule matched and autoReply is enabled, check Self-Learning / RAG Engine
        if (!replied && botEngine.settings.autoReply) {
            try {
                const match = botEngine.findBestAnswer(msg.body);
                if (match && match.answer) {
                    console.log(`[ChatbotRag] Auto-replying via ${match.sourceType} (${match.score}% match): "${match.answer.substring(0, 40)}..."`);
                    await msg.reply(match.answer);
                    replied = true;
                }
            } catch (err) {
                console.error("[ChatbotRag] Error during auto-reply:", err);
            }
        }
    });
    client.on("message_create", async (msg) => {
        // Fired on all messages including our own
        if (msg.fromMe) {
            // Self-learn from user's replies to contacts!
            if (!msg.to.includes("@g.us")) {
                botEngine.recordOutgoing(msg.to, msg.body);
            }
            try {
                io.emit("outgoing_message", {
                    id: msg.id._serialized,
                    to: msg.to,
                    body: msg.body,
                    timestamp: msg.timestamp * 1000
                });
            }
            catch (e) { }
        }
    });
}
// ─── Boot ─────────────────────────────────────────────────────────────────────
// Move startup to the end to ensure API is ready first
// createAndStartQRClient();
// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log("Client connected");
    // Send current status immediately on connect
    if (isReady) {
        socket.emit("ready", true);
    }
    else if (isAuthenticated) {
        socket.emit("authenticated", true);
    }
    else if (qrCodeData) {
        socket.emit("qr", qrCodeData);
    }
    socket.on("get_status", () => {
        if (isReady) {
            socket.emit("ready", true);
        }
        else if (qrCodeData) {
            socket.emit("qr", qrCodeData);
        }
        else {
            socket.emit("status_response", { isReady: false, qr: null });
        }
    });
    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
    socket.on("sendMessage", async (data) => {
        const { number, message } = data;
        if (!activeClient)
            return socket.emit("messageError", { number, error: "No active client" });
        try {
            const formattedNumber = number.includes("@c.us") ? number : `${number}@c.us`;
            await activeClient.sendMessage(formattedNumber, message);
            socket.emit("messageSent", { number, status: "success" });
        }
        catch (error) {
            console.error("Error sending message:", error);
            socket.emit("messageError", { number, error: "Failed to send" });
        }
    });
});
// ─── REST API ─────────────────────────────────────────────────────────────────
app.get("/api/wa-status", (_req, res) => {
    res.json({ isReady, authenticated: isAuthenticated, qr: qrCodeData || null });
});
// ─── Activation & Licensing ──────────────────────────────────────────────────
app.get("/api/license-status", (_req, res) => {
    const license = getStoredLicense();
    res.json({
        machineId: MACHINE_ID,
        license: license || null,
        isActivated: !!(license && (!license.expiresAt || new Date(license.expiresAt) > new Date()))
    });
});
app.post("/api/activate", async (req, res) => {
    const { code } = req.body;
    if (!code) {
        // @ts-ignore
        return res.status(400).json({ error: "Activation code is required" });
    }
    const payload = JSON.stringify({
        code,
        deviceId: MACHINE_ID,
        deviceName: os_1.default.hostname(),
        deviceType: "DESKTOP"
    });
    const options = {
        hostname: 'syndiki-pro.vercel.app',
        port: 443,
        path: '/api/activation/validate',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length
        }
    };
    const request = https_1.default.request(options, (remoteRes) => {
        let data = '';
        remoteRes.on('data', (chunk) => { data += chunk; });
        remoteRes.on('end', () => {
            try {
                const response = JSON.parse(data);
                if (remoteRes.statusCode === 200 && response.success) {
                    // Store license locally
                    const licenseData = {
                        code: response.activationCode,
                        expiresAt: response.expiresAt,
                        activatedAt: new Date().toISOString()
                    };
                    fs_1.default.writeFileSync(LICENSE_PATH, JSON.stringify(licenseData, null, 2));
                    res.json({ success: true, license: licenseData });
                }
                else {
                    // @ts-ignore
                    res.status(remoteRes.statusCode || 400).json({ error: response.error || "Activation failed" });
                }
            }
            catch (e) {
                // @ts-ignore
                res.status(500).json({ error: "Invalid response from activation server" });
            }
        });
    });
    request.on('error', (error) => {
        console.error("Activation request error:", error);
        // @ts-ignore
        res.status(500).json({ error: "Could not connect to activation server" });
    });
    request.write(payload);
    request.end();
});
// ─── Bulk send ────────────────────────────────────────────────────────────────
app.post("/api/send-bulk", async (req, res) => {
    const { recipients = [], message, minDelay = 1000, maxDelay = 3000, attachments = [] } = req.body;
    if (!isReady || !activeClient) {
        // @ts-ignore
        return res.status(503).json({ error: "WhatsApp client not ready" });
    }
    if (isBulkRunning) {
        // @ts-ignore
        return res.status(400).json({ error: "A campaign is already running" });
    }
    const client = activeClient;
    isBulkRunning = true;
    currentBulkResults = [];
    // Process in background
    (async () => {
        let sentCount = 0;
        let failCount = 0;
        const total = recipients.length;
        const startTime = Date.now();
        for (const recipient of recipients) {
            if (!isBulkRunning) {
                console.log("Campaign stopped by user");
                break;
            }
            try {
                const number = recipient.number || "";
                let parsedNumber = number;
                // Remove all spaces, dashes and non-digit characters except the + sign
                parsedNumber = parsedNumber.replace(/[^\d+]/g, '');
                // WhatsApp API expects exactly digits without a leading +
                if (parsedNumber.startsWith('+')) {
                    parsedNumber = parsedNumber.substring(1);
                }
                const name = recipient.name || "Subscriber";
                console.log(`Checking number on WhatsApp: ${parsedNumber}`);
                const contactId = await client.getNumberId(parsedNumber);
                if (!contactId) {
                    console.warn(`Number ${number} not registered on WhatsApp`);
                    throw new Error("Number not registered on WhatsApp");
                }
                const formattedNumber = contactId._serialized;
                console.log(`Formatted number: ${formattedNumber}`);
                const personalizedMessage = message ? message.replace(/{{name}}/g, name) : "";
                if (!isReady)
                    throw new Error("WhatsApp disconnected during campaign");
                if (attachments.length > 0) {
                    const { mimetype, data, filename } = attachments[0];
                    const media = new whatsapp_web_js_1.MessageMedia(mimetype, data, filename);
                    const sendOptions = personalizedMessage && personalizedMessage.trim() ? { caption: personalizedMessage } : {};
                    console.log(`Sending media${sendOptions.caption ? ' with caption' : ''} to ${formattedNumber}...`);
                    await client.sendMessage(formattedNumber, media, sendOptions);
                    for (let i = 1; i < attachments.length; i++) {
                        const { mimetype: mt, data: d, filename: fn } = attachments[i];
                        await client.sendMessage(formattedNumber, new whatsapp_web_js_1.MessageMedia(mt, d, fn));
                    }
                }
                else if (personalizedMessage && personalizedMessage.trim()) {
                    console.log(`Sending message to ${formattedNumber}...`);
                    await client.sendMessage(formattedNumber, personalizedMessage);
                    console.log(`Message sent to ${formattedNumber}`);
                }
                sentCount++;
                currentBulkResults.push({ number, name: recipient.name, status: "success" });
                console.log(`Sent to ${number} (${sentCount}/${total})`);
                const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                const nextSendAt = Date.now() + delay;
                io.emit("bulkProgress", {
                    current: sentCount,
                    total,
                    lastNumber: number,
                    status: "success",
                    nextSendAt: (sentCount + failCount) < total && isBulkRunning ? nextSendAt : null,
                });
                if ((sentCount + failCount) < total && isBulkRunning) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            catch (e) {
                console.error(`Failed to send to ${recipient.number}`, e);
                failCount++;
                currentBulkResults.push({
                    number: recipient.number,
                    name: recipient.name,
                    status: "error",
                    error: e.message
                });
                io.emit("bulkProgress", {
                    current: sentCount,
                    total,
                    lastNumber: recipient.number,
                    status: "error",
                    error: e.message,
                    nextSendAt: (sentCount + failCount) < total && isBulkRunning ? Date.now() + 500 : null,
                });
                if ((sentCount + failCount) < total && isBulkRunning) {
                    await new Promise(resolve => setTimeout(resolve, 500)); // Short delay after error
                }
            }
        }
        isBulkRunning = false;
        const endTime = Date.now();
        const historyItem = {
            id: startTime.toString(),
            timestamp: new Date().toISOString(),
            total,
            sentCount,
            message,
            attachmentCount: attachments.length,
            duration: Math.floor((endTime - startTime) / 1000),
        };
        try {
            const historyPath = path_1.default.join(DATA_DIR, 'history.json');
            let history = [];
            if (fs_1.default.existsSync(historyPath)) {
                history = JSON.parse(fs_1.default.readFileSync(historyPath, 'utf8'));
            }
            history.unshift(historyItem);
            fs_1.default.writeFileSync(historyPath, JSON.stringify(history.slice(0, 50), null, 2));
        }
        catch (err) {
            console.error("Failed to save history:", err);
        }
        io.emit("bulkComplete", { total, sentCount, results: currentBulkResults });
    })();
    // @ts-ignore
    res.json({ success: true, message: "Bulk sending started" });
});
app.post("/api/stop-bulk", (_req, res) => {
    isBulkRunning = false;
    res.json({ success: true, message: "Campaign stopping..." });
});
// ─── History ──────────────────────────────────────────────────────────────────
app.get("/api/history", (_req, res) => {
    try {
        const historyPath = path_1.default.join(DATA_DIR, 'history.json');
        if (fs_1.default.existsSync(historyPath)) {
            const history = JSON.parse(fs_1.default.readFileSync(historyPath, 'utf8'));
            res.json(history);
        }
        else {
            res.json([]);
        }
    }
    catch {
        res.status(500).json({ error: "Failed to load history" });
    }
});
// ─── Group Extraction ─────────────────────────────────────────────────────────
app.get("/api/groups", async (_req, res) => {
    // Auto-recover isReady if browser is open and has chat elements
    if (!isReady && activeClient && activeClient.pupPage && !activeClient.pupPage.isClosed()) {
        try {
            const hasChatList = await activeClient.pupPage.evaluate(() => {
                return !!(document.querySelector('#pane-side') || document.querySelector('[data-testid="chat-list"]') || (window.Store && window.Store.Chat));
            });
            if (hasChatList) {
                isReady = true;
            }
        } catch (_) {}
    }

    if (!isReady || !activeClient) {
        // @ts-ignore
        return res.status(503).json({ error: "WhatsApp client not ready. Please connect your phone first." });
    }
    try {
        let groups = [];

        // 1. Direct in-memory extraction from window.Store for speed and 100% reliability
        if (activeClient.pupPage && !activeClient.pupPage.isClosed()) {
            try {
                groups = await activeClient.pupPage.evaluate(async () => {
                    const list = [];
                    if (!window.Store || !window.Store.Chat) return list;

                    let chatModels = [];
                    if (typeof window.Store.Chat.getModelsArray === 'function') {
                        chatModels = window.Store.Chat.getModelsArray();
                    } else if (Array.isArray(window.Store.Chat._models)) {
                        chatModels = window.Store.Chat._models;
                    } else if (window.Store.Chat.models) {
                        chatModels = window.Store.Chat.models;
                    }

                    for (const c of chatModels) {
                        try {
                            const rawId = c.id?._serialized || (typeof c.id === 'string' ? c.id : '');
                            const isGroup = c.isGroup === true || 
                                            c.id?.server === 'g.us' || 
                                            rawId.endsWith('@g.us');

                            if (!isGroup) continue;

                            let pCount = 0;
                            if (c.groupMetadata && c.groupMetadata.participants) {
                                const parts = c.groupMetadata.participants._models || c.groupMetadata.participants;
                                pCount = Array.isArray(parts) ? parts.length : (parts?.length || 0);
                            }
                            if (pCount === 0 && window.Store.GroupMetadata) {
                                const meta = typeof window.Store.GroupMetadata.get === 'function' ? window.Store.GroupMetadata.get(c.id) : null;
                                if (meta && meta.participants) {
                                    const parts = meta.participants._models || meta.participants;
                                    pCount = Array.isArray(parts) ? parts.length : (parts?.length || 0);
                                }
                            }

                            list.push({
                                id: rawId,
                                name: c.name || c.formattedTitle || "Groupe WhatsApp",
                                participantsCount: pCount
                            });
                        } catch (_) {}
                    }
                    return list;
                });
            } catch (evalErr) {
                console.warn("[/api/groups] In-memory evaluation error:", evalErr.message);
            }
        }

        // 2. Fallback to activeClient.getChats() if in-memory returned empty
        if (!groups || groups.length === 0) {
            try {
                const chats = await activeClient.getChats();
                groups = chats
                    .filter(c => c.isGroup || (c.id?._serialized && c.id._serialized.endsWith('@g.us')) || c.id?.server === 'g.us')
                    .map(g => ({
                        id: g.id?._serialized || g.id,
                        name: g.name || "Groupe WhatsApp",
                        participantsCount: g.participants?.length || 0
                    }));
            } catch (chatsErr) {
                console.warn("[/api/groups] getChats fallback error:", chatsErr.message);
            }
        }

        res.json({ success: true, groups: groups || [] });
    }
    catch (e) {
        console.error("Error fetching groups:", e);
        // @ts-ignore
        res.status(500).json({ error: "Failed to fetch groups", details: e?.message });
    }
});
app.get("/api/groups/:id/participants", async (req, res) => {
    // Auto-recover isReady if browser is open and has chat elements
    if (!isReady && activeClient && activeClient.pupPage && !activeClient.pupPage.isClosed()) {
        try {
            const hasChatList = await activeClient.pupPage.evaluate(() => {
                return !!(document.querySelector('#pane-side') || document.querySelector('[data-testid="chat-list"]') || (window.Store && window.Store.Chat));
            });
            if (hasChatList) {
                isReady = true;
            }
        } catch (_) {}
    }

    if (!isReady || !activeClient) {
        // @ts-ignore
        return res.status(503).json({ error: "WhatsApp client not ready" });
    }
    try {
        const groupId = req.params.id;
        let results = [];

        // 1. In-browser evaluation with LID -> Phone Number resolution
        if (activeClient.pupPage && !activeClient.pupPage.isClosed()) {
            try {
                results = await activeClient.pupPage.evaluate(async (gId) => {
                    const list = [];
                    if (!window.Store) return list;

                    const chatWid = window.Store.WidFactory ? window.Store.WidFactory.createWid(gId) : gId;
                    let groupMeta = null;

                    // Try GroupMetadata store
                    const gmStore = window.Store.GroupMetadata || window.Store.WAWebGroupMetadataCollection;
                    if (gmStore) {
                        if (typeof gmStore.get === 'function') {
                            groupMeta = gmStore.get(chatWid) || gmStore.get(gId);
                        }
                        if (!groupMeta && typeof gmStore.find === 'function') {
                            try { groupMeta = await gmStore.find(chatWid); } catch (_) {}
                        }
                        if (!groupMeta && typeof gmStore.update === 'function') {
                            try { await gmStore.update(chatWid); } catch (_) {}
                            groupMeta = typeof gmStore.get === 'function' ? (gmStore.get(chatWid) || gmStore.get(gId)) : null;
                        }
                    }

                    // Fallback to chat.groupMetadata
                    if (!groupMeta && window.Store.Chat) {
                        const chat = typeof window.Store.Chat.get === 'function' ? (window.Store.Chat.get(chatWid) || window.Store.Chat.get(gId)) : null;
                        if (chat && chat.groupMetadata) {
                            groupMeta = chat.groupMetadata;
                        }
                    }

                    if (!groupMeta || !groupMeta.participants) return list;

                    const rawList = groupMeta.participants._models || (Array.isArray(groupMeta.participants) ? groupMeta.participants : []);

                    for (const p of rawList) {
                        try {
                            let number = "";
                            let name = "Participant";

                            // Check contact directly
                            if (p.contact && p.contact.phoneNumber) {
                                number = p.contact.phoneNumber;
                            }

                            // User ID if standard @c.us
                            const pIdStr = p.id?._serialized || (typeof p.id === 'string' ? p.id : '');
                            if (!number && pIdStr.endsWith('@c.us')) {
                                number = p.id.user || pIdStr.split('@')[0];
                            }

                            // Query Contact store
                            if (!number && window.Store.Contact) {
                                const contact = typeof window.Store.Contact.get === 'function' ? window.Store.Contact.get(p.id) : null;
                                if (contact) {
                                    if (contact.phoneNumber) number = contact.phoneNumber;
                                    else if (contact.id?.user && !contact.id._serialized.endsWith('@lid')) {
                                        number = contact.id.user;
                                    }
                                    name = contact.name || contact.pushname || contact.formattedName || name;
                                }
                            }

                            if (!number && !pIdStr.endsWith('@lid')) {
                                number = p.id?.user || pIdStr.split('@')[0];
                            }

                            if (number) {
                                const clean = number.replace(/[^\d+]/g, '');
                                const formatted = clean.startsWith('+') ? clean : `+${clean}`;
                                list.push({
                                    number: formatted,
                                    name: name
                                });
                            }
                        } catch (_) {}
                    }
                    return list;
                }, groupId);
            } catch (evalErr) {
                console.warn("[/api/groups/participants] In-page evaluation error:", evalErr.message);
            }
        }

        // 2. Fallback via getChatById if direct evaluation was empty
        if (!results || results.length === 0) {
            try {
                const chat = await activeClient.getChatById(groupId);
                const participants = chat.participants || [];
                for (const p of participants) {
                    const contactId = p.id ? p.id._serialized : null;
                    if (!contactId) continue;
                    const numberStr = p.id.user || contactId.split('@')[0];
                    if (numberStr && !contactId.endsWith('@lid')) {
                        results.push({
                            number: numberStr.startsWith('+') ? numberStr : `+${numberStr}`,
                            name: "Participant"
                        });
                    }
                }
            } catch (chatErr) {
                console.warn("[/api/groups/participants] getChatById fallback error:", chatErr.message);
            }
        }

        res.json({ success: true, count: results.length, participants: results });
    }
    catch (e) {
        console.error("Error fetching group participants:", e?.message || e);
        // @ts-ignore
        res.status(500).json({ error: "Failed to fetch participants", details: e?.message });
    }
});
// ─── Auto-Responses API ───────────────────────────────────────────────────────
app.get("/api/auto-responses", (_req, res) => {
    res.json(autoResponses);
});
app.post("/api/auto-responses", (req, res) => {
    const { rules } = req.body;
    if (Array.isArray(rules)) {
        autoResponses = rules;
        fs_1.default.writeFileSync(AUTO_RESPONSES_PATH, JSON.stringify(autoResponses, null, 2));
        res.json({ success: true });
    }
    else {
        // @ts-ignore
        res.status(400).json({ error: "Invalid rules format" });
    }
});
// ─── Watchdog / Connection Recovery ──────────────────────────────────────────
app.post("/api/reconnect", async (_req, res) => {
    console.log("[Watchdog] Manual reconnect requested via API");
    scheduleAutoReconnect(500);
    res.json({ success: true, message: "Reconnection scheduled" });
});
// ─── Chatbot & RAG API ────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: "2026.4.0", timestamp: Date.now() });
});
app.get("/api/chatbot/stats", (_req, res) => {
    res.json({
        success: true,
        knowledgeCount: botEngine.learnedPairs ? botEngine.learnedPairs.length : 0,
        sourcesCount: botEngine.sources ? botEngine.sources.length : 0,
        chunksCount: botEngine.chunks ? botEngine.chunks.length : 0,
        settings: botEngine.settings
    });
});
app.get("/api/chatbot/sources", (_req, res) => {
    res.json({ success: true, sources: botEngine.sources });
});
app.post("/api/chatbot/ingest-url", async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: "Website URL is required" });
    }
    try {
        console.log(`[API] Ingesting website: ${url}`);
        const result = await botEngine.ingestUrl(url, chromePath);
        res.json(result);
    } catch (err) {
        console.error("Ingest URL error:", err);
        res.status(500).json({ error: err.message || "Failed to crawl and learn from website" });
    }
});
app.post("/api/chatbot/ingest-text", (req, res) => {
    const { title, content, url } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required" });
    }
    try {
        const result = botEngine.ingestText(title, content, url || "");
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message || "Failed to ingest text" });
    }
});
app.delete("/api/chatbot/sources/:id", (req, res) => {
    const result = botEngine.deleteSource(req.params.id);
    res.json(result);
});
app.get("/api/chatbot/knowledge", (_req, res) => {
    res.json({
        success: true,
        pairs: botEngine.learnedPairs,
        settings: botEngine.settings,
        sourcesCount: botEngine.sources.length,
        chunksCount: botEngine.chunks.length
    });
});
app.post("/api/chatbot/knowledge", (req, res) => {
    const { question, answer } = req.body;
    if (!question || !answer) {
        return res.status(400).json({ error: "Question and answer are required" });
    }
    const result = botEngine.addLearnedPair(question, answer);
    res.json(result);
});
app.delete("/api/chatbot/knowledge/:id", (req, res) => {
    const result = botEngine.deleteLearnedPair(req.params.id);
    res.json(result);
});
app.post("/api/chatbot/settings", (req, res) => {
    const { autoLearn, autoReply, useRag, similarityThreshold, maxResponseLength } = req.body;
    botEngine.settings = {
        ...botEngine.settings,
        ...(autoLearn !== undefined && { autoLearn: !!autoLearn }),
        ...(autoReply !== undefined && { autoReply: !!autoReply }),
        ...(useRag !== undefined && { useRag: !!useRag }),
        ...(similarityThreshold !== undefined && { similarityThreshold: Number(similarityThreshold) }),
        ...(maxResponseLength !== undefined && { maxResponseLength: Number(maxResponseLength) })
    };
    botEngine.saveSettings();
    res.json({ success: true, settings: botEngine.settings });
});
app.post("/api/chatbot/test-query", (req, res) => {
    const { query } = req.body;
    if (!query) {
        return res.status(400).json({ error: "Query is required" });
    }
    const match = botEngine.findBestAnswer(query);
    res.json({ success: true, query, match: match || null });
});
// ─── Scraper API ──────────────────────────────────────────────────────────────
app.post("/api/scrape-leads", async (req, res) => {
    const { keyword, location } = req.body;
    if (!keyword || !location) {
        // @ts-ignore
        return res.status(400).json({ error: "Keyword and location required" });
    }
    try {
        const browser = await puppeteer_1.default.launch({
            executablePath: chromePath,
            headless: true,
            args: PUPPETEER_ARGS
        });
        const page = await browser.newPage();
        // Simulate a search on Google Maps directly
        // Bypass Google Cookie Consent popup
        await page.setCookie({ name: 'CONSENT', value: 'YES+cb.20230101-00-p0.en+FX+777', domain: '.google.com' });
        const query = encodeURIComponent(`${keyword} in ${location}`);
        await page.goto(`https://www.google.com/maps/search/${query}`, { waitUntil: 'networkidle2' });
        // Wait for business listings to load
        await new Promise(resolve => setTimeout(resolve, 8000));
        // Inject DOM Parser to extract Name & Number pairs
        // @ts-ignore
        const extractedLeads = await page.evaluate(async () => {
            const results = [];
            // Scroll to load more results
            const scrollableDiv = document.querySelector('div[role="feed"]');
            if (scrollableDiv) {
                for (let i = 0; i < 6; i++) {
                    scrollableDiv.scrollBy(0, 1500);
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
            const allElements = document.querySelectorAll('a, div[role="article"]');
            allElements.forEach((el) => {
                let name = el.getAttribute('aria-label');
                if (!name)
                    return;
                // Clean up Google Maps aria-labels French/English prefixes
                name = name.replace(/^Visiter le site Web de\s+/i, '')
                    .replace(/^Visitez le site Web de\s+/i, '')
                    .replace(/^Visit website for\s+/i, '')
                    .replace(/^Website for\s+/i, '');
                name = name.split('·')[0].replace(/^Annonce/i, '').replace(/,/g, '').trim();
                if (!name)
                    name = "Lead";
                let parent = el.parentElement;
                while (parent && parent.innerText && parent.innerText.length < 500) {
                    const text = parent.innerText;
                    const phoneRegex = /(?:\+(?:[0-9]\s*){1,3})?[0-9](?:[\s.-]*[0-9]){8,13}/g;
                    const matches = text.match(phoneRegex);
                    if (matches) {
                        const numbers = matches.filter((n) => {
                            const digits = n.replace(/\D/g, '');
                            return digits.length >= 9 && digits.length <= 15;
                        });
                        if (numbers.length > 0) {
                            // Try to extract email
                            const emailRegex = /[\w.-]+@[\w.-]+\.\w+/g;
                            const emailMatches = text.match(emailRegex);
                            const email = emailMatches ? emailMatches[0] : "";
                            // Try to extract address
                            const lines = text.split('\n').filter((l) => l.trim().length > 0);
                            let address = "";
                            if (lines.length > 2) {
                                address = lines.find((l) => l.includes("·") || l.includes(",")) || lines[2];
                            }
                            if (address) {
                                address = address.replace(phoneRegex, '').replace(emailRegex, '').replace(/,/g, ' ').trim();
                            }
                            results.push({ name: name, number: numbers[0], email, address });
                            break;
                        }
                    }
                    parent = parent.parentElement;
                }
            });
            return results;
        });
        await browser.close();
        // Format numbers and deduplicate
        const leads = extractedLeads.map((item) => ({
            name: item.name,
            number: item.number.replace(/[^\d+]/g, ''),
            email: item.email || "",
            address: item.address || ""
        }));
        // Deduplicate by number
        const uniqueLeads = Array.from(new Map(leads.map(item => [item.number, item])).values());
        res.json({ success: true, leads: uniqueLeads.slice(0, 100) }); // Limit to 100
    }
    catch (e) {
        console.error("Scraping error:", e);
        // @ts-ignore
        res.status(500).json({ error: "Failed to scrape leads. Make sure Chrome is installed." });
    }
});
// ─── Phone Pairing ────────────────────────────────────────────────────────────
/**
 * Request a pairing code by:
 * 1. Destroying the current QR client
 * 2. Creating a new client with pairWithPhoneNumber option
 * 3. Waiting for the "code" event (emitted by whatsapp-web.js when the code is ready)
 * 4. Returning the code, then automatically switching back to QR mode after 5 min
 *
 * This is the CORRECT pattern for whatsapp-web.js — pairWithPhoneNumber MUST be
 * set at construction time so the library registers window.onCodeReceivedEvent.
 */
app.post("/api/request-pairing-code", async (req, res) => {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
        // @ts-ignore
        return res.status(400).json({ error: "Phone number is required." });
    }
    const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, "");
    if (cleanNumber.length < 7) {
        // @ts-ignore
        return res.status(400).json({ error: "Invalid phone number. Include country code (e.g. 212612345678)." });
    }
    if (isReady || isAuthenticated) {
        // @ts-ignore
        return res.status(400).json({
            error: "Already connected. Click Reset first to log out, then try phone pairing.",
        });
    }
    console.log(`Switching to phone-pairing mode for ${cleanNumber}…`);
    // Tell frontend we're restarting
    io.emit("mode_switching", { mode: "phone", phone: cleanNumber });
    // Destroy current QR client — skip logout for speed (only needed on full session reset)
    await destroyActiveClient(true);
    // Minimal grace period for old browser process to release OS resources
    await new Promise(r => setTimeout(r, 500));
    // Create a phone-pairing client — this registers window.onCodeReceivedEvent
    const phoneClient = new whatsapp_web_js_1.Client(buildClientOptions({
        phoneNumber: cleanNumber,
        showNotification: true,
    }));
    activeClient = phoneClient;
    registerClientEvents(phoneClient);
    // Wrap in a promise that resolves when the "code" event fires
    const codePromise = new Promise((resolve, reject) => {
        // whatsapp-web.js emits "code" with the pairing code
        phoneClient.once("code", (code) => {
            resolve(code);
        });
        // Also handle auth_failure as rejection
        phoneClient.once("auth_failure", (msg) => {
            reject(new Error(`Auth failure: ${msg}`));
        });
    });
    // Start initialization — this triggers the phone pairing flow
    phoneClient.initialize().catch(err => {
        console.warn("[Watchdog] Phone client initialize notice:", err.message);
    });
    try {
        // Wait up to 90 seconds for the code
        const code = await Promise.race([
            codePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for pairing code. Make sure WhatsApp server is reachable and try again.")), 90000)),
        ]);
        console.log(`Pairing code for ${cleanNumber}: ${code}`);
        res.json({ success: true, code });
    }
    catch (error) {
        console.error("Phone pairing error:", error);
        // If phone mode failed, fall back to QR mode gracefully
        if (activeClient === phoneClient) {
            console.log("Phone pairing failed — falling back to QR mode...");
            io.emit("mode_switching", { mode: "qr" });
            await destroyActiveClient(true);
            await new Promise(r => setTimeout(r, 500));
            createAndStartQRClient();
        }
        // @ts-ignore
        res.status(500).json({ error: error.message || "Failed to get pairing code" });
    }
});
// ─── Reset Session ────────────────────────────────────────────────────────────
app.post("/api/reset-session", async (_req, res) => {
    console.log("[API] Resetting WhatsApp session on request...");
    // Notify frontend
    io.emit("disconnected", "manual_reset");
    await destroyActiveClient(true);
    // Clear auth folder for a clean restart
    const authPath = process.env.WWEBJS_DATA_PATH || path_1.default.join(process.cwd(), ".wwebjs_auth");
    safeClearFolder(authPath);
    cleanChromiumLocks();
    // Short delay, then restart in QR mode
    setTimeout(() => {
        console.log("[API] Restarting fresh in QR mode...");
        createAndStartQRClient();
    }, 600);
    res.json({ success: true, message: "Session reset. Restarting in QR mode." });
});
// ─── Static files & Web UI ──────────────────────────────────────────────────
const outPath = path_1.default.join(__dirname, "out");
if (fs_1.default.existsSync(outPath)) {
    app.use(express_1.default.static(outPath));
    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/")) return next();
        res.sendFile(path_1.default.join(outPath, "index.html"));
    });
}

// ─── Start server ─────────────────────────────────────────────────────────────
httpServer.listen(port, () => {
    console.log(`> Backend Ready on http://localhost:${port}`);
    // Also start a listener on port 3000 so both http://localhost:3000 and 3001 work
    try {
        const port3000Server = (0, http_1.createServer)(app);
        io.attach(port3000Server);
        port3000Server.listen(3000, () => {
            console.log(`> Web UI also available on http://localhost:3000 (with Socket.IO)`);
        }).on('error', () => {});
    } catch {}

    // Start WA Client AFTER express is listening so the UI can at least connect
    setTimeout(() => {
        console.log("Initializing WhatsApp Client...");
        createAndStartQRClient();
    }, 1000);
});
httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Attempting to recover...`);
        process.exit(1);
    }
});
