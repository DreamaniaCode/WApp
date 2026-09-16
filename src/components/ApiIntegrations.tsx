"use client";

import React, { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import {
    Cpu, Bot, MapPin, Globe, Webhook, Key, Save, CheckCircle2,
    AlertCircle, Loader2, Sparkles, Send, Eye, EyeOff, Radio,
    Sliders, RefreshCw, Layers, ShieldCheck, Database, Check,
    ExternalLink
} from "lucide-react";

interface AiSettings {
    enabled: boolean;
    provider: "openai" | "gemini" | "claude" | "deepseek" | "groq" | "ollama" | "openrouter" | "custom";
    apiKey: string;
    model: string;
    endpointUrl: string;
    systemPrompt: string;
    useRagContext: boolean;
    temperature: number;
    maxTokens: number;
}

interface ScraperSettings {
    mode: "serper" | "serpapi" | "browser" | "google_places" | "custom_webhook";
    googlePlacesApiKey: string;
    serpApiKey: string;
    serperApiKey: string;
    scraperApiKey: string;
    customWebhookUrl: string;
}

interface WebhookSettings {
    leadsWebhookUrl: string;
    leadsWebhookEnabled: boolean;
    inboundMessageWebhookUrl: string;
    inboundMessageWebhookEnabled: boolean;
}

interface PhoneSettings {
    defaultCountryCode: string;
    autoFormatOnImport: boolean;
    pureDigitsForWhatsApp: boolean;
}

interface IntegrationsConfig {
    ai: AiSettings;
    scraper: ScraperSettings;
    webhooks: WebhookSettings;
    phone: PhoneSettings;
}

const DEFAULT_CONFIG: IntegrationsConfig = {
    ai: {
        enabled: false,
        provider: "openai",
        apiKey: "",
        model: "gpt-4o-mini",
        endpointUrl: "",
        systemPrompt: "You are a courteous and helpful WhatsApp customer service assistant. Reply concisely and professionally in the same language the customer uses (Darija/Arabic, French, or English).",
        useRagContext: true,
        temperature: 0.7,
        maxTokens: 350
    },
    scraper: {
        mode: "serper",
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

const COUNTRY_PRESETS = [
    { code: "212", label: "Morocco (+212)", flag: "🇲🇦" },
    { code: "33", label: "France (+33)", flag: "🇫🇷" },
    { code: "1", label: "USA / Canada (+1)", flag: "🇺🇸" },
    { code: "34", label: "Spain (+34)", flag: "🇪🇸" },
    { code: "971", label: "UAE (+971)", flag: "🇦🇪" },
    { code: "966", label: "Saudi Arabia (+966)", flag: "🇸🇦" },
    { code: "44", label: "United Kingdom (+44)", flag: "🇬🇧" },
    { code: "49", label: "Germany (+49)", flag: "🇩🇪" },
    { code: "39", label: "Italy (+39)", flag: "🇮🇹" },
    { code: "213", label: "Algeria (+213)", flag: "🇩🇿" },
    { code: "216", label: "Tunisia (+216)", flag: "🇹🇳" },
    { code: "20", label: "Egypt (+20)", flag: "🇪🇬" },
];

const MODEL_PRESETS: Record<string, string[]> = {
    openai: ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"],
    gemini: ["gemini-2.5-flash", "gemini-3.7-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    openrouter: ["google/gemini-2.5-flash", "anthropic/claude-3.5-sonnet", "meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-chat", "qwen/qwen-2.5-72b-instruct"],
    claude: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
    deepseek: ["deepseek-chat", "deepseek-reasoner"],
    groq: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "llama-3.1-8b-instant"],
    ollama: ["llama3.2", "mistral", "qwen2.5", "llama3.1:8b"],
    custom: ["default"]
};

export function ApiIntegrations() {
    const [activeTab, setActiveTab] = useState<"ai" | "scraper" | "webhooks" | "phone">("ai");
    const [config, setConfig] = useState<IntegrationsConfig>(DEFAULT_CONFIG);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

    // AI Testing state
    const [showKey, setShowKey] = useState(false);
    const [testPrompt, setTestPrompt] = useState("Bonjour, quels sont vos services et horaires ?");
    const [testAiLoading, setTestAiLoading] = useState(false);
    const [testAiResponse, setTestAiResponse] = useState<string | null>(null);

    // Webhook Testing state
    const [testingLeadsWebhook, setTestingLeadsWebhook] = useState(false);
    const [testingInboundWebhook, setTestingInboundWebhook] = useState(false);

    // Scraper Testing state
    const [testingSerper, setTestingSerper] = useState(false);
    const [serperStatus, setSerperStatus] = useState<{ connected: boolean; message: string } | null>(null);
    const [showSerperKey, setShowSerperKey] = useState(false);

    const [testingSerpApi, setTestingSerpApi] = useState(false);
    const [serpApiStatus, setSerpApiStatus] = useState<{ connected: boolean; message: string } | null>(null);
    const [showSerpKey, setShowSerpKey] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            const res = await fetch(`${API_URL}/api/integrations/settings`);
            const data = await res.json();
            if (data.success && data.settings) {
                setConfig({
                    ai: { ...DEFAULT_CONFIG.ai, ...(data.settings.ai || {}) },
                    scraper: { ...DEFAULT_CONFIG.scraper, ...(data.settings.scraper || {}) },
                    webhooks: { ...DEFAULT_CONFIG.webhooks, ...(data.settings.webhooks || {}) },
                    phone: { ...DEFAULT_CONFIG.phone, ...(data.settings.phone || {}) }
                });
            }
        } catch (e) {
            console.warn("Could not load integrations settings:", e);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async (override?: Partial<IntegrationsConfig>) => {
        setSaving(true);
        setStatus(null);
        const toSave = { ...config, ...(override || {}) };

        try {
            if (toSave.phone?.defaultCountryCode) {
                localStorage.setItem("wapp_default_country", toSave.phone.defaultCountryCode);
            }

            const res = await fetch(`${API_URL}/api/integrations/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(toSave)
            });
            const data = await res.json();
            if (data.success) {
                setConfig(toSave);
                setStatus({ type: "success", message: "API integrations and configuration saved successfully!" });
                setTimeout(() => setStatus(null), 3500);
            } else {
                setStatus({ type: "error", message: data.error || "Failed to save configuration" });
            }
        } catch (e: any) {
            setStatus({ type: "error", message: "Could not connect to backend server" });
        } finally {
            setSaving(false);
        }
    };

    const handleTestAi = async () => {
        if (!testPrompt.trim()) return;
        setTestAiLoading(true);
        setTestAiResponse(null);
        try {
            const res = await fetch(`${API_URL}/api/integrations/test-ai`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: testPrompt,
                    config: config.ai
                })
            });
            const data = await res.json();
            if (data.success && data.reply) {
                setTestAiResponse(data.reply);
            } else {
                setTestAiResponse(`Error: ${data.error || "Failed to generate AI response. Verify your API key and model."}`);
            }
        } catch (e: any) {
            setTestAiResponse(`Error: Could not connect to backend (${e.message})`);
        } finally {
            setTestAiLoading(false);
        }
    };

    const handleTestWebhook = async (type: "leads" | "inbound") => {
        const url = type === "leads" ? config.webhooks.leadsWebhookUrl : config.webhooks.inboundMessageWebhookUrl;
        if (!url) {
            setStatus({ type: "error", message: `Please provide a ${type === "leads" ? "Leads" : "Inbound Message"} Webhook URL first` });
            return;
        }

        if (type === "leads") setTestingLeadsWebhook(true);
        else setTestingInboundWebhook(true);

        try {
            const res = await fetch(`${API_URL}/api/integrations/test-webhook`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url,
                    payload: {
                        event: type === "leads" ? "leads_test_ping" : "inbound_test_ping",
                        timestamp: new Date().toISOString(),
                        app: "WApp Manager Leads Pro",
                        test: true
                    }
                })
            });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: "success", message: `Webhook test succeeded! HTTP ${data.status} ${data.statusText || "OK"}` });
            } else {
                setStatus({ type: "error", message: `Webhook test failed: ${data.error}` });
            }
        } catch (e: any) {
            setStatus({ type: "error", message: `Webhook request failed: ${e.message}` });
        } finally {
            setTestingLeadsWebhook(false);
            setTestingInboundWebhook(false);
        }
    };

    const handleTestSerper = async () => {
        const key = config.scraper.serperApiKey?.trim();
        if (!key) {
            setSerperStatus({ connected: false, message: "Please enter a Serper.dev API key first" });
            return;
        }
        setTestingSerper(true);
        setSerperStatus(null);
        try {
            const res = await fetch(`${API_URL}/api/integrations/test-serper`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey: key })
            });
            const data = await res.json();
            if (data.success) {
                setSerperStatus({ connected: true, message: data.message || "Connected to Serper.dev successfully!" });
            } else {
                setSerperStatus({ connected: false, message: data.error || "Connection failed. Check your API key." });
            }
        } catch (e: any) {
            setSerperStatus({ connected: false, message: `Could not reach backend: ${e.message}` });
        } finally {
            setTestingSerper(false);
        }
    };

    const handleTestSerpApi = async () => {
        const key = config.scraper.serpApiKey?.trim();
        if (!key) {
            setSerpApiStatus({ connected: false, message: "Please enter a SerpApi key first" });
            return;
        }
        setTestingSerpApi(true);
        setSerpApiStatus(null);
        try {
            const res = await fetch(`${API_URL}/api/integrations/test-serpapi`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ apiKey: key })
            });
            const data = await res.json();
            if (data.success) {
                setSerpApiStatus({ connected: true, message: data.message || "Connected to SerpApi successfully!" });
            } else {
                setSerpApiStatus({ connected: false, message: data.error || "Connection failed. Check your API key." });
            }
        } catch (e: any) {
            setSerpApiStatus({ connected: false, message: `Could not reach backend: ${e.message}` });
        } finally {
            setTestingSerpApi(false);
        }
    };

    if (loading) {
        return (
            <div className="py-20 flex flex-col items-center justify-center text-gray-400 space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <p className="text-sm font-medium">Loading API Integrations...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Cpu className="w-6 h-6 text-indigo-600" />
                        APIs & Integrations Hub
                    </h2>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Configure AI Chatbot LLMs, Lead Scraping engines, CRM webhooks, and international phone number formatting.
                    </p>
                </div>
                <button
                    onClick={() => saveSettings()}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90 text-white font-semibold text-sm rounded-xl transition shadow-sm hover:shadow disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save All Settings
                </button>
            </div>

            {/* Notification Alert */}
            {status && (
                <div className={`p-4 rounded-xl text-sm border flex items-center justify-between ${
                    status.type === "success"
                        ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : "bg-red-50 text-red-800 border-red-200"
                }`}>
                    <div className="flex items-center gap-2">
                        {status.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                        <span>{status.message}</span>
                    </div>
                    <button onClick={() => setStatus(null)} className="text-xs opacity-60 hover:opacity-100 font-bold px-1">✕</button>
                </div>
            )}

            {/* Sub-Navigation Tabs */}
            <div className="flex gap-2 p-1 bg-gray-100 rounded-xl border border-gray-200 overflow-x-auto">
                <button
                    onClick={() => setActiveTab("ai")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition shrink-0 ${
                        activeTab === "ai"
                            ? "bg-white text-indigo-700 shadow-xs"
                            : "text-gray-600 hover:text-gray-900"
                    }`}
                >
                    <Bot className="w-4 h-4" /> AI Chatbot APIs (LLM)
                    {config.ai.enabled && (
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab("scraper")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition shrink-0 ${
                        activeTab === "scraper"
                            ? "bg-white text-indigo-700 shadow-xs"
                            : "text-gray-600 hover:text-gray-900"
                    }`}
                >
                    <MapPin className="w-4 h-4" /> Scraping APIs & Engine
                </button>
                <button
                    onClick={() => setActiveTab("webhooks")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition shrink-0 ${
                        activeTab === "webhooks"
                            ? "bg-white text-indigo-700 shadow-xs"
                            : "text-gray-600 hover:text-gray-900"
                    }`}
                >
                    <Webhook className="w-4 h-4" /> CRM & Webhooks
                </button>
                <button
                    onClick={() => setActiveTab("phone")}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition shrink-0 ${
                        activeTab === "phone"
                            ? "bg-white text-indigo-700 shadow-xs"
                            : "text-gray-600 hover:text-gray-900"
                    }`}
                >
                    <Globe className="w-4 h-4" /> Country & Phone Formatter
                </button>
            </div>

            {/* TAB 1: AI Chatbot APIs */}
            {activeTab === "ai" && (
                <div className="space-y-6">
                    {/* Enable Toggle Card */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${config.ai.enabled ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                                <Bot className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900">AI Chatbot Auto-Responder</h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    When enabled, customer inquiries without matching keyword rules are answered by the configured AI model.
                                </p>
                            </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                            <input
                                type="checkbox"
                                checked={config.ai.enabled}
                                onChange={(e) => setConfig({ ...config, ai: { ...config.ai, enabled: e.target.checked } })}
                                className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Settings Column */}
                        <div className="lg:col-span-7 space-y-4">
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4">
                                <h4 className="text-sm font-bold text-gray-800 border-b pb-2 flex items-center gap-2">
                                    <Key className="w-4 h-4 text-indigo-600" /> AI Provider & Credentials
                                </h4>

                                {/* Provider Selector */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        Select AI Provider
                                    </label>
                                    <select
                                        value={config.ai.provider}
                                        onChange={(e) => {
                                            const prov = e.target.value as any;
                                            const defaultModel = MODEL_PRESETS[prov]?.[0] || "default";
                                            setConfig({
                                                ...config,
                                                ai: {
                                                    ...config.ai,
                                                    provider: prov,
                                                    model: defaultModel,
                                                    endpointUrl: prov === "ollama" ? "http://localhost:11434/v1" : config.ai.endpointUrl
                                                }
                                            });
                                        }}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                    >
                                        <option value="gemini">Google Gemini (Gemini 2.5 Flash / 3.7 Flash / Pro)</option>
                                        <option value="openrouter">OpenRouter (Multi-Model Gateway: Gemini, Claude, LLaMA, DeepSeek)</option>
                                        <option value="openai">OpenAI (ChatGPT - Official API)</option>
                                        <option value="claude">Anthropic Claude (Claude 3.5 Sonnet / Haiku)</option>
                                        <option value="deepseek">DeepSeek (DeepSeek V3 / R1 Reasoner)</option>
                                        <option value="groq">Groq (Ultra Fast Llama 3.3 / Mixtral)</option>
                                        <option value="ollama">Ollama (Local Offline LLM)</option>
                                        <option value="custom">Custom OpenAI-Compatible Endpoint</option>
                                    </select>
                                </div>

                                {/* API Key */}
                                {config.ai.provider !== "ollama" && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                                            {config.ai.provider.toUpperCase()} API Key
                                        </label>
                                        <div className="relative">
                                            <input
                                                type={showKey ? "text" : "password"}
                                                placeholder={`Enter your ${config.ai.provider} API key (e.g. sk-...)`}
                                                value={config.ai.apiKey}
                                                onChange={(e) => setConfig({ ...config, ai: { ...config.ai, apiKey: e.target.value } })}
                                                className="w-full pr-10 pl-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowKey(!showKey)}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                            >
                                                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* Model Name & Presets */}
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-xs font-semibold text-gray-700">
                                            Model Identifier
                                        </label>
                                        <span className="text-[11px] text-gray-400">Quick presets below:</span>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="e.g. gpt-4o-mini, gemini-3.6-flash..."
                                        value={config.ai.model}
                                        onChange={(e) => setConfig({ ...config, ai: { ...config.ai, model: e.target.value } })}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                    />
                                    {MODEL_PRESETS[config.ai.provider] && (
                                        <div className="flex gap-1.5 flex-wrap mt-2">
                                            {MODEL_PRESETS[config.ai.provider].map(m => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => setConfig({ ...config, ai: { ...config.ai, model: m } })}
                                                    className={`px-2 py-1 text-xs rounded-lg border transition ${
                                                        config.ai.model === m
                                                            ? "bg-indigo-50 border-indigo-300 text-indigo-700 font-semibold"
                                                            : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"
                                                    }`}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Custom / Ollama Endpoint URL */}
                                {(config.ai.provider === "ollama" || config.ai.provider === "custom") && (
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">
                                            Endpoint URL
                                        </label>
                                        <input
                                            type="text"
                                            placeholder={config.ai.provider === "ollama" ? "http://localhost:11434/v1" : "https://your-custom-llm.com/v1"}
                                            value={config.ai.endpointUrl}
                                            onChange={(e) => setConfig({ ...config, ai: { ...config.ai, endpointUrl: e.target.value } })}
                                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Persona & System Prompt Card */}
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4">
                                <h4 className="text-sm font-bold text-gray-800 border-b pb-2 flex items-center gap-2">
                                    <Sliders className="w-4 h-4 text-indigo-600" /> AI Persona & Behavior
                                </h4>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                                        System Prompt (Persona)
                                    </label>
                                    <textarea
                                        rows={3}
                                        value={config.ai.systemPrompt}
                                        onChange={(e) => setConfig({ ...config, ai: { ...config.ai, systemPrompt: e.target.value } })}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        placeholder="Define how the AI introduces itself, its tone, language, and guidelines..."
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-indigo-50/60 rounded-xl border border-indigo-100">
                                    <div className="flex items-center gap-2">
                                        <Database className="w-4 h-4 text-indigo-600" />
                                        <div>
                                            <span className="text-xs font-semibold text-indigo-900 block">Inject RAG Company Knowledge</span>
                                            <span className="text-[11px] text-indigo-700">Embeds crawled website chunks & learned Q&As into the AI prompt</span>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={config.ai.useRagContext}
                                        onChange={(e) => setConfig({ ...config, ai: { ...config.ai, useRagContext: e.target.checked } })}
                                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Interactive Testing Box Column */}
                        <div className="lg:col-span-5 space-y-4">
                            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4 flex flex-col h-full">
                                <h4 className="text-sm font-bold text-gray-800 border-b pb-2 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-amber-500" /> Live AI Tester
                                </h4>
                                <p className="text-xs text-gray-500">
                                    Test your AI configuration with a sample customer question before enabling it on WhatsApp:
                                </p>

                                <div className="space-y-2">
                                    <label className="block text-xs font-semibold text-gray-700">
                                        Customer Message (Inquiry)
                                    </label>
                                    <textarea
                                        rows={2}
                                        value={testPrompt}
                                        onChange={(e) => setTestPrompt(e.target.value)}
                                        className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                        placeholder="Type customer message to test..."
                                    />
                                    <button
                                        type="button"
                                        onClick={handleTestAi}
                                        disabled={testAiLoading || !testPrompt.trim() || (!config.ai.apiKey && config.ai.provider !== "ollama")}
                                        className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition shadow-xs disabled:opacity-50"
                                    >
                                        {testAiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        Generate Test Response
                                    </button>
                                </div>

                                <div className="flex-1 min-h-[140px] p-3 bg-gray-50 border border-gray-200 rounded-xl overflow-y-auto">
                                    <div className="text-[11px] font-semibold text-gray-400 uppercase mb-1">
                                        AI Response Preview
                                    </div>
                                    {testAiLoading ? (
                                        <div className="py-6 flex flex-col items-center justify-center text-gray-400 space-y-2">
                                            <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                                            <span className="text-xs">Invoking {config.ai.provider} ({config.ai.model})...</span>
                                        </div>
                                    ) : testAiResponse ? (
                                        <div className="text-xs text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                                            {testAiResponse}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-gray-400 italic py-6 text-center">
                                            Click &ldquo;Generate Test Response&rdquo; to test your API key and prompt.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: Lead Scraping APIs & Engine */}
            {activeTab === "scraper" && (
                <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4">
                        <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-emerald-600" /> Scraper Engine Selector
                        </h3>
                        <p className="text-xs text-gray-500">
                            Choose between the built-in free browser scraper or connect cloud scraping APIs for high-volume extraction.
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 pt-2">
                            {/* Option 1: Serper.dev (Fastest & Recommended) */}
                            <div
                                onClick={() => setConfig({ ...config, scraper: { ...config.scraper, mode: "serper" } })}
                                className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                                    config.scraper.mode === "serper"
                                        ? "border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20"
                                        : "border-gray-200 hover:border-gray-300 bg-white"
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                                            <Sparkles className="w-3 h-3 text-emerald-600" /> RECOMMENDED
                                        </span>
                                        {config.scraper.mode === "serper" && <Check className="w-4 h-4 text-emerald-600" />}
                                    </div>
                                    <div className="font-bold text-sm text-gray-900 mb-1 flex items-center gap-1.5">
                                        Serper.dev Maps API
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        Fast cloud Google Maps search with verified telephone numbers and instant extraction.
                                    </p>
                                </div>
                                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-1.5 text-[11px]">
                                    {config.scraper.serperApiKey ? (
                                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                            Connected & Ready
                                        </span>
                                    ) : (
                                        <span className="text-amber-600 font-medium flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                            Key required below
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Option 2: SerpAPI */}
                            <div
                                onClick={() => setConfig({ ...config, scraper: { ...config.scraper, mode: "serpapi" } })}
                                className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                                    config.scraper.mode === "serpapi"
                                        ? "border-purple-600 bg-purple-50/40 ring-2 ring-purple-500/20"
                                        : "border-gray-200 hover:border-gray-300 bg-white"
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                                            FAST SERP
                                        </span>
                                        {config.scraper.mode === "serpapi" && <Check className="w-4 h-4 text-purple-600" />}
                                    </div>
                                    <div className="font-bold text-sm text-gray-900 mb-1">SerpAPI Maps Engine</div>
                                    <p className="text-xs text-gray-500">
                                        Cloud-rotated search engine API for Google Maps results without proxy overhead.
                                    </p>
                                </div>
                                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-1.5 text-[11px]">
                                    {config.scraper.serpApiKey ? (
                                        <span className="text-purple-700 font-semibold flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                                            Connected & Ready
                                        </span>
                                    ) : (
                                        <span className="text-amber-600 font-medium flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                            Key required below
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Option 3: Google Places API */}
                            <div
                                onClick={() => setConfig({ ...config, scraper: { ...config.scraper, mode: "google_places" } })}
                                className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                                    config.scraper.mode === "google_places"
                                        ? "border-blue-600 bg-blue-50/40 ring-2 ring-blue-500/20"
                                        : "border-gray-200 hover:border-gray-300 bg-white"
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                            OFFICIAL API
                                        </span>
                                        {config.scraper.mode === "google_places" && <Check className="w-4 h-4 text-blue-600" />}
                                    </div>
                                    <div className="font-bold text-sm text-gray-900 mb-1">Google Places API</div>
                                    <p className="text-xs text-gray-500">
                                        Official Google Cloud Places Text Search & Details. Fast and verified data.
                                    </p>
                                </div>
                                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-1.5 text-[11px]">
                                    {config.scraper.googlePlacesApiKey ? (
                                        <span className="text-blue-700 font-semibold flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                            Configured
                                        </span>
                                    ) : (
                                        <span className="text-gray-400">Not configured</span>
                                    )}
                                </div>
                            </div>

                            {/* Option 4: Free Browser */}
                            <div
                                onClick={() => setConfig({ ...config, scraper: { ...config.scraper, mode: "browser" } })}
                                className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                                    config.scraper.mode === "browser"
                                        ? "border-gray-600 bg-gray-50/70 ring-2 ring-gray-400/20"
                                        : "border-gray-200 hover:border-gray-300 bg-white"
                                }`}
                            >
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-gray-700 bg-gray-200 px-2 py-0.5 rounded-full">
                                            100% FREE
                                        </span>
                                        {config.scraper.mode === "browser" && <Check className="w-4 h-4 text-gray-700" />}
                                    </div>
                                    <div className="font-bold text-sm text-gray-900 mb-1">Built-in Chrome Scraper</div>
                                    <p className="text-xs text-gray-500">
                                        Headless Puppeteer scraper. Directly navigates Google Maps. Zero API keys required.
                                    </p>
                                </div>
                                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-1.5 text-[11px] text-gray-500 font-medium">
                                    <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                                    Always available
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Scraper API Credentials Card */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-5">
                        <h4 className="text-sm font-bold text-gray-800 border-b pb-2 flex items-center gap-2">
                            <Key className="w-4 h-4 text-indigo-600" /> Scraper API Credentials
                        </h4>

                        <div className="space-y-6 max-w-2xl">
                            {/* 1. Serper.dev API */}
                            <div className="p-4 bg-emerald-50/30 border border-emerald-200/80 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-bold text-gray-800">
                                        Serper.dev API Key (Recommended)
                                    </label>
                                    <a
                                        href="https://serper.dev"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1"
                                    >
                                        serper.dev <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <div className="relative">
                                    <input
                                        type={showSerperKey ? "text" : "password"}
                                        placeholder="56b7780f..."
                                        value={config.scraper.serperApiKey}
                                        onChange={(e) => setConfig({ ...config, scraper: { ...config.scraper, serperApiKey: e.target.value } })}
                                        className="w-full p-2.5 pr-10 bg-white border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSerperKey(!showSerperKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showSerperKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleTestSerper}
                                        disabled={testingSerper || !config.scraper.serperApiKey}
                                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs"
                                    >
                                        {testingSerper ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                        Test Serper.dev Connection
                                    </button>

                                    {serperStatus && (
                                        <div
                                            className={`text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                                                serperStatus.connected
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                    : "bg-red-50 text-red-700 border-red-200"
                                            }`}
                                        >
                                            {serperStatus.connected ? (
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                            ) : (
                                                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                                            )}
                                            <span>{serperStatus.message}</span>
                                        </div>
                                    )}

                                    {!serperStatus && config.scraper.serperApiKey && (
                                        <div className="text-xs font-medium text-emerald-700 flex items-center gap-1.5 bg-emerald-50/80 px-2.5 py-1 rounded-lg border border-emerald-100">
                                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                            <span>API Key Loaded</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 2. SerpAPI */}
                            <div className="p-4 bg-purple-50/30 border border-purple-200/80 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="block text-xs font-bold text-gray-800">
                                        SerpAPI Private Key
                                    </label>
                                    <a
                                        href="https://serpapi.com"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-purple-700 hover:text-purple-800 font-semibold flex items-center gap-1"
                                    >
                                        serpapi.com <ExternalLink className="w-3 h-3" />
                                    </a>
                                </div>
                                <div className="relative">
                                    <input
                                        type={showSerpKey ? "text" : "password"}
                                        placeholder="Enter your SerpAPI key (64 characters)..."
                                        value={config.scraper.serpApiKey}
                                        onChange={(e) => setConfig({ ...config, scraper: { ...config.scraper, serpApiKey: e.target.value } })}
                                        className="w-full p-2.5 pr-10 bg-white border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSerpKey(!showSerpKey)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showSerpKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center gap-3 pt-1">
                                    <button
                                        type="button"
                                        onClick={handleTestSerpApi}
                                        disabled={testingSerpApi || !config.scraper.serpApiKey}
                                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition shadow-2xs"
                                    >
                                        {testingSerpApi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                        Test SerpAPI Connection
                                    </button>

                                    {serpApiStatus && (
                                        <div
                                            className={`text-xs font-semibold px-3 py-1.5 rounded-xl border flex items-center gap-1.5 ${
                                                serpApiStatus.connected
                                                    ? "bg-purple-50 text-purple-700 border-purple-200"
                                                    : "bg-red-50 text-red-700 border-red-200"
                                            }`}
                                        >
                                            {serpApiStatus.connected ? (
                                                <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                                            ) : (
                                                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                                            )}
                                            <span>{serpApiStatus.message}</span>
                                        </div>
                                    )}

                                    {!serpApiStatus && config.scraper.serpApiKey && (
                                        <div className="text-xs font-medium text-purple-700 flex items-center gap-1.5 bg-purple-50/80 px-2.5 py-1 rounded-lg border border-purple-100">
                                            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
                                            <span>API Key Loaded</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* 3. Google Places API */}
                            <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                                <label className="block text-xs font-bold text-gray-800">
                                    Google Places API Key (Google Cloud Console)
                                </label>
                                <input
                                    type="text"
                                    placeholder="AIzaSy..."
                                    value={config.scraper.googlePlacesApiKey}
                                    onChange={(e) => setConfig({ ...config, scraper: { ...config.scraper, googlePlacesApiKey: e.target.value } })}
                                    className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-sm font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                />
                                <span className="text-[11px] text-gray-400 block">
                                    Enable Places API (New) or Places API in Google Cloud Platform.
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 3: Webhooks & Automations */}
            {activeTab === "webhooks" && (
                <div className="space-y-6">
                    {/* Outgoing Leads Webhook */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <Webhook className="w-4 h-4 text-emerald-600" /> Outgoing Scraped Leads Webhook
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Automatically POST extracted business leads to Zapier, Make.com, n8n, Hubspot, or your CRM webhook.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input
                                    type="checkbox"
                                    checked={config.webhooks.leadsWebhookEnabled}
                                    onChange={(e) => setConfig({ ...config, webhooks: { ...config.webhooks, leadsWebhookEnabled: e.target.checked } })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                        </div>

                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="https://hook.eu1.make.com/... or https://hooks.zapier.com/..."
                                value={config.webhooks.leadsWebhookUrl}
                                onChange={(e) => setConfig({ ...config, webhooks: { ...config.webhooks, leadsWebhookUrl: e.target.value } })}
                                className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            />
                            <button
                                type="button"
                                onClick={() => handleTestWebhook("leads")}
                                disabled={testingLeadsWebhook || !config.webhooks.leadsWebhookUrl}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                            >
                                {testingLeadsWebhook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                Ping Webhook
                            </button>
                        </div>
                    </div>

                    {/* Inbound WhatsApp Messages Webhook */}
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <Webhook className="w-4 h-4 text-blue-600" /> Inbound WhatsApp Message Webhook
                                </h3>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Forward customer messages received on WhatsApp in real time to your external server or support desk.
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer shrink-0">
                                <input
                                    type="checkbox"
                                    checked={config.webhooks.inboundMessageWebhookEnabled}
                                    onChange={(e) => setConfig({ ...config, webhooks: { ...config.webhooks, inboundMessageWebhookEnabled: e.target.checked } })}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>

                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="https://api.yourdomain.com/webhooks/whatsapp-inbound"
                                value={config.webhooks.inboundMessageWebhookUrl}
                                onChange={(e) => setConfig({ ...config, webhooks: { ...config.webhooks, inboundMessageWebhookUrl: e.target.value } })}
                                className="flex-1 p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                            />
                            <button
                                type="button"
                                onClick={() => handleTestWebhook("inbound")}
                                disabled={testingInboundWebhook || !config.webhooks.inboundMessageWebhookUrl}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                            >
                                {testingInboundWebhook ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                Ping Webhook
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: Country & Phone Formatter */}
            {activeTab === "phone" && (
                <div className="space-y-6">
                    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs space-y-5">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                                <Globe className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900">Default Country Calling Code</h3>
                                <p className="text-xs text-gray-500">
                                    Used to automatically normalize local 10-digit numbers starting with 0 into valid WhatsApp international format.
                                </p>
                            </div>
                        </div>

                        {/* Country Presets */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-2">
                                Select Default Country Calling Code
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                {COUNTRY_PRESETS.map((country) => (
                                    <button
                                        key={country.code}
                                        type="button"
                                        onClick={() => setConfig({ ...config, phone: { ...config.phone, defaultCountryCode: country.code } })}
                                        className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition ${
                                            config.phone.defaultCountryCode === country.code
                                                ? "bg-amber-50/60 border-amber-400 text-amber-900 font-bold shadow-2xs"
                                                : "bg-gray-50/60 border-gray-200 hover:bg-gray-100 text-gray-700 font-medium"
                                        }`}
                                    >
                                        <span className="text-lg">{country.flag}</span>
                                        <span className="text-xs">{country.label}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Custom Country Code Input */}
                        <div className="max-w-xs">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Or Custom Country Code (Digits only)
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400">+</span>
                                <input
                                    type="text"
                                    value={config.phone.defaultCountryCode}
                                    onChange={(e) => setConfig({ ...config, phone: { ...config.phone, defaultCountryCode: e.target.value.replace(/\D/g, "") } })}
                                    className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold text-gray-900 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                                    placeholder="212"
                                />
                            </div>
                        </div>

                        {/* Formatting Explanation Banner */}
                        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 space-y-2">
                            <div className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                                <ShieldCheck className="w-4 h-4 text-blue-600" /> WhatsApp E.164 Deliverability Standard
                            </div>
                            <p className="text-xs text-blue-800 leading-relaxed">
                                WhatsApp Web requires pure numeric IDs in the format <code>&lt;country_code&gt;&lt;number&gt;@c.us</code>.
                                Prefixing <code>+</code> to local numbers starting with 0 (like <code>+0524420559</code>) is invalid in telecommunications because no country has a code starting with 0.
                                The system converts them to <code>212524420559</code> or <code>212639320092</code>, guaranteeing 100% successful delivery.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
