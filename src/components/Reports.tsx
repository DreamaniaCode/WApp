"use client";

import { useState, useEffect } from "react";
import {
    BarChart3, RefreshCw, Send, Mail, Bot, Smartphone, AlertCircle,
    CheckCircle2, XCircle, TrendingUp, Users, ShieldAlert, ArrowUpRight,
    Download, Activity, Calendar
} from "lucide-react";
import { API_URL } from "@/lib/config";

interface DailyStat {
    date: string;
    sent: number;
    failed: number;
    emails: number;
    aiReplies: number;
}

interface ReportData {
    summary: {
        totalWhatsAppSent: number;
        totalWhatsAppFailed: number;
        deliveryRate: number;
        totalEmailsSent: number;
        totalEmailsFailed: number;
        totalContacts: number;
        totalAiReplies: number;
        activeDevicesCount: number;
        agentRequestsPending: number;
        bulkCampaignsCount: number;
    };
    dailyStats: DailyStat[];
    sourceBreakdown: Record<string, number>;
    devices: any[];
}

export function Reports() {
    const [data, setData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchReports = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/api/reports/full`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                setData(json);
            } else {
                throw new Error(json.error || "Failed to load report data");
            }
        } catch (e: any) {
            setError(e.message || "Erreur lors du chargement des statistiques");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
        const interval = setInterval(fetchReports, 30000); // auto-refresh every 30s
        return () => clearInterval(interval);
    }, []);

    const exportReportJSON = () => {
        if (!data) return;
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `wapp-report-${new Date().toISOString().split("T")[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    if (loading && !data) {
        return (
            <div className="flex flex-col items-center justify-center p-16 text-gray-500">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                <p className="font-semibold text-sm">Génération des analyses en temps réel...</p>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="p-8 bg-red-50 border border-red-200 rounded-2xl text-center text-red-700">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-600" />
                <p className="font-bold">Impossible de charger les statistiques</p>
                <p className="text-xs text-red-500 mt-1">{error}</p>
                <button
                    onClick={fetchReports}
                    className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-semibold hover:bg-red-700 transition"
                >
                    Réessayer
                </button>
            </div>
        );
    }

    const s = data?.summary || {
        totalWhatsAppSent: 0,
        totalWhatsAppFailed: 0,
        deliveryRate: 100,
        totalEmailsSent: 0,
        totalEmailsFailed: 0,
        totalContacts: 0,
        totalAiReplies: 0,
        activeDevicesCount: 0,
        agentRequestsPending: 0,
        bulkCampaignsCount: 0
    };

    const maxActivity = Math.max(
        ...(data?.dailyStats.map(d => Math.max(d.sent, d.emails, d.aiReplies)) || [1]),
        1
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-blue-600" />
                        Rapports &amp; Analytics Complets
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Tableau de bord unifié WhatsApp, IA Auto-Répondeur, Campagnes Emailing et Flotte d'Appareils
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportReportJSON}
                        className="px-3.5 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                        <Download className="w-3.5 h-3.5 text-gray-500" />
                        Exporter JSON
                    </button>
                    <button
                        onClick={fetchReports}
                        disabled={loading}
                        className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-sm disabled:opacity-50"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                        Actualiser
                    </button>
                </div>
            </div>

            {/* Alert banner if human agent requested */}
            {s.agentRequestsPending > 0 && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-md flex items-center justify-between animate-pulse">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                            <ShieldAlert className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <div className="font-black text-sm">
                                {s.agentRequestsPending} client(s) ont demandé un agent humain !
                            </div>
                            <div className="text-xs text-red-100">
                                Rendez-vous sur l'onglet Live Chat pour basculer en mode manuel et leur répondre directement.
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3.5">
                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-blue-600 mb-2">
                        <span className="text-xs font-semibold text-gray-500">WhatsApp Envoyés</span>
                        <Send className="w-4 h-4" />
                    </div>
                    <div className="text-2xl font-black text-gray-900">{s.totalWhatsAppSent}</div>
                    <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                        <span className="text-emerald-600 font-bold">{s.deliveryRate}% succès</span>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-indigo-600 mb-2">
                        <span className="text-xs font-semibold text-gray-500">Emails Envoyés</span>
                        <Mail className="w-4 h-4" />
                    </div>
                    <div className="text-2xl font-black text-gray-900">{s.totalEmailsSent}</div>
                    <div className="text-[10px] text-gray-400 mt-1">
                        {s.totalEmailsFailed} échecs
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-purple-600 mb-2">
                        <span className="text-xs font-semibold text-gray-500">Réponses IA Bot</span>
                        <Bot className="w-4 h-4" />
                    </div>
                    <div className="text-2xl font-black text-gray-900">{s.totalAiReplies}</div>
                    <div className="text-[10px] text-purple-600 font-semibold mt-1">
                        RAG + Mots-clés
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-emerald-600 mb-2">
                        <span className="text-xs font-semibold text-gray-500">Appareils Actifs</span>
                        <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="text-2xl font-black text-gray-900">{s.activeDevicesCount}</div>
                    <div className="text-[10px] text-emerald-600 font-semibold mt-1">
                        En ligne
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-amber-600 mb-2">
                        <span className="text-xs font-semibold text-gray-500">Total Contacts</span>
                        <Users className="w-4 h-4" />
                    </div>
                    <div className="text-2xl font-black text-gray-900">{s.totalContacts}</div>
                    <div className="text-[10px] text-gray-400 mt-1">
                        Base qualifiée
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col justify-between">
                    <div className="flex items-center justify-between text-rose-600 mb-2">
                        <span className="text-xs font-semibold text-gray-500">Demandes Agent</span>
                        <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="text-2xl font-black text-rose-600">{s.agentRequestsPending}</div>
                    <div className="text-[10px] text-rose-500 font-semibold mt-1">
                        Attente humain
                    </div>
                </div>
            </div>

            {/* 7-Day Performance & Trends */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-indigo-600" />
                            Activité des 7 Derniers Jours
                        </h2>
                        <p className="text-xs text-gray-500">Comparatif des flux WhatsApp, Emails et Réponses IA</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm bg-blue-500" />
                            <span className="text-gray-600">WhatsApp</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm bg-indigo-500" />
                            <span className="text-gray-600">Emails</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 rounded-sm bg-purple-500" />
                            <span className="text-gray-600">Réponses IA</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-4">
                    {data?.dailyStats && data.dailyStats.length > 0 ? (
                        data.dailyStats.map((day) => {
                            const total = day.sent + day.emails + day.aiReplies;
                            return (
                                <div key={day.date} className="space-y-1.5">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-gray-700 w-24">{day.date}</span>
                                        <span className="text-gray-400 font-mono">
                                            WA: <strong className="text-blue-600">{day.sent}</strong> | 
                                            Email: <strong className="text-indigo-600">{day.emails}</strong> | 
                                            IA: <strong className="text-purple-600">{day.aiReplies}</strong>
                                        </span>
                                    </div>
                                    <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
                                        <div
                                            className="h-full bg-blue-500 rounded-l-full transition-all duration-500"
                                            style={{ width: `${(day.sent / maxActivity) * 100}%` }}
                                            title={`WhatsApp: ${day.sent}`}
                                        />
                                        <div
                                            className="h-full bg-indigo-500 transition-all duration-500"
                                            style={{ width: `${(day.emails / maxActivity) * 100}%` }}
                                            title={`Emails: ${day.emails}`}
                                        />
                                        <div
                                            className="h-full bg-purple-500 rounded-r-full transition-all duration-500"
                                            style={{ width: `${(day.aiReplies / maxActivity) * 100}%` }}
                                            title={`IA: ${day.aiReplies}`}
                                        />
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <p className="text-gray-400 text-xs text-center py-6">Aucune activité enregistrée sur les 7 derniers jours.</p>
                    )}
                </div>
            </div>

            {/* AI Source Breakdown & Connected Devices */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* AI Replies Breakdown */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <Bot className="w-4 h-4 text-purple-600" />
                        Sources des Réponses Automatiques IA
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">Répartition des origines des réponses générées</p>
                    {data?.sourceBreakdown && Object.keys(data.sourceBreakdown).length > 0 ? (
                        <div className="space-y-3">
                            {Object.entries(data.sourceBreakdown).map(([source, count]) => {
                                const percent = Math.round((count / (s.totalAiReplies || 1)) * 100);
                                return (
                                    <div key={source} className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
                                            <span className="text-gray-800 capitalize">{source}</span>
                                            <span className="text-purple-600">{count} ({percent}%)</span>
                                        </div>
                                        <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                                            <div
                                                className="bg-purple-600 h-full rounded-full transition-all duration-500"
                                                style={{ width: `${percent}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="text-center py-8 text-xs text-gray-400">
                            Aucune réponse IA enregistrée pour le moment.
                        </div>
                    )}
                </div>

                {/* Connected Devices Fleet */}
                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                    <h3 className="text-sm font-bold text-gray-900 mb-1 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-emerald-600" />
                        Flotte d'Appareils WhatsApp Connectés
                    </h3>
                    <p className="text-xs text-gray-400 mb-4">État de connectivité de vos sessions en cours</p>
                    <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                        {data?.devices && data.devices.length > 0 ? (
                            data.devices.map((d: any) => (
                                <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${d.isReady ? "bg-emerald-500 shadow-sm shadow-emerald-500/50 animate-pulse" : "bg-red-400"}`} />
                                        <div>
                                            <div className="font-semibold text-xs text-gray-900">{d.label || d.id}</div>
                                            <div className="text-[11px] text-gray-400 font-mono">{d.phone || d.wid || "Numéro non synchronisé"}</div>
                                        </div>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                        d.isReady ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
                                    }`}>
                                        {d.isReady ? "Connecté" : "Hors ligne"}
                                    </span>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-xs text-gray-400">
                                Aucun appareil configuré dans le Device Hub.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
