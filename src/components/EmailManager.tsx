"use client";

import React, { useState, useEffect } from "react";
import {
    Mail,
    Send,
    Settings,
    History,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Server,
    Users,
    Sparkles,
    Trash2,
    RefreshCw,
    Check,
    FileText
} from "lucide-react";
import { soundEffects } from "@/utils/soundEffects";

interface EmailConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    fromName: string;
    fromEmail: string;
}

interface EmailLog {
    id: string;
    timestamp: string;
    to: string;
    subject: string;
    status: "success" | "failed";
    error?: string;
}

export function EmailManager() {
    const [tab, setTab] = useState<"compose" | "settings" | "history">("compose");

    // SMTP Config state
    const [config, setConfig] = useState<EmailConfig>({
        host: "",
        port: 587,
        secure: false,
        user: "",
        pass: "",
        fromName: "WApp Manager Pro",
        fromEmail: ""
    });
    const [testingSmtp, setTestingSmtp] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [smtpStatus, setSmtpStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);

    // Compose / Campaign state
    const [recipientsText, setRecipientsText] = useState("");
    const [subject, setSubject] = useState("");
    const [bodyHtml, setBodyHtml] = useState("");
    const [sending, setSending] = useState(false);
    const [sendFeedback, setSendFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
    const [campaignProgress, setCampaignProgress] = useState<{ current: number; total: number; sent: number; failed: number } | null>(null);

    // History state
    const [history, setHistory] = useState<EmailLog[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    useEffect(() => {
        loadSettings();
        loadHistory();
    }, []);

    const loadSettings = async () => {
        try {
            const res = await fetch("/api/email/settings");
            const data = await res.json();
            if (data.success && data.settings) {
                setConfig(prev => ({ ...prev, ...data.settings }));
            }
        } catch (e) {
            console.error("Failed to load email settings", e);
        }
    };

    const loadHistory = async () => {
        setLoadingHistory(true);
        try {
            const res = await fetch("/api/email/history");
            const data = await res.json();
            if (Array.isArray(data)) setHistory(data);
        } catch (e) {
            console.error("Failed to load email history", e);
        } finally {
            setLoadingHistory(false);
        }
    };

    const handleSaveConfig = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingConfig(true);
        setSmtpStatus(null);
        try {
            const res = await fetch("/api/email/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config)
            });
            const data = await res.json();
            if (data.success) {
                setSmtpStatus({ type: "success", message: "Configuration SMTP enregistrée avec succès !" });
            } else {
                setSmtpStatus({ type: "error", message: data.error || "Erreur de sauvegarde." });
            }
        } catch (err) {
            setSmtpStatus({ type: "error", message: "Erreur de connexion au serveur local." });
        } finally {
            setSavingConfig(false);
            setTimeout(() => setSmtpStatus(null), 4000);
        }
    };

    const handleTestSmtp = async () => {
        setTestingSmtp(true);
        setSmtpStatus(null);
        try {
            const res = await fetch("/api/email/test-smtp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(config)
            });
            const data = await res.json();
            if (data.success) {
                soundEffects.playSuccessSound();
                setSmtpStatus({ type: "success", message: "✅ Connexion SMTP validée avec succès !" });
            } else {
                soundEffects.playErrorSound();
                setSmtpStatus({ type: "error", message: `❌ Échec: ${data.error || "Impossible de se connecter"}` });
            }
        } catch (err) {
            soundEffects.playErrorSound();
            setSmtpStatus({ type: "error", message: "Erreur réseau lors du test SMTP." });
        } finally {
            setTestingSmtp(false);
        }
    };

    const handleSendCampaign = async (e: React.FormEvent) => {
        e.preventDefault();
        const emails = recipientsText
            .split(/[\n,;]+/)
            .map(e => e.trim())
            .filter(e => e.length > 3 && e.includes("@"));

        if (emails.length === 0) {
            alert("Veuillez saisir au moins une adresse email valide.");
            return;
        }
        if (!subject.trim() || !bodyHtml.trim()) {
            alert("Veuillez renseigner un objet et un corps de message.");
            return;
        }

        setSending(true);
        setSendFeedback(null);
        setCampaignProgress({ current: 0, total: emails.length, sent: 0, failed: 0 });

        try {
            if (emails.length === 1) {
                const res = await fetch("/api/email/send-single", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        to: emails[0],
                        subject: subject.trim(),
                        html: bodyHtml
                    })
                });
                const data = await res.json();
                if (data.success) {
                    soundEffects.playSuccessSound();
                    setSendFeedback({ type: "success", message: `Email envoyé avec succès à ${emails[0]} !` });
                    loadHistory();
                } else {
                    soundEffects.playErrorSound();
                    setSendFeedback({ type: "error", message: data.error || "Échec de l'envoi de l'email" });
                }
            } else {
                const res = await fetch("/api/email/send-bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        recipients: emails,
                        subject: subject.trim(),
                        template: bodyHtml
                    })
                });
                const data = await res.json();
                if (data.success) {
                    soundEffects.playSuccessSound();
                    setSendFeedback({ type: "success", message: `Campagne de ${emails.length} emails lancée en arrière-plan !` });
                    loadHistory();
                } else {
                    soundEffects.playErrorSound();
                    setSendFeedback({ type: "error", message: data.error || "Échec de lancement de la campagne" });
                }
            }
        } catch (err) {
            soundEffects.playErrorSound();
            setSendFeedback({ type: "error", message: "Erreur réseau lors de l'envoi" });
        } finally {
            setSending(false);
            setTimeout(() => setSendFeedback(null), 5000);
        }
    };

    const handleImportContacts = async () => {
        try {
            const res = await fetch("/api/contacts");
            const data = await res.json();
            if (Array.isArray(data)) {
                const validEmails = data.map(c => c.email).filter(Boolean);
                if (validEmails.length > 0) {
                    setRecipientsText(prev => {
                        const existing = prev ? prev + "\n" : "";
                        return existing + validEmails.join("\n");
                    });
                    alert(`✅ ${validEmails.length} adresses email importées depuis vos contacts !`);
                } else {
                    alert("Aucun email renseigné dans vos contacts.");
                }
            }
        } catch (e) {
            alert("Erreur lors du chargement des contacts.");
        }
    };

    const clearHistory = async () => {
        if (!confirm("Voulez-vous vraiment effacer tout l'historique des emails ?")) return;
        try {
            await fetch("/api/email/history", { method: "DELETE" });
            setHistory([]);
        } catch (e) {}
    };

    return (
        <div className="space-y-6">
            {/* Top Navigation Tabs */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                        <Mail className="w-5 h-5 text-indigo-600" />
                        Email Marketing & Campagnes SMTP
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Envoyez des emails marketing et transactionnels avec votre serveur SMTP personnalisé.
                    </p>
                </div>

                <div className="flex items-center gap-1.5 bg-gray-100 p-1 rounded-xl text-xs font-semibold text-gray-600">
                    <button
                        onClick={() => setTab("compose")}
                        className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 ${tab === "compose" ? "bg-white text-gray-900 shadow-xs" : "hover:text-gray-900"}`}
                    >
                        <Send className="w-3.5 h-3.5 text-indigo-600" />
                        Composer & Envoi
                    </button>
                    <button
                        onClick={() => setTab("settings")}
                        className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 ${tab === "settings" ? "bg-white text-gray-900 shadow-xs" : "hover:text-gray-900"}`}
                    >
                        <Server className="w-3.5 h-3.5 text-sky-600" />
                        Serveur SMTP
                    </button>
                    <button
                        onClick={() => { setTab("history"); loadHistory(); }}
                        className={`px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 ${tab === "history" ? "bg-white text-gray-900 shadow-xs" : "hover:text-gray-900"}`}
                    >
                        <History className="w-3.5 h-3.5 text-emerald-600" />
                        Historique ({history.length})
                    </button>
                </div>
            </div>

            {/* TAB 1: Compose & Campaign */}
            {tab === "compose" && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* Left Column: Form */}
                    <div className="lg:col-span-8 bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-5">
                        <form onSubmit={handleSendCampaign} className="space-y-4">
                            {/* Recipients Input */}
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Destinataires (Un par ligne ou séparés par une virgule)
                                    </label>
                                    <button
                                        type="button"
                                        onClick={handleImportContacts}
                                        className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                                    >
                                        <Users className="w-3.5 h-3.5" /> Importer depuis Contacts
                                    </button>
                                </div>
                                <textarea
                                    placeholder="client1@exemple.com&#10;client2@entreprise.com"
                                    value={recipientsText}
                                    onChange={e => setRecipientsText(e.target.value)}
                                    rows={3}
                                    className="w-full p-3 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition font-mono"
                                    required
                                />
                            </div>

                            {/* Subject */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Objet de l'Email
                                </label>
                                <input
                                    type="text"
                                    placeholder="ex: Offre Exclusive : -20% sur votre prochaine commande"
                                    value={subject}
                                    onChange={e => setSubject(e.target.value)}
                                    className="w-full p-2.5 px-4 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                                    required
                                />
                            </div>

                            {/* Body */}
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                                        Corps de l'Email (HTML ou Texte)
                                    </label>
                                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                        <span>Balises :</span>
                                        <button
                                            type="button"
                                            onClick={() => setBodyHtml(prev => prev + " {{name}}")}
                                            className="px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-mono text-[10px]"
                                        >
                                            {"{{name}}"}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setBodyHtml(prev => prev + " {{email}}")}
                                            className="px-1.5 py-0.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 font-mono text-[10px]"
                                        >
                                            {"{{email}}"}
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    placeholder="Bonjour {{name}},&#10;&#10;Nous avons le plaisir de vous présenter notre nouvelle offre..."
                                    value={bodyHtml}
                                    onChange={e => setBodyHtml(e.target.value)}
                                    rows={10}
                                    className="w-full p-3 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition font-sans"
                                    required
                                />
                            </div>

                            {/* Feedback notification */}
                            {sendFeedback && (
                                <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                                    sendFeedback.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
                                }`}>
                                    {sendFeedback.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                                    <span>{sendFeedback.message}</span>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="pt-2 flex items-center gap-3">
                                <button
                                    type="submit"
                                    disabled={sending}
                                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:opacity-90 text-white text-xs font-bold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                                >
                                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    <span>{sending ? "Envoi en cours..." : "Lancer l'Envoi des Emails"}</span>
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Right Column: Preview & SMTP Status */}
                    <div className="lg:col-span-4 space-y-4">
                        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-5 space-y-3">
                            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                                <Server className="w-4 h-4 text-indigo-600" /> Expéditeur Actif
                            </h4>
                            <div className="bg-white p-3 rounded-xl border border-gray-200 text-xs space-y-1">
                                <p className="font-bold text-gray-900">{config.fromName || "Non configuré"}</p>
                                <p className="text-gray-500 font-mono text-[11px]">{config.fromEmail || config.user || "Aucun email défini"}</p>
                                <p className="text-[10px] text-gray-400">
                                    Hôte : {config.host || "SMTP non connecté"} (Port {config.port})
                                </p>
                            </div>
                            {!config.host && (
                                <button
                                    onClick={() => setTab("settings")}
                                    className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl transition border border-indigo-200"
                                >
                                    Configurer le SMTP maintenant
                                </button>
                            )}
                        </div>

                        {/* Live Email Preview */}
                        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3 shadow-2xs">
                            <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                                Aperçu de l'Email
                            </h4>
                            <div className="border border-gray-200 rounded-xl overflow-hidden text-xs">
                                <div className="bg-gray-50 p-2.5 border-b border-gray-200 space-y-1">
                                    <div className="text-[11px] text-gray-500 truncate">
                                        <span className="font-bold">De :</span> {config.fromName} &lt;{config.fromEmail || config.user}&gt;
                                    </div>
                                    <div className="text-[11px] font-semibold text-gray-900 truncate">
                                        <span className="font-bold text-gray-500">Objet :</span> {subject || "(Sans objet)"}
                                    </div>
                                </div>
                                <div className="p-4 bg-white min-h-[140px] whitespace-pre-wrap text-gray-700 font-sans leading-relaxed text-[11px]">
                                    {bodyHtml ? bodyHtml.replace(/{{name}}/g, "Mohammed").replace(/{{email}}/g, "client@exemple.com") : "Le contenu de votre email apparaîtra ici..."}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: SMTP Configuration */}
            {tab === "settings" && (
                <div className="max-w-2xl bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-6">
                    <div>
                        <h3 className="text-sm font-bold text-gray-900">Paramètres du Serveur SMTP Personnalisé</h3>
                        <p className="text-xs text-gray-500 mt-0.5">
                            Connectez n'importe quel fournisseur SMTP : Gmail (App Password), Outlook, Mailgun, SendGrid, ou votre propre serveur cPanel / Postfix.
                        </p>
                    </div>

                    <form onSubmit={handleSaveConfig} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Serveur SMTP (Hôte)
                                </label>
                                <input
                                    type="text"
                                    placeholder="ex: smtp.gmail.com ou mail.domaine.com"
                                    value={config.host}
                                    onChange={e => setConfig({ ...config, host: e.target.value })}
                                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Port
                                </label>
                                <input
                                    type="number"
                                    placeholder="587 ou 465"
                                    value={config.port}
                                    onChange={e => setConfig({ ...config, port: Number(e.target.value) })}
                                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                            <input
                                type="checkbox"
                                id="secureSmtp"
                                checked={config.secure}
                                onChange={e => setConfig({ ...config, secure: e.target.checked })}
                                className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            <label htmlFor="secureSmtp" className="text-xs text-gray-700 cursor-pointer">
                                Utiliser SSL/TLS direct (habituellement pour le port 465)
                            </label>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Utilisateur / Email SMTP
                                </label>
                                <input
                                    type="text"
                                    placeholder="votre-email@domaine.com"
                                    value={config.user}
                                    onChange={e => setConfig({ ...config, user: e.target.value })}
                                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Mot de passe / App Password
                                </label>
                                <input
                                    type="password"
                                    placeholder="••••••••••••••••"
                                    value={config.pass}
                                    onChange={e => setConfig({ ...config, pass: e.target.value })}
                                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                                    required
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Nom de l'Expéditeur
                                </label>
                                <input
                                    type="text"
                                    placeholder="ex: Support Client Dreamania"
                                    value={config.fromName}
                                    onChange={e => setConfig({ ...config, fromName: e.target.value })}
                                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">
                                    Adresse Email d'Expédition (From)
                                </label>
                                <input
                                    type="email"
                                    placeholder="contact@votre-domaine.com"
                                    value={config.fromEmail}
                                    onChange={e => setConfig({ ...config, fromEmail: e.target.value })}
                                    className="w-full p-2.5 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
                                />
                            </div>
                        </div>

                        {smtpStatus && (
                            <div className={`p-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                                smtpStatus.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
                            }`}>
                                {smtpStatus.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                                <span>{smtpStatus.message}</span>
                            </div>
                        )}

                        <div className="pt-2 flex items-center gap-3">
                            <button
                                type="submit"
                                disabled={savingConfig}
                                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs flex items-center gap-2 disabled:opacity-50"
                            >
                                {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                <span>Enregistrer les paramètres SMTP</span>
                            </button>
                            <button
                                type="button"
                                onClick={handleTestSmtp}
                                disabled={testingSmtp || !config.host}
                                className="px-4 py-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-bold transition flex items-center gap-2 disabled:opacity-50"
                            >
                                {testingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                                <span>Tester la connexion SMTP</span>
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* TAB 3: History */}
            {tab === "history" && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold text-gray-900">
                            Journal des Emails Envoyés ({history.length})
                        </h3>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={loadHistory}
                                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition"
                                title="Actualiser"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                            <button
                                onClick={clearHistory}
                                disabled={history.length === 0}
                                className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition disabled:opacity-50 flex items-center gap-1.5"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Vider l'Historique</span>
                            </button>
                        </div>
                    </div>

                    {loadingHistory ? (
                        <div className="p-8 text-center text-xs text-gray-400">
                            Chargement de l'historique...
                        </div>
                    ) : history.length === 0 ? (
                        <div className="p-8 text-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                            Aucun email envoyé pour l'instant.
                        </div>
                    ) : (
                        <div className="overflow-x-auto border border-gray-200 rounded-xl">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 font-bold">
                                        <th className="p-3">Date</th>
                                        <th className="p-3">Destinataire</th>
                                        <th className="p-3">Objet</th>
                                        <th className="p-3">Statut</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {history.map(item => (
                                        <tr key={item.id} className="hover:bg-gray-50/70 transition">
                                            <td className="p-3 text-gray-500 whitespace-nowrap">
                                                {new Date(item.timestamp).toLocaleString()}
                                            </td>
                                            <td className="p-3 font-semibold text-gray-900 whitespace-nowrap">
                                                {item.to}
                                            </td>
                                            <td className="p-3 text-gray-700">
                                                {item.subject}
                                            </td>
                                            <td className="p-3 whitespace-nowrap">
                                                {item.status === "success" ? (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                                        ✅ Envoyé
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200" title={item.error}>
                                                        ❌ Échec ({item.error?.slice(0, 30)}...)
                                                    </span>
                                                )}
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
