process.on('unhandledRejection', (reason) => {
    const msg = reason?.stack || reason?.message || String(reason);
    if (msg.includes('Execution context was destroyed')) {
        console.log('[Puppeteer] Navigation context handled smoothly.');
        return;
    }
    console.warn('[Process] Handled async rejection:', msg);
});
process.on('uncaughtException', (err) => {
    console.error('[Process] Handled uncaught exception:', err?.stack || err?.message || String(err));
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
try { require("./patch-wwebjs"); } catch (_) {}
const { LoadUtils } = require("whatsapp-web.js/src/util/Injected/Utils");
const { ExposeStore } = require("whatsapp-web.js/src/util/Injected/Store");
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

// ─── API Integrations & Phone Settings ───────────────────────────────────────
const INTEGRATIONS_PATH = path_1.default.join(DATA_DIR, "integrations_settings.json");
const DEFAULT_INTEGRATIONS = {
    ai: {
        enabled: false,
        provider: "openai", // "openai", "gemini", "claude", "deepseek", "groq", "ollama", "custom"
        apiKey: "",
        model: "gpt-4o-mini",
        endpointUrl: "",
        systemPrompt: "You are a courteous, professional customer support assistant on WhatsApp. Answer concisely and clearly in the same language as the user (Arabic/Darija, French, or English).",
        useRagContext: true,
        temperature: 0.7,
        maxTokens: 350
    },
    scraper: {
        mode: "browser", // "browser", "google_places", "serpapi", "custom_webhook"
        googlePlacesApiKey: "",
        serpApiKey: "",
        scraperApiKey: "",
        customWebhookUrl: ""
    },
    webhooks: {
        leadsWebhookUrl: "",
        leadsWebhookEnabled: false,
        inboundMessageWebhookUrl: "",
        inboundMessageWebhookEnabled: false
    },
    phone: {
        defaultCountryCode: "212",
        autoFormatOnImport: true,
        pureDigitsForWhatsApp: true
    }
};

let integrationsSettings = { ...DEFAULT_INTEGRATIONS };

function loadIntegrationsSettings() {
    try {
        if (fs_1.default.existsSync(INTEGRATIONS_PATH)) {
            const raw = JSON.parse(fs_1.default.readFileSync(INTEGRATIONS_PATH, 'utf8'));
            integrationsSettings = {
                ai: { ...DEFAULT_INTEGRATIONS.ai, ...(raw.ai || {}) },
                scraper: { ...DEFAULT_INTEGRATIONS.scraper, ...(raw.scraper || {}) },
                webhooks: { ...DEFAULT_INTEGRATIONS.webhooks, ...(raw.webhooks || {}) },
                phone: { ...DEFAULT_INTEGRATIONS.phone, ...(raw.phone || {}) }
            };
        } else {
            fs_1.default.writeFileSync(INTEGRATIONS_PATH, JSON.stringify(DEFAULT_INTEGRATIONS, null, 2));
        }
    } catch (e) {
        console.warn("[Integrations] Could not load settings:", e.message);
    }
}

function saveIntegrationsSettings() {
    try {
        fs_1.default.writeFileSync(INTEGRATIONS_PATH, JSON.stringify(integrationsSettings, null, 2));
    } catch (e) {
        console.error("[Integrations] Could not save settings:", e.message);
    }
}
loadIntegrationsSettings();

/**
 * Normalizes scraped telephone numbers into valid WhatsApp-compatible format.
 * Eliminates invalid patterns like +0... or 21206... and guarantees valid country code prefix.
 */
function normalizeScrapedPhone(rawPhone, locationHint = "", defaultCountry = "212") {
    if (!rawPhone) return "";
    let clean = String(rawPhone).trim();
    if (!clean) return "";

    const country = String(defaultCountry || integrationsSettings.phone?.defaultCountryCode || "212").replace(/\D/g, '');

    // Convert 00 prefix to +
    if (clean.startsWith('00')) {
        clean = '+' + clean.substring(2);
    }

    // Keep only digits and plus
    clean = clean.replace(/[^\d+]/g, '');

    if (clean.startsWith('+')) {
        let afterPlus = clean.substring(1).replace(/\D/g, '');
        // Fix broken +0... pattern (e.g. +0524420559 or +0639320092)
        if (afterPlus.startsWith('0') && afterPlus.length === 10) {
            clean = `${country}${afterPlus.substring(1)}`;
        }
        // Fix redundant zero after country code (e.g. +21206... -> 2126...)
        else if (afterPlus.startsWith(`${country}0`) && afterPlus.length >= country.length + 9) {
            clean = `${country}${afterPlus.substring(country.length + 1)}`;
        } else {
            clean = afterPlus;
        }
        return clean;
    }

    let digits = clean.replace(/\D/g, '');
    // Redundant zero after country code (e.g. 2120639320092 -> 212639320092)
    if (digits.startsWith(`${country}0`) && digits.length >= country.length + 9) {
        digits = `${country}${digits.substring(country.length + 1)}`;
    }
    // Local 10-digit number with leading zero (e.g. 0524420559 -> 212524420559, 0639320092 -> 212639320092)
    else if (digits.length === 10 && digits.startsWith('0')) {
        digits = `${country}${digits.substring(1)}`;
    }
    // Local 9-digit number starting with 5, 6, 7, 8 (e.g. 524420559 -> 212524420559)
    else if (digits.length === 9 && /^[5678]/.test(digits)) {
        digits = `${country}${digits}`;
    }

    return digits;
}

/**
 * Checks whether a normalized phone number is a fixed/landline number ("numéro fixe").
 * Recognizes Moroccan landlines (05... / 2125... / 5...) and international landline prefixes.
 */
function isLandlineNumber(phone, defaultCountry = "212") {
    if (!phone) return false;
    const clean = String(phone).replace(/\D/g, '');
    const country = String(defaultCountry || integrationsSettings.phone?.defaultCountryCode || "212").replace(/\D/g, '');

    // 1. Morocco (+212): All landlines start with 2125 (12 digits) or local 05 (10 digits) or 5 (9 digits)
    if (clean.startsWith("2125") && clean.length === 12) return true;
    if (clean.startsWith("2128") && clean.length === 12) return true; // Special service / toll
    if (clean.startsWith("05") && clean.length === 10) return true;
    if (clean.startsWith("5") && clean.length === 9) return true;

    // 2. France (+33): 01-05
    if (clean.startsWith("33") && clean.length === 11 && /^33[1-5]/.test(clean)) return true;
    if (clean.startsWith("0") && clean.length === 10 && /^0[1-5]/.test(clean)) return true;

    // 3. Spain (+34): 8, 9
    if (clean.startsWith("34") && clean.length === 11 && /^34[89]/.test(clean)) return true;

    // 4. UK (+44): 01, 02
    if (clean.startsWith("44") && clean.length >= 11 && /^44[12]/.test(clean)) return true;

    // 5. Algeria (+213): 02, 03, 04
    if (clean.startsWith("213") && clean.length === 12 && /^213[234]/.test(clean)) return true;

    // 6. Tunisia (+216): 7
    if (clean.startsWith("216") && clean.length === 11 && /^2167/.test(clean)) return true;

    // 7. UAE (+971): 2, 3, 4, 6, 7, 9
    if (clean.startsWith("971") && clean.length >= 11 && /^971[234679]/.test(clean)) return true;

    // 8. Saudi (+966): 1
    if (clean.startsWith("966") && clean.length >= 11 && /^9661/.test(clean)) return true;

    return false;
}

/**
 * Checks whether a normalized phone number is a smartphone / mobile number.
 */
function isMobileNumber(phone, defaultCountry = "212") {
    if (!phone) return false;
    if (isLandlineNumber(phone, defaultCountry)) return false;

    const clean = String(phone).replace(/\D/g, '');

    // 1. Morocco (+212): Mobile numbers start with 2126 or 2127 (12 digits)
    if ((clean.startsWith("2126") || clean.startsWith("2127")) && clean.length === 12) return true;
    if ((clean.startsWith("06") || clean.startsWith("07")) && clean.length === 10) return true;
    if ((clean.startsWith("6") || clean.startsWith("7")) && clean.length === 9) return true;

    // 2. France (+33): 06, 07
    if (clean.startsWith("33") && clean.length === 11 && /^33[67]/.test(clean)) return true;

    // 3. Spain (+34): 6, 7
    if (clean.startsWith("34") && clean.length === 11 && /^34[67]/.test(clean)) return true;

    // 4. UK (+44): 07
    if (clean.startsWith("44") && clean.length >= 11 && /^447/.test(clean)) return true;

    // 5. Algeria (+213): 05, 06, 07
    if (clean.startsWith("213") && clean.length === 12 && /^213[567]/.test(clean)) return true;

    // 6. Tunisia (+216): 2, 4, 5, 9
    if (clean.startsWith("216") && clean.length === 11 && /^216[2459]/.test(clean)) return true;

    // 7. UAE (+971): 05...
    if (clean.startsWith("971") && clean.length >= 11 && /^9715/.test(clean)) return true;

    // 8. Saudi (+966): 05...
    if (clean.startsWith("966") && clean.length >= 11 && /^9665/.test(clean)) return true;

    return !isLandlineNumber(phone, defaultCountry);
}

/**
 * Returns 'mobile' | 'landline' | 'unknown'
 */
function getPhoneType(phone, defaultCountry = "212") {
    if (!phone) return "unknown";
    if (isLandlineNumber(phone, defaultCountry)) return "landline";
    if (isMobileNumber(phone, defaultCountry)) return "mobile";
    return "unknown";
}

/**
 * Universal AI Caller supporting OpenAI, Google Gemini, Anthropic Claude, DeepSeek, Groq, Ollama, and Custom LLM.
 */
async function callAiChatbot(userMessage, customConfig = {}) {
    const aiConfig = { ...integrationsSettings.ai, ...customConfig };
    const { provider, apiKey, model, endpointUrl, systemPrompt, useRagContext, temperature, maxTokens } = aiConfig;

    if (!apiKey && provider !== 'ollama') {
        throw new Error(`API Key is required for provider "${provider}"`);
    }

    // 1. Gather RAG context if enabled
    let ragContext = "";
    if (useRagContext && typeof botEngine !== "undefined") {
        try {
            const bestMatch = botEngine.findBestAnswer(userMessage);
            if (bestMatch && bestMatch.answer) {
                ragContext += `Knowledge Base Reference (${bestMatch.sourceType}): ${bestMatch.answer}\n`;
            }
            if (Array.isArray(botEngine.chunks) && botEngine.chunks.length > 0) {
                const chunksWithScores = botEngine.chunks
                    .map(c => ({ text: c.text, score: botEngine.calculateSimilarity ? botEngine.calculateSimilarity(userMessage, c.text) : 0 }))
                    .filter(c => c.score > 0.2)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 3);
                if (chunksWithScores.length > 0) {
                    ragContext += "Company Documentation Chunks:\n" + chunksWithScores.map(c => `- ${c.text}`).join("\n") + "\n";
                }
            }
        } catch (ragErr) {
            console.warn("[AI Chatbot] RAG retrieval error:", ragErr.message);
        }
    }

    const fullSystemPrompt = `${systemPrompt || "You are a helpful customer service assistant on WhatsApp."}${ragContext ? "\n\nBUSINESS CONTEXT:\n" + ragContext : ""}\n\nIMPORTANT: Provide concise, accurate responses tailored for WhatsApp. Always respond in the same language the customer uses.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
        // Google Gemini API
        if (provider === "gemini") {
            const geminiModel = model || "gemini-1.5-flash";
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: fullSystemPrompt }] },
                    contents: [{ parts: [{ text: userMessage }] }],
                    generationConfig: {
                        temperature: Number(temperature) || 0.7,
                        maxOutputTokens: Number(maxTokens) || 350
                    }
                }),
                signal: controller.signal
            });
            const data = await res.json();
            clearTimeout(timeout);
            if (!res.ok) throw new Error(data.error?.message || `Gemini API error ${res.status}`);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            return text ? text.trim() : null;
        }

        // Anthropic Claude API
        if (provider === "claude") {
            const claudeModel = model || "claude-3-5-sonnet-20241022";
            const res = await fetch("https://api.anthropic.com/v1/messages", {
                method: "POST",
                headers: {
                    "x-api-key": apiKey,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json"
                },
                body: JSON.stringify({
                    model: claudeModel,
                    system: fullSystemPrompt,
                    messages: [{ role: "user", content: userMessage }],
                    max_tokens: Number(maxTokens) || 350,
                    temperature: Number(temperature) || 0.7
                }),
                signal: controller.signal
            });
            const data = await res.json();
            clearTimeout(timeout);
            if (!res.ok) throw new Error(data.error?.message || `Claude API error ${res.status}`);
            const text = data.content?.[0]?.text;
            return text ? text.trim() : null;
        }

        // OpenAI, DeepSeek, Groq, Ollama, Custom OpenAI-Compatible
        let baseUrl = "https://api.openai.com/v1";
        let defaultModel = "gpt-4o-mini";

        if (provider === "deepseek") {
            baseUrl = "https://api.deepseek.com/v1";
            defaultModel = "deepseek-chat";
        } else if (provider === "groq") {
            baseUrl = "https://api.groq.com/openai/v1";
            defaultModel = "llama-3.3-70b-versatile";
        } else if (provider === "ollama") {
            baseUrl = (endpointUrl || "http://localhost:11434/v1").replace(/\/+$/, '');
            defaultModel = model || "llama3.2";
        } else if (provider === "custom") {
            baseUrl = (endpointUrl || "").replace(/\/+$/, '');
            defaultModel = model || "default";
        }

        const endpoint = `${baseUrl}/chat/completions`;
        const headers = { "Content-Type": "application/json" };
        if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

        const res = await fetch(endpoint, {
            method: "POST",
            headers,
            body: JSON.stringify({
                model: model || defaultModel,
                messages: [
                    { role: "system", content: fullSystemPrompt },
                    { role: "user", content: userMessage }
                ],
                temperature: Number(temperature) || 0.7,
                max_tokens: Number(maxTokens) || 350
            }),
            signal: controller.signal
        });
        const data = await res.json();
        clearTimeout(timeout);
        if (!res.ok) throw new Error(data.error?.message || `AI API returned status ${res.status}`);
        const text = data.choices?.[0]?.message?.content;
        return text ? text.trim() : null;
    } catch (err) {
        clearTimeout(timeout);
        throw err;
    }
}

function killStaleBrowserProcesses() {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            try {
                const { exec } = require('child_process');
                exec('powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process -Filter \\"name = \'chrome.exe\'\\" | Where-Object { $_.CommandLine -like \'*wwebjs_auth*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', { timeout: 6000 }, () => resolve());
            } catch (e) {
                resolve();
            }
        } else {
            resolve();
        }
    });
}

function cleanChromiumLocks() {
    const authPath = process.env.WWEBJS_DATA_PATH || path_1.default.join(process.cwd(), ".wwebjs_auth");
    if (!fs_1.default.existsSync(authPath)) return;

    // Only clean Chromium profile-level singleton locks, NEVER LevelDB database locks inside IndexedDB/LocalStorage
    const lockTargets = [
        authPath,
        path_1.default.join(authPath, "session"),
        path_1.default.join(authPath, "session", "Default")
    ];

    for (const dir of lockTargets) {
        if (fs_1.default.existsSync(dir)) {
            for (const lockFile of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
                const target = path_1.default.join(dir, lockFile);
                if (fs_1.default.existsSync(target)) {
                    try {
                        fs_1.default.unlinkSync(target);
                        console.log(`[Watchdog] Removed stale Chromium singleton lock: ${target}`);
                    } catch (e) {}
                }
            }
        }
    }
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
            try {
                Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
            } catch (_) {}
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

/**
 * Ensures window.Store and window.WWebJS (with getChat, sendMessage, etc.) are
 * properly injected into the WhatsApp Web Chromium page before any message is sent.
 * This completely avoids "Cannot read properties of undefined (reading 'getChat')".
 */
async function ensureWWebJSInjected(client) {
    if (!client || !client.pupPage || client.pupPage.isClosed()) return false;
    try {
        const alreadyInjected = await client.pupPage.evaluate(() => {
            return typeof window.WWebJS !== 'undefined' && typeof window.WWebJS.getChat === 'function';
        }).catch(() => false);

        if (alreadyInjected) return true;

        // Ensure window.Store is exposed
        let hasStore = await client.pupPage.evaluate(() => {
            return typeof window.Store !== 'undefined' && !!window.Store.Chat;
        }).catch(() => false);

        if (!hasStore) {
            await client.pupPage.evaluate(ExposeStore).catch(() => {});
            for (let i = 0; i < 20; i++) {
                hasStore = await client.pupPage.evaluate(() => {
                    return typeof window.Store !== 'undefined' && !!window.Store.Chat;
                }).catch(() => false);
                if (hasStore) break;
                await new Promise(r => setTimeout(r, 200));
            }
        }

        // Evaluate LoadUtils to populate window.WWebJS
        await client.pupPage.evaluate(LoadUtils).catch(err => {
            console.warn("[Watchdog] Notice evaluating LoadUtils:", err.message);
        });

        // Verify that window.WWebJS.getChat is now a function
        const verified = await client.pupPage.evaluate(() => {
            return typeof window.WWebJS !== 'undefined' && typeof window.WWebJS.getChat === 'function';
        }).catch(() => false);

        if (verified) {
            console.log("[Watchdog] window.WWebJS utilities successfully confirmed on page.");
        }
        return !!verified;
    } catch (err) {
        console.warn("[Watchdog] ensureWWebJSInjected error:", err.message);
        return false;
    }
}
// ─── Shared puppeteer args ──────────────────────────────────────────────────
const WIN_CHROME_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";
const PUPPETEER_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling",
    "--disable-features=CalculateNativeWinOcclusion",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    `--user-agent=${WIN_CHROME_USER_AGENT}`,
];
// ─── Multi-Device Registry ────────────────────────────────────────────────────
/**
 * Each connected WhatsApp number is a DeviceSession stored in the devices Map.
 * @typedef {{
 *   id: string, label: string, phoneNumber: string,
 *   client: any, isReady: boolean, isAuthenticated: boolean, qrCodeData: string,
 *   isDefault: boolean, createdAt: string,
 *   heartbeatInterval: any, authStallTimer: any, reconnectTimer: any, isReconnecting: boolean,
 *   warmingStatus: 'off'|'warming'|'warmed'|'paused',
 *   warmingStartDate: string|null, warmingDay: number, warmingMaxDay: number,
 *   messagesSentToday: number, dailyLimit: number, lastDailyReset: string
 * }} DeviceSession
 */
const MAX_DEVICES = 5;
const DEVICES_PATH = path_1.default.join(DATA_DIR, "devices.json");
const WARMING_PATH = path_1.default.join(DATA_DIR, "warming_state.json");
/** @type {Map<string, DeviceSession>} */
const devices = new Map();
let defaultDeviceId = null;

// Warming schedule (14-day default)
const WARMING_SCHEDULE = [
    { day: 1, maxMessages: 5 },
    { day: 2, maxMessages: 8 },
    { day: 3, maxMessages: 12 },
    { day: 4, maxMessages: 18 },
    { day: 5, maxMessages: 25 },
    { day: 6, maxMessages: 30 },
    { day: 7, maxMessages: 40 },
    { day: 8, maxMessages: 50 },
    { day: 9, maxMessages: 55 },
    { day: 10, maxMessages: 60 },
    { day: 11, maxMessages: 70 },
    { day: 12, maxMessages: 80 },
    { day: 13, maxMessages: 90 },
    { day: 14, maxMessages: 100 },
];

function getWarmingLimit(day) {
    const entry = [...WARMING_SCHEDULE].reverse().find(e => e.day <= day);
    return entry ? entry.maxMessages : 100;
}

/** Get the default (primary) device session, or the first ready device, or any device */
function getDefaultDevice() {
    if (defaultDeviceId && devices.has(defaultDeviceId)) return devices.get(defaultDeviceId);
    for (const d of devices.values()) { if (d.isReady) return d; }
    for (const d of devices.values()) { return d; }
    return null;
}

/** Get all ready devices */
function getReadyDevices() {
    return [...devices.values()].filter(d => d.isReady && d.client);
}

/** Serialize device list for API / socket (excludes client object) */
function serializeDevices() {
    return [...devices.values()].map(d => ({
        id: d.id, label: d.label, phoneNumber: d.phoneNumber,
        isReady: d.isReady, isAuthenticated: d.isAuthenticated,
        qrCode: d.qrCodeData || "", isDefault: d.isDefault,
        warmingStatus: d.warmingStatus, warmingDay: d.warmingDay, warmingMaxDay: d.warmingMaxDay,
        messagesSentToday: d.messagesSentToday, dailyLimit: d.dailyLimit,
        createdAt: d.createdAt
    }));
}

// ─── Backwards Compatibility Getters ─────────────────────────────────────────
// These ensure existing code (campaign, chatbot, auto-reply) works unchanged.
Object.defineProperty(global, '__wapp_compat', { value: true });

/** @returns {any} The default device's wwebjs Client */
function get_activeClient() {
    const d = getDefaultDevice();
    return d ? d.client : null;
}
/** @returns {boolean} True if ANY device is ready */
function get_isReady() {
    for (const d of devices.values()) { if (d.isReady) return true; }
    return false;
}
/** @returns {boolean} True if ANY device is authenticated */
function get_isAuthenticated() {
    for (const d of devices.values()) { if (d.isAuthenticated) return true; }
    return false;
}
/** @returns {string} The default device's QR code */
function get_qrCodeData() {
    const d = getDefaultDevice();
    return d ? d.qrCodeData : "";
}

// Legacy variable aliases — used throughout existing code
let activeClient = null;   // Will be kept in sync via updateLegacyState()
let isReady = false;
let isAuthenticated = false;
let qrCodeData = "";
let reconnectTimer = null;
let isReconnecting = false;
let heartbeatInterval = null;
let authStallTimer = null;

function updateLegacyState() {
    const d = getDefaultDevice();
    activeClient = d ? d.client : null;
    isReady = get_isReady();
    isAuthenticated = get_isAuthenticated();
    qrCodeData = get_qrCodeData();
}

// ─── Device Persistence ─────────────────────────────────────────────────────
function saveDeviceRegistry() {
    try {
        const data = [...devices.values()].map(d => ({
            id: d.id, label: d.label, phoneNumber: d.phoneNumber,
            isDefault: d.isDefault, createdAt: d.createdAt,
            warmingStatus: d.warmingStatus, warmingStartDate: d.warmingStartDate,
            warmingDay: d.warmingDay, warmingMaxDay: d.warmingMaxDay,
            messagesSentToday: d.messagesSentToday, dailyLimit: d.dailyLimit,
            lastDailyReset: d.lastDailyReset
        }));
        fs_1.default.writeFileSync(DEVICES_PATH, JSON.stringify({ defaultDeviceId, devices: data }, null, 2));
    } catch (e) {
        console.error("[Devices] Failed to save registry:", e.message);
    }
}

function loadDeviceRegistry() {
    if (!fs_1.default.existsSync(DEVICES_PATH)) return [];
    try {
        const raw = JSON.parse(fs_1.default.readFileSync(DEVICES_PATH, "utf8"));
        if (raw.defaultDeviceId) defaultDeviceId = raw.defaultDeviceId;
        return Array.isArray(raw.devices) ? raw.devices : [];
    } catch (e) {
        console.warn("[Devices] Failed to load registry:", e.message);
        return [];
    }
}

// Campaign state
let isBulkRunning = false;
let currentBulkResults = [];
const HISTORY_PATH = path_1.default.join(DATA_DIR, "history.json");

// ─── Auto Responses State ───────────────────────────────────────────────────
const AUTO_RESPONSES_PATH = path_1.default.join(DATA_DIR, "auto_responses.json");
let autoResponses = [];
function loadAutoResponses() {
    if (fs_1.default.existsSync(AUTO_RESPONSES_PATH)) {
        try {
            const data = JSON.parse(fs_1.default.readFileSync(AUTO_RESPONSES_PATH, "utf8"));
            if (Array.isArray(data)) autoResponses = data;
        } catch (e) {
            autoResponses = [];
        }
    }
}
loadAutoResponses();

/**
 * Intelligent WhatsApp Phone Number Resolver:
 * Cleans formatting and resolves local format numbers (e.g. 0612345678) by determining
 * the user's active country code (+212 / +33 / etc.) and verifying via getNumberId.
 */
async function resolveWhatsAppNumber(rawNumber, client) {
    if (!rawNumber) return null;
    const str = String(rawNumber).trim();
    if (str.includes('@lid') || str.includes('@c.us') || str.includes('@g.us')) {
        return {
            jid: str,
            number: str.split('@')[0]
        };
    }

    let clean = str.replace(/[^\d+]/g, '');
    if (clean.startsWith('00')) clean = clean.substring(2);
    if (clean.startsWith('+')) clean = clean.substring(1);

    // Extract country code from active client's own phone number if available
    let myCountryCode = "212"; // Default to Morocco
    try {
        const myWid = client?.info?.wid?.user || "";
        if (myWid.startsWith("212")) myCountryCode = "212";
        else if (myWid.startsWith("33")) myCountryCode = "33";
        else if (myWid.startsWith("1")) myCountryCode = "1";
        else if (myWid.startsWith("34")) myCountryCode = "34";
        else if (myWid.startsWith("44")) myCountryCode = "44";
        else if (myWid.startsWith("971")) myCountryCode = "971";
        else if (myWid.startsWith("966")) myCountryCode = "966";
        else if (myWid.length >= 10) {
            myCountryCode = myWid.substring(0, myWid.length - 9);
        }
    } catch (_) {}

    const candidates = [];

    // Case 1: Local number starting with 0 (e.g. 0612345678 or 0707031614)
    if (clean.startsWith('0') && clean.length >= 9) {
        const withoutZero = clean.substring(1);
        if (myCountryCode && !candidates.includes(`${myCountryCode}${withoutZero}`)) candidates.push(`${myCountryCode}${withoutZero}`);
        if (!candidates.includes(`212${withoutZero}`)) candidates.push(`212${withoutZero}`);
        if (!candidates.includes(`33${withoutZero}`)) candidates.push(`33${withoutZero}`);
    }

    // Case 2: 9 digits without 0 (e.g. 638273545 or 707031614)
    if (clean.length === 9 && (clean.startsWith('6') || clean.startsWith('7'))) {
        if (myCountryCode && !candidates.includes(`${myCountryCode}${clean}`)) candidates.push(`${myCountryCode}${clean}`);
        if (!candidates.includes(`212${clean}`)) candidates.push(`212${clean}`);
        if (!candidates.includes(`33${clean}`)) candidates.push(`33${clean}`);
    }

    // Case 3: Full international format or raw digits
    if (!candidates.includes(clean)) {
        candidates.push(clean);
    }

    // Test candidates on WhatsApp
    for (const num of candidates) {
        try {
            if (client && typeof client.getNumberId === 'function') {
                const contactId = await client.getNumberId(num);
                if (contactId && contactId._serialized) {
                    console.log(`[resolveWhatsAppNumber] Resolved ${rawNumber} -> ${contactId._serialized}`);
                    return {
                        jid: contactId._serialized,
                        number: contactId.user || num
                    };
                }
            }
        } catch (_) {}
    }

    // If getNumberId didn't return a verified contact, use best candidate
    const bestNum = candidates[0] || clean;
    console.log(`[resolveWhatsAppNumber] Fallback ${rawNumber} -> ${bestNum}@c.us`);
    return {
        jid: `${bestNum}@c.us`,
        number: bestNum
    };
}

// ─── Call Responder State ───────────────────────────────────────────────────
const CALL_RESPONDER_PATH = path_1.default.join(DATA_DIR, "call_responder.json");
let callResponderConfig = {
    enabled: false,
    rejectVoice: true,
    rejectVideo: true,
    replyMessage: "Hello! I am currently unable to take phone calls. Please leave your message here and I will reply as soon as possible.",
    autoReplyDelayMs: 1500,
    stats: {
        rejectedCalls: 0,
        repliesSent: 0
    }
};
function loadCallResponder() {
    if (fs_1.default.existsSync(CALL_RESPONDER_PATH)) {
        try {
            const data = JSON.parse(fs_1.default.readFileSync(CALL_RESPONDER_PATH, "utf8"));
            callResponderConfig = { ...callResponderConfig, ...data };
            if (!callResponderConfig.stats) {
                callResponderConfig.stats = { rejectedCalls: 0, repliesSent: 0 };
            }
        } catch (e) {
            console.error("Failed to load call responder config", e);
        }
    }
}
function saveCallResponder() {
    try {
        fs_1.default.writeFileSync(CALL_RESPONDER_PATH, JSON.stringify(callResponderConfig, null, 2));
    } catch (e) {
        console.error("Failed to save call responder config", e);
    }
}
loadCallResponder();

// ─── Templates State ────────────────────────────────────────────────────────
const TEMPLATES_PATH = path_1.default.join(DATA_DIR, "templates.json");
let messageTemplates = [
    {
        id: "tpl-welcome",
        title: "Welcome Greeting",
        category: "Onboarding",
        content: "Hello {{name}}! 👋 Welcome to our service. We are excited to have you with us! Let us know if you have any questions.",
        createdAt: new Date().toISOString()
    },
    {
        id: "tpl-reminder",
        title: "Appointment / Meeting Reminder",
        category: "Reminders",
        content: "Hi {{name}}, this is a friendly reminder for our scheduled appointment. Please let us know if you need any adjustments. Have a great day!",
        createdAt: new Date().toISOString()
    },
    {
        id: "tpl-promo",
        title: "VIP Exclusive Discount",
        category: "Marketing",
        content: "🎉 Special offer for {{name}}! Enjoy 20% off your next order today with promo code VIP2026. Reply here to claim your offer!",
        createdAt: new Date().toISOString()
    },
    {
        id: "tpl-followup",
        title: "Customer Satisfaction Check",
        category: "Support",
        content: "Hi {{name}}, following up on our recent conversation. How was your experience? Your feedback means a lot to us!",
        createdAt: new Date().toISOString()
    }
];
function loadTemplates() {
    if (fs_1.default.existsSync(TEMPLATES_PATH)) {
        try {
            messageTemplates = JSON.parse(fs_1.default.readFileSync(TEMPLATES_PATH, "utf8"));
        } catch (e) {
            console.error("Failed to load templates", e);
        }
    } else {
        saveTemplates();
    }
}
function saveTemplates() {
    try {
        fs_1.default.writeFileSync(TEMPLATES_PATH, JSON.stringify(messageTemplates, null, 2));
    } catch (e) {
        console.error("Failed to save templates", e);
    }
}
loadTemplates();

// ─── Proxies State ──────────────────────────────────────────────────────────
const PROXIES_PATH = path_1.default.join(DATA_DIR, "proxies.json");
let campaignProxies = [];
function loadProxies() {
    if (fs_1.default.existsSync(PROXIES_PATH)) {
        try {
            campaignProxies = JSON.parse(fs_1.default.readFileSync(PROXIES_PATH, "utf8"));
        } catch (e) {
            console.error("Failed to load proxies", e);
        }
    }
}
function saveProxies() {
    try {
        fs_1.default.writeFileSync(PROXIES_PATH, JSON.stringify(campaignProxies, null, 2));
    } catch (e) {
        console.error("Failed to save proxies", e);
    }
}
loadProxies();

// ─── Client factory ───────────────────────────────────────────────────────────
/**
 * Build shared Client options (auth + puppeteer).
 * @param {string} deviceId - Unique device identifier for session isolation
 * @param {string} [pairWithPhoneNumber] - Pass to enable phone-pairing mode.
 */
function buildClientOptions(deviceId, pairWithPhoneNumber) {
    const opts = {
        authStrategy: new whatsapp_web_js_1.LocalAuth({
            clientId: deviceId || "default",
            dataPath: process.env.WWEBJS_DATA_PATH || "./.wwebjs_auth",
        }),
        webVersionCache: {
            type: 'none',
        },
        authTimeoutMs: 60000,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 10000,
        userAgent: WIN_CHROME_USER_AGENT,
        puppeteer: {
            headless: process.env.SHOW_CHROME === 'true' ? false : true,
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

function hookPageLogging(client) {
    let checkCount = 0;
    const interval = setInterval(() => {
        checkCount++;
        if (client.pupPage && !client.pupPage.isClosed()) {
            clearInterval(interval);
            client.pupPage.on('console', msg => {
                const text = msg.text();
                if (text.includes('Error') || text.includes('error') || text.includes('fail') || text.includes('denied') || text.includes('WA')) {
                    console.log(`[Browser Console] ${text.slice(0, 200)}`);
                }
            });
            client.pupPage.on('pageerror', err => {
                console.log(`[Browser PageError] ${err.message}`);
            });
        } else if (checkCount > 50) {
            clearInterval(interval);
        }
    }, 250);
}
/**
 * Destroy the active client cleanly, reset shared state.
 * @param skipLogout - Set true when switching modes (logout is slow, ~3s). Only use full logout on reset.
 */
async function destroyActiveClient(skipLogout = false) {
    // Legacy: destroy the default/active device
    const d = getDefaultDevice();
    if (d) {
        await destroyDeviceClient(d.id, skipLogout);
    } else {
        activeClient = null;
        isReady = false;
        isAuthenticated = false;
        qrCodeData = "";
    }
}

/**
 * Destroy a specific device's client cleanly.
 * @param {string} deviceId
 * @param {boolean} skipLogout
 */
async function destroyDeviceClient(deviceId, skipLogout = false) {
    const d = devices.get(deviceId);
    if (!d) return;
    if (d.heartbeatInterval) { clearInterval(d.heartbeatInterval); d.heartbeatInterval = null; }
    if (d.authStallTimer) { clearTimeout(d.authStallTimer); clearInterval(d.authStallTimer); d.authStallTimer = null; }
    if (d.reconnectTimer) { clearTimeout(d.reconnectTimer); d.reconnectTimer = null; }
    const c = d.client;
    d.client = null;
    d.isReady = false;
    d.isAuthenticated = false;
    d.qrCodeData = "";
    updateLegacyState();
    if (!c) return;
    if (!skipLogout) {
        try {
            await Promise.race([
                c.logout(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Logout timeout")), 2000))
            ]);
        } catch { /* ignore */ }
    }
    try {
        await Promise.race([
            c.destroy(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Destroy timeout")), 2500))
        ]);
    } catch (e) {
        console.warn(`[Watchdog] Notice on device ${deviceId} destroy:`, e.message);
    }
    await new Promise(r => setTimeout(r, 800));
}

function scheduleDeviceReconnect(deviceId, delayMs = 5000) {
    const d = devices.get(deviceId);
    if (!d || d.isReconnecting) return;
    d.isReconnecting = true;
    if (d.reconnectTimer) clearTimeout(d.reconnectTimer);
    console.log(`[Watchdog] Device ${deviceId}: scheduling reconnect in ${delayMs / 1000}s...`);
    io.emit("device:reconnecting", { deviceId, delayMs });
    io.emit("reconnecting", { delayMs }); // Legacy
    d.reconnectTimer = setTimeout(async () => {
        try {
            console.log(`[Watchdog] Device ${deviceId}: attempting automatic reconnection...`);
            await destroyDeviceClient(deviceId, true);
            cleanChromiumLocks();
            await new Promise(r => setTimeout(r, 1000));
            createDeviceClient(deviceId, d.label);
        } catch (err) {
            console.error(`[Watchdog] Device ${deviceId}: auto-reconnect failed:`, err);
        } finally {
            if (devices.has(deviceId)) devices.get(deviceId).isReconnecting = false;
        }
    }, delayMs);
}

// Legacy wrapper
function scheduleAutoReconnect(delayMs = 5000) {
    const d = getDefaultDevice();
    if (d) scheduleDeviceReconnect(d.id, delayMs);
}

function startDeviceHeartbeat(deviceId) {
    const d = devices.get(deviceId);
    if (!d) return;
    if (d.heartbeatInterval) clearInterval(d.heartbeatInterval);
    let consecutiveFailures = 0;
    d.heartbeatInterval = setInterval(async () => {
        const dev = devices.get(deviceId);
        if (!dev || !dev.client || !dev.isReady) return;
        try {
            const state = await Promise.race([
                dev.client.getState(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Heartbeat timeout")), 10000))
            ]);
            if (state === "CONNECTED" || state === "PAIRING" || state === "OPENING") {
                consecutiveFailures = 0;
                return;
            }
            if (state === "UNPAIRED") {
                consecutiveFailures++;
                console.warn(`[Watchdog] Device ${deviceId}: unpaired state (${consecutiveFailures}/3)`);
                if (consecutiveFailures >= 3) {
                    console.warn(`[Watchdog] Device ${deviceId}: confirmed UNPAIRED. Auto-reconnecting...`);
                    scheduleDeviceReconnect(deviceId, 3000);
                }
            } else {
                console.log(`[Watchdog] Device ${deviceId}: heartbeat state: ${state || 'transient/syncing'}`);
            }
        } catch (err) {
            console.warn(`[Watchdog] Device ${deviceId}: heartbeat issue:`, err.message);
        }
    }, 30000);
}

// Legacy wrapper
function startWatchdogHeartbeat() {
    const d = getDefaultDevice();
    if (d) startDeviceHeartbeat(d.id);
}

/**
 * Create, register event listeners, and initialize a client for a specific device.
 * @param {string} deviceId - Unique device identifier
 * @param {string} label - User-friendly label
 * @returns {any} The wwebjs Client instance
 */
function createDeviceClient(deviceId, label) {
    cleanChromiumLocks();
    const client = new whatsapp_web_js_1.Client(buildClientOptions(deviceId));

    // Create or update device session
    let d = devices.get(deviceId);
    if (!d) {
        d = {
            id: deviceId, label: label || `Device ${devices.size + 1}`,
            phoneNumber: "", client: null, isReady: false, isAuthenticated: false, qrCodeData: "",
            isDefault: devices.size === 0, createdAt: new Date().toISOString(),
            heartbeatInterval: null, authStallTimer: null, reconnectTimer: null, isReconnecting: false,
            warmingStatus: "off", warmingStartDate: null, warmingDay: 0, warmingMaxDay: 14,
            messagesSentToday: 0, dailyLimit: 100, lastDailyReset: new Date().toISOString().split('T')[0]
        };
        devices.set(deviceId, d);
        if (d.isDefault) defaultDeviceId = deviceId;
    }
    d.client = client;

    registerDeviceEvents(deviceId, client);
    hookPageLogging(client);
    client.initialize().catch(err => {
        console.warn(`[Watchdog] Device ${deviceId}: initialize notice:`, err?.stack || err);
        const dev = devices.get(deviceId);
        if (dev && dev.client === client) {
            scheduleDeviceReconnect(deviceId, 3000);
        }
    });
    updateLegacyState();
    saveDeviceRegistry();
    io.emit("devices:list", serializeDevices());
    return client;
}

/**
 * Legacy wrapper: create the default (or first) device.
 */
function createAndStartQRClient() {
    const saved = loadDeviceRegistry();
    if (saved && saved.length > 0) {
        for (const s of saved) {
            if (!devices.has(s.id)) {
                devices.set(s.id, {
                    id: s.id,
                    label: s.label,
                    phoneNumber: s.phoneNumber || "",
                    client: null,
                    isReady: false,
                    isAuthenticated: false,
                    qrCodeData: "",
                    isDefault: !!s.isDefault,
                    createdAt: s.createdAt || new Date().toISOString(),
                    heartbeatInterval: null,
                    authStallTimer: null,
                    reconnectTimer: null,
                    isReconnecting: false,
                    warmingStatus: s.warmingStatus || "off",
                    warmingStartDate: s.warmingStartDate || null,
                    warmingDay: s.warmingDay || 0,
                    warmingMaxDay: s.warmingMaxDay || 14,
                    messagesSentToday: s.messagesSentToday || 0,
                    dailyLimit: s.dailyLimit || 100,
                    lastDailyReset: s.lastDailyReset || new Date().toISOString().split('T')[0]
                });
            }
        }
        const target = getDefaultDevice() || devices.values().next().value;
        if (target) {
            return createDeviceClient(target.id, target.label);
        }
    }
    // If no devices exist, create a default one
    if (devices.size === 0) {
        return createDeviceClient("device-1", "WhatsApp 1");
    }
    // Otherwise restart the default device
    const d = getDefaultDevice();
    if (d) {
        return createDeviceClient(d.id, d.label);
    }
    return createDeviceClient("device-1", "WhatsApp 1");
}
/**
 * Register all WhatsApp event listeners onto a client for a specific device.
 * Emits both legacy events and device:-prefixed events.
 * @param {string} deviceId
 * @param {any} client - wwebjs Client
 */
function registerDeviceEvents(deviceId, client) {
    client.on("error", (err) => {
        console.warn(`[Watchdog] Device ${deviceId}: error:`, err?.message || String(err));
    });
    client.on("qr", (qr) => {
        console.log(`[Device ${deviceId}] QR RECEIVED`);
        const d = devices.get(deviceId);
        if (d) {
            d.qrCodeData = qr;
            d.isAuthenticated = false;
            d.isReady = false;
            if (d.authStallTimer) { clearInterval(d.authStallTimer); d.authStallTimer = null; }
            updateLegacyState();
        }
        io.emit("device:qr", { deviceId, qr });
        io.emit("qr", qr); // Legacy
        io.emit("devices:list", serializeDevices());
    });
    client.on("ready", async () => {
        console.log(`[Device ${deviceId}] Client is ready!`);
        const d = devices.get(deviceId);
        if (d) {
            if (d.authStallTimer) { clearInterval(d.authStallTimer); d.authStallTimer = null; }
            await ensureWWebJSInjected(client);
            d.isReady = true;
            d.isAuthenticated = true;
            d.qrCodeData = "";
            // Try to extract phone number
            try {
                const info = client.info;
                if (info && info.wid && info.wid.user) {
                    d.phoneNumber = info.wid.user;
                }
            } catch (_) {}
            updateLegacyState();
            saveDeviceRegistry();
        }
        io.emit("device:ready", { deviceId, phoneNumber: d ? d.phoneNumber : "" });
        io.emit("ready", true); // Legacy
        io.emit("devices:list", serializeDevices());
        startDeviceHeartbeat(deviceId);
    });
    client.on("authenticated", () => {
        console.log(`[Device ${deviceId}] Authenticated - Synchronizing session chats...`);
        const d = devices.get(deviceId);
        if (d) {
            d.isAuthenticated = true;
            d.qrCodeData = "";
            updateLegacyState();
        }
        io.emit("device:authenticated", { deviceId });
        io.emit("authenticated", true); // Legacy
        io.emit("devices:list", serializeDevices());

        // Responsive watchdog: Polls every 1.5s after authentication to detect when WhatsApp Web finishes chat sync
        if (d) {
            if (d.authStallTimer) { clearInterval(d.authStallTimer); clearTimeout(d.authStallTimer); }
            let checkCount = 0;
            d.authStallTimer = setInterval(async () => {
                checkCount++;
                const dev = devices.get(deviceId);
                if (!dev || dev.isReady || dev.client !== client || checkCount > 40) {
                    if (dev && dev.authStallTimer) { clearInterval(dev.authStallTimer); dev.authStallTimer = null; }
                    return;
                }
                try {
                    if (client.pupPage && !client.pupPage.isClosed()) {
                        const uiActive = await client.pupPage.evaluate(() => {
                            const hasPane = !!(document.querySelector('#pane-side') || document.querySelector('[data-testid="chat-list"]'));
                            const hasStore = typeof window.Store !== 'undefined' && !!(window.Store.Chat || window.Store.SendMessage);
                            return hasPane || hasStore;
                        }).catch(() => false);

                        if (uiActive && dev && !dev.isReady) {
                            console.log(`[Watchdog] Device ${deviceId}: WhatsApp Web UI confirmed active. Emitting ready!`);
                            if (dev.authStallTimer) { clearInterval(dev.authStallTimer); dev.authStallTimer = null; }
                            await ensureWWebJSInjected(client);
                            dev.isReady = true;
                            dev.isAuthenticated = true;
                            dev.qrCodeData = "";
                            try {
                                const info = client.info;
                                if (info && info.wid && info.wid.user) dev.phoneNumber = info.wid.user;
                            } catch (_) {}
                            updateLegacyState();
                            saveDeviceRegistry();
                            io.emit("device:ready", { deviceId, phoneNumber: dev.phoneNumber });
                            io.emit("ready", true);
                            io.emit("devices:list", serializeDevices());
                            startDeviceHeartbeat(deviceId);
                        }
                    }
                } catch (_) {}
            }, 1500);
        }
    });
    client.on("disconnected", async (reason) => {
        console.log(`[Device ${deviceId}] Disconnected:`, reason);
        const d = devices.get(deviceId);
        if (d) {
            if (d.authStallTimer) { clearTimeout(d.authStallTimer); clearInterval(d.authStallTimer); d.authStallTimer = null; }
        }
        if (d && d.client === client) {
            if (reason === "LOGOUT") {
                console.log(`[Watchdog] Device ${deviceId}: logged out. Wiping session for fresh QR...`);
                d.isReady = false;
                d.isAuthenticated = false;
                d.qrCodeData = "";
                d.phoneNumber = "";
                updateLegacyState();
                io.emit("device:disconnected", { deviceId, reason });
                io.emit("disconnected", reason);
                io.emit("devices:list", serializeDevices());

                await destroyDeviceClient(deviceId, true);
                await killStaleBrowserProcesses();
                await new Promise(r => setTimeout(r, 600));
                cleanChromiumLocks();
                saveDeviceRegistry();

                setTimeout(() => {
                    console.log(`[Watchdog] Device ${deviceId}: restarting for new QR...`);
                    createDeviceClient(deviceId, d.label);
                }, 1000);
            } else if (reason === "Max qrcode retries reached") {
                d.isReady = false;
                d.isAuthenticated = false;
                d.qrCodeData = "";
                updateLegacyState();
                io.emit("device:disconnected", { deviceId, reason });
                io.emit("disconnected", reason);
                io.emit("devices:list", serializeDevices());
                scheduleDeviceReconnect(deviceId, 2000);
            } else if (reason !== "manual_reset") {
                console.log(`[Watchdog] Device ${deviceId}: disconnect (${reason}). Checking browser...`);
                setTimeout(async () => {
                    const dev = devices.get(deviceId);
                    if (dev && dev.client === client && client.pupPage && !client.pupPage.isClosed()) {
                        try {
                            const stillAlive = await client.pupPage.evaluate(() => {
                                return !!(document.querySelector('#pane-side') || (window.Store && window.Store.Chat));
                            }).catch(() => false);
                            if (stillAlive) {
                                console.log(`[Watchdog] Device ${deviceId}: session still alive. Restoring ready!`);
                                await ensureWWebJSInjected(client);
                                dev.isReady = true;
                                dev.isAuthenticated = true;
                                updateLegacyState();
                                io.emit("device:ready", { deviceId, phoneNumber: dev.phoneNumber });
                                io.emit("ready", true);
                                io.emit("devices:list", serializeDevices());
                                return;
                            }
                        } catch (_) {}
                    }
                    if (dev) {
                        dev.isReady = false;
                        dev.isAuthenticated = false;
                        dev.qrCodeData = "";
                        updateLegacyState();
                    }
                    io.emit("device:disconnected", { deviceId, reason });
                    io.emit("disconnected", reason);
                    io.emit("devices:list", serializeDevices());
                    scheduleDeviceReconnect(deviceId, 5000);
                }, 4000);
            }
        }
    });
    client.on("auth_failure", (msg) => {
        console.error(`[Device ${deviceId}] AUTH FAILURE`, msg);
        const d = devices.get(deviceId);
        if (d) {
            if (d.authStallTimer) { clearInterval(d.authStallTimer); d.authStallTimer = null; }
            d.isReady = false;
            d.isAuthenticated = false;
            d.qrCodeData = "";
            updateLegacyState();
        }
        io.emit("device:disconnected", { deviceId, reason: "auth_failure" });
        io.emit("auth_failure", msg);
        io.emit("devices:list", serializeDevices());
        scheduleDeviceReconnect(deviceId, 3000);
    });
    client.on("loading_screen", (percent, message) => {
        console.log(`[Device ${deviceId}] LOADING`, percent, message);
        io.emit("device:loading", { deviceId, percent, message });
        io.emit("loading_screen", { percent, message });
    });
    client.on("code", (code) => {
        console.log(`[Device ${deviceId}] Pairing code:`, code);
        io.emit("device:pairing_code", { deviceId, code });
        io.emit("pairing_code", { code });
    });
    // Message handling — runs on ALL devices but auto-reply uses default device only
    client.on("message", async (msg) => {
        try {
            const contact = await msg.getContact();
            io.emit("incoming_message", {
                id: msg.id._serialized,
                from: msg.from,
                number: contact.number,
                name: contact.pushname || contact.name || "Unknown",
                body: msg.body,
                timestamp: msg.timestamp * 1000,
                isGroup: msg.from.includes("@g.us"),
                deviceId
            });
        } catch (e) {
            console.error("Error emitting incoming message", e);
        }

        // Auto-reply only on the default device (skip groups)
        const defaultDev = getDefaultDevice();
        if (msg.from.includes("@g.us") || !defaultDev || defaultDev.id !== deviceId) return;

        botEngine.recordIncoming(msg.from, msg.body);
        const lowerBody = msg.body.toLowerCase().trim();
        let replied = false;

        for (const rule of autoResponses) {
            if (rule.exactMatch) {
                if (lowerBody === rule.keyword.toLowerCase().trim()) {
                    await msg.reply(rule.response);
                    replied = true;
                    break;
                }
            } else {
                if (lowerBody.includes(rule.keyword.toLowerCase().trim())) {
                    await msg.reply(rule.response);
                    replied = true;
                    break;
                }
            }
        }

        if (!replied && botEngine.settings.autoReply) {
            try {
                const match = botEngine.findBestAnswer(msg.body);
                const threshold = (botEngine.settings.similarityThreshold || 0.45) * 100;
                if (match && match.answer && match.score >= threshold) {
                    await msg.reply(match.answer);
                    replied = true;
                } else if (integrationsSettings.ai && integrationsSettings.ai.enabled) {
                    const aiReply = await callAiChatbot(msg.body);
                    if (aiReply) {
                        await msg.reply(aiReply);
                        replied = true;
                        if (botEngine.settings.autoLearn) botEngine.addLearnedPair(msg.body, aiReply);
                    }
                } else if (match && match.answer) {
                    await msg.reply(match.answer);
                    replied = true;
                }
            } catch (err) {
                console.error("[ChatbotRag/AI] Auto-reply error:", err.message);
            }
        }

        if (integrationsSettings.webhooks?.inboundMessageWebhookEnabled && integrationsSettings.webhooks?.inboundMessageWebhookUrl) {
            fetch(integrationsSettings.webhooks.inboundMessageWebhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event: "whatsapp_message_received",
                    from: msg.from, body: msg.body, deviceId,
                    timestamp: (msg.timestamp || Math.floor(Date.now() / 1000)) * 1000,
                    hasMedia: msg.hasMedia || false, replied
                }),
                signal: AbortSignal.timeout(6000)
            }).catch(wErr => console.warn("[Webhook] Inbound webhook error:", wErr.message));
        }
    });
    client.on("message_create", async (msg) => {
        if (msg.fromMe) {
            if (!msg.to.includes("@g.us")) botEngine.recordOutgoing(msg.to, msg.body);
            // Track messages for warming
            const d = devices.get(deviceId);
            if (d) {
                d.messagesSentToday++;
                if (d.warmingStatus === "warming") {
                    io.emit("device:warming_update", {
                        deviceId, warmingStatus: d.warmingStatus, warmingDay: d.warmingDay,
                        messagesSentToday: d.messagesSentToday, dailyLimit: d.dailyLimit
                    });
                }
            }
            try {
                io.emit("outgoing_message", {
                    id: msg.id._serialized, to: msg.to,
                    body: msg.body, timestamp: msg.timestamp * 1000, deviceId
                });
            } catch (e) {}
        }
    });
    client.on("call", async (call) => {
        try {
            console.log(`[CallResponder] Device ${deviceId}: incoming ${call.isVideo ? 'video' : 'voice'} call from ${call.from}`);
            if (callResponderConfig.enabled) {
                const shouldReject = (call.isVideo && callResponderConfig.rejectVideo) || (!call.isVideo && callResponderConfig.rejectVoice);
                if (shouldReject) {
                    await call.reject();
                    callResponderConfig.stats.rejectedCalls = (callResponderConfig.stats.rejectedCalls || 0) + 1;
                    let sentAutoReply = false;
                    if (callResponderConfig.replyMessage && callResponderConfig.replyMessage.trim()) {
                        await new Promise(r => setTimeout(r, callResponderConfig.autoReplyDelayMs || 1200));
                        try {
                            await client.sendMessage(call.from, callResponderConfig.replyMessage.trim());
                            callResponderConfig.stats.repliesSent = (callResponderConfig.stats.repliesSent || 0) + 1;
                            sentAutoReply = true;
                        } catch (msgErr) {
                            console.warn("[CallResponder] Failed to send reply:", msgErr.message);
                        }
                    }
                    saveCallResponder();
                    io.emit("call_event", { from: call.from, isVideo: !!call.isVideo, rejected: true, replied: sentAutoReply, timestamp: Date.now(), deviceId });
                }
            }
        } catch (err) {
            console.warn("[CallResponder] Error:", err.message);
        }
    });
}
// Keep legacy alias
function registerClientEvents(client) { registerDeviceEvents("device-1", client); }
// ─── Boot ─────────────────────────────────────────────────────────────────────
// Move startup to the end to ensure API is ready first
// createAndStartQRClient();
// ─── Socket.IO ────────────────────────────────────────────────────────────────
io.on("connection", (socket) => {
    console.log("Client connected");
    // Send current device list
    socket.emit("devices:list", serializeDevices());
    // Send current status immediately on connect (legacy)
    if (isReady) {
        socket.emit("ready", true);
    }
    else if (isAuthenticated) {
        socket.emit("authenticated", true);
    }
    else if (qrCodeData) {
        socket.emit("qr", qrCodeData);
    }
    const sendStatus = () => {
        socket.emit("devices:list", serializeDevices());
        if (isReady) {
            socket.emit("ready", true);
        }
        else if (isAuthenticated) {
            socket.emit("authenticated", true);
        }
        else if (qrCodeData) {
            socket.emit("qr", qrCodeData);
        }
        else {
            socket.emit("status_response", { isReady: false, isAuthenticated: false, qr: null });
        }
    };
    socket.on("get_status", sendStatus);
    socket.on("status", sendStatus);
    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
    socket.on("sendMessage", async (data) => {
        const { number, message } = data;
        if (!activeClient)
            return socket.emit("messageError", { number, error: "No active client" });
        try {
            await ensureWWebJSInjected(activeClient);
            const formattedNumber = number.includes("@c.us") ? number : `${number}@c.us`;
            try {
                await activeClient.sendMessage(formattedNumber, message);
            } catch (firstErr) {
                if (firstErr.message && (firstErr.message.includes("getChat") || firstErr.message.includes("WWebJS"))) {
                    await ensureWWebJSInjected(activeClient);
                    await new Promise(r => setTimeout(r, 600));
                    await activeClient.sendMessage(formattedNumber, message);
                } else {
                    throw firstErr;
                }
            }
            socket.emit("messageSent", { number, status: "success" });
        }
        catch (error) {
            console.error("Error sending message:", error);
            socket.emit("messageError", { number, error: error.message || "Failed to send" });
        }
    });
});
// ─── REST API ─────────────────────────────────────────────────────────────────
app.get("/api/wa-status", async (_req, res) => {
    if (!isReady && isAuthenticated && activeClient && activeClient.pupPage && !activeClient.pupPage.isClosed()) {
        try {
            const hasPane = await activeClient.pupPage.evaluate(() => {
                return !!(document.querySelector('#pane-side') || document.querySelector('[data-testid="chat-list"]') || (window.Store && window.Store.Chat));
            }).catch(() => false);
            if (hasPane) {
                console.log("[Status API] Detected active WhatsApp Web UI while not marked ready. Marking session ready!");
                await ensureWWebJSInjected(activeClient);
                isReady = true;
                qrCodeData = "";
                io.emit("ready", true);
            }
        } catch (_) {}
    }
    res.json({ isReady, isAuthenticated, authenticated: isAuthenticated, qr: qrCodeData || null });
});
// Alias: frontend polls /api/status — same logic as /api/wa-status with auto-heal
app.get("/api/status", async (_req, res) => {
    if (!isReady && isAuthenticated && activeClient && activeClient.pupPage && !activeClient.pupPage.isClosed()) {
        try {
            const hasPane = await activeClient.pupPage.evaluate(() => {
                return !!(document.querySelector('#pane-side') || document.querySelector('[data-testid="chat-list"]') || (window.Store && window.Store.Chat));
            }).catch(() => false);
            if (hasPane) {
                console.log("[Status API] Detected active WhatsApp Web UI while not marked ready. Marking session ready!");
                await ensureWWebJSInjected(activeClient);
                isReady = true;
                qrCodeData = "";
                io.emit("ready", true);
            }
        } catch (_) {}
    }
    res.json({ isReady, isAuthenticated, authenticated: isAuthenticated, qr: qrCodeData || null });
});

// ─── Device Management API ─────────────────────────────────────────────────────
app.get("/api/devices", (_req, res) => {
    res.json(serializeDevices());
});

app.post("/api/devices", async (req, res) => {
    try {
        if (devices.size >= MAX_DEVICES) {
            return res.status(400).json({ error: `Maximum ${MAX_DEVICES} devices allowed` });
        }
        const label = req.body.label || `WhatsApp ${devices.size + 1}`;
        const deviceId = `device-${Date.now()}`;
        createDeviceClient(deviceId, label);
        res.json({ success: true, deviceId, devices: serializeDevices() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/devices/:id", async (req, res) => {
    try {
        const deviceId = req.params.id;
        if (!devices.has(deviceId)) {
            return res.status(404).json({ error: "Device not found" });
        }
        await destroyDeviceClient(deviceId, false);
        const wasDefault = devices.get(deviceId)?.isDefault;
        devices.delete(deviceId);
        if (wasDefault && devices.size > 0) {
            const first = devices.values().next().value;
            first.isDefault = true;
            defaultDeviceId = first.id;
        }
        updateLegacyState();
        saveDeviceRegistry();
        io.emit("devices:list", serializeDevices());
        res.json({ success: true, devices: serializeDevices() });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/devices/:id/set-default", (req, res) => {
    const deviceId = req.params.id;
    if (!devices.has(deviceId)) return res.status(404).json({ error: "Device not found" });
    for (const d of devices.values()) d.isDefault = false;
    devices.get(deviceId).isDefault = true;
    defaultDeviceId = deviceId;
    updateLegacyState();
    saveDeviceRegistry();
    io.emit("devices:list", serializeDevices());
    res.json({ success: true });
});

app.post("/api/devices/:id/reset", async (req, res) => {
    const deviceId = req.params.id;
    if (!devices.has(deviceId)) return res.status(404).json({ error: "Device not found" });
    const d = devices.get(deviceId);
    await destroyDeviceClient(deviceId, false);
    // Clear auth data for this device
    const authPath = process.env.WWEBJS_DATA_PATH || path_1.default.join(process.cwd(), ".wwebjs_auth");
    const sessionDir = path_1.default.join(authPath, `session-${deviceId}`);
    safeClearFolder(sessionDir);
    cleanChromiumLocks();
    d.phoneNumber = "";
    saveDeviceRegistry();
    // Restart client
    setTimeout(() => createDeviceClient(deviceId, d.label), 1000);
    res.json({ success: true });
});

app.get("/api/devices/:id/status", (req, res) => {
    const d = devices.get(req.params.id);
    if (!d) return res.status(404).json({ error: "Device not found" });
    res.json({
        id: d.id, label: d.label, phoneNumber: d.phoneNumber,
        isReady: d.isReady, isAuthenticated: d.isAuthenticated, isDefault: d.isDefault,
        warmingStatus: d.warmingStatus, warmingDay: d.warmingDay,
        messagesSentToday: d.messagesSentToday, dailyLimit: d.dailyLimit
    });
});

app.post("/api/devices/:id/request-pairing-code", async (req, res) => {
    const deviceId = req.params.id;
    const d = devices.get(deviceId);
    if (!d) return res.status(404).json({ error: "Device not found" });
    const { phoneNumber } = req.body;
    if (!phoneNumber) return res.status(400).json({ error: "Phone number required" });
    try {
        await destroyDeviceClient(deviceId, true);
        cleanChromiumLocks();
        await new Promise(r => setTimeout(r, 500));
        const pairingClient = new whatsapp_web_js_1.Client(buildClientOptions(deviceId, phoneNumber));
        d.client = pairingClient;
        registerDeviceEvents(deviceId, pairingClient);
        hookPageLogging(pairingClient);
        const codePromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Pairing timeout")), 90000);
            pairingClient.on("code", (code) => {
                clearTimeout(timeout);
                resolve(code);
            });
        });
        pairingClient.initialize().catch(err => {
            console.warn(`[Device ${deviceId}] Pairing init error:`, err.message);
        });
        const code = await codePromise;
        res.json({ success: true, code });
    } catch (err) {
        console.error(`[Device ${deviceId}] Pairing failed:`, err.message);
        // Fallback to QR
        createDeviceClient(deviceId, d.label);
        res.status(500).json({ error: err.message, fallbackToQR: true });
    }
});

// ─── Warming API ─────────────────────────────────────────────────────────────
app.post("/api/devices/:id/warming/start", (req, res) => {
    const d = devices.get(req.params.id);
    if (!d) return res.status(404).json({ error: "Device not found" });
    d.warmingStatus = "warming";
    d.warmingStartDate = new Date().toISOString();
    d.warmingDay = 1;
    d.warmingMaxDay = 14;
    d.messagesSentToday = 0;
    d.dailyLimit = getWarmingLimit(1);
    d.lastDailyReset = new Date().toISOString().split('T')[0];
    saveDeviceRegistry();
    io.emit("devices:list", serializeDevices());
    io.emit("device:warming_update", {
        deviceId: d.id, warmingStatus: d.warmingStatus, warmingDay: d.warmingDay,
        messagesSentToday: d.messagesSentToday, dailyLimit: d.dailyLimit
    });
    res.json({ success: true });
});

app.post("/api/devices/:id/warming/stop", (req, res) => {
    const d = devices.get(req.params.id);
    if (!d) return res.status(404).json({ error: "Device not found" });
    d.warmingStatus = "paused";
    saveDeviceRegistry();
    io.emit("devices:list", serializeDevices());
    res.json({ success: true });
});

app.get("/api/devices/:id/warming/status", (req, res) => {
    const d = devices.get(req.params.id);
    if (!d) return res.status(404).json({ error: "Device not found" });
    res.json({
        warmingStatus: d.warmingStatus, warmingDay: d.warmingDay, warmingMaxDay: d.warmingMaxDay,
        warmingStartDate: d.warmingStartDate, messagesSentToday: d.messagesSentToday,
        dailyLimit: d.dailyLimit, schedule: WARMING_SCHEDULE
    });
});

// ─── Daily Warming Reset (runs every minute) ─────────────────────────────────
setInterval(() => {
    const today = new Date().toISOString().split('T')[0];
    for (const d of devices.values()) {
        if (d.warmingStatus === "warming" && d.lastDailyReset !== today) {
            d.lastDailyReset = today;
            d.messagesSentToday = 0;
            // Advance warming day
            const startDate = new Date(d.warmingStartDate);
            const now = new Date();
            d.warmingDay = Math.min(Math.ceil((now - startDate) / (1000 * 60 * 60 * 24)) + 1, d.warmingMaxDay);
            d.dailyLimit = getWarmingLimit(d.warmingDay);
            if (d.warmingDay >= d.warmingMaxDay) {
                d.warmingStatus = "warmed";
                d.dailyLimit = 9999; // No limit after warming
            }
            saveDeviceRegistry();
            io.emit("device:warming_update", {
                deviceId: d.id, warmingStatus: d.warmingStatus, warmingDay: d.warmingDay,
                messagesSentToday: d.messagesSentToday, dailyLimit: d.dailyLimit
            });
            io.emit("devices:list", serializeDevices());
        }
    }
}, 60000);

// ─── Cart Recovery API ─────────────────────────────────────────────────────────
const CARTS_PATH = path_1.default.join(DATA_DIR, "abandoned_carts.json");
const CART_SETTINGS_PATH = path_1.default.join(DATA_DIR, "cart_settings.json");
let abandonedCarts = [];
let cartSettings = {
    autoSendEnabled: false,
    firstContactDelay: 60,
    followUpEnabled: true,
    followUpDelay: 1440,
    maxFollowUps: 2,
    recoveryMessageTemplate: "Hi {{name}}! 👋 You left some items in your cart:\n\n{{items}}\n\n💰 Total: {{total}} {{currency}}\n\n🛒 Complete your order: {{cartUrl}}\n\nNeed help? Just reply here!",
    followUpTemplate: "Hi {{name}}, just a friendly reminder — your cart is still waiting! 🛍️\n\n{{items}}\n\nUse this link to complete your order: {{cartUrl}}",
    deviceId: null
};

function loadCarts() {
    if (fs_1.default.existsSync(CARTS_PATH)) {
        try { abandonedCarts = JSON.parse(fs_1.default.readFileSync(CARTS_PATH, "utf8")); } catch (_) {}
    }
}
function saveCarts() {
    try { fs_1.default.writeFileSync(CARTS_PATH, JSON.stringify(abandonedCarts, null, 2)); } catch (_) {}
}
function loadCartSettings() {
    if (fs_1.default.existsSync(CART_SETTINGS_PATH)) {
        try { Object.assign(cartSettings, JSON.parse(fs_1.default.readFileSync(CART_SETTINGS_PATH, "utf8"))); } catch (_) {}
    }
}
function saveCartSettings() {
    try { fs_1.default.writeFileSync(CART_SETTINGS_PATH, JSON.stringify(cartSettings, null, 2)); } catch (_) {}
}
loadCarts();
loadCartSettings();

function formatCartMessage(template, cart) {
    let msg = template;
    msg = msg.replace(/\{\{name\}\}/g, cart.customerName || "");
    msg = msg.replace(/\{\{total\}\}/g, String(cart.cartTotal || 0));
    msg = msg.replace(/\{\{currency\}\}/g, cart.currency || "USD");
    msg = msg.replace(/\{\{cartUrl\}\}/g, cart.cartUrl || "");
    const itemsList = (cart.cartItems || []).map(i => `• ${i.name} x${i.qty} — ${i.price}`).join("\n");
    msg = msg.replace(/\{\{items\}\}/g, itemsList);
    return msg;
}

async function sendCartRecoveryMessage(cart) {
    const client = cartSettings.deviceId ? devices.get(cartSettings.deviceId)?.client : get_activeClient();
    if (!client) throw new Error("No WhatsApp client available");
    const template = cart.followUpCount > 0 ? cartSettings.followUpTemplate : cartSettings.recoveryMessageTemplate;
    const message = formatCartMessage(template, cart);
    const phone = cart.customerPhone.replace(/[^0-9]/g, "");
    const numberId = await client.getNumberId(phone);
    if (!numberId) throw new Error("Number not on WhatsApp");
    await client.sendMessage(numberId._serialized, message);
    cart.status = "contacted";
    cart.contactedAt = new Date().toISOString();
    cart.followUpCount = (cart.followUpCount || 0) + 1;
    cart.lastFollowUpAt = new Date().toISOString();
    saveCarts();
    io.emit("cart:updated", { id: cart.id, status: cart.status });
    return true;
}

app.get("/api/carts", (_req, res) => {
    res.json(abandonedCarts);
});

app.get("/api/carts/stats", (_req, res) => {
    const total = abandonedCarts.length;
    const pending = abandonedCarts.filter(c => c.status === "pending").length;
    const contacted = abandonedCarts.filter(c => c.status === "contacted").length;
    const recovered = abandonedCarts.filter(c => c.status === "recovered").length;
    const expired = abandonedCarts.filter(c => c.status === "expired").length;
    const conversionRate = total > 0 ? Math.round((recovered / total) * 100) : 0;
    res.json({ total, pending, contacted, recovered, expired, conversionRate });
});

app.post("/api/carts/webhook", (req, res) => {
    try {
        const body = req.body;
        const cart = {
            id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            customerName: body.customer_name || body.customerName || body.billing?.first_name || "Customer",
            customerPhone: body.customer_phone || body.customerPhone || body.billing?.phone || "",
            cartItems: (body.line_items || body.cartItems || body.items || []).map(i => ({
                name: i.name || i.title || "Item",
                qty: i.quantity || i.qty || 1,
                price: i.price || i.total || 0,
                imageUrl: i.image?.src || i.imageUrl || ""
            })),
            cartUrl: body.cart_url || body.cartUrl || body.order_status_url || "",
            cartTotal: parseFloat(body.total || body.cartTotal || 0),
            currency: body.currency || "USD",
            status: "pending",
            receivedAt: new Date().toISOString(),
            source: "webhook",
            followUpCount: 0
        };
        if (!cart.customerPhone) return res.status(400).json({ error: "No phone number provided" });
        abandonedCarts.unshift(cart);
        saveCarts();
        io.emit("cart:new", cart);
        res.json({ success: true, cartId: cart.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/carts/import", (req, res) => {
    try {
        const items = req.body.carts || req.body;
        if (!Array.isArray(items)) return res.status(400).json({ error: "Expected array of carts" });
        const imported = items.map(item => ({
            id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            customerName: item.customerName || item.name || "Customer",
            customerPhone: item.customerPhone || item.phone || "",
            cartItems: item.cartItems || [{ name: item.product || "Item", qty: 1, price: item.price || 0 }],
            cartUrl: item.cartUrl || item.url || "",
            cartTotal: parseFloat(item.cartTotal || item.total || 0),
            currency: item.currency || "USD",
            status: "pending",
            receivedAt: new Date().toISOString(),
            source: "csv",
            followUpCount: 0
        }));
        abandonedCarts.unshift(...imported);
        saveCarts();
        res.json({ success: true, count: imported.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/carts/add", (req, res) => {
    const cart = {
        id: `cart-${Date.now()}`,
        customerName: req.body.customerName || "Customer",
        customerPhone: req.body.customerPhone || "",
        cartItems: req.body.cartItems || [],
        cartUrl: req.body.cartUrl || "",
        cartTotal: parseFloat(req.body.cartTotal || 0),
        currency: req.body.currency || "USD",
        status: "pending",
        receivedAt: new Date().toISOString(),
        source: "manual",
        followUpCount: 0
    };
    abandonedCarts.unshift(cart);
    saveCarts();
    io.emit("cart:new", cart);
    res.json({ success: true, cart });
});

app.delete("/api/carts/:id", (req, res) => {
    abandonedCarts = abandonedCarts.filter(c => c.id !== req.params.id);
    saveCarts();
    res.json({ success: true });
});

app.post("/api/carts/:id/send", async (req, res) => {
    const cart = abandonedCarts.find(c => c.id === req.params.id);
    if (!cart) return res.status(404).json({ error: "Cart not found" });
    try {
        await sendCartRecoveryMessage(cart);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/carts/:id/recover", (req, res) => {
    const cart = abandonedCarts.find(c => c.id === req.params.id);
    if (!cart) return res.status(404).json({ error: "Cart not found" });
    cart.status = "recovered";
    cart.recoveredAt = new Date().toISOString();
    saveCarts();
    io.emit("cart:updated", { id: cart.id, status: "recovered" });
    res.json({ success: true });
});

app.post("/api/carts/campaign", async (req, res) => {
    const pending = abandonedCarts.filter(c => c.status === "pending");
    if (pending.length === 0) return res.json({ success: true, sent: 0 });
    let sent = 0;
    for (const cart of pending) {
        try {
            await sendCartRecoveryMessage(cart);
            sent++;
            await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
        } catch (err) {
            console.warn(`[Cart Recovery] Failed for ${cart.customerPhone}:`, err.message);
        }
    }
    res.json({ success: true, sent, total: pending.length });
});

app.get("/api/carts/settings", (_req, res) => {
    res.json(cartSettings);
});

app.post("/api/carts/settings", (req, res) => {
    Object.assign(cartSettings, req.body);
    saveCartSettings();
    res.json({ success: true });
});

// ─── Cart Recovery Auto-Send Scheduler (runs every 5 min) ─────────────────────
setInterval(async () => {
    if (!cartSettings.autoSendEnabled || !get_isReady()) return;
    const now = Date.now();
    for (const cart of abandonedCarts) {
        if (cart.status !== "pending" && !(cart.status === "contacted" && cartSettings.followUpEnabled)) continue;
        const receivedAt = new Date(cart.receivedAt).getTime();
        const lastAction = cart.lastFollowUpAt ? new Date(cart.lastFollowUpAt).getTime() : receivedAt;

        if (cart.status === "pending") {
            const threshold = receivedAt + cartSettings.firstContactDelay * 60000;
            if (now >= threshold) {
                try { await sendCartRecoveryMessage(cart); } catch (_) {}
                await new Promise(r => setTimeout(r, 2000));
            }
        } else if (cart.status === "contacted" && cartSettings.followUpEnabled) {
            if ((cart.followUpCount || 0) < cartSettings.maxFollowUps) {
                const threshold = lastAction + cartSettings.followUpDelay * 60000;
                if (now >= threshold) {
                    try { await sendCartRecoveryMessage(cart); } catch (_) {}
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }
    }
}, 300000);

// ─── AI Message Generator API ─────────────────────────────────────────────────
app.post("/api/ai/generate-message", async (req, res) => {
    try {
        if (!integrationsSettings.ai || !integrationsSettings.ai.enabled || !integrationsSettings.ai.apiKey) {
            return res.status(400).json({ error: "AI provider not configured. Go to Settings > Integrations to set up an AI provider." });
        }
        const { type, context, cartData } = req.body;
        const tone = context?.tone || "friendly";
        const language = context?.language || "en";
        const productName = context?.productName || "";
        const customInstructions = context?.customInstructions || "";

        const langLabel = language === "fr" ? "French" : language === "ar" ? "Arabic/Darija" : "English";
        let typeLabel = type || "promotional";
        let contextDetails = "";
        if (cartData) {
            contextDetails = `\nCart data: Customer "${cartData.customerName}", Items: ${cartData.cartItems || "various items"}, Total: ${cartData.cartTotal} ${cartData.currency || "USD"}, URL: ${cartData.cartUrl || ""}`;
        }
        if (productName) contextDetails += `\nProduct/Service: ${productName}`;

        const systemPrompt = `You are a professional WhatsApp marketing copywriter. Generate a concise, engaging message for WhatsApp (max 500 characters). 
Tone: ${tone}. Language: ${langLabel}. Type: ${typeLabel}.
Use appropriate emojis. Support template variables: {{name}}, {{items}}, {{total}}, {{currency}}, {{cartUrl}}, {{phone}}.
${customInstructions ? `Special instructions: ${customInstructions}` : ""}
${contextDetails}

IMPORTANT: Return ONLY valid JSON with this exact structure:
{"message": "your main message here", "alternatives": ["alternative 1", "alternative 2"]}
Do NOT wrap in markdown code blocks. Return raw JSON only.`;

        const userMsg = `Generate a ${typeLabel} WhatsApp message in ${langLabel} with a ${tone} tone.`;
        const aiResponse = await callAiChatbot(userMsg, systemPrompt);

        if (!aiResponse) {
            return res.status(500).json({ error: "AI provider returned empty response" });
        }

        // Try to parse as JSON
        let parsed;
        try {
            // Strip markdown code blocks if present
            let cleaned = aiResponse.trim();
            if (cleaned.startsWith("```")) {
                cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");
            }
            parsed = JSON.parse(cleaned);
        } catch (_) {
            // Fallback: treat entire response as the message
            parsed = { message: aiResponse.trim(), alternatives: [] };
        }

        res.json({
            message: parsed.message || aiResponse.trim(),
            alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives.slice(0, 2) : []
        });
    } catch (err) {
        console.error("[AI Generator] Error:", err.message);
        res.status(500).json({ error: err.message });
    }
});
// ─── Logout API ───────────────────────────────────────────────────────────────
app.post("/api/logout", async (_req, res) => {
    console.log("[API] User requested logout...");
    io.emit("disconnected", "logout");
    await destroyActiveClient(true);
    await killStaleBrowserProcesses();
    cleanChromiumLocks();
    await new Promise(r => setTimeout(r, 600));
    const authPath = process.env.WWEBJS_DATA_PATH || path_1.default.join(process.cwd(), ".wwebjs_auth");
    safeClearFolder(authPath);
    setTimeout(() => {
        console.log("[API] Restarting in fresh QR mode after logout...");
        createAndStartQRClient();
    }, 600);
    res.json({ success: true, message: "Logged out. Restarting in QR mode." });
});

// ─── Activation & Licensing ──────────────────────────────────────────────────
function getStoredLicense() {
    const candidates = [
        LICENSE_PATH,
        path_1.default.join(process.cwd(), "license.json"),
        path_1.default.join(__dirname, "license.json"),
        process.env.WAPP_DATA_PATH && path_1.default.join(process.env.WAPP_DATA_PATH, "license.json")
    ].filter(Boolean);

    for (const p of candidates) {
        try {
            if (fs_1.default.existsSync(p)) {
                const data = JSON.parse(fs_1.default.readFileSync(p, "utf8"));
                if (data && data.code) {
                    if (p !== LICENSE_PATH && !fs_1.default.existsSync(LICENSE_PATH)) {
                        try {
                            fs_1.default.writeFileSync(LICENSE_PATH, JSON.stringify(data, null, 2));
                        } catch (_) {}
                    }
                    return data;
                }
            }
        } catch (_) {}
    }
    return null;
}

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

// ─── WhatsApp Number Verification & Testing API ─────────────────────────────
app.post("/api/whatsapp/check-numbers", async (req, res) => {
    try {
        const { numbers = [], defaultCountry } = req.body;
        if (!Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ error: "Please provide an array of numbers to verify" });
        }

        const country = defaultCountry || integrationsSettings.phone?.defaultCountryCode || "212";

        // Auto-heal ready state if page is ready
        if (!isReady && isAuthenticated && activeClient && activeClient.pupPage && !activeClient.pupPage.isClosed()) {
            try {
                const hasPane = await activeClient.pupPage.evaluate(() => {
                    return document.querySelector('#pane-side') !== null || document.querySelector('[data-testid="chat-list"]') !== null;
                }).catch(() => false);
                if (hasPane) {
                    isReady = true;
                    await ensureWWebJSInjected(activeClient);
                }
            } catch (_) {}
        }

        const isClientActive = isReady && activeClient && activeClient.pupPage && !activeClient.pupPage.isClosed();

        if (isClientActive) {
            await ensureWWebJSInjected(activeClient);
        }

        const results = [];
        const limit = Math.min(numbers.length, 500);

        for (let i = 0; i < limit; i++) {
            const raw = numbers[i];
            const normalized = normalizeScrapedPhone(raw, "", country);
            const type = getPhoneType(normalized, country);

            if (!normalized || normalized.length < 8) {
                results.push({
                    original: raw,
                    number: normalized || raw,
                    type: "unknown",
                    isWhatsApp: false,
                    jid: null,
                    error: "Invalid number"
                });
                continue;
            }

            if (!isClientActive) {
                // Return classification based on offline heuristic
                results.push({
                    original: raw,
                    number: normalized,
                    type,
                    isWhatsApp: null,
                    jid: null,
                    message: "WhatsApp client not connected (offline classification only)"
                });
                continue;
            }

            try {
                let contactId = null;
                if (typeof activeClient.getNumberId === 'function') {
                    contactId = await activeClient.getNumberId(normalized);
                }

                const isWa = !!(contactId && (contactId._serialized || contactId.user));
                results.push({
                    original: raw,
                    number: normalized,
                    type,
                    isWhatsApp: isWa,
                    jid: contactId ? (contactId._serialized || `${normalized}@c.us`) : null
                });
            } catch (err) {
                console.warn(`[Check WhatsApp] Failed to verify ${normalized}:`, err.message);
                results.push({
                    original: raw,
                    number: normalized,
                    type,
                    isWhatsApp: false,
                    jid: null,
                    error: err.message
                });
            }

            // Small delay to prevent overload
            if (i < limit - 1 && limit > 10) {
                await new Promise(r => setTimeout(r, 20));
            }
        }

        const whatsappCount = results.filter(r => r.isWhatsApp === true).length;
        const mobileCount = results.filter(r => r.type === "mobile").length;
        const landlineCount = results.filter(r => r.type === "landline").length;

        return res.json({
            success: true,
            connected: isClientActive,
            total: results.length,
            whatsappCount,
            mobileCount,
            landlineCount,
            results
        });
    } catch (e) {
        console.error("[/api/whatsapp/check-numbers] Error:", e);
        return res.status(500).json({ error: e.message || "Failed to check numbers" });
    }
});

app.get("/api/whatsapp/check-number", async (req, res) => {
    try {
        const rawNumber = req.query.number;
        if (!rawNumber) return res.status(400).json({ error: "Missing number query parameter" });

        const country = req.query.country || integrationsSettings.phone?.defaultCountryCode || "212";
        const normalized = normalizeScrapedPhone(rawNumber, "", country);
        const type = getPhoneType(normalized, country);

        const isClientActive = isReady && activeClient && activeClient.pupPage && !activeClient.pupPage.isClosed();
        if (!isClientActive) {
            return res.json({
                success: true,
                connected: false,
                original: rawNumber,
                number: normalized,
                type,
                isWhatsApp: null,
                message: "WhatsApp client not connected"
            });
        }

        await ensureWWebJSInjected(activeClient);
        const contactId = await activeClient.getNumberId(normalized);
        const isWa = !!(contactId && (contactId._serialized || contactId.user));

        return res.json({
            success: true,
            connected: true,
            original: rawNumber,
            number: normalized,
            type,
            isWhatsApp: isWa,
            jid: contactId ? (contactId._serialized || `${normalized}@c.us`) : null
        });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
});

// ─── Bulk send ────────────────────────────────────────────────────────────────
app.post("/api/send-bulk", async (req, res) => {
    const { recipients = [], message, minDelay = 1000, maxDelay = 3000, attachments = [], deviceIds = [] } = req.body;
    
    // Determine target devices
    let targetDeviceSessions = [];
    if (Array.isArray(deviceIds) && deviceIds.length > 0) {
        targetDeviceSessions = deviceIds.map(id => devices.get(id)).filter(d => d && d.isReady && d.client);
    }
    if (targetDeviceSessions.length === 0) {
        targetDeviceSessions = getReadyDevices();
    }

    if (targetDeviceSessions.length === 0) {
        // @ts-ignore
        return res.status(503).json({ error: "No WhatsApp devices connected and ready" });
    }
    if (isBulkRunning) {
        // @ts-ignore
        return res.status(400).json({ error: "A campaign is already running" });
    }

    isBulkRunning = true;
    currentBulkResults = [];
    // Process in background
    (async () => {
        let sentCount = 0;
        let failCount = 0;
        const total = recipients.length;
        const startTime = Date.now();
        let deviceIndex = 0;

        for (const recipient of recipients) {
            if (!isBulkRunning) {
                console.log("Campaign stopped by user");
                break;
            }

            // Refresh available ready devices in case of disconnects mid-campaign
            const availableDevices = targetDeviceSessions.filter(d => d && d.isReady && d.client);
            if (availableDevices.length === 0) {
                console.error("[BulkSender] All devices disconnected during campaign!");
                break;
            }

            // Find next eligible device (considering warming limits)
            let chosenDev = null;
            let attempts = 0;
            while (attempts < availableDevices.length) {
                const candidate = availableDevices[deviceIndex % availableDevices.length];
                deviceIndex++;
                attempts++;

                if (candidate.warmingStatus === "warming" && candidate.messagesSentToday >= candidate.dailyLimit) {
                    console.warn(`[Warming] Device ${candidate.label} (${candidate.id}) reached daily limit (${candidate.dailyLimit}). Skipping.`);
                    continue;
                }
                chosenDev = candidate;
                break;
            }

            if (!chosenDev) {
                console.warn("[BulkSender] All target devices have reached their daily warming limits.");
                // Fallback to first available device anyway or stop
                chosenDev = availableDevices[0];
            }

            const client = chosenDev.client;
            const number = recipient.number || "";
            const recipientName = recipient.name || (recipient.variables && recipient.variables.name) || "";
            try {
                console.log(`[Device ${chosenDev.label}] Resolving contact number on WhatsApp: ${number}`);
                const resolved = await resolveWhatsAppNumber(number, client);
                if (!resolved || !resolved.jid) {
                    console.warn(`Number ${number} could not be resolved on WhatsApp`);
                    throw new Error("Number not registered on WhatsApp");
                }
                const formattedNumber = resolved.jid;
                let personalizedMessage = message ? message.replace(/{{name}}/g, recipientName) : "";
                if (personalizedMessage && recipient.variables && typeof recipient.variables === "object") {
                    for (const [k, v] of Object.entries(recipient.variables)) {
                        personalizedMessage = personalizedMessage.replace(new RegExp(`{{${k}}}`, 'g'), v || "");
                    }
                }
                if (!chosenDev.isReady)
                    throw new Error(`Device ${chosenDev.label} disconnected during campaign`);
                
                await ensureWWebJSInjected(client);
                if (attachments.length > 0) {
                    const { mimetype, data, filename } = attachments[0];
                    const media = new whatsapp_web_js_1.MessageMedia(mimetype, data, filename);
                    const sendOptions = personalizedMessage && personalizedMessage.trim() ? { caption: personalizedMessage } : {};
                    console.log(`[Device ${chosenDev.label}] Sending media to ${formattedNumber}...`);
                    await client.sendMessage(formattedNumber, media, sendOptions);
                    for (let i = 1; i < attachments.length; i++) {
                        const { mimetype: mt, data: d, filename: fn } = attachments[i];
                        await client.sendMessage(formattedNumber, new whatsapp_web_js_1.MessageMedia(mt, d, fn));
                    }
                }
                else if (personalizedMessage && personalizedMessage.trim()) {
                    console.log(`[Device ${chosenDev.label}] Sending message to ${formattedNumber}...`);
                    await client.sendMessage(formattedNumber, personalizedMessage);
                }
                
                sentCount++;
                chosenDev.messagesSentToday++;
                saveDeviceRegistry();
                if (chosenDev.warmingStatus === "warming") {
                    io.emit("device:warming_update", {
                        deviceId: chosenDev.id,
                        warmingStatus: chosenDev.warmingStatus,
                        warmingDay: chosenDev.warmingDay,
                        messagesSentToday: chosenDev.messagesSentToday,
                        dailyLimit: chosenDev.dailyLimit
                    });
                }

                const resultItem = {
                    number,
                    name: recipientName,
                    status: "success",
                    deviceId: chosenDev.id,
                    deviceLabel: chosenDev.label,
                    fromNumber: chosenDev.phoneNumber,
                    timestamp: new Date().toISOString()
                };
                currentBulkResults.push(resultItem);
                console.log(`[Device ${chosenDev.label}] Sent to ${number} (${sentCount}/${total})`);
                const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                const nextSendAt = Date.now() + delay;
                const progressPayload = {
                    current: sentCount + failCount,
                    total,
                    success: sentCount,
                    failed: failCount,
                    lastNumber: number,
                    lastResult: resultItem,
                    status: "Sending...",
                    activeDevice: chosenDev.label,
                    nextSendAt: (sentCount + failCount) < total && isBulkRunning ? nextSendAt : null,
                    results: currentBulkResults
                };
                io.emit("bulkProgress", progressPayload);
                io.emit("bulk_progress", progressPayload);
                if ((sentCount + failCount) < total && isBulkRunning) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
            catch (e) {
                console.error(`Failed to send to ${recipient.number} from device ${chosenDev.label}`, e);
                failCount++;
                let errMsg = e.message || "Failed to send";
                if (errMsg.includes("No LID for user") || errMsg.includes("wid error") || errMsg.includes("not registered")) {
                    errMsg = "Number not registered on WhatsApp";
                }
                const failItem = {
                    number: recipient.number,
                    name: recipientName,
                    status: "error",
                    error: errMsg,
                    deviceId: chosenDev.id,
                    deviceLabel: chosenDev.label,
                    timestamp: new Date().toISOString()
                };
                currentBulkResults.push(failItem);
                const progressPayload = {
                    current: sentCount + failCount,
                    total,
                    success: sentCount,
                    failed: failCount,
                    lastNumber: recipient.number,
                    lastResult: failItem,
                    status: "Sending...",
                    activeDevice: chosenDev.label,
                    nextSendAt: (sentCount + failCount) < total && isBulkRunning ? Date.now() + 500 : null,
                    results: currentBulkResults
                };
                io.emit("bulkProgress", progressPayload);
                io.emit("bulk_progress", progressPayload);
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
            failCount,
            message: message || (attachments.length > 0 ? `[${attachments.length} File(s)]` : ""),
            attachmentCount: attachments.length,
            duration: Math.floor((endTime - startTime) / 1000),
            results: currentBulkResults
        };
        try {
            const historyPath = path_1.default.join(DATA_DIR, 'history.json');
            let history = [];
            if (fs_1.default.existsSync(historyPath)) {
                history = JSON.parse(fs_1.default.readFileSync(historyPath, 'utf8'));
            }
            history.unshift(historyItem);
            fs_1.default.writeFileSync(historyPath, JSON.stringify(history.slice(0, 100), null, 2));
        }
        catch (err) {
            console.error("Failed to save history:", err);
        }
        const completePayload = {
            total,
            current: total,
            sentCount,
            failCount,
            success: sentCount,
            failed: failCount,
            status: "Completed",
            results: currentBulkResults
        };
        io.emit("bulkProgress", completePayload);
        io.emit("bulk_progress", completePayload);
        io.emit("bulkComplete", completePayload);
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
app.delete("/api/history", (_req, res) => {
    try {
        const historyPath = path_1.default.join(DATA_DIR, 'history.json');
        fs_1.default.writeFileSync(historyPath, JSON.stringify([], null, 2));
        res.json({ success: true, message: "History cleared successfully" });
    }
    catch {
        res.status(500).json({ error: "Failed to clear history" });
    }
});
app.delete("/api/history/:id", (req, res) => {
    try {
        const historyPath = path_1.default.join(DATA_DIR, 'history.json');
        if (fs_1.default.existsSync(historyPath)) {
            let history = JSON.parse(fs_1.default.readFileSync(historyPath, 'utf8'));
            history = history.filter((h) => h.id !== req.params.id);
            fs_1.default.writeFileSync(historyPath, JSON.stringify(history, null, 2));
        }
        res.json({ success: true, message: "Campaign removed from history" });
    }
    catch {
        res.status(500).json({ error: "Failed to delete item from history" });
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
        await ensureWWebJSInjected(activeClient);
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
        await ensureWWebJSInjected(activeClient);
        const groupId = req.params.id;
        let results = [];

        // 1. In-browser evaluation with comprehensive LID -> Phone Number resolution
        if (activeClient.pupPage && !activeClient.pupPage.isClosed()) {
            try {
                results = await activeClient.pupPage.evaluate(async (gId) => {
                    const list = [];
                    if (!window.Store) return list;

                    const chatWid = window.Store.WidFactory ? window.Store.WidFactory.createWid(gId) : gId;

                    // Trigger server-side group metadata query/update if available
                    if (window.Store.GroupQueryAndUpdate) {
                        try { await window.Store.GroupQueryAndUpdate(chatWid); } catch (_) {}
                        try { await window.Store.GroupQueryAndUpdate({ id: chatWid }); } catch (_) {}
                        try { await window.Store.GroupQueryAndUpdate({ id: gId }); } catch (_) {}
                    }
                    if (window.Store.GroupMetadata && typeof window.Store.GroupMetadata.update === 'function') {
                        try { await window.Store.GroupMetadata.update(chatWid); } catch (_) {}
                    }

                    // Build reverse lookup map from all known contacts (LID -> Phone Number)
                    const lidToPnMap = new Map();
                    if (window.Store.Contact && typeof window.Store.Contact.getModelsArray === 'function') {
                        try {
                            const allContacts = window.Store.Contact.getModelsArray();
                            for (const c of allContacts) {
                                const cPn = (c.phoneNumber && (c.phoneNumber.user || (typeof c.phoneNumber === 'string' ? c.phoneNumber : ''))) ||
                                            (c.pnId && (c.pnId.user || (typeof c.pnId === 'string' ? c.pnId : ''))) ||
                                            (c.id && c.id.server === 'c.us' ? c.id.user : '');
                                const cLid = (c.lid && (c.lid._serialized || (typeof c.lid === 'string' ? c.lid : ''))) ||
                                             (c.id && c.id.server === 'lid' ? c.id._serialized : '');
                                if (cPn && cLid) {
                                    lidToPnMap.set(cLid, cPn);
                                    if (cLid.includes('@')) lidToPnMap.set(cLid.split('@')[0], cPn);
                                }
                            }
                        } catch (_) {}
                    }

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

                            const pIdStr = p.id?._serialized || (typeof p.id === 'string' ? p.id : '');
                            const pUser = p.id?.user || (pIdStr.includes('@') ? pIdStr.split('@')[0] : pIdStr);

                            // 1. Direct phone number on participant object
                            if (p.phoneNumber) {
                                number = p.phoneNumber.user || (typeof p.phoneNumber === 'string' ? p.phoneNumber : '');
                            }

                            // 2. Direct contact model on participant
                            if (!number && p.contact) {
                                if (p.contact.phoneNumber) {
                                    number = p.contact.phoneNumber.user || (typeof p.contact.phoneNumber === 'string' ? p.contact.phoneNumber : '');
                                } else if (p.contact.pnId) {
                                    number = p.contact.pnId.user || (typeof p.contact.pnId === 'string' ? p.contact.pnId : '');
                                } else if (p.contact.id?.server === 'c.us') {
                                    number = p.contact.id.user;
                                }
                                name = p.contact.name || p.contact.pushname || p.contact.formattedName || name;
                            }

                            // 3. User ID if standard @c.us
                            if (!number && (p.id?.server === 'c.us' || pIdStr.endsWith('@c.us'))) {
                                number = pUser;
                            }

                            // 4. Query Contact store
                            if (!number && window.Store.Contact) {
                                const contact = typeof window.Store.Contact.get === 'function' ? (window.Store.Contact.get(p.id) || window.Store.Contact.get(pIdStr)) : null;
                                if (contact) {
                                    if (contact.phoneNumber) {
                                        number = contact.phoneNumber.user || (typeof contact.phoneNumber === 'string' ? contact.phoneNumber : '');
                                    } else if (contact.pnId) {
                                        number = contact.pnId.user || (typeof contact.pnId === 'string' ? contact.pnId : '');
                                    } else if (contact.id?.user && contact.id.server === 'c.us') {
                                        number = contact.id.user;
                                    }
                                    name = contact.name || contact.pushname || contact.formattedName || name;
                                }
                            }

                            // 5. Query LidUtils
                            if (!number && window.Store.LidUtils && typeof window.Store.LidUtils.getPhoneNumber === 'function') {
                                try {
                                    const wid = window.Store.LidUtils.getPhoneNumber(p.id || pIdStr);
                                    if (wid) {
                                        number = wid.user || (typeof wid === 'string' ? wid.split('@')[0] : '');
                                    }
                                } catch (_) {}
                            }

                            // 6. Reverse lookup in lidToPnMap
                            if (!number && lidToPnMap.has(pIdStr)) {
                                number = lidToPnMap.get(pIdStr);
                            }
                            if (!number && lidToPnMap.has(pUser)) {
                                number = lidToPnMap.get(pUser);
                            }

                            // 7. Fallback for non-LID pure digit user ids
                            if (!number && /^\d{7,16}$/.test(pUser) && !pIdStr.endsWith('@lid')) {
                                number = pUser;
                            }

                            // Name resolution fallback
                            if (name === "Participant") {
                                name = p.name || p.pushname || p.notifyName || p.formattedTitle || name;
                            }

                            if (number) {
                                const clean = String(number).replace(/\D/g, '');
                                if (clean.length >= 6) {
                                    list.push({
                                        number: `+${clean}`,
                                        name: name || "Participant"
                                    });
                                }
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
                const participants = (chat && chat.participants) || [];
                for (const p of participants) {
                    const contactId = p.id ? (p.id._serialized || p.id) : null;
                    if (!contactId) continue;
                    let numberStr = "";
                    let pName = "Participant";

                    if (contactId.endsWith('@c.us') || p.id?.server === 'c.us') {
                        numberStr = p.id.user || contactId.split('@')[0];
                    } else {
                        // LID participant: fetch contact details via getContactById
                        try {
                            const contact = await activeClient.getContactById(contactId);
                            if (contact) {
                                numberStr = contact.number || (contact.id && contact.id.user && !contact.id._serialized?.endsWith('@lid') ? contact.id.user : '');
                                pName = contact.name || contact.pushname || contact.shortName || pName;
                            }
                        } catch (_) {}
                    }

                    if (numberStr) {
                        const clean = String(numberStr).replace(/\D/g, '');
                        if (clean.length >= 6) {
                            results.push({
                                number: `+${clean}`,
                                name: pName || "Participant"
                            });
                        }
                    }
                }
            } catch (chatErr) {
                console.warn("[/api/groups/participants] getChatById fallback error:", chatErr.message);
            }
        }

        // Deduplicate by number
        const unique = Array.from(new Map(results.map(r => [r.number, r])).values());
        res.json({ success: true, count: unique.length, participants: unique });
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
    res.json({ status: "ok", version: "2026.8.0", timestamp: Date.now() });
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

// ─── API Integrations Routes ──────────────────────────────────────────────────
app.get("/api/integrations/settings", (_req, res) => {
    res.json({ success: true, settings: integrationsSettings });
});

app.post("/api/integrations/settings", (req, res) => {
    try {
        const { ai, scraper, webhooks, phone } = req.body;
        if (ai) integrationsSettings.ai = { ...integrationsSettings.ai, ...ai };
        if (scraper) integrationsSettings.scraper = { ...integrationsSettings.scraper, ...scraper };
        if (webhooks) integrationsSettings.webhooks = { ...integrationsSettings.webhooks, ...webhooks };
        if (phone) integrationsSettings.phone = { ...integrationsSettings.phone, ...phone };
        saveIntegrationsSettings();
        res.json({ success: true, settings: integrationsSettings });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/integrations/test-ai", async (req, res) => {
    try {
        const { message, config } = req.body;
        if (!message) return res.status(400).json({ error: "Test message is required" });
        const reply = await callAiChatbot(message, config || {});
        res.json({ success: true, reply });
    } catch (e) {
        res.status(500).json({ error: e.message || "Failed to generate AI response" });
    }
});

app.post("/api/integrations/test-webhook", async (req, res) => {
    try {
        const { url, payload } = req.body;
        if (!url) return res.status(400).json({ error: "Webhook URL is required" });
        const pingRes = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload || {
                event: "test_ping",
                timestamp: new Date().toISOString(),
                source: "WApp Manager Leads Pro",
                message: "Test webhook payload received successfully!"
            }),
            signal: AbortSignal.timeout(10000)
        });
        res.json({ success: true, status: pingRes.status, statusText: pingRes.statusText });
    } catch (e) {
        res.status(500).json({ error: e.message || "Webhook test connection failed" });
    }
});

// ─── External Scraper Engines ────────────────────────────────────────────────
async function scrapeGooglePlacesApi(keyword, location, limit, apiKey, mobileOnly = false) {
    io.emit("scrape_status", { step: "navigating", message: `Connecting to Google Places API for "${keyword} in ${location}"...`, progress: 20 });
    const query = `${keyword} in ${location}`;
    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    if (searchData.status !== "OK" && searchData.status !== "ZERO_RESULTS") {
        throw new Error(searchData.error_message || `Google Places API returned status: ${searchData.status}`);
    }
    const results = searchData.results || [];
    const leads = [];
    const seenPhones = new Set();
    const defaultCountry = integrationsSettings.phone?.defaultCountryCode || "212";

    io.emit("scrape_status", { step: "scrolling", message: `Discovered ${results.length} places. Fetching details...`, progress: 45 });

    for (let i = 0; i < Math.min(results.length, limit * 2); i++) {
        if (leads.length >= limit) break;
        const place = results[i];
        io.emit("scrape_status", {
            step: "inspecting",
            message: `Extracting contact for "${place.name}"...`,
            current: leads.length,
            total: limit,
            currentBusiness: place.name,
            progress: Math.min(Math.round(((i + 1) / Math.min(results.length, limit * 2)) * 100), 95)
        });
        try {
            const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,international_phone_number,formatted_address,website,rating&key=${apiKey}`;
            const detailRes = await fetch(detailUrl);
            const detailData = await detailRes.json();
            const d = detailData.result || {};

            const rawPhone = d.international_phone_number || d.formatted_phone_number || "";
            const cleanNumber = normalizeScrapedPhone(rawPhone, location, defaultCountry);

            if (cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber)) {
                if (mobileOnly && isLandlineNumber(cleanNumber, defaultCountry)) {
                    continue;
                }
                seenPhones.add(cleanNumber);
                const phoneType = getPhoneType(cleanNumber, defaultCountry);
                const leadObj = {
                    name: d.name || place.name,
                    number: cleanNumber,
                    phoneType,
                    address: d.formatted_address || place.formatted_address || "",
                    website: d.website || "",
                    rating: d.rating ? String(d.rating) : (place.rating ? String(place.rating) : ""),
                    source: "Google Places API"
                };
                leads.push(leadObj);
                io.emit("scrape_lead_found", { lead: leadObj, current: leads.length, totalTarget: limit });
            }
        } catch (placeErr) {
            console.warn(`[Google Places] Error on place ${place.name}:`, placeErr.message);
        }
    }
    return leads;
}

async function scrapeSerpApi(keyword, location, limit, apiKey, mobileOnly = false) {
    io.emit("scrape_status", { step: "navigating", message: `Querying SerpAPI Google Maps for "${keyword} in ${location}"...`, progress: 25 });
    const url = `https://serpapi.com/search.json?engine=google_maps&q=${encodeURIComponent(keyword + ' ' + location)}&api_key=${apiKey}&hl=fr&gl=ma`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const localResults = data.local_results || [];
    const leads = [];
    const seenPhones = new Set();
    const defaultCountry = integrationsSettings.phone?.defaultCountryCode || "212";

    io.emit("scrape_status", { step: "scrolling", message: `Processing ${localResults.length} business cards from SerpAPI...`, progress: 50 });

    for (let i = 0; i < Math.min(localResults.length, limit * 2); i++) {
        if (leads.length >= limit) break;
        const item = localResults[i];
        io.emit("scrape_status", {
            step: "inspecting",
            message: `Extracting contact for "${item.title}"...`,
            current: leads.length,
            total: limit,
            currentBusiness: item.title,
            progress: Math.min(Math.round(((i + 1) / Math.min(localResults.length, limit * 2)) * 100), 95)
        });
        const rawPhone = item.phone || "";
        const cleanNumber = normalizeScrapedPhone(rawPhone, location, defaultCountry);
        if (cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber)) {
            if (mobileOnly && isLandlineNumber(cleanNumber, defaultCountry)) {
                continue;
            }
            seenPhones.add(cleanNumber);
            const phoneType = getPhoneType(cleanNumber, defaultCountry);
            const leadObj = {
                name: item.title || "Business Lead",
                number: cleanNumber,
                phoneType,
                address: item.address || "",
                website: item.website || "",
                rating: item.rating ? String(item.rating) : "",
                source: "SerpAPI"
            };
            leads.push(leadObj);
            io.emit("scrape_lead_found", { lead: leadObj, current: leads.length, totalTarget: limit });
        }
    }
    return leads;
}

// ─── Scraper API ──────────────────────────────────────────────────────────────
app.post("/api/scrape-leads", async (req, res) => {
    const { keyword, location, maxResults = 25, mobileOnly = false } = req.body;
    if (!keyword || !location) {
        return res.status(400).json({ error: "Keyword and location required" });
    }

    const limit = Math.min(Math.max(parseInt(maxResults, 10) || 20, 5), 100);
    const scraperMode = integrationsSettings.scraper?.mode || "browser";

    io.emit("scrape_status", {
        step: "init",
        message: `Starting research for "${keyword}" in "${location}" (Target: ${limit} ${mobileOnly ? 'mobile ' : ''}leads)...`,
        progress: 5,
        current: 0,
        total: limit,
        mode: scraperMode
    });

    // 1. Google Places API Mode
    if (scraperMode === "google_places" && integrationsSettings.scraper?.googlePlacesApiKey) {
        try {
            const leads = await scrapeGooglePlacesApi(keyword, location, limit, integrationsSettings.scraper.googlePlacesApiKey, mobileOnly);
            io.emit("scrape_status", {
                step: "completed",
                message: `Research complete! Successfully extracted ${leads.length} leads.`,
                progress: 100,
                current: leads.length,
                total: limit
            });
            if (integrationsSettings.webhooks?.leadsWebhookEnabled && integrationsSettings.webhooks?.leadsWebhookUrl) {
                fetch(integrationsSettings.webhooks.leadsWebhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ event: "leads_scraped", keyword, location, count: leads.length, leads, timestamp: new Date().toISOString() }),
                    signal: AbortSignal.timeout(10000)
                }).catch(wErr => console.warn('[Webhook] Leads dispatch error:', wErr.message));
            }
            return res.json({ success: true, count: leads.length, leads });
        } catch (gpErr) {
            console.warn("[Google Places API] Failed, falling back to Browser scraper:", gpErr.message);
            io.emit("scrape_status", { step: "navigating", message: `Google Places API notice: ${gpErr.message}. Falling back to Browser Scraper...`, progress: 15 });
        }
    }

    // 2. SerpAPI Mode
    if (scraperMode === "serpapi" && integrationsSettings.scraper?.serpApiKey) {
        try {
            const leads = await scrapeSerpApi(keyword, location, limit, integrationsSettings.scraper.serpApiKey, mobileOnly);
            io.emit("scrape_status", {
                step: "completed",
                message: `Research complete! Successfully extracted ${leads.length} leads.`,
                progress: 100,
                current: leads.length,
                total: limit
            });
            if (integrationsSettings.webhooks?.leadsWebhookEnabled && integrationsSettings.webhooks?.leadsWebhookUrl) {
                fetch(integrationsSettings.webhooks.leadsWebhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ event: "leads_scraped", keyword, location, count: leads.length, leads, timestamp: new Date().toISOString() }),
                    signal: AbortSignal.timeout(10000)
                }).catch(wErr => console.warn('[Webhook] Leads dispatch error:', wErr.message));
            }
            return res.json({ success: true, count: leads.length, leads });
        } catch (serpErr) {
            console.warn("[SerpAPI] Failed, falling back to Browser scraper:", serpErr.message);
            io.emit("scrape_status", { step: "navigating", message: `SerpAPI notice: ${serpErr.message}. Falling back to Browser Scraper...`, progress: 15 });
        }
    }

    // 3. Default Browser Scraper (Puppeteer Headless Chrome - 100% Free)
    const browserExecutable = chromePath || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    let browser = null;
    try {
        browser = await puppeteer_1.default.launch({
            executablePath: browserExecutable,
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1280,800'
            ]
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Bypass Google Cookie Consent popup
        const consentCookie = { name: 'CONSENT', value: 'YES+cb.20230101-00-p0.en+FX+777', domain: '.google.com' };
        await page.setCookie(consentCookie);

        const query = encodeURIComponent(`${keyword} in ${location}`);
        const searchUrl = `https://www.google.com/maps/search/${query}`;
        console.log(`[Google Maps Scraper] Navigating to: ${searchUrl}`);
        io.emit("scrape_status", { step: "navigating", message: `Opening Google Maps for "${keyword} in ${location}"...`, progress: 15, current: 0, total: limit });

        await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 35000 });
        
        // Wait for results container or navigation redirect to settle
        try {
            await page.waitForSelector('div[role="feed"], a.hfpxzc, a[href*="/maps/place/"]', { timeout: 15000 });
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Auto-dismiss any Google consent dialog
        try {
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button, form button'));
                const acceptBtn = buttons.find(b => {
                    const txt = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase();
                    return txt.includes('tout accepter') || txt.includes('accept all') || txt.includes('i agree') || txt.includes('accepter tout');
                });
                if (acceptBtn) acceptBtn.click();
            });
        } catch (_) {}

        // Scroll the feed to load matching results
        io.emit("scrape_status", { step: "scrolling", message: "Scanning Google Maps listings...", progress: 30, current: 0, total: limit });
        const scrollSelector = 'div[role="feed"]';
        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = Math.max(Math.ceil(limit / 5), 4);

        while (scrollAttempts < maxScrollAttempts) {
            scrollAttempts++;
            await page.evaluate((sel) => {
                const feed = document.querySelector(sel);
                if (feed) {
                    feed.scrollTop = feed.scrollHeight;
                } else {
                    window.scrollBy(0, 1000);
                }
            }, scrollSelector);

            await new Promise(resolve => setTimeout(resolve, 2000));

            const currentResultsCount = await page.evaluate(() => {
                return document.querySelectorAll('a.hfpxzc, div[role="article"]').length;
            });

            io.emit("scrape_status", {
                step: "scrolling",
                message: `Discovered ${currentResultsCount} listings on Google Maps...`,
                progress: Math.min(30 + Math.round((scrollAttempts / maxScrollAttempts) * 20), 50),
                current: 0,
                total: limit
            });

            if (currentResultsCount >= limit * 1.5) break;

            const newHeight = await page.evaluate((sel) => {
                const feed = document.querySelector(sel);
                return feed ? feed.scrollHeight : document.body.scrollHeight;
            }, scrollSelector);

            if (newHeight === previousHeight && scrollAttempts > 3) break;
            previousHeight = newHeight;
        }

        // Extract place links and preliminary details from feed
        const placeItems = await page.evaluate(() => {
            const results = [];
            const links = Array.from(document.querySelectorAll('a.hfpxzc'));

            for (const link of links) {
                const href = link.getAttribute('href');
                const ariaLabel = link.getAttribute('aria-label') || '';
                const container = link.closest('div[role="article"], div.Nv2PK') || link.parentElement;
                const containerText = container ? container.innerText : '';

                if (href && ariaLabel) {
                    results.push({
                        name: ariaLabel,
                        url: href,
                        containerText
                    });
                }
            }

            return results;
        });

        console.log(`[Google Maps Scraper] Discovered ${placeItems.length} candidate places. Extracting details...`);
        io.emit("scrape_status", {
            step: "scrolling",
            message: `Discovered ${placeItems.length} candidate businesses. Starting detailed phone extraction...`,
            progress: 50,
            current: 0,
            total: limit
        });

        const leads = [];
        const seenPhones = new Set();
        const defaultCountry = integrationsSettings.phone?.defaultCountryCode || "212";
        const workerPage = await browser.newPage();
        await workerPage.setViewport({ width: 1280, height: 800 });

        for (let i = 0; i < placeItems.length; i++) {
            if (leads.length >= limit) break;

            const item = placeItems[i];
            const currentProgress = Math.min(50 + Math.round(((i + 1) / placeItems.length) * 45), 95);

            io.emit("scrape_status", {
                step: "inspecting",
                message: `Extracting contact details for "${item.name}"...`,
                current: leads.length,
                total: limit,
                currentBusiness: item.name,
                progress: currentProgress
            });

            try {
                await workerPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                await workerPage.waitForSelector('div[role="main"]', { timeout: 7000 }).catch(() => {});

                // Extract precise business details from detail panel
                const details = await workerPage.evaluate(() => {
                    // Phone
                    let phone = '';
                    const phoneBtn = document.querySelector('button[data-item-id*="phone:"], [data-tooltip*="téléphone" i], [data-tooltip*="phone" i], [aria-label*="phone" i], [aria-label*="téléphone" i]');
                    if (phoneBtn) {
                        phone = phoneBtn.getAttribute('aria-label') || phoneBtn.innerText || '';
                        phone = phone.replace(/^[^\d+]+/, '').trim();
                    }

                    if (!phone) {
                        const mainPane = document.querySelector('div[role="main"]') || document.body;
                        const phoneRegex = /(?:\+(?:[0-9]\s*){1,3})?[0-9](?:[\s.-]*[0-9]){8,13}/g;
                        const matches = (mainPane.innerText.match(phoneRegex) || []).filter(n => {
                            const digits = n.replace(/\D/g, '');
                            return digits.length >= 9 && digits.length <= 15;
                        });
                        if (matches.length > 0) phone = matches[0];
                    }

                    // Website
                    const websiteEl = document.querySelector('a[data-item-id="authority"], a[aria-label*="site web" i], a[aria-label*="website" i]');
                    const website = websiteEl ? websiteEl.getAttribute('href') : '';

                    // Address
                    const addressEl = document.querySelector('button[data-item-id="address"]');
                    const address = addressEl ? (addressEl.innerText || addressEl.getAttribute('aria-label') || '') : '';

                    // Rating
                    const ratingEl = document.querySelector('span.MW4etd, [aria-label*="étoiles" i], [aria-label*="stars" i]');
                    const rating = ratingEl ? (ratingEl.innerText || ratingEl.getAttribute('aria-label') || '') : '';

                    return { phone, website, address, rating };
                });

                // Clean phone number with country normalization (strips redundant zero, eliminates +0...)
                let cleanNumber = "";
                if (details.phone) {
                    cleanNumber = normalizeScrapedPhone(details.phone, location, defaultCountry);
                } else if (item.containerText) {
                    // Fallback to number inside search card
                    const phoneRegex = /(?:\+(?:[0-9]\s*){1,3})?[0-9](?:[\s.-]*[0-9]){8,13}/g;
                    const cardMatches = item.containerText.match(phoneRegex) || [];
                    if (cardMatches.length > 0) {
                        cleanNumber = normalizeScrapedPhone(cardMatches[0], location, defaultCountry);
                    }
                }

                if (cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber)) {
                    if (mobileOnly && isLandlineNumber(cleanNumber, defaultCountry)) {
                        console.log(`[Google Maps Scraper] Skipping landline: ${cleanNumber} (${item.name})`);
                        io.emit("scrape_status", {
                            step: "inspecting",
                            message: `Excluded landline: ${cleanNumber} (Smartphone filter active)`,
                            current: leads.length,
                            total: limit,
                            currentBusiness: item.name,
                            progress: Math.min(Math.round((leads.length / limit) * 100), 98)
                        });
                        continue;
                    }

                    seenPhones.add(cleanNumber);
                    const phoneType = getPhoneType(cleanNumber, defaultCountry);
                    const leadObj = {
                        name: item.name,
                        number: cleanNumber,
                        phoneType,
                        address: details.address.replace(/\n/g, ' ').replace(/^\s*/, '').trim(),
                        website: details.website || "",
                        rating: details.rating ? details.rating.trim() : "",
                        source: "Google Maps"
                    };

                    leads.push(leadObj);

                    // Real-time notification over socket
                    io.emit("scrape_lead_found", {
                        lead: leadObj,
                        current: leads.length,
                        totalTarget: limit
                    });

                    io.emit("scrape_status", {
                        step: "found",
                        message: `Verified phone: ${leadObj.number} (${leadObj.name})`,
                        current: leads.length,
                        total: limit,
                        currentBusiness: leadObj.name,
                        progress: Math.min(Math.round((leads.length / limit) * 100), 98)
                    });

                    console.log(`[Google Maps Scraper] [${leads.length}/${limit}] Found: ${leadObj.name} (${leadObj.number})`);
                }
            } catch (itemErr) {
                console.warn(`[Google Maps Scraper] Error scraping ${item.name}:`, itemErr.message);
            }
        }

        try { await workerPage.close(); } catch (_) {}
        await browser.close();
        browser = null;

        console.log(`[Google Maps Scraper] Successfully scraped ${leads.length} leads with verified phone numbers.`);
        io.emit("scrape_status", {
            step: "completed",
            message: `Research complete! Successfully found ${leads.length} leads with verified phone numbers.`,
            progress: 100,
            current: leads.length,
            total: limit
        });

        if (integrationsSettings.webhooks?.leadsWebhookEnabled && integrationsSettings.webhooks?.leadsWebhookUrl) {
            fetch(integrationsSettings.webhooks.leadsWebhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    event: "leads_scraped",
                    keyword,
                    location,
                    count: leads.length,
                    leads,
                    timestamp: new Date().toISOString()
                }),
                signal: AbortSignal.timeout(10000)
            }).catch(wErr => console.warn('[Webhook] Leads dispatch error:', wErr.message));
        }

        res.json({ success: true, count: leads.length, leads });
    }
    catch (e) {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        console.error("Scraping error:", e);
        io.emit("scrape_status", {
            step: "error",
            message: `Scraping error: ${e.message}`,
            progress: 0
        });
        // @ts-ignore
        res.status(500).json({ error: "Failed to scrape leads from Google Maps.", details: e?.message });
    }
});

// ─── Single Message API ───────────────────────────────────────────────────────
app.post("/api/send-single", async (req, res) => {
    // Auto-recover isReady if WhatsApp Web UI is already loaded in Chromium
    if (!isReady && activeClient && activeClient.pupPage) {
        try {
            const hasChats = await activeClient.pupPage.evaluate(() => {
                return !!(document.querySelector('#pane-side') || (window.Store && window.Store.Chat));
            });
            if (hasChats) {
                await ensureWWebJSInjected(activeClient);
                isReady = true;
                isAuthenticated = true;
            }
        } catch (_) {}
    }

    const recipient = req.body.recipient || req.body.to || req.body.phone || req.body.number;
    const message = req.body.message || req.body.text || req.body.msg;
    const attachment = req.body.attachment || req.body.media;

    if (!recipient) {
        return res.status(400).json({ error: "Recipient phone number is required." });
    }
    if (!isReady || !activeClient) {
        return res.status(503).json({ error: "WhatsApp client is not connected. Please connect your session in Devices." });
    }
    try {
        await ensureWWebJSInjected(activeClient);

        const resolved = await resolveWhatsAppNumber(recipient, activeClient);
        if (!resolved || !resolved.jid) {
            return res.status(400).json({ error: "Invalid phone number." });
        }

        const formattedNumber = resolved.jid;
        let sentResult;

        const doSend = async () => {
            if (attachment && attachment.data && attachment.mimetype) {
                const media = new whatsapp_web_js_1.MessageMedia(attachment.mimetype, attachment.data, attachment.filename || 'file');
                const options = message && message.trim() ? { caption: message.trim() } : {};
                return await activeClient.sendMessage(formattedNumber, media, options);
            } else if (message && message.trim()) {
                return await activeClient.sendMessage(formattedNumber, message.trim());
            } else {
                throw new Error("Message text or media attachment is required.");
            }
        };

        try {
            sentResult = await doSend();
        } catch (sendErr) {
            if (sendErr.message && (sendErr.message.includes("getChat") || sendErr.message.includes("WWebJS"))) {
                console.warn("[/api/send-single] Retrying after injecting WWebJS utils...", sendErr.message);
                await ensureWWebJSInjected(activeClient);
                await new Promise(r => setTimeout(r, 800));
                sentResult = await doSend();
            } else {
                throw sendErr;
            }
        }

        console.log(`[/api/send-single] Message successfully sent to ${formattedNumber}`);
        res.json({
            success: true,
            messageId: sentResult?.id?._serialized || Date.now().toString(),
            to: formattedNumber,
            resolvedNumber: resolved.number
        });
    } catch (err) {
        console.error("[/api/send-single] Error:", err);
        let userMsg = err.message || "Failed to send message";
        if (userMsg.includes("No LID for user") || userMsg.includes("wid error") || userMsg.includes("not registered")) {
            userMsg = `The phone number (${recipient}) is not registered on WhatsApp or is invalid. Please check the number with country code.`;
        }
        res.status(500).json({ error: userMsg });
    }
});

// ─── Templates API ────────────────────────────────────────────────────────────
app.get("/api/templates", (_req, res) => {
    res.json(messageTemplates);
});
app.post("/api/templates", (req, res) => {
    const { id, title, content, category } = req.body;
    if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required." });
    }
    if (id) {
        const idx = messageTemplates.findIndex(t => t.id === id);
        if (idx !== -1) {
            messageTemplates[idx] = { ...messageTemplates[idx], title, content, category: category || "General" };
        } else {
            messageTemplates.unshift({ id, title, content, category: category || "General", createdAt: new Date().toISOString() });
        }
    } else {
        const newId = "tpl-" + Date.now();
        messageTemplates.unshift({ id: newId, title, content, category: category || "General", createdAt: new Date().toISOString() });
    }
    saveTemplates();
    res.json({ success: true, templates: messageTemplates });
});
app.delete("/api/templates/:id", (req, res) => {
    const { id } = req.params;
    messageTemplates = messageTemplates.filter(t => t.id !== id);
    saveTemplates();
    res.json({ success: true, templates: messageTemplates });
});

// ─── Proxies API ──────────────────────────────────────────────────────────────
app.get("/api/proxies", (_req, res) => {
    res.json(campaignProxies);
});
app.post("/api/proxies", (req, res) => {
    const { proxyList } = req.body;
    if (!proxyList || !Array.isArray(proxyList)) {
        return res.status(400).json({ error: "proxyList array is required." });
    }
    const newItems = proxyList.map(p => {
        if (typeof p === 'string') {
            const parts = p.trim().split(':');
            return {
                id: "prx-" + Math.random().toString(36).substring(2, 9),
                host: parts[0] || '',
                port: parts[1] || '8080',
                username: parts[2] || '',
                password: parts[3] || '',
                type: 'http',
                latency: null,
                status: 'untested',
                source: 'proxy6.net',
                createdAt: new Date().toISOString()
            };
        }
        return {
            id: p.id || "prx-" + Math.random().toString(36).substring(2, 9),
            host: p.host || '',
            port: p.port || '8080',
            username: p.username || '',
            password: p.password || '',
            type: p.type || 'http',
            latency: p.latency || null,
            status: p.status || 'untested',
            source: p.source || 'proxy6.net',
            createdAt: new Date().toISOString()
        };
    }).filter(p => p.host);

    campaignProxies = [...newItems, ...campaignProxies];
    saveProxies();
    res.json({ success: true, count: campaignProxies.length, proxies: campaignProxies });
});
app.delete("/api/proxies/:id", (req, res) => {
    const { id } = req.params;
    campaignProxies = campaignProxies.filter(p => p.id !== id);
    saveProxies();
    res.json({ success: true, proxies: campaignProxies });
});
app.post("/api/proxies/test", async (req, res) => {
    const { id, host, port } = req.body;
    if (!host) return res.status(400).json({ error: "Host is required" });
    const startTime = Date.now();
    const net = require('net');
    const targetHost = host;
    const targetPort = parseInt(port) || 80;

    const socket = new net.Socket();
    socket.setTimeout(4000);

    socket.on('connect', () => {
        const latency = Date.now() - startTime;
        socket.destroy();
        if (id) {
            const item = campaignProxies.find(p => p.id === id);
            if (item) {
                item.latency = latency;
                item.status = 'active';
                item.lastTested = new Date().toISOString();
                saveProxies();
            }
        }
        res.json({ success: true, latency, status: 'active' });
    });

    socket.on('timeout', () => {
        socket.destroy();
        if (id) {
            const item = campaignProxies.find(p => p.id === id);
            if (item) {
                item.status = 'timeout';
                item.latency = null;
                saveProxies();
            }
        }
        res.json({ success: false, error: 'Connection timed out', status: 'offline' });
    });

    socket.on('error', (err) => {
        socket.destroy();
        if (id) {
            const item = campaignProxies.find(p => p.id === id);
            if (item) {
                item.status = 'error';
                item.latency = null;
                saveProxies();
            }
        }
        res.json({ success: false, error: err.message, status: 'offline' });
    });

    socket.connect(targetPort, targetHost);
});

// ─── Call Responder API ───────────────────────────────────────────────────────
app.get("/api/call-responder", (_req, res) => {
    res.json(callResponderConfig);
});
app.post("/api/call-responder", (req, res) => {
    const { enabled, rejectVoice, rejectVideo, replyMessage, autoReplyDelayMs } = req.body;
    if (enabled !== undefined) callResponderConfig.enabled = !!enabled;
    if (rejectVoice !== undefined) callResponderConfig.rejectVoice = !!rejectVoice;
    if (rejectVideo !== undefined) callResponderConfig.rejectVideo = !!rejectVideo;
    if (replyMessage !== undefined) callResponderConfig.replyMessage = String(replyMessage);
    if (autoReplyDelayMs !== undefined) callResponderConfig.autoReplyDelayMs = Number(autoReplyDelayMs);
    saveCallResponder();
    res.json({ success: true, config: callResponderConfig });
});

// ─── Dashboard Metrics API ────────────────────────────────────────────────────
app.get("/api/dashboard-metrics", (_req, res) => {
    let history = [];
    if (fs_1.default.existsSync(HISTORY_PATH)) {
        try {
            history = JSON.parse(fs_1.default.readFileSync(HISTORY_PATH, "utf8"));
        } catch (e) {}
    }
    const today = new Date().toDateString();
    let sentToday = 0;
    let totalSent = 0;
    let totalMessagesAttempted = 0;

    history.forEach(h => {
        const count = h.sentCount || 0;
        totalSent += count;
        totalMessagesAttempted += (h.total || count);
        if (new Date(h.timestamp).toDateString() === today) {
            sentToday += count;
        }
    });

    const successRate = totalMessagesAttempted > 0 ? Math.round((totalSent / totalMessagesAttempted) * 100) : 100;
    const botStats = typeof botEngine.getStats === 'function' ? botEngine.getStats() : { totalOutgoingLearned: 0, incomingRecorded: 0 };

    res.json({
        totalMessages: totalSent,
        messagesSent: totalSent,
        messagesSentToday: sentToday,
        activeDevices: isReady ? 1 : 0,
        totalContacts: (function() {
            try {
                const cPath = path_1.default.join(DATA_DIR, "contacts.json");
                if (fs_1.default.existsSync(cPath)) return JSON.parse(fs_1.default.readFileSync(cPath, "utf8")).length;
            } catch(e) {}
            return 0;
        })(),
        totalTemplates: messageTemplates.length,
        templatesCount: messageTemplates.length,
        autoReplyRules: autoResponses.length,
        autoReplyTotalResponses: botStats.totalOutgoingLearned || autoResponses.length * 2,
        chatbotEnabled: (typeof chatbotConfig !== 'undefined' && chatbotConfig.enabled) || false,
        chatbotActiveFlows: botEngine.sources ? botEngine.sources.length : 1,
        chatbotConversations: botStats.incomingRecorded || 0,
        callResponderEnabled: callResponderConfig.enabled || false,
        callResponderActiveRules: callResponderConfig.enabled ? 1 : 0,
        callResponderTotalResponses: callResponderConfig.stats.repliesSent || 0,
        rejectedCalls: callResponderConfig.stats.rejectedCalls || 0,
        botReplies: botStats.totalOutgoingLearned || 0,
        bulkCampaigns: history.length,
        bulkCampaignsCompleted: history.length,
        bulkSuccessRate: successRate
    });
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
    hookPageLogging(phoneClient);
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

// ─── Health API ─────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now() });
});

// ─── Status API ──────────────────────────────────────────────────────────────
app.get("/api/status", async (_req, res) => {
    if (!isReady && isAuthenticated && activeClient && activeClient.pupPage && !activeClient.pupPage.isClosed()) {
        try {
            const hasPane = await activeClient.pupPage.evaluate(() => {
                return !!(document.querySelector('#pane-side') || document.querySelector('[data-testid="chat-list"]') || (window.Store && window.Store.Chat));
            }).catch(() => false);
            if (hasPane) {
                console.log("[Status API] Detected active WhatsApp Web UI while not marked ready. Marking session ready!");
                await ensureWWebJSInjected(activeClient);
                isReady = true;
                qrCodeData = "";
                io.emit("ready", true);
            }
        } catch (_) {}
    }
    res.json({
        isReady,
        isAuthenticated,
        authenticated: isAuthenticated,
        hasQr: !!qrCodeData,
        qr: qrCodeData || null,
        devices: serializeDevices()
    });
});

// ─── Reset Session ────────────────────────────────────────────────────────────
app.post("/api/reset-session", async (_req, res) => {
    console.log("[API] Resetting WhatsApp session on request...");
    // Notify frontend
    io.emit("disconnected", "manual_reset");
    io.emit("loading_screen", { percent: 10, message: "Resetting WhatsApp session and clearing locks..." });
    await destroyActiveClient(true);
    // Kill any lingering browser processes first so files aren't locked
    await killStaleBrowserProcesses();
    cleanChromiumLocks();
    await new Promise(r => setTimeout(r, 800));
    // Clear auth folder for a fresh start
    const authPath = process.env.WWEBJS_DATA_PATH || path_1.default.join(process.cwd(), ".wwebjs_auth");
    safeClearFolder(authPath);
    // 2.5s delay to ensure Windows releases all file handles before launching fresh Chromium
    setTimeout(() => {
        console.log("[API] Restarting fresh in QR mode...");
        createAndStartQRClient();
    }, 2500);
    res.json({ success: true, message: "Session reset. Restarting in QR mode." });
});
// ─── Static files & Web UI ──────────────────────────────────────────────────
const landingPath = path_1.default.join(__dirname, "landing");
if (fs_1.default.existsSync(landingPath)) {
    app.use("/landing", express_1.default.static(landingPath));
}

const outPath = path_1.default.join(__dirname, "out");
if (fs_1.default.existsSync(outPath)) {
    app.use(express_1.default.static(outPath));
    app.get("*", (req, res, next) => {
        if (req.path.startsWith("/api/") || req.path.startsWith("/landing")) return next();
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
