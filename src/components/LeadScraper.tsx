"use client";

import React, { useState } from "react";
import { API_URL } from "@/lib/config";
import { Search, MapPin, Download, Loader2, Building2, UserPlus } from "lucide-react";

interface Lead {
    name: string;
    number: string;
    email?: string;
    address?: string;
    isSaved?: boolean;
}

export function LeadScraper() {
    const [keyword, setKeyword] = useState("");
    const [location, setLocation] = useState("");
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!keyword || !location) {
            setStatus({ type: 'error', message: "Please provide both keyword and location" });
            return;
        }

        setLoading(true);
        setStatus(null);
        setLeads([]);

        try {
            const res = await fetch(`${API_URL}/api/scrape-leads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyword, location })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                setLeads(data.leads || []);
                if (data.leads?.length === 0) {
                    setStatus({ type: 'error', message: "No phone numbers found for this search" });
                } else {
                    setStatus({ type: 'success', message: `Found ${data.leads.length} potential leads` });
                }
            } else {
                setStatus({ type: 'error', message: data.error || "Failed to search for leads" });
            }
        } catch (err) {
            setStatus({ type: 'error', message: "Could not connect to backend scraper" });
        } finally {
            setLoading(false);
        }
    };

    const exportToCsv = () => {
        if (leads.length === 0) return;

        const headers = ["Number", "Name", "Email", "Address"];
        const rows = leads.map(l => [
            l.number || "",
            l.name ? `"${l.name.replace(/"/g, '""')}"` : "",
            l.email ? `"${l.email.replace(/"/g, '""')}"` : "",
            l.address ? `"${l.address.replace(/"/g, '""')}"` : ""
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(e => e.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${keyword}_${location}_leads.csv`.replace(/[^a-z0-9_.]/gi, '_').toLowerCase());
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    <Building2 className="w-6 h-6 text-[#00a884]" />
                    Web Leads Scraper
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    Find business phone numbers from the web to build your contact list
                </p>
            </div>

            <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Business type (e.g. Restaurants, Plumbers)"
                        value={keyword}
                        onChange={(e) => setKeyword(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 focus:border-[#00a884] text-sm text-gray-900"
                        disabled={loading}
                    />
                </div>
                <div className="flex-1 relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Location (e.g. Paris, New York)"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 focus:border-[#00a884] text-sm text-gray-900"
                        disabled={loading}
                    />
                </div>
                <button
                    type="submit"
                    disabled={loading || !keyword || !location}
                    className="flex justify-center items-center gap-2 px-6 py-2.5 bg-[#00a884] hover:bg-[#008f6f] text-white font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                    {loading ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Scraping...
                        </>
                    ) : (
                        <>
                            <Search className="w-4 h-4" />
                            Search
                        </>
                    )}
                </button>
            </form>

            {status && (
                <div className={`mb-6 p-3 rounded-lg text-sm border relative ${status.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {status.message}
                    {status.type === 'error' && (
                        <button onClick={() => setStatus(null)} className="absolute right-3 top-3 opacity-50 hover:opacity-100">✕</button>
                    )}
                </div>
            )}

            <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="font-medium text-gray-700 text-sm">Extracted Numbers</h3>
                    {leads.length > 0 && (
                        <button
                            onClick={exportToCsv}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#00a884] bg-[#00a884]/10 hover:bg-[#00a884]/20 rounded transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export CSV
                        </button>
                    )}
                </div>

                <div className="max-h-[350px] overflow-y-auto">
                    {loading ? (
                        <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                            <Loader2 className="w-8 h-8 animate-spin text-[#00a884] mb-4" />
                            <p className="text-sm">Scraping search results for phone numbers...</p>
                            <p className="text-xs mt-2 max-w-sm text-center">This can take up to 20 seconds. We're launching an invisible browser to find the best results.</p>
                        </div>
                    ) : leads.length === 0 ? (
                        <div className="py-12 text-center text-gray-500">
                            <p>No leads extracted yet. Try searching above.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-white sticky top-0 shadow-sm z-10">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Source / Name</th>
                                    <th className="px-4 py-3 font-medium">Phone Number</th>
                                    <th className="px-4 py-3 font-medium">Email</th>
                                    <th className="px-4 py-3 font-medium">Address</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {leads.map((lead, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3 text-gray-800">
                                            <div className="flex items-center gap-2">
                                                <UserPlus className="w-4 h-4 text-gray-400" />
                                                <span className="truncate max-w-[200px]" title={lead.name}>{lead.name}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900">
                                            {lead.number}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600 truncate max-w-[150px]" title={lead.email}>
                                            {lead.email || "-"}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]" title={lead.address}>
                                            {lead.address || "-"}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div className="mt-4 text-xs text-gray-400">
                <p><strong>Note:</strong> The quality of scraped data depends on search engine results and formatted numbers on websites. Verify numbers before sending campaigns.</p>
            </div>
        </div>
    );
}
