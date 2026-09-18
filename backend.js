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
        mode: "serper", // "serper", "serpapi", "browser", "google_places", "custom_webhook"
        googlePlacesApiKey: "",
        serpApiKey: "",
        serperApiKey: "56b7780f8785c9d26504deca8d2adb9c48546ffd",
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

            // Set user's Serper.dev key if not set
            if (!integrationsSettings.scraper.serperApiKey) {
                integrationsSettings.scraper.serperApiKey = "56b7780f8785c9d26504deca8d2adb9c48546ffd";
            }
            if (integrationsSettings.scraper.mode === "browser" || !integrationsSettings.scraper.mode) {
                integrationsSettings.scraper.mode = "serper";
            }

            // Ensure valid Gemini model without forcing deprecated 3.6
            if (integrationsSettings.ai && integrationsSettings.ai.provider === "gemini") {
                const curModel = (integrationsSettings.ai.model || "").trim();
                if (!curModel || curModel === "gemini-3.6-flash") {
                    integrationsSettings.ai.model = "gemini-2.5-flash";
                    try { fs_1.default.writeFileSync(INTEGRATIONS_PATH, JSON.stringify(integrationsSettings, null, 2)); } catch (_) {}
                }
            }
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

// ─── Live Chat, AI Reply Log, Emailing, Contacts & Workflows Stores ──────────
const CONVERSATIONS_PATH = path_1.default.join(DATA_DIR, "conversations.json");
const CONVERSATIONS_STATE_PATH = path_1.default.join(DATA_DIR, "conversations_state.json");
const AI_REPLY_LOG_PATH = path_1.default.join(DATA_DIR, "ai_reply_log.json");
const EMAIL_SETTINGS_PATH = path_1.default.join(DATA_DIR, "email_settings.json");
const EMAIL_HISTORY_PATH = path_1.default.join(DATA_DIR, "email_history.json");
const CONTACTS_PATH = path_1.default.join(DATA_DIR, "contacts.json");
const WORKFLOWS_PATH = path_1.default.join(DATA_DIR, "workflows.json");

let conversationsMap = new Map();
let conversationsState = {};
let aiReplyLogs = [];
let emailSettings = {
    host: "",
    port: 587,
    secure: false,
    user: "",
    pass: "",
    fromName: "WApp Manager Pro",
    fromEmail: ""
};
let emailHistory = [];
let savedContacts = [];
let workflowsList = [];

function loadExtendedStores() {
    try {
        if (fs_1.default.existsSync(CONVERSATIONS_PATH)) {
            const raw = JSON.parse(fs_1.default.readFileSync(CONVERSATIONS_PATH, 'utf8'));
            if (Array.isArray(raw)) {
                conversationsMap = new Map(raw.map(c => [c.id, c]));
            }
        }
        if (fs_1.default.existsSync(CONVERSATIONS_STATE_PATH)) {
            conversationsState = JSON.parse(fs_1.default.readFileSync(CONVERSATIONS_STATE_PATH, 'utf8')) || {};
        }
        if (fs_1.default.existsSync(AI_REPLY_LOG_PATH)) {
            aiReplyLogs = JSON.parse(fs_1.default.readFileSync(AI_REPLY_LOG_PATH, 'utf8')) || [];
        }
        if (fs_1.default.existsSync(EMAIL_SETTINGS_PATH)) {
            emailSettings = { ...emailSettings, ...JSON.parse(fs_1.default.readFileSync(EMAIL_SETTINGS_PATH, 'utf8')) };
        }
        if (fs_1.default.existsSync(EMAIL_HISTORY_PATH)) {
            emailHistory = JSON.parse(fs_1.default.readFileSync(EMAIL_HISTORY_PATH, 'utf8')) || [];
        }
        if (fs_1.default.existsSync(CONTACTS_PATH)) {
            savedContacts = JSON.parse(fs_1.default.readFileSync(CONTACTS_PATH, 'utf8')) || [];
        }
        if (fs_1.default.existsSync(WORKFLOWS_PATH)) {
            workflowsList = JSON.parse(fs_1.default.readFileSync(WORKFLOWS_PATH, 'utf8')) || [];
        } else {
            workflowsList = [
                { id: "wf-1", name: "Alerte Demande d'Agent", trigger: "agent_requested", active: true, action: "alert_and_switch_manual", description: "Bascule la conversation en mode MANUEL et notifie l'agent immédiatement" },
                { id: "wf-2", name: "Accusé de Réception Automatique", trigger: "first_incoming", active: false, action: "send_welcome_msg", delayMinutes: 0, description: "Envoie un message de bienvenue personnalisé lors du premier message d'un client" },
                { id: "wf-3", name: "Relance Client Inactif (24h)", trigger: "no_reply_24h", active: false, action: "send_followup", delayMinutes: 1440, description: "Relance un prospect qui n'a pas répondu depuis 24 heures" }
            ];
            try { fs_1.default.writeFileSync(WORKFLOWS_PATH, JSON.stringify(workflowsList, null, 2)); } catch (_) {}
        }
    } catch (e) {
        console.warn("[ExtendedStores] Error loading stores:", e.message);
    }
}
loadExtendedStores();

function saveConversations() {
    try {
        const arr = Array.from(conversationsMap.values());
        fs_1.default.writeFileSync(CONVERSATIONS_PATH, JSON.stringify(arr, null, 2));
    } catch (e) {
        console.error("[ExtendedStores] Could not save conversations:", e.message);
    }
}

function recordChatMessage({ id, chatId, from, to, fromMe, body, senderName, number, timestamp, isAiReply, source, confidence }) {
    if (!chatId) return;
    const cleanId = chatId.includes("@") ? chatId : `${chatId}@c.us`;
    const state = conversationsState[cleanId] || { mode: "ai", requestedAgent: false };

    let conv = conversationsMap.get(cleanId);
    if (!conv) {
        conv = {
            id: cleanId,
            name: senderName || number || cleanId.split("@")[0],
            number: number || cleanId.split("@")[0],
            lastMessage: body,
            lastTimestamp: timestamp || Date.now(),
            unreadCount: fromMe ? 0 : 1,
            mode: state.mode || "ai",
            requestedAgent: !!state.requestedAgent,
            agentRequestTimestamp: state.agentRequestTimestamp || null,
            messages: []
        };
        conversationsMap.set(cleanId, conv);
    } else {
        conv.lastMessage = body;
        conv.lastTimestamp = timestamp || Date.now();
        if (!fromMe) conv.unreadCount = (conv.unreadCount || 0) + 1;
        conv.mode = state.mode || conv.mode || "ai";
        conv.requestedAgent = !!state.requestedAgent;
        conv.agentRequestTimestamp = state.agentRequestTimestamp || conv.agentRequestTimestamp;
        if (senderName && (conv.name === conv.number || !conv.name)) conv.name = senderName;
    }

    const msgItem = {
        id: id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        fromMe: !!fromMe,
        body,
        timestamp: timestamp || Date.now(),
        isAiReply: !!isAiReply,
        source: source || (fromMe ? "manual" : "incoming"),
        confidence: confidence || null
    };

    if (!conv.messages) conv.messages = [];
    conv.messages.push(msgItem);
    if (conv.messages.length > 100) conv.messages = conv.messages.slice(-100);

    saveConversations();
    io.emit("chat:message_added", { chatId: cleanId, message: msgItem, conversation: { ...conv, messages: undefined } });
}

function recordAiReplyLogEntry({ contactNumber, contactName, question, reply, source, confidence, deviceId }) {
    const entry = {
        id: `airpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: new Date().toISOString(),
        contactNumber: contactNumber || "Inconnu",
        contactName: contactName || contactNumber || "Client",
        question: question || "",
        reply: reply || "",
        source: source || "AI Fallback",
        confidence: confidence || "100%",
        deviceId: deviceId || "default"
    };
    aiReplyLogs.unshift(entry);
    if (aiReplyLogs.length > 500) aiReplyLogs = aiReplyLogs.slice(0, 500);
    try {
        fs_1.default.writeFileSync(AI_REPLY_LOG_PATH, JSON.stringify(aiReplyLogs, null, 2));
    } catch (_) {}
    io.emit("chatbot:reply_logged", entry);
    return entry;
}

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
    const override = typeof customConfig === "string" ? { systemPrompt: customConfig } : (customConfig || {});
    const aiConfig = { ...integrationsSettings.ai, ...override };
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

    try {
        // Google Gemini API
        if (provider === "gemini") {
            let geminiModel = (model || "").trim().replace(/^models\//, "");
            if (!geminiModel || geminiModel === "default") {
                geminiModel = "gemini-2.5-flash";
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: fullSystemPrompt }] },
                    contents: [{ parts: [{ text: userMessage }] }],
                    generationConfig: {
                        temperature: Number(temperature) || 0.7,
                        maxOutputTokens: Math.max(Number(maxTokens) || 350, 1024)
                    }
                }),
                signal: AbortSignal.timeout(25000)
            });
            const data = await res.json();
            if (res.ok) {
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                return text ? text.trim() : null;
            }
            throw new Error(data.error?.message || `Erreur Gemini API (${geminiModel}): HTTP ${res.status}`);
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
                signal: AbortSignal.timeout(25000)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error?.message || `Claude API error ${res.status}`);
            const text = data.content?.[0]?.text;
            return text ? text.trim() : null;
        }

        // OpenRouter, OpenAI, DeepSeek, Groq, Ollama, Custom OpenAI-Compatible
        let baseUrl = "https://api.openai.com/v1";
        let defaultModel = "gpt-4o-mini";

        if (provider === "openrouter") {
            baseUrl = "https://openrouter.ai/api/v1";
            defaultModel = "google/gemini-2.5-flash";
        } else if (provider === "deepseek") {
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
        if (provider === "openrouter") {
            headers["HTTP-Referer"] = "https://wapp-manager.local";
            headers["X-Title"] = "WApp Manager Leads Pro";
        }

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
            signal: AbortSignal.timeout(25000)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || `AI API returned status ${res.status}`);
        const text = data.choices?.[0]?.message?.content;
        return text ? text.trim() : null;
    } catch (err) {
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

    // Clean Chromium profile-level singleton locks across all device session directories
    const lockTargets = [authPath];
    try {
        const entries = fs_1.default.readdirSync(authPath, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const sessionDir = path_1.default.join(authPath, entry.name);
                lockTargets.push(sessionDir);
                const defaultDir = path_1.default.join(sessionDir, "Default");
                if (fs_1.default.existsSync(defaultDir)) {
                    lockTargets.push(defaultDir);
                }
            }
        }
    } catch (_) {}

    for (const dir of lockTargets) {
        if (fs_1.default.existsSync(dir)) {
            for (const lockFile of ["SingletonLock", "SingletonCookie", "SingletonSocket", "parent.lock"]) {
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
    "--unlimited-storage",
    "--enable-aggressive-domstorage-flushing",
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
let isBulkPaused = false;
let currentBulkResults = [];
let currentBulkSession = null;
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
            const raw = JSON.parse(fs_1.default.readFileSync(TEMPLATES_PATH, "utf8"));
            if (Array.isArray(raw)) {
                messageTemplates = raw.map(t => ({
                    ...t,
                    title: t.title || t.name || "Untitled Template",
                    name: t.name || t.title || "Untitled Template"
                }));
            }
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
    const interval = setInterval(async () => {
        checkCount++;
        if (client.pupPage && !client.pupPage.isClosed()) {
            clearInterval(interval);
            try {
                if (client.pupBrowser) {
                    const context = client.pupBrowser.defaultBrowserContext();
                    await context.overridePermissions('https://web.whatsapp.com', [
                        'persistent-storage',
                        'notifications',
                        'clipboard-read',
                        'clipboard-write'
                    ]).catch(() => {});
                }
                await client.pupPage.evaluateOnNewDocument(() => {
                    try {
                        if (navigator.storage) {
                            navigator.storage.persist = async () => true;
                            navigator.storage.persisted = async () => true;
                        }
                    } catch (_) {}
                }).catch(() => {});
                await client.pupPage.evaluate(() => {
                    try {
                        if (navigator.storage) {
                            navigator.storage.persist = async () => true;
                            navigator.storage.persisted = async () => true;
                        }
                    } catch (_) {}
                }).catch(() => {});
            } catch (_) {}
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
 * Proactive watchdog that monitors WhatsApp Web page state in Chromium.
 * Automatically recovers session when user scans QR, even if wwebjs library events stall.
 */
function startDeviceAuthWatchdog(deviceId, client) {
    const d = devices.get(deviceId);
    if (!d) return;
    if (d.authStallTimer) { clearInterval(d.authStallTimer); d.authStallTimer = null; }

    let checks = 0;
    d.authStallTimer = setInterval(async () => {
        checks++;
        const dev = devices.get(deviceId);
        if (!dev || dev.client !== client || dev.isReady || checks > 120) {
            if (dev && dev.authStallTimer) { clearInterval(dev.authStallTimer); dev.authStallTimer = null; }
            return;
        }

        try {
            if (client.pupPage && !client.pupPage.isClosed()) {
                const status = await client.pupPage.evaluate(() => {
                    const hasPane = !!(
                        document.querySelector('#pane-side') || 
                        document.querySelector('[data-testid="chat-list"]') || 
                        document.querySelector('[data-testid="intro-title"]') ||
                        document.querySelector('[data-testid="conversation-panel-wrapper"]') ||
                        document.querySelector('header [data-testid="menu-bar-menu-button"]') ||
                        (typeof window.Store !== 'undefined' && (window.Store.Chat || window.Store.SendMessage))
                    );

                    const hasQR = !!(document.querySelector('canvas') || document.querySelector('[data-ref]'));

                    let phone = "";
                    try {
                        if (window.Store && window.Store.Conn && window.Store.Conn.wid) {
                            phone = window.Store.Conn.wid.user || "";
                        }
                    } catch (_) {}

                    return { hasPane, hasQR, phone };
                }).catch(() => null);

                if (!status) return;

                if (status.hasPane && !dev.isReady) {
                    console.log(`[Watchdog] Device ${deviceId}: WhatsApp Web UI confirmed active. Emitting ready!`);
                    if (dev.authStallTimer) { clearInterval(dev.authStallTimer); dev.authStallTimer = null; }
                    await ensureWWebJSInjected(client);
                    dev.isReady = true;
                    dev.isAuthenticated = true;
                    dev.qrCodeData = "";
                    if (status.phone) {
                        dev.phoneNumber = status.phone;
                    } else {
                        try {
                            const info = client.info;
                            if (info && info.wid && info.wid.user) dev.phoneNumber = info.wid.user;
                        } catch (_) {}
                    }
                    updateLegacyState();
                    saveDeviceRegistry();
                    io.emit("device:ready", { deviceId, phoneNumber: dev.phoneNumber });
                    io.emit("ready", true);
                    io.emit("devices:list", serializeDevices());
                    startDeviceHeartbeat(deviceId);
                    return;
                }

                if (!status.hasQR && !dev.isAuthenticated) {
                    console.log(`[Watchdog] Device ${deviceId}: QR code scanned, synchronizing...`);
                    dev.isAuthenticated = true;
                    dev.qrCodeData = "";
                    updateLegacyState();
                    io.emit("device:authenticated", { deviceId });
                    io.emit("authenticated", true);
                    io.emit("devices:list", serializeDevices());
                }
            }
        } catch (_) {}
    }, 1500);
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
    // Start proactive watchdog to detect QR scan and chat list load immediately
    startDeviceAuthWatchdog(deviceId, client);

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
        startDeviceAuthWatchdog(deviceId, client);
    });
    client.on("disconnected", async (reason) => {
        console.log(`[Device ${deviceId}] Disconnected:`, reason);
        const d = devices.get(deviceId);
        if (d) {
            if (d.authStallTimer) { clearTimeout(d.authStallTimer); clearInterval(d.authStallTimer); d.authStallTimer = null; }
        }
        if (d && d.client === client) {
            if (reason === "LOGOUT") {
                // If device has an active UI or is synchronizing, do not immediately destroy the session
                if (client.pupPage && !client.pupPage.isClosed()) {
                    try {
                        const uiActive = await client.pupPage.evaluate(() => {
                            return !!(
                                document.querySelector('#pane-side') || 
                                document.querySelector('[data-testid="chat-list"]') || 
                                document.querySelector('[data-testid="intro-title"]') ||
                                (typeof window.Store !== 'undefined' && (window.Store.Chat || window.Store.SendMessage))
                            );
                        }).catch(() => false);
                        if (uiActive) {
                            console.log(`[Watchdog] Device ${deviceId}: ignoring transient LOGOUT (WhatsApp UI is confirmed active).`);
                            return;
                        }
                    } catch (_) {}
                }
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
        let contactNumber = msg.from.split("@")[0];
        let contactName = contactNumber;
        try {
            const contact = await msg.getContact();
            contactNumber = contact.number || contactNumber;
            contactName = contact.pushname || contact.name || contactNumber;
            io.emit("incoming_message", {
                id: msg.id._serialized,
                from: msg.from,
                number: contactNumber,
                name: contactName,
                body: msg.body,
                timestamp: msg.timestamp * 1000,
                isGroup: msg.from.includes("@g.us"),
                deviceId
            });
        } catch (e) {
            console.error("Error emitting incoming message", e);
        }

        const chatId = msg.from;
        const lowerBody = (msg.body || "").toLowerCase().trim();

        // 1. Detect if customer requests a human agent
        const isAgentRequest = !msg.from.includes("@g.us") && (
            /(?:agent|humain|human|conseiller|conseilleur|support|aide|service client|parler.*avec|responsable)/i.test(lowerBody) ||
            /^(agent|humain|human|support|aide|\?)$/i.test(lowerBody)
        );

        if (isAgentRequest) {
            conversationsState[chatId] = {
                mode: "manual",
                requestedAgent: true,
                agentRequestTimestamp: Date.now()
            };
            try {
                fs_1.default.writeFileSync(CONVERSATIONS_STATE_PATH, JSON.stringify(conversationsState, null, 2));
            } catch (_) {}

            io.emit("agent_requested", {
                chatId,
                from: msg.from,
                number: contactNumber,
                name: contactName,
                body: msg.body,
                timestamp: Date.now()
            });
            console.log(`[LiveChat] ⚠️ Human agent requested by ${contactName} (${contactNumber})! Chat mode switched to MANUAL.`);
        }

        // 2. Record incoming message in LiveChat store
        recordChatMessage({
            id: msg.id._serialized,
            chatId,
            from: msg.from,
            to: "me",
            fromMe: false,
            body: msg.body,
            senderName: contactName,
            number: contactNumber,
            timestamp: msg.timestamp * 1000
        });

        // 3. Auto-reply only on default device (skip groups)
        const defaultDev = getDefaultDevice();
        if (msg.from.includes("@g.us") || !defaultDev || defaultDev.id !== deviceId) return;

        // 4. If conversation is in MANUAL mode, skip automatic replies completely
        const currentMode = conversationsState[chatId]?.mode || "ai";
        if (currentMode === "manual") {
            console.log(`[AutoReply] Skipped for ${chatId} (Conversation is in MANUEL mode)`);
            return;
        }

        botEngine.recordIncoming(msg.from, msg.body);
        let replied = false;
        let replySource = "";
        let replyText = "";

        // 5. Keyword rules
        for (const rule of autoResponses) {
            if (rule.exactMatch) {
                if (lowerBody === rule.keyword.toLowerCase().trim()) {
                    replyText = rule.response;
                    replySource = "Règle Mot-Clé (Exact)";
                    await msg.reply(rule.response);
                    replied = true;
                    break;
                }
            } else {
                if (lowerBody.includes(rule.keyword.toLowerCase().trim())) {
                    replyText = rule.response;
                    replySource = "Règle Mot-Clé (Contient)";
                    await msg.reply(rule.response);
                    replied = true;
                    break;
                }
            }
        }

        // 6. Chatbot Learned Pairs & RAG & AI Fallback
        // Requirement: Do NOT reply with AI unless explicitly granted (aiAutoReplyEnabled !== false)
        if (!replied && botEngine.settings.autoReply) {
            try {
                const match = botEngine.findBestAnswer(msg.body);
                const threshold = (botEngine.settings.similarityThreshold || 0.45) * 100;
                if (match && match.answer && match.score >= threshold) {
                    replyText = match.answer;
                    replySource = `Base de Connaissance (${match.sourceType || "Apprise"})`;
                    await msg.reply(match.answer);
                    replied = true;
                } else if (botEngine.settings.aiAutoReplyEnabled && integrationsSettings.ai && integrationsSettings.ai.enabled) {
                    const aiReply = await callAiChatbot(msg.body);
                    if (aiReply) {
                        replyText = aiReply;
                        replySource = `IA Générative (${integrationsSettings.ai.provider || "LLM"})`;
                        await msg.reply(aiReply);
                        replied = true;
                        if (botEngine.settings.autoLearn) botEngine.addLearnedPair(msg.body, aiReply);
                    }
                } else if (match && match.answer) {
                    replyText = match.answer;
                    replySource = "RAG Match";
                    await msg.reply(match.answer);
                    replied = true;
                }
            } catch (err) {
                console.error("[ChatbotRag/AI] Auto-reply error:", err.message);
            }
        }

        // 7. If replied, log to AI reply log and record message in LiveChat
        if (replied && replyText) {
            recordAiReplyLogEntry({
                contactNumber,
                contactName,
                question: msg.body,
                reply: replyText,
                source: replySource,
                confidence: "100%",
                deviceId
            });
            recordChatMessage({
                id: `rep-${Date.now()}`,
                chatId,
                from: "me",
                to: msg.from,
                fromMe: true,
                body: replyText,
                senderName: "AI Bot",
                number: contactNumber,
                timestamp: Date.now(),
                isAiReply: true,
                source: replySource
            });
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
                recordChatMessage({
                    id: msg.id._serialized,
                    chatId: msg.to,
                    from: "me",
                    to: msg.to,
                    fromMe: true,
                    body: msg.body,
                    senderName: "Vous",
                    number: msg.to.split("@")[0],
                    timestamp: msg.timestamp * 1000,
                    source: "manual"
                });
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
    const defDev = getDefaultDevice();
    res.json({
        isReady,
        isAuthenticated,
        authenticated: isAuthenticated,
        qr: qrCodeData || defDev?.qrCodeData || null,
        phoneNumber: defDev?.phoneNumber || "",
        label: defDev?.label || "Compte WhatsApp Principal",
        deviceId: defDev?.id || "device-1"
    });
});

app.get("/api/whatsapp/account", (_req, res) => {
    const defDev = getDefaultDevice();
    res.json({
        success: true,
        isReady,
        isAuthenticated,
        phoneNumber: defDev?.phoneNumber || "",
        label: defDev?.label || "Compte WhatsApp Principal",
        deviceId: defDev?.id || "device-1",
        qr: qrCodeData || defDev?.qrCodeData || null
    });
});

// ─── Device Management API ─────────────────────────────────────────────────────
app.get("/api/devices", async (_req, res) => {
    for (const d of devices.values()) {
        if (!d.isReady && d.client && d.client.pupPage && !d.client.pupPage.isClosed()) {
            try {
                const uiActive = await d.client.pupPage.evaluate(() => {
                    return !!(
                        document.querySelector('#pane-side') || 
                        document.querySelector('[data-testid="chat-list"]') || 
                        document.querySelector('[data-testid="intro-title"]') ||
                        (typeof window.Store !== 'undefined' && (window.Store.Chat || window.Store.SendMessage))
                    );
                }).catch(() => false);

                if (uiActive) {
                    console.log(`[/api/devices] Detected active WhatsApp Web UI on device ${d.id}. Marking ready!`);
                    await ensureWWebJSInjected(d.client);
                    d.isReady = true;
                    d.isAuthenticated = true;
                    d.qrCodeData = "";
                    try {
                        const info = d.client.info;
                        if (info && info.wid && info.wid.user) d.phoneNumber = info.wid.user;
                    } catch (_) {}
                    updateLegacyState();
                    saveDeviceRegistry();
                    io.emit("device:ready", { deviceId: d.id, phoneNumber: d.phoneNumber });
                    io.emit("ready", true);
                    startDeviceHeartbeat(d.id);
                }
            } catch (_) {}
        }
    }
    res.json(serializeDevices());
});

app.post("/api/devices", async (req, res) => {
    try {
        if (devices.size >= MAX_DEVICES) {
            return res.status(400).json({ error: `Maximum ${MAX_DEVICES} devices allowed` });
        }
        const label = (req.body.label || `WhatsApp ${devices.size + 1}`).trim();
        const deviceId = `device-${Date.now()}`;
        createDeviceClient(deviceId, label);
        res.json({
            success: true,
            id: deviceId,
            deviceId,
            label,
            message: `Appareil "${label}" ajouté avec succès. Initialisation en cours...`,
            devices: serializeDevices()
        });
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
        const ai = integrationsSettings.ai || {};
        const isConfigured = ai.provider === "ollama" || (ai.apiKey && ai.apiKey.trim().length > 0);
        if (!isConfigured) {
            return res.status(400).json({ error: "AI provider not configured. Go to Settings > Integrations to enter your API key." });
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
        const aiResponse = await callAiChatbot(userMsg, { systemPrompt, maxTokens: 2048, useRagContext: false });

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
            try {
                parsed = JSON.parse(cleaned);
            } catch {
                const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]);
                } else {
                    parsed = { message: cleaned, alternatives: [] };
                }
            }
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
const LICENSE_SALT = "DreamaniaWApp2026SecureKeySalt#";

function generateExpectedKey(machineId, plan = "LIFETIME") {
    const raw = `${String(machineId).toUpperCase().trim()}:${String(plan).toUpperCase().trim()}:${LICENSE_SALT}`;
    const hash = crypto_1.default.createHash("sha256").update(raw).digest("hex").toUpperCase();
    const p = String(plan).toUpperCase().trim();
    const prefix = p === "30D" ? "W30D" : p === "180D" ? "W180" : p === "365D" ? "W365" : "WAPP";
    return `${prefix}-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}`;
}

function verifyActivationCode(code, machineId) {
    if (!code || typeof code !== "string") return null;
    const clean = code.toUpperCase().trim();

    // Master / Owner VIP Keys
    if (clean === "DREAMANIA-VIP-2026" || clean === "DREAMANIA-ENTERPRISE-2026" || clean === "DREAMANIA2026!") {
        return {
            isValid: true,
            type: "VIP Master Lifetime",
            expiresAt: null
        };
    }

    // Machine-locked cryptographic plans
    const plans = [
        { id: "LIFETIME", days: null, label: "Lifetime Enterprise Pass" },
        { id: "365D", days: 365, label: "1 Year Enterprise Pass" },
        { id: "180D", days: 180, label: "6 Months Enterprise Pass" },
        { id: "30D", days: 30, label: "1 Month Enterprise Pass" }
    ];

    for (const plan of plans) {
        const expected = generateExpectedKey(machineId, plan.id);
        if (clean === expected) {
            let expiresAt = null;
            if (plan.days) {
                const d = new Date();
                d.setDate(d.getDate() + plan.days);
                expiresAt = d.toISOString();
            }
            return {
                isValid: true,
                type: plan.label,
                expiresAt
            };
        }
    }

    return null;
}

function getStoredLicense() {
    try {
        if (!fs_1.default.existsSync(LICENSE_PATH)) return null;
        const data = JSON.parse(fs_1.default.readFileSync(LICENSE_PATH, "utf8"));
        if (!data || !data.code) return null;

        const isMaster = data.code === "DREAMANIA-VIP-2026" || data.code === "DREAMANIA-ENTERPRISE-2026" || data.code === "DREAMANIA2026!";
        // Ensure hardware lock
        if (!isMaster && data.machineId && data.machineId !== MACHINE_ID) {
            console.warn(`[Licensing] Machine ID mismatch (${data.machineId} != ${MACHINE_ID}). Activation required.`);
            return null;
        }

        // Ensure not expired
        if (data.expiresAt && new Date(data.expiresAt).getTime() <= Date.now()) {
            console.warn("[Licensing] Stored license has expired.");
            return null;
        }

        // Validate code authenticity
        const verified = verifyActivationCode(data.code, MACHINE_ID);
        if (verified && verified.isValid) {
            return data;
        }

        // Or valid server-activated license for this machine
        if (data.type === "server_license" && data.machineId === MACHINE_ID) {
            return data;
        }

        return null;
    } catch (_) {
        return null;
    }
}

app.get("/api/license-status", (_req, res) => {
    const license = getStoredLicense();
    const isActivated = Boolean(license && (!license.expiresAt || new Date(license.expiresAt).getTime() > Date.now()));
    res.json({
        machineId: MACHINE_ID,
        license: isActivated ? license : null,
        isActivated
    });
});

app.post("/api/activate", async (req, res) => {
    const { code } = req.body;
    if (!code || typeof code !== "string" || !code.trim()) {
        return res.status(400).json({ error: "Activation code is required" });
    }
    const cleanCode = code.trim().toUpperCase();

    // 1. Instant local verification (Master key or Machine-locked key)
    const local = verifyActivationCode(cleanCode, MACHINE_ID);
    if (local && local.isValid) {
        const licenseData = {
            code: cleanCode,
            machineId: MACHINE_ID,
            type: local.type,
            activatedAt: new Date().toISOString(),
            expiresAt: local.expiresAt
        };
        try {
            fs_1.default.writeFileSync(LICENSE_PATH, JSON.stringify(licenseData, null, 2));
            console.log(`[Licensing] Successfully activated locally with ${local.type}`);
            return res.json({ success: true, license: licenseData });
        } catch (saveErr) {
            return res.status(500).json({ error: "Failed to store license: " + saveErr.message });
        }
    }

    // 2. Fallback to online activation server (syndiki-pro.vercel.app)
    try {
        const payload = JSON.stringify({
            code: cleanCode,
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
                'Content-Length': Buffer.byteLength(payload)
            }
        };

        const remoteReq = https_1.default.request(options, (remoteRes) => {
            let data = '';
            remoteRes.on('data', (chunk) => { data += chunk; });
            remoteRes.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (remoteRes.statusCode === 200 && response.success) {
                        const licenseData = {
                            code: response.activationCode || cleanCode,
                            machineId: MACHINE_ID,
                            type: "server_license",
                            expiresAt: response.expiresAt || null,
                            activatedAt: new Date().toISOString()
                        };
                        fs_1.default.writeFileSync(LICENSE_PATH, JSON.stringify(licenseData, null, 2));
                        console.log("[Licensing] Successfully activated via online server");
                        return res.json({ success: true, license: licenseData });
                    } else {
                        return res.status(400).json({ error: response.error || "Invalid activation code. Please contact support on WhatsApp." });
                    }
                } catch (e) {
                    return res.status(400).json({ error: "Invalid activation code. Please contact support on WhatsApp." });
                }
            });
        });

        remoteReq.on('error', (error) => {
            console.error("[Licensing] Remote activation error:", error.message);
            res.status(400).json({ error: "Invalid activation code or could not connect to server. Contact support on WhatsApp." });
        });
        remoteReq.setTimeout(8000, () => {
            remoteReq.destroy();
            res.status(400).json({ error: "Activation server timeout. Contact support on WhatsApp." });
        });
        remoteReq.write(payload);
        remoteReq.end();
    } catch (netErr) {
        return res.status(400).json({ error: "Invalid activation code. Contact support on WhatsApp." });
    }
});

app.post("/api/license/reset", (_req, res) => {
    try {
        if (fs_1.default.existsSync(LICENSE_PATH)) {
            fs_1.default.unlinkSync(LICENSE_PATH);
        }
        res.json({ success: true, message: "License cleared. Activation required." });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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

// ─── Bulk Campaign Engine with Pause, Resume & Anti-Duplicate Resume ────────
async function runBulkCampaign() {
    if (!currentBulkSession) return;
    const session = currentBulkSession;
    const total = session.recipients.length;
    let deviceIndex = 0;

    for (let i = 0; i < session.recipients.length; i++) {
        const recipient = session.recipients[i];

        // 1. Wait while paused
        while (isBulkPaused && isBulkRunning) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 2. Break if stopped
        if (!isBulkRunning) {
            console.log("[BulkSender] Campaign stopped by user");
            break;
        }

        // 3. Skip if already sent successfully (ANTI-DUPLICATE / SANS REDOUBLER)
        if (recipient.status === "success") {
            continue;
        }

        recipient.status = "sending";

        // Refresh available ready devices
        let targetDeviceSessions = [];
        if (Array.isArray(session.deviceIds) && session.deviceIds.length > 0) {
            targetDeviceSessions = session.deviceIds.map(id => devices.get(id)).filter(d => d && d.isReady && d.client);
        }
        if (targetDeviceSessions.length === 0) {
            targetDeviceSessions = getReadyDevices();
        }
        if (targetDeviceSessions.length === 0) {
            console.error("[BulkSender] No ready devices available during campaign!");
            recipient.status = "error";
            recipient.error = "No ready devices available";
            session.failCount++;
            break;
        }

        // Choose device considering warming limits
        let chosenDev = null;
        let attempts = 0;
        while (attempts < targetDeviceSessions.length) {
            const candidate = targetDeviceSessions[deviceIndex % targetDeviceSessions.length];
            deviceIndex++;
            attempts++;
            if (candidate.warmingStatus === "warming" && candidate.messagesSentToday >= candidate.dailyLimit) {
                continue;
            }
            chosenDev = candidate;
            break;
        }
        if (!chosenDev) chosenDev = targetDeviceSessions[0];

        const client = chosenDev.client;
        const number = recipient.number || "";
        const recipientName = recipient.name || "";

        try {
            const resolved = await resolveWhatsAppNumber(number, client);
            if (!resolved || !resolved.jid) {
                throw new Error("Number not registered on WhatsApp");
            }
            const formattedNumber = resolved.jid;
            let personalizedMessage = session.message ? session.message.replace(/{{name}}/g, recipientName) : "";
            if (personalizedMessage && recipient.variables && typeof recipient.variables === "object") {
                for (const [k, v] of Object.entries(recipient.variables)) {
                    personalizedMessage = personalizedMessage.replace(new RegExp(`{{${k}}}`, 'g'), v || "");
                }
            }

            if (!chosenDev.isReady) throw new Error(`Device ${chosenDev.label} disconnected during campaign`);
            await ensureWWebJSInjected(client);

            if (session.attachments && session.attachments.length > 0) {
                const { mimetype, data, filename } = session.attachments[0];
                const media = new whatsapp_web_js_1.MessageMedia(mimetype, data, filename);
                const sendOptions = personalizedMessage && personalizedMessage.trim() ? { caption: personalizedMessage } : {};
                await client.sendMessage(formattedNumber, media, sendOptions);
                for (let j = 1; j < session.attachments.length; j++) {
                    const { mimetype: mt, data: d, filename: fn } = session.attachments[j];
                    await client.sendMessage(formattedNumber, new whatsapp_web_js_1.MessageMedia(mt, d, fn));
                }
            } else if (personalizedMessage && personalizedMessage.trim()) {
                await client.sendMessage(formattedNumber, personalizedMessage);
            }

            recipient.status = "success";
            recipient.sentAt = new Date().toISOString();
            session.sentCount++;
            chosenDev.messagesSentToday++;
            saveDeviceRegistry();

            const resultItem = {
                number,
                name: recipientName,
                status: "success",
                deviceId: chosenDev.id,
                deviceLabel: chosenDev.label,
                fromNumber: chosenDev.phoneNumber,
                timestamp: new Date().toISOString()
            };
            const exIdx = currentBulkResults.findIndex(r => r.number === number);
            if (exIdx >= 0) currentBulkResults[exIdx] = resultItem;
            else currentBulkResults.push(resultItem);

            const delay = Math.floor(Math.random() * (session.maxDelay - session.minDelay + 1)) + session.minDelay;
            const progressPayload = {
                current: session.sentCount + session.failCount,
                total,
                success: session.sentCount,
                failed: session.failCount,
                lastNumber: number,
                lastResult: resultItem,
                status: isBulkPaused ? "Paused" : "Sending...",
                isPaused: isBulkPaused,
                activeDevice: chosenDev.label,
                nextSendAt: (session.sentCount + session.failCount) < total && isBulkRunning && !isBulkPaused ? Date.now() + delay : null,
                results: currentBulkResults
            };
            io.emit("bulkProgress", progressPayload);
            io.emit("bulk_progress", progressPayload);

            if ((session.sentCount + session.failCount) < total && isBulkRunning && !isBulkPaused) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } catch (e) {
            console.error(`Failed to send to ${recipient.number} from device ${chosenDev.label}`, e);
            recipient.status = "error";
            let errMsg = e.message || "Failed to send";
            if (errMsg.includes("No LID for user") || errMsg.includes("wid error") || errMsg.includes("not registered")) {
                errMsg = "Number not registered on WhatsApp";
            }
            recipient.error = errMsg;
            session.failCount++;

            const failItem = {
                number: recipient.number,
                name: recipientName,
                status: "error",
                error: errMsg,
                deviceId: chosenDev.id,
                deviceLabel: chosenDev.label,
                timestamp: new Date().toISOString()
            };
            const exIdx = currentBulkResults.findIndex(r => r.number === recipient.number);
            if (exIdx >= 0) currentBulkResults[exIdx] = failItem;
            else currentBulkResults.push(failItem);

            const progressPayload = {
                current: session.sentCount + session.failCount,
                total,
                success: session.sentCount,
                failed: session.failCount,
                lastNumber: recipient.number,
                lastResult: failItem,
                status: isBulkPaused ? "Paused" : "Sending...",
                isPaused: isBulkPaused,
                activeDevice: chosenDev.label,
                nextSendAt: (session.sentCount + session.failCount) < total && isBulkRunning && !isBulkPaused ? Date.now() + 500 : null,
                results: currentBulkResults
            };
            io.emit("bulkProgress", progressPayload);
            io.emit("bulk_progress", progressPayload);

            if ((session.sentCount + session.failCount) < total && isBulkRunning && !isBulkPaused) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }

    const wasPaused = isBulkPaused;
    if (!wasPaused) {
        isBulkRunning = false;
        isBulkPaused = false;
    }
    const endTime = Date.now();

    // Save history
    const historyItem = {
        id: session.startTime.toString(),
        timestamp: new Date().toISOString(),
        total,
        sentCount: session.sentCount,
        failCount: session.failCount,
        message: session.message || (session.attachments.length > 0 ? `[${session.attachments.length} File(s)]` : ""),
        attachmentCount: session.attachments.length,
        duration: Math.floor((endTime - session.startTime) / 1000),
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
    } catch (err) {
        console.error("Failed to save history:", err);
    }

    const completePayload = {
        total,
        current: session.sentCount + session.failCount,
        sentCount: session.sentCount,
        failCount: session.failCount,
        success: session.sentCount,
        failed: session.failCount,
        status: (session.sentCount + session.failCount >= total) ? "Completed" : (wasPaused ? "Paused" : "Stopped"),
        isPaused: wasPaused,
        results: currentBulkResults
    };
    io.emit("bulkProgress", completePayload);
    io.emit("bulk_progress", completePayload);
    if (!wasPaused) {
        io.emit("bulkComplete", completePayload);
    }
}

app.post("/api/send-bulk", async (req, res) => {
    const { recipients = [], message, minDelay = 1000, maxDelay = 3000, attachments = [], deviceIds = [] } = req.body;

    let targetDeviceSessions = [];
    if (Array.isArray(deviceIds) && deviceIds.length > 0) {
        targetDeviceSessions = deviceIds.map(id => devices.get(id)).filter(d => d && d.isReady && d.client);
    }
    if (targetDeviceSessions.length === 0) {
        targetDeviceSessions = getReadyDevices();
    }

    if (targetDeviceSessions.length === 0) {
        return res.status(503).json({ error: "Aucun compte WhatsApp connecté et prêt." });
    }
    if (isBulkRunning) {
        return res.status(400).json({ error: "Une campagne est déjà en cours d'exécution." });
    }

    currentBulkResults = [];
    currentBulkSession = {
        id: `bulk-${Date.now()}`,
        recipients: recipients.map((r, idx) => ({
            index: idx,
            number: r.number || "",
            name: r.name || (r.variables && r.variables.name) || "",
            variables: r.variables || {},
            status: "pending",
            error: null,
            sentAt: null
        })),
        message,
        minDelay: Number(minDelay) || 1000,
        maxDelay: Number(maxDelay) || 3000,
        attachments: attachments || [],
        deviceIds: deviceIds || [],
        startTime: Date.now(),
        sentCount: 0,
        failCount: 0,
        total: recipients.length,
        isPaused: false
    };

    isBulkRunning = true;
    isBulkPaused = false;

    runBulkCampaign().catch(err => console.error("[BulkSender] Execution error:", err));

    res.json({ success: true, message: "Campagne démarrée avec succès", total: recipients.length });
});

app.post("/api/bulk/pause", (_req, res) => {
    if (!isBulkRunning) return res.status(400).json({ error: "Aucune campagne en cours d'envoi." });
    isBulkPaused = true;
    if (currentBulkSession) currentBulkSession.isPaused = true;
    const payload = {
        isPaused: true,
        status: "Paused",
        current: currentBulkSession ? (currentBulkSession.sentCount + currentBulkSession.failCount) : 0,
        total: currentBulkSession ? currentBulkSession.total : 0,
        success: currentBulkSession ? currentBulkSession.sentCount : 0,
        failed: currentBulkSession ? currentBulkSession.failCount : 0,
        results: currentBulkResults
    };
    io.emit("bulkProgress", payload);
    io.emit("bulk_progress", payload);
    io.emit("bulk:paused", { isPaused: true });
    res.json({ success: true, message: "Campagne mise en pause." });
});

app.post("/api/bulk/resume", (_req, res) => {
    if (isBulkRunning && isBulkPaused) {
        isBulkPaused = false;
        if (currentBulkSession) currentBulkSession.isPaused = false;
        const payload = {
            isPaused: false,
            status: "Sending...",
            current: currentBulkSession ? (currentBulkSession.sentCount + currentBulkSession.failCount) : 0,
            total: currentBulkSession ? currentBulkSession.total : 0,
            success: currentBulkSession ? currentBulkSession.sentCount : 0,
            failed: currentBulkSession ? currentBulkSession.failCount : 0,
            results: currentBulkResults
        };
        io.emit("bulkProgress", payload);
        io.emit("bulk_progress", payload);
        io.emit("bulk:resumed", { isPaused: false });
        return res.json({ success: true, message: "Campagne reprise." });
    }

    if (!isBulkRunning && currentBulkSession && Array.isArray(currentBulkSession.recipients)) {
        const remaining = currentBulkSession.recipients.filter(r => r.status !== "success");
        if (remaining.length > 0) {
            remaining.forEach(r => {
                r.status = "pending";
                r.error = null;
            });
            isBulkRunning = true;
            isBulkPaused = false;
            currentBulkSession.isPaused = false;
            runBulkCampaign().catch(err => console.error("[BulkSender] Resume error:", err));
            return res.json({
                success: true,
                message: `Campagne reprise pour ${remaining.length} destinataire(s) non-envoyé(s) (sans doublon)`,
                remainingCount: remaining.length
            });
        }
    }

    res.status(400).json({ error: "Aucune campagne en pause ou incomplète à reprendre." });
});

app.post("/api/bulk/resume-unsent", (_req, res) => {
    if (isBulkRunning) {
        return res.status(400).json({ error: "Une campagne est déjà en cours d'exécution." });
    }
    if (!currentBulkSession || !Array.isArray(currentBulkSession.recipients)) {
        return res.status(400).json({ error: "Aucune session de campagne précédente trouvée." });
    }
    const remaining = currentBulkSession.recipients.filter(r => r.status !== "success");
    if (remaining.length === 0) {
        return res.status(400).json({ error: "Tous les destinataires ont déjà reçu le message avec succès !" });
    }

    remaining.forEach(r => {
        r.status = "pending";
        r.error = null;
    });

    isBulkRunning = true;
    isBulkPaused = false;
    currentBulkSession.isPaused = false;

    runBulkCampaign().catch(err => console.error("[BulkSender] Resume unsent error:", err));

    res.json({
        success: true,
        message: `Reprise lancée pour ${remaining.length} destinataire(s) non-envoyé(s) (sans doublon)`,
        remainingCount: remaining.length,
        alreadySentCount: currentBulkSession.sentCount
    });
});

app.get("/api/bulk/session", (_req, res) => {
    res.json({
        success: true,
        isBulkRunning,
        isBulkPaused,
        session: currentBulkSession ? {
            id: currentBulkSession.id,
            total: currentBulkSession.total,
            sentCount: currentBulkSession.sentCount,
            failCount: currentBulkSession.failCount,
            remainingCount: currentBulkSession.recipients.filter(r => r.status !== 'success').length,
            message: currentBulkSession.message,
            isPaused: isBulkPaused,
            results: currentBulkResults
        } : null
    });
});

app.post("/api/stop-bulk", (_req, res) => {
    isBulkRunning = false;
    isBulkPaused = false;
    if (currentBulkSession) currentBulkSession.isPaused = false;
    const payload = {
        isPaused: false,
        status: "Stopped",
        current: currentBulkSession ? (currentBulkSession.sentCount + currentBulkSession.failCount) : 0,
        total: currentBulkSession ? currentBulkSession.total : 0,
        success: currentBulkSession ? currentBulkSession.sentCount : 0,
        failed: currentBulkSession ? currentBulkSession.failCount : 0,
        results: currentBulkResults
    };
    io.emit("bulkProgress", payload);
    io.emit("bulk_progress", payload);
    io.emit("bulk:stopped", { status: "Stopped" });
    res.json({ success: true, message: "Arrêt de la campagne effectué." });
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
    const { autoLearn, autoReply, useRag, similarityThreshold, maxResponseLength, aiAutoReplyEnabled } = req.body;
    botEngine.settings = {
        ...botEngine.settings,
        ...(autoLearn !== undefined && { autoLearn: !!autoLearn }),
        ...(autoReply !== undefined && { autoReply: !!autoReply }),
        ...(useRag !== undefined && { useRag: !!useRag }),
        ...(aiAutoReplyEnabled !== undefined && { aiAutoReplyEnabled: !!aiAutoReplyEnabled }),
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

// ─── Chatbot File Ingestion (Excel, PDF, DOCX, TXT) ──────────────────────────
app.post("/api/chatbot/ingest-file", async (req, res) => {
    try {
        const { filename, data } = req.body;
        if (!filename || !data) {
            return res.status(400).json({ error: "Filename and file data (base64) are required" });
        }
        const ext = path_1.default.extname(filename).toLowerCase();
        const buffer = Buffer.from(data, 'base64');
        let extractedText = "";

        if (ext === '.xlsx' || ext === '.xls' || ext === '.csv') {
            const xlsx = require('xlsx');
            const workbook = xlsx.read(buffer, { type: 'buffer' });
            const sheetsText = [];
            for (const sheetName of workbook.SheetNames) {
                const sheet = workbook.Sheets[sheetName];
                const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
                if (rows.length > 0) {
                    const headers = rows[0] || [];
                    const bodyRows = rows.slice(1);
                    const formattedRows = bodyRows.map(r => {
                        return headers.map((h, i) => `${h}: ${r[i] !== undefined ? r[i] : ''}`).join(" | ");
                    }).filter(l => l.trim().length > 5);
                    sheetsText.push(`=== Fichier: ${filename} (Feuille: ${sheetName}) ===\n` + formattedRows.join("\n"));
                }
            }
            extractedText = sheetsText.join("\n\n");
        } else if (ext === '.pdf') {
            const raw = buffer.toString('binary');
            const textParts = [];
            const matches = raw.match(/\(([^()]{3,})\)/g) || [];
            for (const m of matches) {
                const clean = m.slice(1, -1).trim();
                if (clean.length > 3 && /[a-zA-ZÀ-ÿ0-9]/.test(clean)) {
                    textParts.push(clean);
                }
            }
            extractedText = textParts.join(" ");
            if (!extractedText || extractedText.length < 30) {
                extractedText = buffer.toString('utf8').replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, ' ').replace(/\s{2,}/g, ' ');
            }
        } else {
            extractedText = buffer.toString('utf8').replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, ' ');
        }

        if (!extractedText || extractedText.trim().length < 15) {
            return res.status(400).json({ error: "Impossible d'extraire du contenu textuel de ce fichier." });
        }

        const result = botEngine.ingestText(filename, extractedText, filename);
        res.json({
            success: true,
            filename,
            chunkCount: result.chunkCount,
            characterCount: extractedText.length,
            preview: extractedText.slice(0, 300)
        });
    } catch (err) {
        console.error("[/api/chatbot/ingest-file] Error:", err);
        res.status(500).json({ error: err.message || "Erreur lors du traitement du fichier" });
    }
});

app.get("/api/chatbot/files", (_req, res) => {
    res.json({ success: true, sources: botEngine.sources || [] });
});

app.delete("/api/chatbot/files/:id", (req, res) => {
    const result = botEngine.deleteSource(req.params.id);
    res.json(result);
});

// ─── AI Reply Log Endpoints ──────────────────────────────────────────────────
app.get("/api/chatbot/reply-log", (_req, res) => {
    res.json(aiReplyLogs);
});

app.delete("/api/chatbot/reply-log", (_req, res) => {
    aiReplyLogs = [];
    try { fs_1.default.writeFileSync(AI_REPLY_LOG_PATH, JSON.stringify([], null, 2)); } catch (_) {}
    res.json({ success: true });
});

// ─── Live Chat & Conversations Endpoints ─────────────────────────────────────
app.get("/api/chat/conversations", (_req, res) => {
    const list = Array.from(conversationsMap.values()).map(c => ({
        ...c,
        messages: undefined
    })).sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
    res.json(list);
});

// Synchronize all active WhatsApp chats directly from device
app.get("/api/chat/sync", async (_req, res) => {
    try {
        if (!isReady || !activeClient) {
            return res.status(503).json({ error: "WhatsApp non connecté. Veuillez scanner le QR code." });
        }
        await ensureWWebJSInjected(activeClient);
        const chats = await activeClient.getChats();
        let syncedCount = 0;

        for (const chat of (chats || []).slice(0, 60)) {
            const chatId = chat.id?._serialized;
            if (!chatId) continue;
            const cleanId = chatId;
            const name = chat.name || chat.formattedTitle || chatId.split('@')[0];
            const number = chatId.split('@')[0];
            const lastMsgBody = chat.lastMessage?.body || (chat.lastMessage?.hasMedia ? "[Média]" : "");
            const rawTs = chat.timestamp || chat.lastMessage?.timestamp;
            const lastTimestamp = rawTs ? (rawTs > 1e11 ? rawTs : rawTs * 1000) : Date.now();
            const unreadCount = chat.unreadCount || 0;
            const state = conversationsState[cleanId] || { mode: "ai", requestedAgent: false };

            let conv = conversationsMap.get(cleanId);
            if (!conv) {
                conv = {
                    id: cleanId,
                    name,
                    number,
                    lastMessage: lastMsgBody,
                    lastTimestamp,
                    unreadCount,
                    mode: state.mode || "ai",
                    requestedAgent: !!state.requestedAgent,
                    agentRequestTimestamp: state.agentRequestTimestamp || null,
                    isGroup: !!chat.isGroup,
                    messages: []
                };
                conversationsMap.set(cleanId, conv);
            } else {
                if (name && (conv.name === conv.number || !conv.name)) conv.name = name;
                conv.number = number;
                if (lastMsgBody) conv.lastMessage = lastMsgBody;
                if (lastTimestamp && lastTimestamp > (conv.lastTimestamp || 0)) conv.lastTimestamp = lastTimestamp;
                conv.unreadCount = unreadCount;
                conv.isGroup = !!chat.isGroup;
            }
            syncedCount++;
        }

        saveConversations();
        const list = Array.from(conversationsMap.values()).map(c => ({
            ...c,
            messages: undefined
        })).sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));

        io.emit("chat:synced", list);
        res.json({ success: true, count: syncedCount, conversations: list });
    } catch (e) {
        console.error("[/api/chat/sync] Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.get("/api/chat/messages/:chatId", async (req, res) => {
    try {
        const chatId = req.params.chatId;
        const cleanId = chatId.includes('@') ? chatId : `${chatId}@c.us`;
        let conv = conversationsMap.get(cleanId) || conversationsMap.get(chatId);

        // Attempt live fetch directly from WhatsApp device if available
        if (isReady && activeClient) {
            try {
                await ensureWWebJSInjected(activeClient);
                const chat = await activeClient.getChatById(cleanId);
                if (chat && typeof chat.fetchMessages === 'function') {
                    const fetched = await chat.fetchMessages({ limit: 40 });
                    if (Array.isArray(fetched) && fetched.length > 0) {
                        const parsedMsgs = fetched.map(m => {
                            const ts = m.timestamp ? (m.timestamp > 1e11 ? m.timestamp : m.timestamp * 1000) : Date.now();
                            return {
                                id: m.id?._serialized || m.id?.id || `msg-${ts}`,
                                fromMe: !!m.fromMe,
                                body: m.body || (m.hasMedia ? "[Média]" : ""),
                                timestamp: ts,
                                source: m.fromMe ? "manual" : "incoming"
                            };
                        });

                        if (!conv) {
                            conv = {
                                id: cleanId,
                                name: chat.name || cleanId.split('@')[0],
                                number: cleanId.split('@')[0],
                                lastMessage: parsedMsgs[parsedMsgs.length - 1]?.body || "",
                                lastTimestamp: parsedMsgs[parsedMsgs.length - 1]?.timestamp || Date.now(),
                                unreadCount: 0,
                                mode: conversationsState[cleanId]?.mode || "ai",
                                requestedAgent: !!conversationsState[cleanId]?.requestedAgent,
                                messages: parsedMsgs
                            };
                            conversationsMap.set(cleanId, conv);
                        } else {
                            // Preserve any AI metadata from existing messages
                            const existingMap = new Map((conv.messages || []).map(m => [m.id, m]));
                            parsedMsgs.forEach(pm => {
                                if (existingMap.has(pm.id)) {
                                    const ex = existingMap.get(pm.id);
                                    pm.isAiReply = ex.isAiReply;
                                    pm.confidence = ex.confidence;
                                    pm.source = ex.source || pm.source;
                                }
                            });
                            conv.messages = parsedMsgs;
                        }
                    }
                }
            } catch (liveErr) {
                console.warn("[/api/chat/messages] Live messages fetch fallback:", liveErr.message);
            }
        }

        if (conv) {
            conv.unreadCount = 0;
            saveConversations();
            res.json({ success: true, conversation: conv, messages: conv.messages || [] });
        } else {
            res.json({ success: true, conversation: null, messages: [] });
        }
    } catch (e) {
        console.error("[/api/chat/messages] Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/chat/send", async (req, res) => {
    try {
        const { chatId, message } = req.body;
        if (!chatId || !message) return res.status(400).json({ error: "ChatId et message requis" });
        if (!isReady || !activeClient) return res.status(503).json({ error: "WhatsApp non connecté. Veuillez connecter un appareil." });

        const targetJid = chatId.includes("@") ? chatId : `${chatId}@c.us`;
        await ensureWWebJSInjected(activeClient);
        await activeClient.sendMessage(targetJid, message.trim());

        recordChatMessage({
            id: `msg-${Date.now()}`,
            chatId: targetJid,
            from: "me",
            to: targetJid,
            fromMe: true,
            body: message.trim(),
            senderName: "Vous",
            number: targetJid.split("@")[0],
            timestamp: Date.now(),
            source: "manual"
        });

        res.json({ success: true, message: "Message envoyé avec succès" });
    } catch (e) {
        console.error("[/api/chat/send] Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/chat/mode", (req, res) => {
    try {
        const { chatId, mode } = req.body;
        if (!chatId || !mode) return res.status(400).json({ error: "ChatId et mode requis" });
        const cleanId = chatId.includes("@") ? chatId : `${chatId}@c.us`;
        conversationsState[cleanId] = {
            ...(conversationsState[cleanId] || {}),
            mode: mode === "manual" ? "manual" : "ai"
        };
        const conv = conversationsMap.get(cleanId);
        if (conv) {
            conv.mode = conversationsState[cleanId].mode;
        }
        fs_1.default.writeFileSync(CONVERSATIONS_STATE_PATH, JSON.stringify(conversationsState, null, 2));
        saveConversations();
        io.emit("chat:mode_changed", { chatId: cleanId, mode: conversationsState[cleanId].mode });
        res.json({ success: true, chatId: cleanId, mode: conversationsState[cleanId].mode });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/chat/resolve-agent-request", (req, res) => {
    try {
        const { chatId } = req.body;
        const cleanId = chatId.includes("@") ? chatId : `${chatId}@c.us`;
        if (conversationsState[cleanId]) {
            conversationsState[cleanId].requestedAgent = false;
        }
        const conv = conversationsMap.get(cleanId);
        if (conv) {
            conv.requestedAgent = false;
        }
        fs_1.default.writeFileSync(CONVERSATIONS_STATE_PATH, JSON.stringify(conversationsState, null, 2));
        saveConversations();
        io.emit("chat:agent_request_resolved", { chatId: cleanId });
        res.json({ success: true, chatId: cleanId });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Contacts & Contact Groups Endpoints ─────────────────────────────────────
app.get("/api/contacts", (_req, res) => {
    res.json(savedContacts);
});

app.get("/api/contacts/groups", (_req, res) => {
    const groupMap = new Map();
    for (const c of savedContacts) {
        const gName = (c.group && String(c.group).trim()) ? String(c.group).trim() : "Général";
        groupMap.set(gName, (groupMap.get(gName) || 0) + 1);
    }
    const groups = Array.from(groupMap.entries()).map(([name, count]) => ({ name, count }));
    res.json({ success: true, groups, totalContacts: savedContacts.length });
});

app.post("/api/contacts", (req, res) => {
    try {
        const { name, number, email, company, city, tags, group } = req.body;
        if (!number) return res.status(400).json({ error: "Numéro de téléphone requis" });
        const clean = String(number).replace(/\D/g, '');
        const existingIdx = savedContacts.findIndex(c => c.number.replace(/\D/g, '') === clean);
        const contactItem = {
            id: `cnt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: name || "Contact",
            number: clean,
            email: email || "",
            company: company || "",
            city: city || "",
            tags: tags || "",
            group: group ? String(group).trim() : "Général",
            createdAt: new Date().toISOString()
        };
        if (existingIdx !== -1) {
            savedContacts[existingIdx] = { ...savedContacts[existingIdx], ...contactItem };
        } else {
            savedContacts.unshift(contactItem);
        }
        fs_1.default.writeFileSync(CONTACTS_PATH, JSON.stringify(savedContacts, null, 2));
        res.json({ success: true, contact: contactItem, contacts: savedContacts });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/contacts/import", (req, res) => {
    try {
        const { contacts = [], group } = req.body;
        if (!Array.isArray(contacts)) return res.status(400).json({ error: "Format invalide" });
        const targetGroup = (group && String(group).trim()) ? String(group).trim() : "Général";
        let added = 0;
        let updated = 0;

        for (const item of contacts) {
            const rawNum = item.number || item.phone || item.telephone || item.tel || item["Téléphone"] || item["Telephone"];
            if (!rawNum) continue;
            const clean = String(rawNum).replace(/\D/g, '');
            if (clean.length < 6) continue;

            const existingIdx = savedContacts.findIndex(c => c.number.replace(/\D/g, '') === clean);
            const contactGroup = (item.group && String(item.group).trim()) ? String(item.group).trim() : targetGroup;

            if (existingIdx !== -1) {
                // Update existing contact's group and details
                savedContacts[existingIdx] = {
                    ...savedContacts[existingIdx],
                    name: item.name || item.nom || item["Nom"] || savedContacts[existingIdx].name,
                    email: item.email || item["Email"] || savedContacts[existingIdx].email,
                    company: item.company || item.entreprise || item["Entreprise"] || savedContacts[existingIdx].company,
                    city: item.city || item.ville || item["Ville"] || savedContacts[existingIdx].city,
                    tags: item.tags || item.note || item["Tags"] || savedContacts[existingIdx].tags,
                    group: contactGroup
                };
                updated++;
            } else {
                savedContacts.push({
                    id: `cnt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                    name: item.name || item.nom || item["Nom"] || "Contact",
                    number: clean,
                    email: item.email || item["Email"] || "",
                    company: item.company || item.entreprise || item["Entreprise"] || "",
                    city: item.city || item.ville || item["Ville"] || "",
                    tags: item.tags || item.note || item["Tags"] || "",
                    group: contactGroup,
                    createdAt: new Date().toISOString()
                });
                added++;
            }
        }
        fs_1.default.writeFileSync(CONTACTS_PATH, JSON.stringify(savedContacts, null, 2));
        res.json({
            success: true,
            added,
            updated,
            group: targetGroup,
            total: savedContacts.length,
            contacts: savedContacts
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/contacts/delete-bulk", (req, res) => {
    try {
        const { ids, group, all } = req.body;
        const initialCount = savedContacts.length;

        if (all === true) {
            savedContacts = [];
        } else if (group && typeof group === "string") {
            const targetGroup = group.trim().toLowerCase();
            savedContacts = savedContacts.filter(c => {
                const g = ((c.group && String(c.group).trim()) || "Général").toLowerCase();
                return g !== targetGroup;
            });
        } else if (Array.isArray(ids) && ids.length > 0) {
            const idSet = new Set(ids.map(String));
            savedContacts = savedContacts.filter(c => !idSet.has(String(c.id)));
        } else {
            return res.status(400).json({ error: "Critère de suppression requis (ids, group, ou all: true)" });
        }

        const deletedCount = initialCount - savedContacts.length;
        fs_1.default.writeFileSync(CONTACTS_PATH, JSON.stringify(savedContacts, null, 2));
        res.json({
            success: true,
            deletedCount,
            remainingCount: savedContacts.length,
            contacts: savedContacts
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete("/api/contacts/:id", (req, res) => {
    try {
        savedContacts = savedContacts.filter(c => c.id !== req.params.id);
        fs_1.default.writeFileSync(CONTACTS_PATH, JSON.stringify(savedContacts, null, 2));
        res.json({ success: true, contacts: savedContacts });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ─── Email Marketing Endpoints (Custom SMTP & Campaigns) ─────────────────────
app.get("/api/email/settings", (_req, res) => {
    res.json({ success: true, settings: emailSettings });
});

app.post("/api/email/settings", (req, res) => {
    try {
        emailSettings = { ...emailSettings, ...(req.body || {}) };
        fs_1.default.writeFileSync(EMAIL_SETTINGS_PATH, JSON.stringify(emailSettings, null, 2));
        res.json({ success: true, settings: emailSettings });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/email/test-smtp", async (req, res) => {
    try {
        const config = req.body || emailSettings;
        if (!config.host || !config.user) {
            return res.status(400).json({ error: "Hôte SMTP et identifiant requis" });
        }
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: Number(config.port) || 587,
            secure: config.secure === true || Number(config.port) === 465,
            auth: {
                user: config.user,
                pass: config.pass
            },
            tls: { rejectUnauthorized: false }
        });
        await transporter.verify();
        res.json({ success: true, message: "Connexion SMTP établie avec succès !" });
    } catch (err) {
        console.error("[SMTP Test] Error:", err);
        res.status(500).json({ error: err.message || "Échec de connexion au serveur SMTP" });
    }
});

app.post("/api/email/send-single", async (req, res) => {
    try {
        const { to, subject, html, text } = req.body;
        if (!to || !subject) return res.status(400).json({ error: "Destinataire et objet requis" });
        if (!emailSettings.host || !emailSettings.user) {
            return res.status(400).json({ error: "Veuillez d'abord configurer vos paramètres SMTP dans Email Marketing" });
        }
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: emailSettings.host,
            port: Number(emailSettings.port) || 587,
            secure: emailSettings.secure === true || Number(emailSettings.port) === 465,
            auth: {
                user: emailSettings.user,
                pass: emailSettings.pass
            },
            tls: { rejectUnauthorized: false }
        });

        const info = await transporter.sendMail({
            from: `"${emailSettings.fromName || 'WApp Manager'}" <${emailSettings.fromEmail || emailSettings.user}>`,
            to,
            subject,
            text: text || html?.replace(/<[^>]+>/g, ''),
            html: html || text
        });

        const historyItem = {
            id: `eml-${Date.now()}`,
            timestamp: new Date().toISOString(),
            to,
            subject,
            status: "success",
            messageId: info.messageId
        };
        emailHistory.unshift(historyItem);
        if (emailHistory.length > 500) emailHistory = emailHistory.slice(0, 500);
        try { fs_1.default.writeFileSync(EMAIL_HISTORY_PATH, JSON.stringify(emailHistory, null, 2)); } catch (_) {}

        res.json({ success: true, messageId: info.messageId, message: "Email envoyé avec succès !" });
    } catch (err) {
        console.error("[Email Send] Error:", err);
        const failItem = {
            id: `eml-${Date.now()}`,
            timestamp: new Date().toISOString(),
            to: req.body.to || "",
            subject: req.body.subject || "",
            status: "failed",
            error: err.message
        };
        emailHistory.unshift(failItem);
        try { fs_1.default.writeFileSync(EMAIL_HISTORY_PATH, JSON.stringify(emailHistory, null, 2)); } catch (_) {}
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/email/send-bulk", async (req, res) => {
    try {
        const { recipients = [], subject, template } = req.body;
        if (!recipients.length || !subject) return res.status(400).json({ error: "Destinataires et objet requis" });
        if (!emailSettings.host || !emailSettings.user) return res.status(400).json({ error: "Configuration SMTP manquante" });

        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: emailSettings.host,
            port: Number(emailSettings.port) || 587,
            secure: emailSettings.secure === true || Number(emailSettings.port) === 465,
            auth: { user: emailSettings.user, pass: emailSettings.pass },
            tls: { rejectUnauthorized: false }
        });

        res.json({ success: true, message: `Campagne email lancée pour ${recipients.length} destinataires.` });

        (async () => {
            let sent = 0;
            let failed = 0;
            for (const r of recipients) {
                const targetEmail = typeof r === 'string' ? r : r.email;
                if (!targetEmail || !targetEmail.includes('@')) { failed++; continue; }
                const name = (typeof r === 'object' && r.name) ? r.name : targetEmail.split('@')[0];
                const bodyHtml = (template || "").replace(/{{name}}/g, name).replace(/{{email}}/g, targetEmail);
                try {
                    await transporter.sendMail({
                        from: `"${emailSettings.fromName || 'WApp Manager'}" <${emailSettings.fromEmail || emailSettings.user}>`,
                        to: targetEmail,
                        subject: subject.replace(/{{name}}/g, name),
                        html: bodyHtml
                    });
                    sent++;
                    emailHistory.unshift({ id: `eml-${Date.now()}`, timestamp: new Date().toISOString(), to: targetEmail, subject, status: "success" });
                } catch (e) {
                    failed++;
                    emailHistory.unshift({ id: `eml-${Date.now()}`, timestamp: new Date().toISOString(), to: targetEmail, subject, status: "failed", error: e.message });
                }
                io.emit("email:campaign_progress", { current: sent + failed, total: recipients.length, sent, failed });
                await new Promise(r => setTimeout(r, 600));
            }
            fs_1.default.writeFileSync(EMAIL_HISTORY_PATH, JSON.stringify(emailHistory.slice(0, 500), null, 2));
            io.emit("email:campaign_complete", { total: recipients.length, sent, failed });
        })();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/email/history", (_req, res) => {
    res.json(emailHistory);
});

app.delete("/api/email/history", (_req, res) => {
    emailHistory = [];
    try { fs_1.default.writeFileSync(EMAIL_HISTORY_PATH, JSON.stringify([], null, 2)); } catch (_) {}
    res.json({ success: true });
});

// ─── Reports & Analytics API ─────────────────────────────────────────────────
app.get("/api/reports/full", (_req, res) => {
    try {
        let history = [];
        if (fs_1.default.existsSync(HISTORY_PATH)) {
            try { history = JSON.parse(fs_1.default.readFileSync(HISTORY_PATH, "utf8")); } catch (_) {}
        }

        let totalMessagesSent = 0;
        let totalMessagesFailed = 0;
        const daysMap = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const str = d.toISOString().split('T')[0];
            daysMap[str] = { date: str, sent: 0, failed: 0, emails: 0, aiReplies: 0 };
        }

        history.forEach(h => {
            const sent = h.sentCount || 0;
            const failed = h.failCount || 0;
            totalMessagesSent += sent;
            totalMessagesFailed += failed;
            const dStr = (h.timestamp || "").split('T')[0];
            if (daysMap[dStr]) {
                daysMap[dStr].sent += sent;
                daysMap[dStr].failed += failed;
            }
        });

        emailHistory.forEach(e => {
            const dStr = (e.timestamp || "").split('T')[0];
            if (daysMap[dStr]) {
                daysMap[dStr].emails += 1;
            }
        });

        aiReplyLogs.forEach(r => {
            const dStr = (r.timestamp || "").split('T')[0];
            if (daysMap[dStr]) {
                daysMap[dStr].aiReplies += 1;
            }
        });

        const activeDevs = serializeDevices().filter(d => d.isReady);
        const agentRequestsCount = Array.from(conversationsMap.values()).filter(c => c.requestedAgent).length;

        const sourceBreakdown = {};
        aiReplyLogs.forEach(log => {
            const src = log.source || "Autre";
            sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
        });

        res.json({
            success: true,
            summary: {
                totalWhatsAppSent: totalMessagesSent,
                totalWhatsAppFailed: totalMessagesFailed,
                deliveryRate: (totalMessagesSent + totalMessagesFailed) > 0 ? Math.round((totalMessagesSent / (totalMessagesSent + totalMessagesFailed)) * 100) : 100,
                totalEmailsSent: emailHistory.filter(e => e.status === 'success').length,
                totalEmailsFailed: emailHistory.filter(e => e.status === 'failed').length,
                totalContacts: savedContacts.length,
                totalAiReplies: aiReplyLogs.length,
                activeDevicesCount: activeDevs.length,
                agentRequestsPending: agentRequestsCount,
                bulkCampaignsCount: history.length
            },
            dailyStats: Object.values(daysMap),
            sourceBreakdown,
            devices: serializeDevices()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Workflow Bot Endpoints ──────────────────────────────────────────────────
app.get("/api/workflows", (_req, res) => {
    res.json(workflowsList);
});

app.post("/api/workflows", (req, res) => {
    try {
        const { workflows } = req.body;
        if (Array.isArray(workflows)) {
            workflowsList = workflows;
            fs_1.default.writeFileSync(WORKFLOWS_PATH, JSON.stringify(workflowsList, null, 2));
            res.json({ success: true, workflows: workflowsList });
        } else {
            res.status(400).json({ error: "Workflows array required" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/workflows/:id/toggle", (req, res) => {
    try {
        const wf = workflowsList.find(w => w.id === req.params.id);
        if (wf) {
            wf.active = !wf.active;
            fs_1.default.writeFileSync(WORKFLOWS_PATH, JSON.stringify(workflowsList, null, 2));
            res.json({ success: true, workflow: wf });
        } else {
            res.status(404).json({ error: "Workflow non trouvé" });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
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

app.post("/api/integrations/test-serper", async (req, res) => {
    try {
        const apiKey = req.body?.apiKey || integrationsSettings.scraper?.serperApiKey || "56b7780f8785c9d26504deca8d2adb9c48546ffd";
        if (!apiKey) return res.status(400).json({ success: false, error: "Serper.dev API key is required" });

        const testRes = await fetch("https://google.serper.dev/maps", {
            method: "POST",
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                q: "restaurant Paris",
                gl: "fr",
                hl: "fr"
            }),
            signal: AbortSignal.timeout(10000)
        });

        if (!testRes.ok) {
            const errBody = await testRes.json().catch(() => ({}));
            return res.status(testRes.status).json({
                success: false,
                error: errBody.message || `Serper.dev returned HTTP ${testRes.status}`
            });
        }

        const data = await testRes.json();
        const count = data.places?.length || 0;
        return res.json({
            success: true,
            message: `Connected to Serper.dev! Verified ${count} business results.`,
            placesCount: count
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || "Serper.dev test connection failed" });
    }
});

app.post("/api/integrations/test-serpapi", async (req, res) => {
    try {
        const apiKey = req.body?.apiKey || integrationsSettings.scraper?.serpApiKey;
        if (!apiKey) return res.status(400).json({ success: false, error: "SerpApi API key is required" });

        const url = `https://serpapi.com/search.json?engine=google_maps&q=cafe+paris&api_key=${apiKey}&hl=fr&gl=fr`;
        const testRes = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await testRes.json();

        if (data.error) {
            return res.status(400).json({ success: false, error: data.error });
        }

        return res.json({
            success: true,
            message: `Connected to SerpApi! Found ${data.local_results?.length || 0} local results.`,
            count: data.local_results?.length || 0
        });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || "SerpApi test connection failed" });
    }
});

// ─── Lead Scraping & Multi-Source Extraction Suite ───────────────────────────

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,7}\b/g;
const PHONE_EXTRACT_REGEX = /(?:\+(?:[0-9]\s*){1,3})?[0-9](?:[\s.-]*[0-9]){8,13}/g;

function cleanExtractedEmail(text) {
    if (!text) return "";
    const matches = text.match(EMAIL_REGEX) || [];
    const valid = matches.filter(e => {
        const l = e.toLowerCase();
        return !l.endsWith('.png') && !l.endsWith('.jpg') && !l.endsWith('.jpeg') && !l.endsWith('.webp')
            && !l.endsWith('.svg') && !l.endsWith('.gif') && !l.endsWith('.bmp')
            && !l.includes('example.com') && !l.includes('domain.com') && !l.includes('email.com')
            && !l.includes('sentry.io') && !l.includes('wixpress.com') && !l.includes('cloudflare.com')
            && !l.includes('webpack') && !l.includes('schema.org') && !l.includes('bootstrap')
            && !l.includes('googleapis.com') && !l.includes('w3.org');
    });
    return valid.length > 0 ? valid[0].toLowerCase() : "";
}

async function extractEmailFromWebsite(websiteUrl, timeoutMs = 4500) {
    if (!websiteUrl || !websiteUrl.startsWith('http')) return "";
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(websiteUrl, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });
        clearTimeout(timeout);
        if (!res.ok) return "";
        const html = await res.text();

        // 1. Check for mailto: links
        const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,7})/gi)];
        if (mailtoMatches.length > 0) {
            const mEmail = mailtoMatches[0][1].toLowerCase();
            if (!mEmail.includes('example') && !mEmail.includes('domain')) return mEmail;
        }

        // 2. Search html text
        const email = cleanExtractedEmail(html);
        if (email) return email;

        // 3. Try contact subpage if homepage had no email
        try {
            const urlObj = new URL(websiteUrl);
            const contactUrl = `${urlObj.origin}/contact`;
            const cController = new AbortController();
            const cTimeout = setTimeout(() => cController.abort(), 2500);
            const cRes = await fetch(contactUrl, {
                signal: cController.signal,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'text/html'
                }
            });
            clearTimeout(cTimeout);
            if (cRes.ok) {
                const cHtml = await cRes.text();
                const cEmail = cleanExtractedEmail(cHtml);
                if (cEmail) return cEmail;
            }
        } catch (_) {}

        return "";
    } catch (_) {
        return "";
    }
}

function decodeBingUrl(url) {
    if (!url) return '';
    if (url.includes('&u=a1') || url.includes('?u=a1')) {
        const match = url.match(/[?&]u=a1([a-zA-Z0-9_-]+)/);
        if (match) {
            try {
                let base64 = match[1].replace(/-/g, '+').replace(/_/g, '/');
                while (base64.length % 4) base64 += '=';
                return Buffer.from(base64, 'base64').toString('utf8');
            } catch (_) {}
        }
    }
    return url;
}

function extractPhonesFromText(text) {
    if (!text) return [];
    const matches = text.match(PHONE_EXTRACT_REGEX) || [];
    return matches.map(m => m.trim()).filter(m => {
        const digits = m.replace(/\D/g, '');
        return digits.length >= 9 && digits.length <= 15;
    });
}

// ─── External Scraper Engines ────────────────────────────────────────────────
async function scrapeGooglePlacesApi(keyword, location, limit, apiKey, mobileOnly = false, extractEmails = true) {
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
                let email = "";
                if (extractEmails && d.website) {
                    email = await extractEmailFromWebsite(d.website);
                }
                const leadObj = {
                    name: d.name || place.name,
                    number: cleanNumber,
                    email,
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

async function scrapeSerpApi(keyword, location, limit, apiKey, mobileOnly = false, extractEmails = true) {
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
            let email = "";
            if (extractEmails && item.website) {
                email = await extractEmailFromWebsite(item.website);
            }
            const leadObj = {
                name: item.title || "Business Lead",
                number: cleanNumber,
                email,
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

async function scrapeSerperDev(keyword, location, limit, apiKey, mobileOnly = false, extractEmails = true) {
    io.emit("scrape_status", { step: "navigating", message: `Connecting to Serper.dev Google Maps for "${keyword} in ${location}"...`, progress: 20 });

    const leads = [];
    const seenPhones = new Set();
    const defaultCountry = integrationsSettings.phone?.defaultCountryCode || "212";
    const glCode = defaultCountry === "212" ? "ma" : (defaultCountry === "33" ? "fr" : "us");
    const maxPages = Math.min(Math.ceil(limit / 15), 10);

    for (let page = 1; page <= maxPages; page++) {
        if (leads.length >= limit) break;
        io.emit("scrape_status", {
            step: "scrolling",
            message: `Fetching Serper.dev Maps results (Page ${page})...`,
            progress: Math.min(25 + page * 15, 85)
        });

        const res = await fetch("https://google.serper.dev/maps", {
            method: "POST",
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                q: `${keyword} ${location}`,
                gl: glCode,
                hl: "fr",
                page: page
            }),
            signal: AbortSignal.timeout(15000)
        });

        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || `Serper.dev returned HTTP ${res.status}`);
        }

        const data = await res.json();
        const places = data.places || [];
        if (places.length === 0) break;

        for (let i = 0; i < places.length; i++) {
            if (leads.length >= limit) break;
            const item = places[i];
            const rawPhone = item.phoneNumber || item.phone || "";
            const cleanNumber = normalizeScrapedPhone(rawPhone, location, defaultCountry);

            if (cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber)) {
                if (mobileOnly && isLandlineNumber(cleanNumber, defaultCountry)) {
                    continue;
                }
                seenPhones.add(cleanNumber);
                const phoneType = getPhoneType(cleanNumber, defaultCountry);
                let email = "";
                if (extractEmails && item.website) {
                    email = await extractEmailFromWebsite(item.website);
                }
                const leadObj = {
                    name: item.title || "Business Lead",
                    number: cleanNumber,
                    email,
                    phoneType,
                    address: item.address || "",
                    website: item.website || "",
                    rating: item.rating ? String(item.rating) : "",
                    source: "Serper.dev"
                };
                leads.push(leadObj);
                io.emit("scrape_lead_found", { lead: leadObj, current: leads.length, totalTarget: limit });
            }
        }
    }
    return leads;
}

// ─── Free Chrome Puppeteer Scrapers ──────────────────────────────────────────

async function scrapeGoogleMapsPuppeteer(browser, keyword, location, limit, options = {}) {
    const { mobileOnly = false, extractEmails = true, seenPhones = new Set(), seenEmails = new Set() } = options;
    const defaultCountry = integrationsSettings.phone?.defaultCountryCode || "212";
    const leads = [];

    const page = await browser.newPage();
    try {
        await page.setViewport({ width: 1280, height: 800 });
        const consentCookie = { name: 'CONSENT', value: 'YES+cb.20230101-00-p0.en+FX+777', domain: '.google.com' };
        await page.setCookie(consentCookie);

        const query = encodeURIComponent(`${keyword} in ${location}`);
        const searchUrl = `https://www.google.com/maps/search/${query}`;
        console.log(`[Google Maps Scraper] Navigating to: ${searchUrl}`);
        io.emit("scrape_status", { step: "navigating", message: `Opening Google Maps for "${keyword} in ${location}"...`, progress: 15, current: leads.length, total: limit, mode: "Google Maps" });

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

        try {
            await page.waitForSelector('div[role="feed"], a.hfpxzc, a[href*="/maps/place/"]', { timeout: 15000 });
        } catch (_) {}
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Auto-dismiss Google cookie dialog
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
        io.emit("scrape_status", { step: "scrolling", message: "Scanning Google Maps listings...", progress: 30, current: leads.length, total: limit, mode: "Google Maps" });
        const scrollSelector = 'div[role="feed"]';
        let previousHeight = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = Math.min(Math.max(Math.ceil(limit / 3), 8), 40);

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

            await new Promise(resolve => setTimeout(resolve, 1500));

            const currentResultsCount = await page.evaluate(() => {
                return document.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]').length;
            });

            io.emit("scrape_status", {
                step: "scrolling",
                message: `Discovered ${currentResultsCount} listings on Google Maps...`,
                progress: Math.min(30 + Math.round((scrollAttempts / maxScrollAttempts) * 25), 55),
                current: leads.length,
                total: limit,
                mode: "Google Maps"
            });

            if (currentResultsCount >= limit * 1.5) break;

            const newHeight = await page.evaluate((sel) => {
                const feed = document.querySelector(sel);
                return feed ? feed.scrollHeight : document.body.scrollHeight;
            }, scrollSelector);

            if (newHeight === previousHeight && scrollAttempts > 8) break;
            previousHeight = newHeight;
        }

        // Extract place links and summary cards
        const placeItems = await page.evaluate(() => {
            const results = [];
            const links = Array.from(document.querySelectorAll('a.hfpxzc, a[href*="/maps/place/"]'));

            for (const link of links) {
                const href = link.getAttribute('href');
                let ariaLabel = link.getAttribute('aria-label') || '';
                const container = link.closest('div[role="article"], div.Nv2PK') || link.parentElement;
                const containerText = container ? container.innerText : '';

                if (!ariaLabel && container) {
                    const titleEl = container.querySelector('.qBF1Pd, font, [class*="title"]');
                    if (titleEl) ariaLabel = titleEl.innerText;
                }

                if (href && (ariaLabel || containerText)) {
                    results.push({
                        name: ariaLabel || "Business",
                        url: href,
                        containerText
                    });
                }
            }
            return results;
        });

        console.log(`[Google Maps Scraper] Discovered ${placeItems.length} candidate places.`);
        io.emit("scrape_status", {
            step: "inspecting",
            message: `Extracting contact details for ${placeItems.length} businesses...`,
            progress: 55,
            current: leads.length,
            total: limit,
            mode: "Google Maps"
        });

        // First pass: extract phones directly from card text without opening pages!
        for (const item of placeItems) {
            if (leads.length >= limit) break;
            if (item.containerText) {
                const phones = extractPhonesFromText(item.containerText);
                if (phones.length > 0) {
                    const cleanNumber = normalizeScrapedPhone(phones[0], location, defaultCountry);
                    if (cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber)) {
                        if (mobileOnly && isLandlineNumber(cleanNumber, defaultCountry)) {
                            continue;
                        }
                        seenPhones.add(cleanNumber);
                        const phoneType = getPhoneType(cleanNumber, defaultCountry);
                        const leadObj = {
                            name: item.name,
                            number: cleanNumber,
                            email: "",
                            phoneType,
                            address: location,
                            website: "",
                            rating: "",
                            source: "Google Maps"
                        };
                        leads.push(leadObj);
                        io.emit("scrape_lead_found", { lead: leadObj, current: leads.length, totalTarget: limit });
                    }
                }
            }
        }

        // Second pass: for remaining needed leads, inspect place detail pages
        const remainingNeeded = limit - leads.length;
        if (remainingNeeded > 0) {
            const placesToInspect = placeItems.filter(p => !leads.some(l => l.name === p.name)).slice(0, remainingNeeded * 2);
            const workerPage = await browser.newPage();
            try {
                await workerPage.setViewport({ width: 1280, height: 800 });
                for (let i = 0; i < placesToInspect.length; i++) {
                    if (leads.length >= limit) break;
                    const item = placesToInspect[i];
                    io.emit("scrape_status", {
                        step: "inspecting",
                        message: `Inspecting Google Maps page for "${item.name}"...`,
                        current: leads.length,
                        total: limit,
                        currentBusiness: item.name,
                        progress: Math.min(60 + Math.round(((i + 1) / placesToInspect.length) * 35), 96)
                    });

                    try {
                        await workerPage.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                        const details = await workerPage.evaluate(() => {
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
                            const websiteEl = document.querySelector('a[data-item-id="authority"], a[aria-label*="site web" i], a[aria-label*="website" i]');
                            const website = websiteEl ? websiteEl.getAttribute('href') : '';
                            const addressEl = document.querySelector('button[data-item-id="address"]');
                            const address = addressEl ? (addressEl.innerText || addressEl.getAttribute('aria-label') || '') : '';
                            const ratingEl = document.querySelector('span.MW4etd, [aria-label*="étoiles" i], [aria-label*="stars" i]');
                            const rating = ratingEl ? (ratingEl.innerText || ratingEl.getAttribute('aria-label') || '') : '';
                            return { phone, website, address, rating };
                        });

                        const cleanNumber = normalizeScrapedPhone(details.phone, location, defaultCountry);
                        if (cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber)) {
                            if (mobileOnly && isLandlineNumber(cleanNumber, defaultCountry)) {
                                continue;
                            }
                            seenPhones.add(cleanNumber);
                            const phoneType = getPhoneType(cleanNumber, defaultCountry);
                            let email = "";
                            if (extractEmails && details.website) {
                                email = await extractEmailFromWebsite(details.website);
                            }
                            const leadObj = {
                                name: item.name,
                                number: cleanNumber,
                                email,
                                phoneType,
                                address: details.address.replace(/\n/g, ' ').replace(/^\s*/, '').trim() || location,
                                website: details.website || "",
                                rating: details.rating ? details.rating.trim() : "",
                                source: "Google Maps"
                            };
                            leads.push(leadObj);
                            io.emit("scrape_lead_found", { lead: leadObj, current: leads.length, totalTarget: limit });
                        }
                    } catch (_) {}
                }
            } finally {
                await workerPage.close().catch(() => {});
            }
        }
    } finally {
        await page.close().catch(() => {});
    }
    return leads;
}

async function scrapeBingPuppeteer(browser, keyword, location, limit, options = {}) {
    const { mobileOnly = false, extractEmails = true, seenPhones = new Set(), seenEmails = new Set() } = options;
    const defaultCountry = integrationsSettings.phone?.defaultCountryCode || "212";
    const leads = [];
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        const maxPages = Math.min(Math.ceil(limit / 10), 6);

        for (let pIdx = 0; pIdx < maxPages; pIdx++) {
            if (leads.length >= limit) break;
            const first = pIdx * 10 + 1;
            const query = `${keyword} ${location} telephone email contact`;
            const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=${first}&setlang=fr-fr`;

            io.emit("scrape_status", {
                step: "navigating",
                message: `Searching Bing (Page ${pIdx + 1}) for "${keyword} in ${location}"...`,
                progress: Math.min(20 + pIdx * 15, 80),
                current: leads.length,
                total: limit,
                mode: "Bing"
            });

            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

            // Dismiss Bing consent
            try {
                await page.evaluate(() => {
                    const btn = document.querySelector('#bnp_btn_accept, #b_privacyCookieConsent, button[id*="accept"]');
                    if (btn) btn.click();
                });
            } catch (_) {}

            const items = await page.evaluate(() => {
                const results = [];
                document.querySelectorAll('h2').forEach(h2 => {
                    const a = h2.querySelector('a');
                    const li = h2.closest('li, div.b_algo, div.b_entityTitle') || h2.parentElement;
                    const text = li ? li.innerText : '';
                    if (a && a.innerText && a.href) {
                        results.push({
                            title: a.innerText.trim(),
                            url: a.href,
                            text: text + ' ' + (a.getAttribute('title') || '')
                        });
                    }
                });
                return results;
            });

            for (const item of items) {
                if (leads.length >= limit) break;
                const realUrl = decodeBingUrl(item.url);
                const phones = extractPhonesFromText(item.text);
                let email = cleanExtractedEmail(item.text);

                if (!email && extractEmails && realUrl && realUrl.startsWith('http') && !realUrl.includes('bing.com')) {
                    email = await extractEmailFromWebsite(realUrl, 3000);
                }

                let cleanNumber = "";
                if (phones.length > 0) {
                    cleanNumber = normalizeScrapedPhone(phones[0], location, defaultCountry);
                }

                const hasValidPhone = cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber);
                const hasValidEmail = email && !seenEmails.has(email.toLowerCase());

                if (hasValidPhone || hasValidEmail) {
                    if (hasValidPhone && mobileOnly && isLandlineNumber(cleanNumber, defaultCountry) && !hasValidEmail) {
                        continue;
                    }
                    if (hasValidPhone) seenPhones.add(cleanNumber);
                    if (hasValidEmail) seenEmails.add(email.toLowerCase());

                    const phoneType = hasValidPhone ? getPhoneType(cleanNumber, defaultCountry) : 'unknown';
                    const leadObj = {
                        name: item.title.split(/[-|•–]/)[0].trim(),
                        number: cleanNumber || "",
                        email: email || "",
                        phoneType,
                        address: location,
                        website: realUrl.startsWith('http') && !realUrl.includes('bing.com') ? realUrl : "",
                        rating: "",
                        source: "Bing"
                    };
                    leads.push(leadObj);
                    io.emit("scrape_lead_found", { lead: leadObj, current: leads.length, totalTarget: limit });
                }
            }
        }
    } catch (e) {
        console.warn("[Bing Scraper] Error:", e.message);
    } finally {
        await page.close().catch(() => {});
    }
    return leads;
}

async function scrapeYahooPuppeteer(browser, keyword, location, limit, options = {}) {
    const { mobileOnly = false, extractEmails = true, seenPhones = new Set(), seenEmails = new Set() } = options;
    const defaultCountry = integrationsSettings.phone?.defaultCountryCode || "212";
    const leads = [];
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        const maxPages = Math.min(Math.ceil(limit / 10), 5);

        for (let pIdx = 0; pIdx < maxPages; pIdx++) {
            if (leads.length >= limit) break;
            const bOffset = pIdx * 10 + 1;
            const searchUrl = `https://fr.search.yahoo.com/search?p=${encodeURIComponent(keyword + ' ' + location + ' telephone email')}&b=${bOffset}`;

            io.emit("scrape_status", {
                step: "navigating",
                message: `Searching Yahoo & Annuaires (Page ${pIdx + 1}) for "${keyword} in ${location}"...`,
                progress: Math.min(25 + pIdx * 15, 80),
                current: leads.length,
                total: limit,
                mode: "Yahoo"
            });

            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

            // Handle Yahoo consent popup
            if (page.url().includes('consent.yahoo.com') || page.url().includes('guce.yahoo.com')) {
                try {
                    await page.evaluate(() => {
                        const btns = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                        const btn = btns.find(b => {
                            const t = (b.innerText || b.value || '').toLowerCase();
                            return t.includes('accepter') || t.includes('agree') || b.name === 'agree';
                        });
                        if (btn) btn.click();
                    });
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 7000 }).catch(() => {});
                } catch (_) {}
            }

            const items = await page.evaluate(() => {
                const list = [];
                document.querySelectorAll('div.algo, li div.compText, div.dd, div[class*="rel-news"], div.compArticle').forEach(el => {
                    const a = el.querySelector('h3 a, a');
                    if (a && a.innerText && a.href && !a.href.includes('yahoo.com')) {
                        list.push({
                            title: a.innerText.trim(),
                            url: a.href,
                            text: el.innerText
                        });
                    }
                });
                return list;
            });

            for (const item of items) {
                if (leads.length >= limit) break;
                const phones = extractPhonesFromText(item.text);
                let email = cleanExtractedEmail(item.text);

                if (!email && extractEmails && item.url && item.url.startsWith('http') && !item.url.includes('yahoo.com')) {
                    email = await extractEmailFromWebsite(item.url, 3000);
                }

                let cleanNumber = "";
                if (phones.length > 0) {
                    cleanNumber = normalizeScrapedPhone(phones[0], location, defaultCountry);
                }

                const hasValidPhone = cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber);
                const hasValidEmail = email && !seenEmails.has(email.toLowerCase());

                if (hasValidPhone || hasValidEmail) {
                    if (hasValidPhone && mobileOnly && isLandlineNumber(cleanNumber, defaultCountry) && !hasValidEmail) {
                        continue;
                    }
                    if (hasValidPhone) seenPhones.add(cleanNumber);
                    if (hasValidEmail) seenEmails.add(email.toLowerCase());

                    const phoneType = hasValidPhone ? getPhoneType(cleanNumber, defaultCountry) : 'unknown';
                    const leadObj = {
                        name: item.title.split(/[-|•–]/)[0].trim(),
                        number: cleanNumber || "",
                        email: email || "",
                        phoneType,
                        address: location,
                        website: item.url.startsWith('http') && !item.url.includes('yahoo.com') ? item.url : "",
                        rating: "",
                        source: "Yahoo"
                    };
                    leads.push(leadObj);
                    io.emit("scrape_lead_found", { lead: leadObj, current: leads.length, totalTarget: limit });
                }
            }
        }
    } catch (e) {
        console.warn("[Yahoo Scraper] Error:", e.message);
    } finally {
        await page.close().catch(() => {});
    }
    return leads;
}

async function scrapeYelpPuppeteer(browser, keyword, location, limit, options = {}) {
    const { mobileOnly = false, extractEmails = true, seenPhones = new Set(), seenEmails = new Set() } = options;
    const defaultCountry = integrationsSettings.phone?.defaultCountryCode || "212";
    const leads = [];
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        const maxPages = Math.min(Math.ceil(limit / 10), 5);

        for (let pIdx = 0; pIdx < maxPages; pIdx++) {
            if (leads.length >= limit) break;
            const start = pIdx * 10;
            const yelpUrl = `https://www.yelp.fr/search?find_desc=${encodeURIComponent(keyword)}&find_loc=${encodeURIComponent(location)}&start=${start}`;

            io.emit("scrape_status", {
                step: "navigating",
                message: `Scanning Yelp (Page ${pIdx + 1}) for "${keyword} in ${location}"...`,
                progress: Math.min(25 + pIdx * 15, 80),
                current: leads.length,
                total: limit,
                mode: "Yelp"
            });

            await page.goto(yelpUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

            const bizList = await page.evaluate(() => {
                const list = [];
                document.querySelectorAll('a[href*="/biz/"]').forEach(a => {
                    const name = a.innerText.trim();
                    if (name && !name.includes('Yelp') && !name.includes('Plus') && !name.includes('continuer') && name.length > 2 && !list.some(x => x.name === name)) {
                        list.push({
                            name: name.replace(/^\d+\.\s*/, '').trim(),
                            url: a.href
                        });
                    }
                });
                return list;
            });

            for (const biz of bizList) {
                if (leads.length >= limit) break;
                const bizPage = await browser.newPage();
                try {
                    await bizPage.goto(biz.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
                    const details = await bizPage.evaluate(() => {
                        const text = document.body.innerText;
                        const phoneRegex = /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{2,4})?/g;
                        const matches = text.match(phoneRegex) || [];
                        const addressEl = document.querySelector('address, [class*="address"]');
                        const address = addressEl ? addressEl.innerText.replace(/\n/g, ' ') : '';
                        const websiteEl = document.querySelector('a[href*="/biz_redir"], a[role="link"][target="_blank"]');
                        let website = websiteEl ? websiteEl.href : '';
                        if (website.includes('url=')) {
                            const m = website.match(/url=([^&]+)/);
                            if (m) website = decodeURIComponent(m[1]);
                        }
                        const ratingEl = document.querySelector('[aria-label*="star rating" i], [aria-label*="étoile" i]');
                        const rating = ratingEl ? ratingEl.getAttribute('aria-label') || '' : '';
                        return { phones: matches, address, website, rating, text };
                    });

                    const validPhones = details.phones.filter(p => {
                        const d = p.replace(/\D/g, '');
                        return d.length >= 9 && d.length <= 15;
                    });

                    let cleanNumber = "";
                    if (validPhones.length > 0) {
                        cleanNumber = normalizeScrapedPhone(validPhones[0], location, defaultCountry);
                    }

                    let email = cleanExtractedEmail(details.text);
                    if (!email && extractEmails && details.website) {
                        email = await extractEmailFromWebsite(details.website, 3000);
                    }

                    const hasValidPhone = cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber);
                    const hasValidEmail = email && !seenEmails.has(email.toLowerCase());

                    if (hasValidPhone || hasValidEmail) {
                        if (hasValidPhone && mobileOnly && isLandlineNumber(cleanNumber, defaultCountry) && !hasValidEmail) {
                            continue;
                        }
                        if (hasValidPhone) seenPhones.add(cleanNumber);
                        if (hasValidEmail) seenEmails.add(email.toLowerCase());

                        const phoneType = hasValidPhone ? getPhoneType(cleanNumber, defaultCountry) : 'unknown';
                        const leadObj = {
                            name: biz.name,
                            number: cleanNumber || "",
                            email: email || "",
                            phoneType,
                            address: details.address || location,
                            website: details.website || biz.url,
                            rating: details.rating ? details.rating.replace(/[^0-9.,]/g, '') : "",
                            source: "Yelp"
                        };
                        leads.push(leadObj);
                        io.emit("scrape_lead_found", { lead: leadObj, current: leads.length, totalTarget: limit });
                    }
                } catch (err) {
                    console.warn(`[Yelp] Error inspecting ${biz.name}:`, err.message);
                } finally {
                    await bizPage.close().catch(() => {});
                }
            }
        }
    } catch (e) {
        console.warn("[Yelp Scraper] Error:", e.message);
    } finally {
        await page.close().catch(() => {});
    }
    return leads;
}

async function scrapeSocialPuppeteer(browser, keyword, location, limit, options = {}) {
    const { mobileOnly = false, extractEmails = true, seenPhones = new Set(), seenEmails = new Set() } = options;
    const defaultCountry = integrationsSettings.phone?.defaultCountryCode || "212";
    const leads = [];
    const page = await browser.newPage();

    try {
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
        const query = `(site:facebook.com OR site:instagram.com OR site:linkedin.com/company OR site:linkedin.com/in) "${keyword}" "${location}" ("@gmail.com" OR "contact" OR "tel" OR "06" OR "07" OR "+")`;
        const maxPages = Math.min(Math.ceil(limit / 10), 6);

        for (let pIdx = 0; pIdx < maxPages; pIdx++) {
            if (leads.length >= limit) break;
            const first = pIdx * 10 + 1;
            const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&first=${first}&setlang=fr-fr`;

            io.emit("scrape_status", {
                step: "navigating",
                message: `Searching Social Media (Facebook, Instagram, LinkedIn) for "${keyword} in ${location}" (Page ${pIdx + 1})...`,
                progress: Math.min(25 + pIdx * 15, 85),
                current: leads.length,
                total: limit,
                mode: "Social Networks"
            });

            await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

            try {
                await page.evaluate(() => {
                    const btn = document.querySelector('#bnp_btn_accept, #b_privacyCookieConsent, button[id*="accept"]');
                    if (btn) btn.click();
                });
            } catch (_) {}

            const items = await page.evaluate(() => {
                const results = [];
                document.querySelectorAll('h2').forEach(h2 => {
                    const a = h2.querySelector('a');
                    const li = h2.closest('li, div.b_algo') || h2.parentElement;
                    const text = li ? li.innerText : '';
                    if (a && a.innerText && a.href) {
                        results.push({
                            title: a.innerText.trim(),
                            url: a.href,
                            text: text + ' ' + (a.getAttribute('title') || '')
                        });
                    }
                });
                return results;
            });

            for (const item of items) {
                if (leads.length >= limit) break;
                const realUrl = decodeBingUrl(item.url);
                let platform = "Social";
                if (realUrl.includes("facebook.com") || item.url.includes("facebook.com")) platform = "Facebook";
                else if (realUrl.includes("instagram.com") || item.url.includes("instagram.com")) platform = "Instagram";
                else if (realUrl.includes("linkedin.com") || item.url.includes("linkedin.com")) platform = "LinkedIn";

                const phones = extractPhonesFromText(item.text);
                const email = cleanExtractedEmail(item.text);

                let cleanNumber = "";
                if (phones.length > 0) {
                    cleanNumber = normalizeScrapedPhone(phones[0], location, defaultCountry);
                }

                const hasValidPhone = cleanNumber && cleanNumber.length >= 8 && !seenPhones.has(cleanNumber);
                const hasValidEmail = email && !seenEmails.has(email.toLowerCase());

                if (hasValidPhone || hasValidEmail) {
                    if (hasValidPhone && mobileOnly && isLandlineNumber(cleanNumber, defaultCountry) && !hasValidEmail) {
                        continue;
                    }
                    if (hasValidPhone) seenPhones.add(cleanNumber);
                    if (hasValidEmail) seenEmails.add(email.toLowerCase());

                    const phoneType = hasValidPhone ? getPhoneType(cleanNumber, defaultCountry) : 'unknown';
                    const leadObj = {
                        name: item.title.split(/[-|•–]/)[0].replace(/\| Facebook|\| LinkedIn|\| Instagram/gi, '').trim(),
                        number: cleanNumber || "",
                        email: email || "",
                        phoneType,
                        address: location,
                        website: realUrl,
                        rating: "",
                        source: platform
                    };
                    leads.push(leadObj);
                    io.emit("scrape_lead_found", { lead: leadObj, current: leads.length, totalTarget: limit });
                }
            }
        }
    } catch (e) {
        console.warn("[Social Scraper] Error:", e.message);
    } finally {
        await page.close().catch(() => {});
    }
    return leads;
}

// ─── Multi-Source Orchestrator ────────────────────────────────────────────────

async function scrapeMultiSources(browser, keyword, location, limit, options = {}) {
    const { source = "all", mobileOnly = false, extractEmails = true } = options;
    const leads = [];
    const seenPhones = new Set();
    const seenEmails = new Set();
    const subOptions = { mobileOnly, extractEmails, seenPhones, seenEmails };

    const sourcesToRun = [];
    if (source === "all") {
        sourcesToRun.push("google_maps", "bing", "yahoo", "yelp", "social");
    } else {
        sourcesToRun.push(source);
    }

    for (const src of sourcesToRun) {
        if (leads.length >= limit) break;
        const needed = limit - leads.length;

        try {
            if (src === "google_maps") {
                const gLeads = await scrapeGoogleMapsPuppeteer(browser, keyword, location, needed, subOptions);
                leads.push(...gLeads);
            } else if (src === "bing") {
                const bLeads = await scrapeBingPuppeteer(browser, keyword, location, needed, subOptions);
                leads.push(...bLeads);
            } else if (src === "yahoo") {
                const yLeads = await scrapeYahooPuppeteer(browser, keyword, location, needed, subOptions);
                leads.push(...yLeads);
            } else if (src === "yelp") {
                const yelpLeads = await scrapeYelpPuppeteer(browser, keyword, location, needed, subOptions);
                leads.push(...yelpLeads);
            } else if (src === "social") {
                const sLeads = await scrapeSocialPuppeteer(browser, keyword, location, needed, subOptions);
                leads.push(...sLeads);
            }
        } catch (srcErr) {
            console.warn(`[MultiSource] Error on ${src}:`, srcErr.message);
        }
    }

    return leads;
}

// ─── Scraper API ──────────────────────────────────────────────────────────────
app.post("/api/scrape-leads", async (req, res) => {
    const {
        keyword,
        location,
        maxResults = 25,
        mobileOnly = false,
        source = "all",
        extractEmails = true
    } = req.body;

    if (!keyword || !location) {
        return res.status(400).json({ error: "Keyword and location required" });
    }

    const limit = Math.min(Math.max(parseInt(maxResults, 10) || 25, 5), 500);
    const scraperMode = integrationsSettings.scraper?.mode || "serper";

    io.emit("scrape_status", {
        step: "init",
        message: `Starting research for "${keyword}" in "${location}" (Target: ${limit} leads, Source: ${source.toUpperCase()})...`,
        progress: 5,
        current: 0,
        total: limit,
        mode: source
    });

    // 0. If user explicitly configured and selected Google Places API
    if (source === "google_maps" && scraperMode === "google_places" && integrationsSettings.scraper?.googlePlacesApiKey) {
        try {
            const leads = await scrapeGooglePlacesApi(keyword, location, limit, integrationsSettings.scraper.googlePlacesApiKey, mobileOnly, extractEmails);
            io.emit("scrape_status", {
                step: "completed",
                message: `Research complete! Successfully extracted ${leads.length} leads via Google Places API.`,
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
        }
    }

    // 1. If user explicitly configured and selected SerpAPI
    if (source === "google_maps" && scraperMode === "serpapi" && integrationsSettings.scraper?.serpApiKey) {
        try {
            const leads = await scrapeSerpApi(keyword, location, limit, integrationsSettings.scraper.serpApiKey, mobileOnly, extractEmails);
            io.emit("scrape_status", {
                step: "completed",
                message: `Research complete! Successfully extracted ${leads.length} leads via SerpAPI.`,
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
        }
    }

    // 2. Default & Multi-Source Browser Scraper (Puppeteer Headless Chrome - 100% Free)
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

        const leads = await scrapeMultiSources(browser, keyword, location, limit, {
            source,
            mobileOnly,
            extractEmails
        });

        await browser.close().catch(() => {});
        browser = null;

        const emailCount = leads.filter(l => l.email).length;
        console.log(`[Scraper] Successfully extracted ${leads.length} leads (${emailCount} with email).`);
        io.emit("scrape_status", {
            step: "completed",
            message: `Research complete! Successfully found ${leads.length} leads (${emailCount} with verified email).`,
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
    } catch (e) {
        if (browser) {
            try { await browser.close(); } catch (_) {}
        }
        console.error("Scraping error:", e);
        io.emit("scrape_status", {
            step: "error",
            message: `Scraping error: ${e.message}`,
            progress: 0
        });
        res.status(500).json({ error: "Failed to scrape leads.", details: e?.message });
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
    res.json({ success: true, templates: messageTemplates });
});
app.post("/api/templates", (req, res) => {
    const { id, category } = req.body;
    const title = (req.body.title || req.body.name || "").trim();
    const content = (req.body.content || "").trim();
    if (!title || !content) {
        return res.status(400).json({ error: "Title and content are required." });
    }
    const templateItem = {
        id: id || ("tpl-" + Date.now()),
        title,
        name: title,
        content,
        category: category || "General",
        createdAt: new Date().toISOString()
    };
    if (id) {
        const idx = messageTemplates.findIndex(t => t.id === id);
        if (idx !== -1) {
            messageTemplates[idx] = { ...messageTemplates[idx], ...templateItem };
        } else {
            messageTemplates.unshift(templateItem);
        }
    } else {
        messageTemplates.unshift(templateItem);
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
