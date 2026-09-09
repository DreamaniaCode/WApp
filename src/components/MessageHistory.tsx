"use client";

import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { History, RefreshCw, Download, Clock, CheckCircle, FileText, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface HistoryItem {
    id: string;
    timestamp: string;
    total: number;
    sentCount: number;
    message: string;
    attachmentCount: number;
    duration: number;
}

export function MessageHistory() {
    const { t } = useLanguage();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/history`);
            if (res.ok) setHistory(await res.json());
        } catch { /* silent */ }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchHistory(); }, []);

    const exportToCSV = () => {
        if (history.length === 0) return;
        const headers = "Date,Total,Sent,Message,Attachments,Duration(s)";
        const rows = history.map(h => `"${new Date(h.timestamp).toLocaleString()}",${h.total},${h.sentCount},"${h.message?.replace(/"/g, '""') || ''}",${h.attachmentCount},${h.duration}`);
        const blob = new Blob([[headers, ...rows].join("\n")], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "wapp-history.csv";
        a.click();
    };

    return (
        <div className="glass rounded-2xl p-6 border border-white/5 space-y-5">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/10 flex items-center justify-center">
                        <History className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-sm font-semibold text-white">{t("campaignHistory")}</h2>
                        <p className="text-xs text-slate-500">{history.length} campaigns</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={fetchHistory} className="btn-secondary flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs">
                        <RefreshCw className="w-3.5 h-3.5" /> {t("refresh")}
                    </button>
                    {history.length > 0 && (
                        <button onClick={exportToCSV} className="btn-secondary flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-blue-400">
                            <Download className="w-3.5 h-3.5" /> {t("exportCSV")}
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <div className="py-12 flex flex-col items-center text-slate-600">
                    <RefreshCw className="w-7 h-7 animate-spin mb-3 text-blue-400/50" />
                    <p className="text-sm">Loading history...</p>
                </div>
            ) : history.length === 0 ? (
                <div className="py-12 flex flex-col items-center text-slate-600">
                    <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm font-medium">{t("noHistory")}</p>
                    <p className="text-xs mt-1 opacity-60">{t("historyWillAppear")}</p>
                </div>
            ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {history.map((h, index) => {
                        const pct = Math.round((h.sentCount / h.total) * 100);
                        return (
                            <div key={h.id} className="bg-white/3 hover:bg-white/5 border border-white/5 rounded-2xl p-4 transition-colors border-l-2 border-l-blue-500/40 animate-fade-in-up">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-white/5 text-slate-500 font-mono">
                                                #{index + 1}
                                            </span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${pct === 100 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                                                {pct}%
                                            </span>
                                            <span className="text-xs text-slate-500 flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {new Date(h.timestamp).toLocaleString()}
                                            </span>
                                        </div>
                                        {h.message && (
                                            <p className="text-sm text-slate-300 truncate mb-2">
                                                &ldquo;{h.message.slice(0, 80)}{h.message.length > 80 ? '…' : ''}&rdquo;
                                            </p>
                                        )}
                                        <div className="flex items-center gap-4 text-xs text-slate-500">
                                            <span className="flex items-center gap-1">
                                                <CheckCircle className="w-3 h-3 text-emerald-500/70" /> {h.sentCount}/{h.total} sent
                                            </span>
                                            {h.attachmentCount > 0 && (
                                                <span className="flex items-center gap-1">
                                                    <FileText className="w-3 h-3 text-blue-500/70" /> {h.attachmentCount} files
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {h.duration}s
                                            </span>
                                        </div>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <div className="text-lg font-bold text-white">{h.sentCount}</div>
                                        <div className="text-[10px] text-slate-600 flex items-center gap-0.5 justify-end">
                                            <Users className="w-2.5 h-2.5" /> msgs
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-3 w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
