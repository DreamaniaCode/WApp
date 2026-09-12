"use client";

import React, { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { formatPhoneNumber, isLandlineNumber, isMobileNumber, getPhoneType } from "@/lib/numberFormatter";
import {
    Search, MapPin, Download, Loader2, Building2, UserPlus,
    Send, CheckCircle2, Copy, ExternalLink, Star, CheckSquare, Square,
    Sparkles, Globe2, Radio, Activity, Check, AlertCircle, Smartphone,
    CheckCheck, XCircle, Phone, Filter
} from "lucide-react";

export interface Lead {
    name: string;
    number: string;
    address?: string;
    website?: string;
    rating?: string;
    source?: string;
    phoneType?: 'mobile' | 'landline' | 'unknown';
    whatsappStatus?: 'active' | 'inactive' | 'testing';
}

interface LeadScraperProps {
    socket?: any;
    onSendToBulk?: (recipients: { number: string; name?: string }[]) => void;
}

interface ScrapeStatus {
    step: "init" | "navigating" | "scrolling" | "inspecting" | "found" | "completed" | "error" | string;
    message: string;
    progress: number;
    current?: number;
    total?: number;
    currentBusiness?: string;
    mode?: string;
}

export function LeadScraper({ socket, onSendToBulk }: LeadScraperProps) {
    const [keyword, setKeyword] = useState("");
    const [location, setLocation] = useState("");
    const [maxResults, setMaxResults] = useState(25);
    const [mobileOnly, setMobileOnly] = useState(true);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [testingWhatsApp, setTestingWhatsApp] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);

    // Listen for real-time scraping progress and lead discovery over WebSocket
    useEffect(() => {
        if (!socket) return;

        const handleStatus = (data: ScrapeStatus) => {
            setScrapeStatus(data);
            if (data.step === "completed") {
                setLoading(false);
            } else if (data.step === "error") {
                setLoading(false);
                setStatus({ type: 'error', message: data.message });
            }
        };

        const handleLeadFound = (data: { lead: Lead; current: number; totalTarget: number }) => {
            if (!data.lead || !data.lead.number) return;
            const formatted = formatPhoneNumber(data.lead.number);
            const pType = data.lead.phoneType || getPhoneType(formatted);

            // Skip landlines if mobileOnly option is on
            if (mobileOnly && (pType === "landline" || isLandlineNumber(formatted))) {
                return;
            }

            const normalizedLead: Lead = {
                ...data.lead,
                number: formatted,
                phoneType: pType
            };

            setLeads(prev => {
                if (prev.some(l => l.number === normalizedLead.number)) return prev;
                const updated = [...prev, normalizedLead];
                setSelectedIndexes(updated.map((_, i) => i));
                return updated;
            });
        };

        socket.on("scrape_status", handleStatus);
        socket.on("scrape_lead_found", handleLeadFound);

        return () => {
            socket.off("scrape_status", handleStatus);
            socket.off("scrape_lead_found", handleLeadFound);
        };
    }, [socket, mobileOnly]);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!keyword.trim() || !location.trim()) {
            setStatus({ type: 'error', message: "Please provide both business keyword and location" });
            return;
        }

        setLoading(true);
        setStatus(null);
        setLeads([]);
        setSelectedIndexes([]);
        setScrapeStatus({
            step: "init",
            message: `Initializing research for "${keyword}" in "${location}"${mobileOnly ? ' (Mobile numbers only)' : ''}...`,
            progress: 5,
            current: 0,
            total: maxResults
        });

        try {
            const res = await fetch(`${API_URL}/api/scrape-leads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    keyword: keyword.trim(),
                    location: location.trim(),
                    maxResults: Number(maxResults) || 25,
                    mobileOnly
                })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                let fetchedLeads: Lead[] = (data.leads || []).map((l: any) => {
                    const formatted = formatPhoneNumber(l.number);
                    return {
                        ...l,
                        number: formatted,
                        phoneType: l.phoneType || getPhoneType(formatted)
                    };
                });

                if (mobileOnly) {
                    fetchedLeads = fetchedLeads.filter(l => !isLandlineNumber(l.number));
                }

                setLeads(fetchedLeads);
                setSelectedIndexes(fetchedLeads.map((_, i) => i));

                if (fetchedLeads.length === 0) {
                    setStatus({
                        type: 'error',
                        message: "No leads with phone numbers found. Try broadening your keyword or location."
                    });
                } else {
                    const mobileCount = fetchedLeads.filter(l => !isLandlineNumber(l.number)).length;
                    setStatus({
                        type: 'success',
                        message: `Successfully extracted ${fetchedLeads.length} business leads (${mobileCount} mobile smartphones)!`
                    });
                }
            } else {
                setStatus({ type: 'error', message: data.error || data.details || "Failed to search Google Maps leads" });
            }
        } catch (err: any) {
            setStatus({ type: 'error', message: "Could not connect to backend scraper. Make sure backend is running." });
        } finally {
            setLoading(false);
        }
    };

    // Filter out landline (fixe) numbers from existing leads
    const filterMobilesOnly = () => {
        const initialCount = leads.length;
        const filtered = leads.filter(l => !isLandlineNumber(l.number));
        const removed = initialCount - filtered.length;
        setLeads(filtered);
        setSelectedIndexes(filtered.map((_, i) => i));
        setStatus({
            type: 'success',
            message: `Removed ${removed} landline numbers (05...). Kept ${filtered.length} smartphone/mobile numbers!`
        });
    };

    // Test numbers directly on WhatsApp Web via backend API
    const testWhatsAppNumbers = async () => {
        if (leads.length === 0) return;
        setTestingWhatsApp(true);
        setStatus({
            type: 'success',
            message: `Testing ${leads.length} numbers live on WhatsApp Web...`
        });

        try {
            const numbersToTest = leads.map(l => l.number);
            const res = await fetch(`${API_URL}/api/whatsapp/check-numbers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ numbers: numbersToTest })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                if (data.connected === false) {
                    setStatus({
                        type: 'error',
                        message: "WhatsApp Web is not connected. Scan the QR Code in 'Connect WhatsApp' tab to run live tests."
                    });
                    return;
                }

                const statusMap = new Map<string, { isWhatsApp: boolean; type: string }>();
                (data.results || []).forEach((r: any) => {
                    statusMap.set(r.number, { isWhatsApp: r.isWhatsApp, type: r.type });
                });

                setLeads(prev => prev.map(l => {
                    const check = statusMap.get(l.number);
                    return {
                        ...l,
                        phoneType: (check?.type as any) || l.phoneType,
                        whatsappStatus: check?.isWhatsApp ? 'active' : 'inactive'
                    };
                }));

                setStatus({
                    type: 'success',
                    message: `WhatsApp test complete: ${data.whatsappCount} active on WhatsApp out of ${data.total} tested!`
                });
            } else {
                setStatus({ type: 'error', message: data.error || "Failed to check WhatsApp status." });
            }
        } catch (err: any) {
            setStatus({ type: 'error', message: "Error contacting WhatsApp verification: " + err.message });
        } finally {
            setTestingWhatsApp(false);
        }
    };

    // Keep only numbers that tested positive on WhatsApp
    const keepWhatsAppOnly = () => {
        const activeLeads = leads.filter(l => l.whatsappStatus === 'active');
        const removed = leads.length - activeLeads.length;
        setLeads(activeLeads);
        setSelectedIndexes(activeLeads.map((_, i) => i));
        setStatus({
            type: 'success',
            message: `Kept ${activeLeads.length} verified WhatsApp contacts (excluded ${removed} inactive / landlines).`
        });
    };

    const toggleSelectAll = () => {
        if (selectedIndexes.length === leads.length) {
            setSelectedIndexes([]);
        } else {
            setSelectedIndexes(leads.map((_, i) => i));
        }
    };

    const toggleSelectIndex = (idx: number) => {
        setSelectedIndexes(prev =>
            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
        );
    };

    const copyToClipboard = (text: string, idx: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(idx);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const exportToCsv = () => {
        const toExport = selectedIndexes.length > 0
            ? leads.filter((_, i) => selectedIndexes.includes(i))
            : leads;

        if (toExport.length === 0) return;

        const headers = ["Name", "Phone Number", "Address", "Website", "Rating"];
        const rows = toExport.map(l => [
            `"${(l.name || "").replace(/"/g, '""')}"`,
            `"${(l.number || "").replace(/"/g, '""')}"`,
            `"${(l.address || "").replace(/"/g, '""')}"`,
            `"${(l.website || "").replace(/"/g, '""')}"`,
            `"${(l.rating || "").replace(/"/g, '""')}"`
        ]);

        const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${keyword}_${location}_leads.csv`.replace(/[^a-z0-9_.]/gi, '_').toLowerCase());
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const saveToContactsManager = () => {
        const toSave = selectedIndexes.length > 0
            ? leads.filter((_, i) => selectedIndexes.includes(i))
            : leads;

        if (toSave.length === 0) return;

        try {
            const raw = localStorage.getItem("whatsapp_contacts");
            const existing = raw ? JSON.parse(raw) : [];
            const existingNumbers = new Set(existing.map((c: any) => c.number));

            let addedCount = 0;
            const updated = [...existing];
            toSave.forEach(l => {
                if (l.number && !existingNumbers.has(l.number)) {
                    existingNumbers.add(l.number);
                    updated.push({ name: l.name || "Lead", number: l.number });
                    addedCount++;
                }
            });

            localStorage.setItem("whatsapp_contacts", JSON.stringify(updated));
            setStatus({
                type: 'success',
                message: `Saved ${addedCount} new contact(s) to Contacts Manager!`
            });
        } catch (_) {
            setStatus({ type: 'error', message: "Failed to save contacts to local storage" });
        }
    };

    const sendToBulkCampaign = () => {
        const toSend = selectedIndexes.length > 0
            ? leads.filter((_, i) => selectedIndexes.includes(i))
            : leads;

        if (toSend.length === 0) return;

        const recipients = toSend
            .filter(l => l.number && l.number.length >= 6)
            .map(l => ({
                number: l.number,
                name: l.name || ""
            }));

        localStorage.setItem("bulk_imported_recipients", JSON.stringify(recipients));

        if (onSendToBulk) {
            onSendToBulk(recipients);
        } else {
            setStatus({
                type: 'success',
                message: `Prepared ${recipients.length} leads for Bulk Campaign! Switch to Bulk Messages tab.`
            });
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm">
                            <MapPin className="w-5 h-5" />
                        </div>
                        Google Maps Lead Generator
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Extract fresh B2B business names, verified phone numbers, and addresses straight from Google Maps
                    </p>
                </div>
            </div>

            {/* Search Form Card */}
            <div className="bg-gray-50/70 border border-gray-200/80 rounded-2xl p-5">
                <form onSubmit={handleSearch} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-5 relative">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                                Activity / Keyword
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="e.g. Dentiste, Restaurant, Plumber, Gym..."
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-gray-900 shadow-2xs"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="sm:col-span-4 relative">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                                City / Location
                            </label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="e.g. Paris, Casablanca, Dubai, Madrid..."
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-gray-900 shadow-2xs"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="sm:col-span-3">
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                                Target Leads
                            </label>
                            <select
                                value={maxResults}
                                onChange={(e) => setMaxResults(Number(e.target.value))}
                                disabled={loading}
                                className="w-full py-2.5 px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-gray-900 shadow-2xs"
                            >
                                <option value={10}>10 Leads</option>
                                <option value={20}>20 Leads</option>
                                <option value={30}>30 Leads</option>
                                <option value={50}>50 Leads</option>
                                <option value={100}>100 Leads</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 cursor-pointer bg-white px-3 py-1.5 border border-gray-200 rounded-xl hover:border-emerald-400 transition shadow-2xs">
                                <input
                                    type="checkbox"
                                    checked={mobileOnly}
                                    onChange={(e) => setMobileOnly(e.target.checked)}
                                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                                />
                                <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                    <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                                    Smartphones Only (Skip Landlines 05...)
                                </span>
                            </label>
                            <span className="text-xs text-gray-400 hidden sm:inline">|</span>
                            <div className="text-xs text-gray-500 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                <span>Extracts business name, phone number, address, and website details</span>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !keyword.trim() || !location.trim()}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Scraping Google Maps...
                                </>
                            ) : (
                                <>
                                    <Search className="w-4 h-4" />
                                    Search Google Maps
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>

            {/* Status Alert */}
            {status && (
                <div className={`p-4 rounded-xl text-sm border flex items-center justify-between ${
                    status.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-red-50 text-red-800 border-red-200'
                }`}>
                    <div className="flex items-center gap-2">
                        {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />}
                        <span>{status.message}</span>
                    </div>
                    <button onClick={() => setStatus(null)} className="text-xs opacity-60 hover:opacity-100 font-bold px-1">✕</button>
                </div>
            )}

            {/* Live Research Status Widget */}
            {(loading || (scrapeStatus && scrapeStatus.step !== "completed")) && scrapeStatus && (
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-cyan-50 p-4 rounded-2xl border border-emerald-200/80 shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                                <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                                Research Status:
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                                    {scrapeStatus.step.toUpperCase()}
                                </span>
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {scrapeStatus.currentBusiness && (
                                <span className="text-xs text-emerald-700 font-medium truncate max-w-[200px] hidden sm:inline" title={scrapeStatus.currentBusiness}>
                                    Target: <strong>{scrapeStatus.currentBusiness}</strong>
                                </span>
                            )}
                            <span className="text-xs font-mono font-bold text-emerald-800">
                                {scrapeStatus.progress}%
                            </span>
                        </div>
                    </div>

                    {/* Animated Progress Bar */}
                    <div className="w-full bg-emerald-200/60 rounded-full h-2.5 overflow-hidden mb-2">
                        <div
                            className="bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(Math.max(scrapeStatus.progress || 5, 5), 100)}%` }}
                        />
                    </div>

                    <div className="flex items-center justify-between text-xs text-emerald-800">
                        <div className="flex items-center gap-1.5 truncate max-w-md">
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" /> : <Activity className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                            <span className="truncate">{scrapeStatus.message}</span>
                        </div>
                        <span className="font-semibold text-emerald-900 shrink-0 ml-2">
                            {leads.length} / {maxResults} Leads Discovered
                        </span>
                    </div>
                </div>
            )}

            {/* Results Table Card */}
            <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-gray-50/80 px-5 py-3.5 border-b border-gray-200 flex flex-wrap gap-3 justify-between items-center">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={toggleSelectAll}
                            disabled={leads.length === 0}
                            className="text-xs font-semibold text-gray-700 hover:text-emerald-600 flex items-center gap-1.5 disabled:opacity-40"
                        >
                            {selectedIndexes.length === leads.length && leads.length > 0 ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                            )}
                            <span>{selectedIndexes.length} / {leads.length} Selected</span>
                        </button>
                        {loading && leads.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" /> Live Streaming...
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {leads.length > 0 && (
                            <>
                                {/* Mobile only filter button */}
                                <button
                                    onClick={filterMobilesOnly}
                                    title="Filter out landline (fixe) numbers"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition shadow-2xs"
                                >
                                    <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                                    Mobiles Only
                                </button>

                                {/* WhatsApp live verification button */}
                                <button
                                    onClick={testWhatsAppNumbers}
                                    disabled={testingWhatsApp}
                                    title="Verify whether these numbers are registered on WhatsApp"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition shadow-2xs disabled:opacity-50"
                                >
                                    {testingWhatsApp ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                                    ) : (
                                        <CheckCheck className="w-3.5 h-3.5 text-teal-600" />
                                    )}
                                    {testingWhatsApp ? "Testing WhatsApp..." : "Test WhatsApp"}
                                </button>

                                {/* Keep WhatsApp Only button (shows if test was conducted) */}
                                {leads.some(l => l.whatsappStatus !== undefined) && (
                                    <button
                                        onClick={keepWhatsAppOnly}
                                        title="Keep only numbers verified on WhatsApp"
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-xl transition shadow-2xs"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                        Keep WhatsApp Active ({leads.filter(l => l.whatsappStatus === 'active').length})
                                    </button>
                                )}

                                <button
                                    onClick={saveToContactsManager}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition shadow-2xs"
                                >
                                    <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                                    Save to Contacts
                                </button>
                                <button
                                    onClick={exportToCsv}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition shadow-2xs"
                                >
                                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                                    Export CSV
                                </button>
                                <button
                                    onClick={sendToBulkCampaign}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 rounded-xl transition shadow-sm"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Send to Bulk Sender
                                </button>
                            </>
                        )}
                    </div>
                </div>

                <div className="max-h-[420px] overflow-y-auto">
                    {loading && leads.length === 0 ? (
                        <div className="py-16 flex flex-col items-center justify-center text-gray-400 space-y-3">
                            <Loader2 className="w-9 h-9 animate-spin text-emerald-600" />
                            <p className="text-sm font-medium text-gray-700">
                                {scrapeStatus ? scrapeStatus.message : "Connecting to Google Maps & extracting leads..."}
                            </p>
                            <p className="text-xs text-gray-400 max-w-sm text-center">
                                Fetching place listings, phone numbers, and addresses in real time.
                            </p>
                        </div>
                    ) : leads.length === 0 ? (
                        <div className="py-16 text-center text-gray-400">
                            <Building2 className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                            <p className="text-sm font-medium text-gray-600">No leads extracted yet</p>
                            <p className="text-xs text-gray-400 mt-1">Enter a business keyword (e.g. Restaurants) and location above to start scraping</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50/50 sticky top-0 shadow-2xs z-10">
                                <tr>
                                    <th className="px-4 py-3 w-10 text-center"></th>
                                    <th className="px-4 py-3 font-semibold">Business Name</th>
                                    <th className="px-4 py-3 font-semibold">Phone Number</th>
                                    <th className="px-4 py-3 font-semibold">Address</th>
                                    <th className="px-4 py-3 font-semibold">Website</th>
                                    <th className="px-4 py-3 font-semibold text-center w-20">Copy</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {leads.map((lead, idx) => {
                                    const isSelected = selectedIndexes.includes(idx);
                                    return (
                                        <tr key={idx} className={`hover:bg-gray-50/70 transition-colors ${isSelected ? 'bg-emerald-50/20' : ''}`}>
                                            <td className="px-4 py-3 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={() => toggleSelectIndex(idx)}
                                                    className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-900">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate max-w-[220px]" title={lead.name}>
                                                        {lead.name}
                                                    </span>
                                                    {lead.rating && (
                                                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                                                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                                                            {lead.rating}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-mono font-semibold text-emerald-700">
                                                <div className="flex flex-col gap-1 items-start">
                                                    <span>{lead.number}</span>
                                                    <div className="flex items-center gap-1">
                                                        {lead.whatsappStatus === 'active' ? (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                                                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-700" /> WhatsApp Actif
                                                            </span>
                                                        ) : lead.whatsappStatus === 'inactive' ? (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                                                <XCircle className="w-2.5 h-2.5 text-rose-600" /> Non-WhatsApp
                                                            </span>
                                                        ) : isLandlineNumber(lead.number) ? (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                                                ☎️ Fixe
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                                                📱 Mobile
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-500 max-w-[220px] truncate" title={lead.address}>
                                                {lead.address || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-500 max-w-[150px] truncate">
                                                {lead.website ? (
                                                    <a
                                                        href={lead.website}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:underline flex items-center gap-1"
                                                    >
                                                        <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
                                                        <ExternalLink className="w-3 h-3 shrink-0" />
                                                    </a>
                                                ) : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <button
                                                    onClick={() => copyToClipboard(lead.number, idx)}
                                                    title="Copy phone number"
                                                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                                                >
                                                    {copiedIndex === idx ? (
                                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                    ) : (
                                                        <Copy className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
