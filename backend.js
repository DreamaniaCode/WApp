"use strict";
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
const port = 3001;
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
// Enable CORS and increase JSON limit for Base64 media
const allowedOrigins = ["http://localhost:3000", "http://localhost:3001", null];
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.startsWith("file://")) {
            callback(null, true);
        }
        else {
            callback(null, true); // Allow all in dev — tighten if needed
        }
    },
    methods: ["GET", "POST"],
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
// ─── Shared puppeteer args (tuned for fast startup) ─────────────────────────
const PUPPETEER_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-background-networking",
    "--safebrowsing-disable-auto-update",
    // Performance: keep renderer alive even when backgrounded
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    // Reduce memory overhead
    "--disable-ipc-flooding-protection",
    "--memory-pressure-off",
    "--disable-hang-monitor",
    "--disable-prompt-on-repost",
    "--disable-sync",
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
        puppeteer: {
            headless: true,
            dumpio: false,
            executablePath: chromePath,
            args: PUPPETEER_ARGS,
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
async function destroyActiveClient(skipLogout = false) {
    const c = activeClient;
    activeClient = null;
    isReady = false;
    isAuthenticated = false;
    qrCodeData = "";
    if (!c)
        return;
    if (!skipLogout) {
        try {
            await c.logout();
        }
        catch { /* ignore */ }
    }
    try {
        await c.destroy();
    }
    catch { /* ignore */ }
}
/**
 * Create, register event listeners, and initialize a QR-mode client.
 * This is the normal startup path.
 */
function createAndStartQRClient() {
    const client = new whatsapp_web_js_1.Client(buildClientOptions());
    activeClient = client;
    registerClientEvents(client);
    client.initialize();
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
        io.emit("qr", qr);
    });
    client.on("ready", () => {
        console.log("Client is ready!");
        isReady = true;
        qrCodeData = ""; // clear QR once ready
        io.emit("ready", true);
    });
    client.on("authenticated", () => {
        console.log("Authenticated");
        isAuthenticated = true;
        qrCodeData = "";
        io.emit("authenticated", true);
    });
    client.on("disconnected", (reason) => {
        console.log("Client was logged out or disconnected:", reason);
        if (client === activeClient) {
            isReady = false;
            isAuthenticated = false;
            qrCodeData = "";
            io.emit("disconnected", reason);
        }
    });
    client.on("auth_failure", (msg) => {
        console.error("AUTHENTICATION FAILURE", msg);
        io.emit("auth_failure", msg);
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
        // Auto-reply logic (skip groups by default to avoid spam)
        if (msg.from.includes("@g.us"))
            return;
        const lowerBody = msg.body.toLowerCase().trim();
        for (const rule of autoResponses) {
            if (rule.exactMatch) {
                if (lowerBody === rule.keyword.toLowerCase().trim()) {
                    await msg.reply(rule.response);
                    break;
                }
            }
            else {
                if (lowerBody.includes(rule.keyword.toLowerCase().trim())) {
                    await msg.reply(rule.response);
                    break;
                }
            }
        }
    });
    client.on("message_create", async (msg) => {
        // Fired on all messages including our own
        if (msg.fromMe) {
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
    if (!isReady || !activeClient) {
        // @ts-ignore
        return res.status(503).json({ error: "WhatsApp client not ready" });
    }
    try {
        const chats = await activeClient.getChats();
        const groups = chats.filter(c => c.isGroup).map(g => ({
            id: g.id._serialized,
            name: g.name,
            // @ts-ignore
            participantsCount: g.participants?.length || 0
        }));
        res.json({ success: true, groups });
    }
    catch (e) {
        console.error("Error fetching groups:", e);
        // @ts-ignore
        res.status(500).json({ error: "Failed to fetch groups" });
    }
});
app.get("/api/groups/:id/participants", async (req, res) => {
    if (!isReady || !activeClient) {
        // @ts-ignore
        return res.status(503).json({ error: "WhatsApp client not ready" });
    }
    try {
        const chatId = req.params.id;
        const chat = await activeClient.getChatById(chatId);
        if (!chat.isGroup) {
            // @ts-ignore
            return res.status(400).json({ error: "Chat is not a group" });
        }
        // @ts-ignore
        const participants = chat.participants || [];
        const results = [];
        for (const p of participants) {
            try {
                // p.id._serialized is the contact ID
                const contactId = p.id ? p.id._serialized : null;
                if (!contactId)
                    continue;
                // Extract number directly from ID to avoid rate-limiting/timeouts
                // e.g. 33612345678@c.us -> "33612345678"
                const numberStr = p.id.user || contactId.split('@')[0];
                results.push({
                    number: `+${numberStr}`,
                    name: "Participant"
                });
            }
            catch (err) {
                console.error(`Error fetching individual participant ${p?.id?._serialized}:`, err);
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
    phoneClient.initialize();
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
    console.log("Resetting WhatsApp session...");
    // Notify frontend
    io.emit("disconnected", "manual_reset");
    await destroyActiveClient();
    // Clear auth folder for a clean restart
    const authPath = process.env.WWEBJS_DATA_PATH || path_1.default.join(process.cwd(), ".wwebjs_auth");
    if (fs_1.default.existsSync(authPath)) {
        try {
            fs_1.default.rmSync(authPath, { recursive: true, force: true });
            console.log("Cleared auth folder:", authPath);
        }
        catch (e) {
            console.warn("Could not clear auth folder:", e);
        }
    }
    // Short delay, then restart in QR mode
    setTimeout(() => {
        console.log("Restarting in QR mode...");
        createAndStartQRClient();
    }, 800);
    res.json({ success: true, message: "Session reset. Restarting in QR mode." });
});
// ─── Start server ─────────────────────────────────────────────────────────────
httpServer.listen(port, () => {
    console.log(`> Backend Ready on http://localhost:${port}`);
    // Start WA Client AFTER express is listening so the UI can at least connect
    setTimeout(() => {
        console.log("Initializing WhatsApp Client...");
        createAndStartQRClient();
    }, 1000);
});
httpServer.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use. Attempting to recover...`);
        // In a real app we might try another port, but here we just exit 
        // because the Electron app depends on 3001.
        process.exit(1);
    }
});
