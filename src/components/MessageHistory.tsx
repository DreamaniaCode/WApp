"use client";

import { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import {
    History, RefreshCw, Download, Clock, CheckCircle2, XCircle, FileText,
    Users, ChevronDown, ChevronUp, Trash2, Search, Filter, AlertCircle,
    Copy, Check, MessageSquare, Send
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import Papa from "papaparse";

interface RecipientResult {
    number: string;
    name?: string;
    status: "success" | "error" | "sending" | "pending";
    error?: string;
    timestamp?: string;
}

interface HistoryItem {
    id: string;
    timestamp: string;
    total: number;
    sentCount: number;
    failCount?: number;
    message: string;
    attachmentCount: number;
    duration: number;
    results?: RecipientResult[];
}

interface MessageHistoryProps {
    onReuseMessage?: (msg: string) => void;
}

export function MessageHistory({ onReuseMessage }: MessageHistoryProps = {}) {
    const { t } = useLanguage();
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedCampaignId, setExpandedCampaignId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [recipientFilter, setRecipientFilter] = useState<"all" | "success" | "error">("all");
    const [recipientSearch, setRecipientSearch] = useState("");
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const handleCopy = (id: string, text: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const fetchHistory = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/history`);
            if (res.ok) {
                const data = await res.json();
                setHistory(data);
                if (data.length > 0 && !expandedCampaignId) {
                    setExpandedCampaignId(data[0].id);
                }
            }
        } catch { /* silent */ }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchHistory(); }, []);

    const deleteCampaign = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm("Are you sure you want to delete this campaign record?")) return;
        try {
            await fetch(`${API_URL}/api/history/${id}`, { method: "DELETE" });
            setHistory(prev => prev.filter(h => h.id !== id));
            if (expandedCampaignId === id) setExpandedCampaignId(null);
        } catch (err) {
            console.error("Failed to delete campaign:", err);
        }
    };

    const clearAllHistory = async () => {
        if (!confirm("Clear all campaign message history? This action cannot be undone.")) return;
        try {
            await fetch(`${API_URL}/api/history`, { method: "DELETE" });
            setHistory([]);
            setExpandedCampaignId(null);
        } catch (err) {
            console.error("Failed to clear history:", err);
        }
    };

    const exportCampaignToCSV = (item: HistoryItem, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const results = item.results || [];
        if (results.length === 0) {
            alert("No itemized message records found for this campaign.");
            return;
        }

        const csvData = results.map((r, i) => ({
            Index: i + 1,
            Phone: r.number,
            Name: r.name || "",
            Status: r.status === "success" ? "Sent" : "Failed",
            Error: r.error || "",
            CampaignDate: new Date(item.timestamp).toLocaleString(),
            Timestamp: r.timestamp ? new Date(r.timestamp).toLocaleString() : ""
        }));

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `campaign_${item.id}_report.csv`;
        a.click();
    };

    const exportAllToCSV = () => {
        if (history.length === 0) return;
        const allRows: any[] = [];

        history.forEach((h, cIdx) => {
            if (h.results && h.results.length > 0) {
                h.results.forEach((r, rIdx) => {
                    allRows.push({
                        CampaignIndex: cIdx + 1,
                        CampaignId: h.id,
                        CampaignDate: new Date(h.timestamp).toLocaleString(),
                        Phone: r.number,
                        Name: r.name || "",
                        Status: r.status === "success" ? "Sent" : "Failed",
                        Error: r.error || "",
                        Message: h.message || "",
                        Timestamp: r.timestamp ? new Date(r.timestamp).toLocaleString() : ""
                    });
                });
            } else {
                allRows.push({
                    CampaignIndex: cIdx + 1,
                    CampaignId: h.id,
                    CampaignDate: new Date(h.timestamp).toLocaleString(),
                    Phone: "Bulk Total",
                    Name: "N/A",
                    Status: `${h.sentCount}/${h.total} Sent`,
                    Error: "",
                    Message: h.message || "",
                    Timestamp: ""
                });
            }
        });

        const csv = Papa.unparse(allRows);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `all_campaigns_history_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
    };

    const filteredHistory = history.filter(h => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (h.message && h.message.toLowerCase().includes(q)) ||
            (h.results && h.results.some(r => (r.number && r.number.includes(q)) || (r.name && r.name.toLowerCase().includes(q))))
        );
    });

    const totalMessagesSent = history.reduce((acc, h) => acc + (h.sentCount || 0), 0);
    const totalRecipients = history.reduce((acc, h) => acc + (h.total || 0), 0);

    return (
        <div className="space-y-6">
            {/* Header & Stats Banner */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
                        <History className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Campaign & Bulk Message History</h2>
                        <p className="text-xs text-gray-500">
                            {history.length} campaigns recorded • {totalMessagesSent} messages delivered of {totalRecipients} total
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        onClick={fetchHistory}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
                    </button>
                    {history.length > 0 && (
                        <>
                            <button
                                onClick={exportAllToCSV}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition"
                            >
                                <Download className="w-3.5 h-3.5" /> Export All (CSV)
                            </button>
                            <button
                                onClick={clearAllHistory}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition"
                            >
                                <Trash2 className="w-3.5 h-3.5" /> Clear History
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Search Filter */}
            {history.length > 0 && (
                <div className="relative max-w-md">
                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search campaign message, recipient number, or name..."
                        className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            )}

            {/* Content Body */}
            {loading && history.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-gray-400">
                    <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-3" />
                    <p className="text-sm font-medium">Loading campaign history...</p>
                </div>
            ) : history.length === 0 ? (
                <div className="py-16 flex flex-col items-center justify-center text-gray-400 border border-dashed border-gray-200 rounded-2xl">
                    <History className="w-12 h-12 mb-3 text-gray-300" />
                    <h3 className="text-base font-bold text-gray-700 mb-1">No Campaign History Yet</h3>
                    <p className="text-xs text-gray-400 max-w-sm text-center">
                        Send a campaign via the Bulk Messages tab. Each message and its delivery status will appear here with detailed logs.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredHistory.map((item, index) => {
                        const isExpanded = expandedCampaignId === item.id;
                        const pct = item.total > 0 ? Math.round((item.sentCount / item.total) * 100) : 0;
                        const failedCount = item.failCount !== undefined ? item.failCount : (item.total - item.sentCount);
                        const results = item.results || [];

                        const filteredRecipients = results.filter(r => {
                            const matchesSearch = !recipientSearch ||
                                (r.number && r.number.includes(recipientSearch)) ||
                                (r.name && r.name.toLowerCase().includes(recipientSearch.toLowerCase())) ||
                                (r.error && r.error.toLowerCase().includes(recipientSearch.toLowerCase()));
                            if (!matchesSearch) return false;
                            if (recipientFilter === "success") return r.status === "success";
                            if (recipientFilter === "error") return r.status === "error";
                            return true;
                        });

                        return (
                            <div
                                key={item.id}
                                className={`rounded-2xl border transition-all ${isExpanded
                                    ? "bg-white border-blue-200 shadow-md ring-1 ring-blue-100"
                                    : "bg-white border-gray-200 hover:border-gray-300 shadow-xs"
                                }`}
                            >
                                {/* Campaign Card Summary Header */}
                                <div
                                    onClick={() => setExpandedCampaignId(isExpanded ? null : item.id)}
                                    className="p-5 cursor-pointer flex flex-col lg:flex-row lg:items-center justify-between gap-4 select-none"
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-mono">
                                                #{index + 1}
                                            </span>
                                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${pct === 100
                                                ? "bg-green-100 text-green-800"
                                                : pct > 50
                                                    ? "bg-blue-100 text-blue-800"
                                                    : "bg-amber-100 text-amber-800"
                                            }`}>
                                                {pct}% Success ({item.sentCount}/{item.total})
                                            </span>
                                            <span className="text-xs text-gray-500 flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5 text-gray-400" />
                                                {new Date(item.timestamp).toLocaleString()}
                                            </span>
                                            {item.duration > 0 && (
                                                <span className="text-xs text-gray-400">
                                                    • {item.duration}s duration
                                                </span>
                                            )}
                                        </div>

                                        {item.message && (
                                            <p className="text-sm font-medium text-gray-800 truncate mb-1">
                                                &ldquo;{item.message}&rdquo;
                                            </p>
                                        )}

                                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                                            <span className="flex items-center gap-1 font-semibold text-green-700">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> {item.sentCount} sent
                                            </span>
                                            {failedCount > 0 && (
                                                <span className="flex items-center gap-1 font-semibold text-red-600">
                                                    <XCircle className="w-3.5 h-3.5" /> {failedCount} failed
                                                </span>
                                            )}
                                            {item.attachmentCount > 0 && (
                                                <span className="flex items-center gap-1 text-blue-600 font-medium">
                                                    <FileText className="w-3.5 h-3.5" /> {item.attachmentCount} attachment(s)
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1 text-gray-400">
                                                <Users className="w-3.5 h-3.5" /> {item.total} contacts
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end lg:self-center">
                                        <button
                                            onClick={(e) => exportCampaignToCSV(item, e)}
                                            className="p-2 rounded-xl text-gray-500 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 transition"
                                            title="Export CSV"
                                        >
                                            <Download className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => deleteCampaign(item.id, e)}
                                            className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 border border-gray-200 transition"
                                            title="Delete Record"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setExpandedCampaignId(isExpanded ? null : item.id);
                                            }}
                                            className="flex items-center gap-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-xl border border-blue-200 transition"
                                        >
                                            {isExpanded ? (
                                                <>Hide Details <ChevronUp className="w-4 h-4" /></>
                                            ) : (
                                                <>View {results.length || item.total} Messages & Statuses <ChevronDown className="w-4 h-4" /></>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Expandable Details: Individual Recipient Breakdown */}
                                {isExpanded && (
                                    <div className="border-t border-gray-100 bg-gray-50/50 p-5 rounded-b-2xl space-y-4">
                                        {/* WhatsApp Authentic Message Preview Card */}
                                        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                                            <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-4 py-2.5 flex items-center justify-between text-white flex-wrap gap-2">
                                                <div className="flex items-center gap-2">
                                                    <MessageSquare className="w-4 h-4 text-emerald-200" />
                                                    <span className="text-xs font-bold tracking-wide uppercase">Campaign Message Preview</span>
                                                    {item.attachmentCount > 0 && (
                                                        <span className="text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded-full">
                                                            {item.attachmentCount} Media Attached
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {item.message && (
                                                        <button
                                                            onClick={(e) => handleCopy(item.id, item.message, e)}
                                                            className="flex items-center gap-1 text-xs bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded-lg transition font-medium text-emerald-50"
                                                            title="Copy message content"
                                                        >
                                                            {copiedId === item.id ? (
                                                                <>
                                                                    <Check className="w-3.5 h-3.5 text-green-300" /> Copied!
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Copy className="w-3.5 h-3.5" /> Copy Text
                                                                </>
                                                            )}
                                                        </button>
                                                    )}
                                                    {onReuseMessage && item.message && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onReuseMessage(item.message);
                                                            }}
                                                            className="flex items-center gap-1 text-xs bg-white text-emerald-800 hover:bg-emerald-50 px-2.5 py-1 rounded-lg transition font-bold shadow-xs"
                                                            title="Load this message in Bulk Sender"
                                                        >
                                                            <Send className="w-3.5 h-3.5" /> Reuse in Bulk
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* WhatsApp Chat Wallpaper & Bubble Container */}
                                            <div className="p-4 bg-[#efeae2] relative overflow-hidden" style={{ backgroundImage: "radial-gradient(#d4ccc5 1px, transparent 1px)", backgroundSize: "16px 16px" }}>
                                                <div className="max-w-md ml-auto bg-[#d9fdd3] text-gray-900 rounded-2xl rounded-tr-xs p-3.5 shadow-sm border border-[#c1e8ba]">
                                                    {item.attachmentCount > 0 && (
                                                        <div className="mb-2.5 flex items-center gap-2 p-2 bg-[#bfeab8]/60 rounded-xl border border-[#b2e2aa] text-xs text-emerald-950 font-medium">
                                                            <FileText className="w-4 h-4 text-emerald-800 shrink-0" />
                                                            <span className="truncate">{item.attachmentCount} Attachment(s) sent with this message</span>
                                                        </div>
                                                    )}
                                                    {item.message ? (
                                                        <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed break-words font-sans">
                                                            {item.message}
                                                        </p>
                                                    ) : (
                                                        <p className="text-xs italic text-gray-500 font-sans">
                                                            [No text message content — Media/attachment only campaign]
                                                        </p>
                                                    )}
                                                    <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-gray-500 select-none">
                                                        <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        <span className="text-blue-500 font-bold text-[11px] leading-none" title="Delivered">✓✓</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {results.length > 0 ? (
                                            <>
                                                {/* Filter Controls */}
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <input
                                                            type="text"
                                                            placeholder="Filter by phone or name..."
                                                            className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                            value={recipientSearch}
                                                            onChange={(e) => setRecipientSearch(e.target.value)}
                                                        />
                                                        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 text-xs">
                                                            <button
                                                                onClick={() => setRecipientFilter("all")}
                                                                className={`px-2 py-0.5 rounded font-medium transition ${recipientFilter === "all" ? "bg-blue-600 text-white" : "text-gray-600"}`}
                                                            >
                                                                All ({results.length})
                                                            </button>
                                                            <button
                                                                onClick={() => setRecipientFilter("success")}
                                                                className={`px-2 py-0.5 rounded font-medium transition ${recipientFilter === "success" ? "bg-green-600 text-white" : "text-green-700"}`}
                                                            >
                                                                Sent ({results.filter(r => r.status === "success").length})
                                                            </button>
                                                            <button
                                                                onClick={() => setRecipientFilter("error")}
                                                                className={`px-2 py-0.5 rounded font-medium transition ${recipientFilter === "error" ? "bg-red-600 text-white" : "text-red-700"}`}
                                                            >
                                                                Failed ({results.filter(r => r.status === "error").length})
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={() => exportCampaignToCSV(item)}
                                                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 self-start sm:self-auto"
                                                    >
                                                        <Download className="w-3.5 h-3.5" /> Download Campaign CSV
                                                    </button>
                                                </div>

                                                {/* Recipient Status Table */}
                                                <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
                                                    <table className="w-full text-left text-xs">
                                                        <thead className="bg-gray-100/70 text-gray-600 border-b border-gray-200">
                                                            <tr>
                                                                <th className="py-2.5 px-4 font-semibold">#</th>
                                                                <th className="py-2.5 px-4 font-semibold">Phone Number</th>
                                                                <th className="py-2.5 px-4 font-semibold">Name</th>
                                                                <th className="py-2.5 px-4 font-semibold">Delivery Status</th>
                                                                <th className="py-2.5 px-4 font-semibold">Status Reason / Details</th>
                                                                <th className="py-2.5 px-4 font-semibold text-right">Time</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100 font-mono">
                                                            {filteredRecipients.length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={6} className="py-8 text-center text-gray-400 font-sans">
                                                                        No recipient records match the filter.
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                filteredRecipients.map((r, i) => (
                                                                    <tr key={i} className="hover:bg-gray-50">
                                                                        <td className="py-2.5 px-4 text-gray-400">{i + 1}</td>
                                                                        <td className="py-2.5 px-4 font-semibold text-gray-900">{r.number}</td>
                                                                        <td className="py-2.5 px-4 font-sans text-gray-600">{r.name || "—"}</td>
                                                                        <td className="py-2.5 px-4">
                                                                            {r.status === "success" ? (
                                                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-800 font-sans">
                                                                                    <CheckCircle2 className="w-3 h-3 text-green-600" />
                                                                                    Delivered
                                                                                </span>
                                                                            ) : (
                                                                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 font-sans">
                                                                                    <XCircle className="w-3 h-3 text-red-600" />
                                                                                    Failed
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="py-2.5 px-4 font-sans">
                                                                            {r.error ? (
                                                                                <span className="text-red-600 text-xs font-medium">
                                                                                    {r.error}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-gray-400 text-xs">
                                                                                    Delivered successfully
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="py-2.5 px-4 text-right text-gray-400 text-[11px]">
                                                                            {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "—"}
                                                                        </td>
                                                                    </tr>
                                                                ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="p-4 bg-white rounded-xl border border-gray-200 text-center text-xs text-gray-500">
                                                <p>Summary: {item.sentCount} out of {item.total} messages were delivered.</p>
                                                <p className="text-[11px] text-gray-400 mt-0.5">Detailed per-number logs will be recorded for all future campaigns.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
