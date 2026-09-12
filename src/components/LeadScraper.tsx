"use client";

import React, { useState } from "react";
import { API_URL } from "@/lib/config";
import {
    Search, MapPin, Download, Loader2, Building2, UserPlus,
    Send, CheckCircle2, Copy, ExternalLink, Star, CheckSquare, Square,
    Sparkles
} from "lucide-react";

export interface Lead {
    name: string;
    number: string;
    address?: string;
    website?: string;
    rating?: string;
    source?: string;
}

interface LeadScraperProps {
    onSendToBulk?: (recipients: { number: string; name?: string }[]) => void;
}

export function LeadScraper({ onSendToBulk }: LeadScraperProps) {
    const [keyword, setKeyword] = useState("");
    const [location, setLocation] = useState("");
    const [maxResults, setMaxResults] = useState(25);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

        try {
            const res = await fetch(`${API_URL}/api/scrape-leads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    keyword: keyword.trim(),
                    location: location.trim(),
                    maxResults: Number(maxResults) || 25
                })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                const fetchedLeads: Lead[] = data.leads || [];
                setLeads(fetchedLeads);
                // Select all by default
                setSelectedIndexes(fetchedLeads.map((_, i) => i));

                if (fetchedLeads.length === 0) {
                    setStatus({
                        type: 'error',
                        message: "No leads with phone numbers found. Try broadening your keyword or location."
                    });
                } else {
                    setStatus({
                        type: 'success',
                        message: `Successfully extracted ${fetchedLeads.length} business leads with verified phone numbers!`
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

                    <div className="flex items-center justify-between pt-2">
                        <div className="text-xs text-gray-500 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>Extracts business name, phone number, address, and website details</span>
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
                        {status.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : null}
                        <span>{status.message}</span>
                    </div>
                    <button onClick={() => setStatus(null)} className="text-xs opacity-60 hover:opacity-100 font-bold px-1">✕</button>
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
                    </div>

                    <div className="flex items-center gap-2">
                        {leads.length > 0 && (
                            <>
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
                    {loading ? (
                        <div className="py-16 flex flex-col items-center justify-center text-gray-400 space-y-3">
                            <Loader2 className="w-9 h-9 animate-spin text-emerald-600" />
                            <p className="text-sm font-medium text-gray-700">Connecting to Google Maps & extracting leads...</p>
                            <p className="text-xs text-gray-400 max-w-sm text-center">
                                Fetching place listings, phone numbers, and addresses. This may take 15 to 30 seconds.
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
                                                {lead.number}
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
