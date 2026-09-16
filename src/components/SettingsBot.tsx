"use client";

import React, { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";
import {
    MessageSquareReply,
    Plus,
    Trash2,
    Save,
    Loader2,
    Globe,
    Brain,
    Sparkles,
    AlertCircle,
    CheckCircle2,
    Upload,
    FileSpreadsheet,
    FileText,
    ListFilter,
    Search,
    Clock,
    ShieldAlert,
    ShieldCheck,
    Bot,
    UserCheck,
    RefreshCw
} from "lucide-react";

export interface AutoResponseRule {
    keyword: string;
    response: string;
    exactMatch: boolean;
}

export interface LearnedPair {
    id: string;
    question: string;
    answer: string;
    uses?: number;
    source?: string;
    createdAt?: string;
}

export interface RagSource {
    id: string;
    title: string;
    url: string;
    chunkCount: number;
    characterCount?: number;
    createdAt?: string;
}

export interface AiReplyLog {
    id: string;
    timestamp: string;
    contactNumber: string;
    contactName: string;
    question: string;
    reply: string;
    source: string;
    confidence: string;
    deviceId: string;
}

export function SettingsBot() {
    const [rules, setRules] = useState<AutoResponseRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [tab, setTab] = useState<'rules' | 'learning' | 'rag' | 'replies_log'>('rules');

    // Self-Learning state
    const [knowledge, setKnowledge] = useState<LearnedPair[]>([]);
    const [settings, setSettings] = useState({
        autoLearn: true,
        autoReply: true,
        useRag: true,
        similarityThreshold: 0.45,
        aiAutoReplyEnabled: false
    });
    const [newQuestion, setNewQuestion] = useState("");
    const [newAnswer, setNewAnswer] = useState("");
    const [showAddPair, setShowAddPair] = useState(false);

    // RAG Website & Document Ingestion state
    const [sources, setSources] = useState<RagSource[]>([]);
    const [webUrl, setWebUrl] = useState("");
    const [crawling, setCrawling] = useState(false);
    const [docTitle, setDocTitle] = useState("");
    const [docContent, setDocContent] = useState("");
    const [showDocInput, setShowDocInput] = useState(false);
    const [testQuery, setTestQuery] = useState("");
    const [testResult, setTestResult] = useState<any>(null);
    const [testingQuery, setTestingQuery] = useState(false);

    // File Ingestion State (Excel, PDF, DOCX, TXT)
    const [uploadingFile, setUploadingFile] = useState(false);
    const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // AI Reply Log state
    const [replyLogs, setReplyLogs] = useState<AiReplyLog[]>([]);
    const [logSearch, setLogSearch] = useState("");
    const [loadingLogs, setLoadingLogs] = useState(false);

    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        try {
            const resRules = await fetch(`${API_URL}/api/auto-responses`);
            const rulesData = await resRules.json();
            if (Array.isArray(rulesData)) setRules(rulesData);

            const resKnowledge = await fetch(`${API_URL}/api/chatbot/knowledge`);
            const knowData = await resKnowledge.json();
            if (knowData.success) {
                setKnowledge(knowData.pairs || []);
                if (knowData.settings) {
                    setSettings(prev => ({ ...prev, ...knowData.settings }));
                }
            }

            const resSources = await fetch(`${API_URL}/api/chatbot/sources`);
            const sourcesData = await resSources.json();
            if (sourcesData.success) setSources(sourcesData.sources || []);

            loadReplyLogs();
        } catch (e) {
            setAlert({ type: 'error', message: 'Erreur lors du chargement des règles et de la base de connaissances' });
        } finally {
            setLoading(false);
        }
    };

    const loadReplyLogs = async () => {
        setLoadingLogs(true);
        try {
            const res = await fetch(`${API_URL}/api/chatbot/reply-log`);
            const data = await res.json();
            if (Array.isArray(data)) setReplyLogs(data);
        } catch (e) {
            console.error("Failed to load AI reply logs", e);
        } finally {
            setLoadingLogs(false);
        }
    };

    const clearReplyLogs = async () => {
        if (!confirm("Voulez-vous vraiment vider tout l'historique des réponses automatiques de l'IA ?")) return;
        try {
            await fetch(`${API_URL}/api/chatbot/reply-log`, { method: "DELETE" });
            setReplyLogs([]);
            setAlert({ type: 'success', message: 'Historique des réponses vidé avec succès.' });
        } catch (e) {
            setAlert({ type: 'error', message: 'Échec de la suppression des logs.' });
        }
    };

    const toggleAiAutoReply = async () => {
        const nextState = !settings.aiAutoReplyEnabled;
        setSettings(prev => ({ ...prev, aiAutoReplyEnabled: nextState }));
        try {
            await fetch(`${API_URL}/api/chatbot/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ aiAutoReplyEnabled: nextState })
            });
            setAlert({
                type: 'success',
                message: nextState
                    ? "✅ Répondeur IA ACTIVÉ : L'IA répondra aux questions des clients selon vos fichiers et règles."
                    : "⏸️ Répondeur IA DÉSACTIVÉ : L'IA ne répondra à aucun message sans votre accord."
            });
            setTimeout(() => setAlert(null), 4000);
        } catch (e) {
            setAlert({ type: 'error', message: 'Erreur lors de la mise à jour des paramètres.' });
        }
    };

    const saveRules = async () => {
        setSaving(true);
        setAlert(null);
        try {
            const res = await fetch(`${API_URL}/api/auto-responses`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rules })
            });
            if (res.ok) {
                setAlert({ type: 'success', message: 'Règles de mots-clés enregistrées avec succès !' });
            } else {
                setAlert({ type: 'error', message: 'Erreur lors de la sauvegarde.' });
            }
        } catch (e) {
            setAlert({ type: 'error', message: 'Erreur réseau.' });
        } finally {
            setSaving(false);
            setTimeout(() => setAlert(null), 4000);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingFile(true);
        setUploadFeedback(null);

        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const base64Data = (reader.result as string).split(",")[1];
                const res = await fetch(`${API_URL}/api/chatbot/ingest-file`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        filename: file.name,
                        data: base64Data
                    })
                });
                const data = await res.json();
                if (data.success) {
                    setUploadFeedback(`✅ "${file.name}" importé avec succès ! ${data.chunkCount} segments de connaissances créés.`);
                    const resSources = await fetch(`${API_URL}/api/chatbot/sources`);
                    const sourcesData = await resSources.json();
                    if (sourcesData.success) setSources(sourcesData.sources || []);
                } else {
                    setUploadFeedback(`❌ Erreur: ${data.error || "Impossible d'analyser le fichier"}`);
                }
            } catch (err) {
                setUploadFeedback("❌ Erreur réseau lors de l'envoi du fichier");
            } finally {
                setUploadingFile(false);
                if (fileInputRef.current) fileInputRef.current.value = "";
                setTimeout(() => setUploadFeedback(null), 6000);
            }
        };
        reader.readAsDataURL(file);
    };

    const handleCrawl = async () => {
        if (!webUrl.trim()) return;
        setCrawling(true);
        setAlert(null);
        try {
            const res = await fetch(`${API_URL}/api/chatbot/ingest-url`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: webUrl.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setSources(prev => [data.source, ...prev]);
                setWebUrl("");
                setAlert({ type: 'success', message: `Site web analysé : ${data.chunkCount} segments créés !` });
            } else {
                setAlert({ type: 'error', message: data.error || "Échec de l'exploration du site" });
            }
        } catch (e) {
            setAlert({ type: 'error', message: "Erreur réseau lors de l'exploration" });
        } finally {
            setCrawling(false);
        }
    };

    const handleIngestDoc = async () => {
        if (!docTitle.trim() || !docContent.trim()) return;
        try {
            const res = await fetch(`${API_URL}/api/chatbot/ingest-text`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: docTitle.trim(), text: docContent.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setSources(prev => [data.source, ...prev]);
                setDocTitle("");
                setDocContent("");
                setShowDocInput(false);
                setAlert({ type: 'success', message: `Document indexé : ${data.chunkCount} segments créés !` });
            }
        } catch (e) {}
    };

    const handleAddManualPair = async () => {
        if (!newQuestion.trim() || !newAnswer.trim()) return;
        try {
            const res = await fetch(`${API_URL}/api/chatbot/knowledge`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: newQuestion.trim(), answer: newAnswer.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setKnowledge(prev => [{
                    id: data.id,
                    question: newQuestion.trim(),
                    answer: newAnswer.trim(),
                    source: 'manual',
                    uses: 0,
                    createdAt: new Date().toISOString()
                }, ...prev]);
                setNewQuestion("");
                setNewAnswer("");
                setShowAddPair(false);
            }
        } catch (e) {}
    };

    const deletePair = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/chatbot/knowledge/${id}`, { method: "DELETE" });
            setKnowledge(prev => prev.filter(p => p.id !== id));
        } catch (e) {}
    };

    const deleteSource = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/chatbot/sources/${id}`, { method: "DELETE" });
            setSources(prev => prev.filter(s => s.id !== id));
        } catch (e) {}
    };

    const handleTestQuery = async () => {
        if (!testQuery.trim()) return;
        setTestingQuery(true);
        setTestResult(null);
        try {
            const res = await fetch(`${API_URL}/api/chatbot/test-query`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: testQuery })
            });
            const data = await res.json();
            setTestResult(data.match || { notFound: true });
        } catch (e) {
            setTestResult({ error: "Erreur lors du test" });
        } finally {
            setTestingQuery(false);
        }
    };

    const addRule = () => setRules([...rules, { keyword: "", response: "", exactMatch: true }]);
    const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));
    const updateRule = (idx: number, field: keyof AutoResponseRule, val: any) => {
        const copy = [...rules];
        copy[idx] = { ...copy[idx], [field]: val };
        setRules(copy);
    };

    const filteredLogs = replyLogs.filter(l =>
        (l.contactNumber || "").includes(logSearch) ||
        (l.contactName || "").toLowerCase().includes(logSearch.toLowerCase()) ||
        (l.question || "").toLowerCase().includes(logSearch.toLowerCase()) ||
        (l.reply || "").toLowerCase().includes(logSearch.toLowerCase()) ||
        (l.source || "").toLowerCase().includes(logSearch.toLowerCase())
    );

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col gap-5">
            {/* Master AI Activation Control Banner (Requirement: Ne répond pas si pas activé) */}
            <div className={`rounded-2xl p-4.5 border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                settings.aiAutoReplyEnabled
                    ? "bg-emerald-50/80 border-emerald-200 text-emerald-950"
                    : "bg-amber-50/80 border-amber-200 text-amber-950"
            }`}>
                <div className="flex items-start sm:items-center gap-3.5">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        settings.aiAutoReplyEnabled ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"
                    }`}>
                        {settings.aiAutoReplyEnabled ? <ShieldCheck className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold">
                                {settings.aiAutoReplyEnabled
                                    ? "Répondeur Automatique IA : ACTIVÉ & AUTORISÉ"
                                    : "Répondeur Automatique IA : DÉSACTIVÉ (En Attente de Votre Accord)"}
                            </h3>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                settings.aiAutoReplyEnabled ? "bg-emerald-200 text-emerald-900" : "bg-amber-200 text-amber-900"
                            }`}>
                                {settings.aiAutoReplyEnabled ? "Prêt à Répondre" : "Silence Radio"}
                            </span>
                        </div>
                        <p className="text-xs opacity-85 mt-0.5">
                            {settings.aiAutoReplyEnabled
                                ? "L'IA est autorisée à répondre automatiquement aux clients sur WhatsApp en se basant sur vos documents Excel/PDF et règles."
                                : "L'IA ne répondra à AUCUN client sans votre activation explicite. Activez le bouton ci-contre pour démarrer."}
                        </p>
                    </div>
                </div>

                <button
                    onClick={toggleAiAutoReply}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 shadow-2xs ${
                        settings.aiAutoReplyEnabled
                            ? "bg-emerald-700 hover:bg-emerald-800 text-white"
                            : "bg-amber-700 hover:bg-amber-800 text-white"
                    }`}
                >
                    <Bot className="w-4 h-4" />
                    <span>{settings.aiAutoReplyEnabled ? "Désactiver l'IA" : "Donner l'accord & Activer l'IA"}</span>
                </button>
            </div>

            {/* Header & Sub-Navigation */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-3">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <MessageSquareReply className="w-5 h-5 text-emerald-600" />
                        Auto Reply, Chatbot IA & Entraînement
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Enseignez l'IA avec vos fichiers (Excel, PDF, Docs), configurez les mots-clés et inspectez l'historique des réponses.
                    </p>
                </div>
                {tab === 'rules' && (
                    <button
                        onClick={saveRules}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition text-xs font-bold disabled:opacity-50 shadow-2xs"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Enregistrer les Règles
                    </button>
                )}
            </div>

            {/* Sub-tabs with 4 entries */}
            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl text-xs font-semibold text-gray-600 overflow-x-auto">
                <button
                    onClick={() => setTab('rules')}
                    className={`flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 ${tab === 'rules' ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'}`}
                >
                    <MessageSquareReply className="w-3.5 h-3.5 text-emerald-600" />
                    Règles Mots-Clés ({rules.length})
                </button>
                <button
                    onClick={() => setTab('rag')}
                    className={`flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 ${tab === 'rag' ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'}`}
                >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-sky-600" />
                    Enseignement Fichiers & RAG ({sources.length})
                </button>
                <button
                    onClick={() => setTab('learning')}
                    className={`flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 ${tab === 'learning' ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'}`}
                >
                    <Brain className="w-3.5 h-3.5 text-purple-600" />
                    Auto-Apprentissage ({knowledge.length})
                </button>
                <button
                    onClick={() => { setTab('replies_log'); loadReplyLogs(); }}
                    className={`flex-1 py-2 px-3 rounded-lg transition-all flex items-center justify-center gap-1.5 shrink-0 ${tab === 'replies_log' ? 'bg-white text-gray-900 shadow-xs' : 'hover:text-gray-900'}`}
                >
                    <Clock className="w-3.5 h-3.5 text-indigo-600" />
                    Historique Réponses IA ({replyLogs.length})
                </button>
            </div>

            {/* Global Alert Notification */}
            {alert && (
                <div className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 animate-in fade-in ${
                    alert.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                    {alert.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />}
                    <span>{alert.message}</span>
                </div>
            )}

            {/* TAB 1: Keyword Rules */}
            {tab === 'rules' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-500">
                            Définissez des réponses instantanées automatiques dès qu'un mot ou phrase exacte est reçu.
                        </p>
                        <button
                            onClick={addRule}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-xs font-bold transition border border-emerald-200"
                        >
                            <Plus className="w-3.5 h-3.5" /> Ajouter une règle
                        </button>
                    </div>

                    <div className="space-y-3">
                        {rules.length === 0 ? (
                            <div className="p-8 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                                Aucune règle configurée. Cliquez sur "Ajouter une règle" ci-dessus.
                            </div>
                        ) : (
                            rules.map((rule, idx) => (
                                <div key={idx} className="p-4 bg-gray-50/70 border border-gray-200 rounded-xl space-y-3">
                                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                                        <div className="flex-1 w-full">
                                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                                Mot-clé déclencheur
                                            </label>
                                            <input
                                                type="text"
                                                value={rule.keyword}
                                                onChange={e => updateRule(idx, 'keyword', e.target.value)}
                                                placeholder="ex: prix, tarif, commande, bonjour"
                                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
                                            />
                                        </div>
                                        <div className="flex items-center gap-2 pt-4 shrink-0">
                                            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={rule.exactMatch}
                                                    onChange={e => updateRule(idx, 'exactMatch', e.target.checked)}
                                                    className="rounded text-emerald-600 focus:ring-emerald-500"
                                                />
                                                <span className="text-[11px] font-medium">Correspondance exacte</span>
                                            </label>
                                            <button
                                                onClick={() => removeRule(idx)}
                                                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-white transition ml-2"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                                            Réponse envoyée automatiquement
                                        </label>
                                        <textarea
                                            value={rule.response}
                                            onChange={e => updateRule(idx, 'response', e.target.value)}
                                            placeholder="Tapez le message WhatsApp à envoyer..."
                                            rows={2}
                                            className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none resize-none"
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* TAB 2: File Ingestion & RAG (Excel, PDF, Docs, Web) */}
            {tab === 'rag' && (
                <div className="space-y-6">
                    {/* File Upload Hero Card */}
                    <div className="bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 rounded-2xl p-5 space-y-4 shadow-2xs">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                                <FileSpreadsheet className="w-6 h-6" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-gray-900">
                                    Enseigner l'IA avec vos Fichiers (Excel, PDF, Documents)
                                </h4>
                                <p className="text-xs text-gray-600 mt-0.5">
                                    Importez vos fichiers produits, catalogues de prix, FAQ en PDF ou tableurs Excel (.xlsx/.csv). L'IA extrait les données et apprend à répondre à vos clients avec précision.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-3">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv,.pdf,.docx,.txt"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="ai-file-upload"
                            />
                            <label
                                htmlFor="ai-file-upload"
                                className={`flex-1 w-full border-2 border-dashed border-sky-300 hover:border-sky-500 bg-white/80 hover:bg-white rounded-xl p-4 flex flex-col sm:flex-row items-center justify-center gap-3 cursor-pointer transition ${
                                    uploadingFile ? "opacity-50 pointer-events-none" : ""
                                }`}
                            >
                                <Upload className="w-5 h-5 text-sky-600" />
                                <div className="text-center sm:text-left">
                                    <span className="text-xs font-bold text-gray-800 block">
                                        {uploadingFile ? "Analyse & Apprentissage en cours..." : "Cliquez pour importer un fichier Excel, PDF ou Document"}
                                    </span>
                                    <span className="text-[10px] text-gray-500">
                                        Formats acceptés : .xlsx, .xls, .csv, .pdf, .docx, .txt (jusqu'à 25 Mo)
                                    </span>
                                </div>
                            </label>
                        </div>

                        {uploadFeedback && (
                            <div className="p-3 rounded-xl text-xs font-semibold bg-white border border-sky-200 text-sky-900 animate-in fade-in">
                                {uploadFeedback}
                            </div>
                        )}
                    </div>

                    {/* URL Crawling Box */}
                    <div className="bg-gray-50/70 border border-gray-200 rounded-2xl p-4 space-y-3">
                        <h4 className="text-xs font-bold text-gray-800 flex items-center gap-2">
                            <Globe className="w-4 h-4 text-sky-600" /> Ou Extraire depuis une URL de site web
                        </h4>
                        <div className="flex gap-2">
                            <input
                                type="url"
                                placeholder="https://votre-site.com/faq ou catalogue"
                                value={webUrl}
                                onChange={e => setWebUrl(e.target.value)}
                                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none"
                            />
                            <button
                                onClick={handleCrawl}
                                disabled={crawling || !webUrl.trim()}
                                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-xs font-bold transition disabled:opacity-50 shadow-2xs"
                            >
                                {crawling ? "Extraction..." : "Analyser le site"}
                            </button>
                        </div>
                    </div>

                    {/* Indexed Sources List */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-gray-800">
                                Documents & Sources Appris par l'IA ({sources.length})
                            </h4>
                            <button
                                onClick={() => setShowDocInput(!showDocInput)}
                                className="text-xs text-emerald-600 font-bold hover:underline"
                            >
                                {showDocInput ? "Masquer" : "+ Ajouter un texte personnalisé"}
                            </button>
                        </div>

                        {showDocInput && (
                            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2.5">
                                <input
                                    type="text"
                                    placeholder="Titre du document (ex: Conditions de livraison)"
                                    value={docTitle}
                                    onChange={e => setDocTitle(e.target.value)}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                                />
                                <textarea
                                    placeholder="Collez le texte, politiques, ou tarifs ici..."
                                    value={docContent}
                                    onChange={e => setDocContent(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs resize-none"
                                />
                                <button
                                    onClick={handleIngestDoc}
                                    className="px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition"
                                >
                                    Indexer ce texte
                                </button>
                            </div>
                        )}

                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                            {sources.length === 0 ? (
                                <p className="text-center py-6 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                                    Aucun document ni lien web indexé pour le moment. Importez un fichier Excel ou PDF ci-dessus !
                                </p>
                            ) : (
                                sources.map(sItem => (
                                    <div key={sItem.id} className="p-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between gap-3 text-xs shadow-2xs">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                                            <div className="truncate">
                                                <p className="font-bold text-gray-900 truncate">{sItem.title || sItem.url}</p>
                                                <p className="text-[10px] text-gray-400">
                                                    {sItem.chunkCount} segments de connaissances indexés • {sItem.createdAt ? new Date(sItem.createdAt).toLocaleDateString() : ''}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => deleteSource(sItem.id)}
                                            className="text-gray-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-gray-100 transition"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Simulator / Test Box */}
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                        <h4 className="text-xs font-bold text-gray-800">Simulateur de Réponse IA</h4>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Posez une question pour tester ce que l'IA va répondre..."
                                value={testQuery}
                                onChange={e => setTestQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleTestQuery()}
                                className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                            />
                            <button
                                onClick={handleTestQuery}
                                disabled={testingQuery}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold disabled:opacity-50 transition shadow-2xs"
                            >
                                {testingQuery ? "Test..." : "Tester"}
                            </button>
                        </div>
                        {testResult && (
                            <div className="p-3 bg-white border border-gray-200 rounded-xl text-xs space-y-1">
                                {testResult.notFound ? (
                                    <span className="text-amber-600 font-semibold italic">
                                        Aucune réponse trouvée dans les documents. L'IA passera au modèle LLM (si activé).
                                    </span>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between text-[11px] font-bold text-emerald-700">
                                            <span>Confiance : {testResult.score}% ({testResult.sourceType})</span>
                                            <span className="text-gray-400 truncate max-w-[160px]">{testResult.sourceTitle}</span>
                                        </div>
                                        <p className="text-gray-800 text-xs mt-1 bg-gray-50 p-2 rounded-lg font-medium">
                                            "{testResult.answer}"
                                        </p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* TAB 3: Self-Learning Q&A */}
            {tab === 'learning' && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <p className="text-xs text-gray-500">
                            Questions-réponses apprises automatiquement lors de vos échanges avec les clients.
                        </p>
                        <button
                            onClick={() => setShowAddPair(!showAddPair)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-xl text-xs font-bold transition border border-purple-200"
                        >
                            <Plus className="w-3.5 h-3.5" /> Ajouter manuellement
                        </button>
                    </div>

                    {showAddPair && (
                        <div className="p-4 bg-purple-50/50 border border-purple-200 rounded-2xl space-y-2.5">
                            <input
                                type="text"
                                placeholder="Question du client (ex: Quels sont vos moyens de paiement ?)"
                                value={newQuestion}
                                onChange={e => setNewQuestion(e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs"
                            />
                            <textarea
                                placeholder="Réponse que le bot doit donner..."
                                value={newAnswer}
                                onChange={e => setNewAnswer(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs resize-none"
                            />
                            <button
                                onClick={handleAddManualPair}
                                className="px-4 py-2 bg-purple-600 text-white text-xs font-bold rounded-xl hover:bg-purple-700 transition"
                            >
                                Enregistrer la paire
                            </button>
                        </div>
                    )}

                    <div className="space-y-2 max-h-[350px] overflow-y-auto">
                        {knowledge.length === 0 ? (
                            <p className="text-center py-8 text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                                Aucune connaissance apprise pour l'instant.
                            </p>
                        ) : (
                            knowledge.map(k => (
                                <div key={k.id} className="p-3.5 bg-white border border-gray-200 rounded-xl flex items-start justify-between gap-3 text-xs shadow-2xs">
                                    <div className="space-y-1 flex-1">
                                        <p className="font-bold text-gray-900">Q : {k.question}</p>
                                        <p className="text-gray-600 text-[11px] bg-gray-50 p-2 rounded-lg">R : {k.answer}</p>
                                        <div className="flex items-center gap-2 text-[10px] text-gray-400">
                                            <span>Source : {k.source}</span>
                                            {k.uses !== undefined && <span>• Utilisé {k.uses} fois</span>}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => deletePair(k.id)}
                                        className="text-gray-400 hover:text-red-500 p-1"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* TAB 4: AI Replies Log (Requirement: L'auto reply doit montrer la liste des msg déjà répondus) */}
            {tab === 'replies_log' && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-indigo-600" />
                            <h4 className="text-xs font-bold text-gray-900">
                                Journal d'Audit des Réponses Automatiques IA ({replyLogs.length})
                            </h4>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <div className="relative flex-1 sm:w-64">
                                <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                <input
                                    type="text"
                                    placeholder="Filtrer par numéro, texte ou source..."
                                    value={logSearch}
                                    onChange={e => setLogSearch(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white outline-none"
                                />
                            </div>
                            <button
                                onClick={loadReplyLogs}
                                title="Actualiser"
                                className="p-1.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-100 transition"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={clearReplyLogs}
                                disabled={replyLogs.length === 0}
                                className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Vider</span>
                            </button>
                        </div>
                    </div>

                    {loadingLogs ? (
                        <div className="p-8 text-center text-xs text-gray-400">
                            Chargement de l'historique...
                        </div>
                    ) : filteredLogs.length === 0 ? (
                        <div className="p-8 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                            Aucune réponse enregistrée dans le journal.
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-2xl">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                                        <th className="p-3">Date / Heure</th>
                                        <th className="p-3">Client</th>
                                        <th className="p-3">Question Reçue</th>
                                        <th className="p-3">Réponse IA Envoyée</th>
                                        <th className="p-3">Source Déclencheur</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 bg-white">
                                    {filteredLogs.map(log => (
                                        <tr key={log.id} className="hover:bg-gray-50/70 transition">
                                            <td className="p-3 text-[11px] text-gray-500 whitespace-nowrap">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                            <td className="p-3 font-semibold text-gray-900 whitespace-nowrap">
                                                <div>{log.contactName}</div>
                                                <div className="text-[10px] text-gray-400 font-normal">+{log.contactNumber}</div>
                                            </td>
                                            <td className="p-3 text-gray-700 max-w-[220px]">
                                                <div className="line-clamp-2 italic bg-gray-50 p-1.5 rounded-lg border border-gray-100">
                                                    "{log.question}"
                                                </div>
                                            </td>
                                            <td className="p-3 text-gray-900 max-w-[280px]">
                                                <div className="line-clamp-2 font-medium bg-emerald-50/50 p-1.5 rounded-lg border border-emerald-100 text-emerald-950">
                                                    {log.reply}
                                                </div>
                                            </td>
                                            <td className="p-3 whitespace-nowrap">
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                                    {log.source}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
