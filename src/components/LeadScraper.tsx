"use client";

import React, { useState, useEffect, useMemo } from "react";
import { API_URL } from "@/lib/config";
import { formatPhoneNumber, isLandlineNumber, isMobileNumber, getPhoneType } from "@/lib/numberFormatter";
import {
    Search, MapPin, Download, Loader2, Building2, UserPlus,
    Send, CheckCircle2, Copy, ExternalLink, Star, CheckSquare, Square,
    Sparkles, Globe2, Radio, Activity, Check, AlertCircle, Smartphone,
    CheckCheck, XCircle, Phone, Filter, Mail, Layers, Compass, Globe,
    Share2, Hash
} from "lucide-react";

export interface Lead {
    name: string;
    number: string;
    email?: string;
    address?: string;
    website?: string;
    rating?: string;
    source?: string;
    phoneType?: 'mobile' | 'landline' | 'unknown';
    whatsappStatus?: 'active' | 'inactive' | 'testing';
}

interface LeadScraperProps {
    socket?: any;
    onSendToBulk?: (recipients: { number: string; name?: string; email?: string }[]) => void;
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

const SOURCE_OPTIONS = [
    { id: "all", label: "Toutes les sources (Multi-moteurs)", icon: Layers, color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
    { id: "google_maps", label: "Google Maps", icon: MapPin, color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
    { id: "bing", label: "Bing Web & Entreprises", icon: Compass, color: "text-blue-600 bg-blue-50 border-blue-200" },
    { id: "yahoo", label: "Yahoo & PagesJaunes", icon: Globe, color: "text-purple-600 bg-purple-50 border-purple-200" },
    { id: "yelp", label: "Yelp Annuaire Pro", icon: Star, color: "text-amber-600 bg-amber-50 border-amber-200" },
    { id: "social", label: "Réseaux Sociaux (FB / IG / LinkedIn)", icon: Share2, color: "text-pink-600 bg-pink-50 border-pink-200" }
];

export function LeadScraper({ socket, onSendToBulk }: LeadScraperProps) {
    const [keyword, setKeyword] = useState("");
    const [location, setLocation] = useState("");
    const [maxResults, setMaxResults] = useState(50);
    const [mobileOnly, setMobileOnly] = useState(false);
    const [source, setSource] = useState("all");
    const [extractEmails, setExtractEmails] = useState(true);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);
    const [loading, setLoading] = useState(false);
    const [testingWhatsApp, setTestingWhatsApp] = useState(false);
    const [copiedPhoneIndex, setCopiedPhoneIndex] = useState<number | null>(null);
    const [copiedEmailIndex, setCopiedEmailIndex] = useState<number | null>(null);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatus | null>(null);
    const [viewFilter, setViewFilter] = useState<'all' | 'emails' | 'mobiles' | 'whatsapp'>('all');
    const [scraperConfig, setScraperConfig] = useState<{
        mode: string;
        serperApiKey?: string;
        serpApiKey?: string;
        googlePlacesApiKey?: string;
    } | null>(null);

    useEffect(() => {
        fetch(`${API_URL}/api/integrations/settings`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.settings?.scraper) {
                    setScraperConfig(data.settings.scraper);
                }
            })
            .catch(() => {});
    }, []);

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
            if (!data.lead) return;
            const hasPhone = !!data.lead.number;
            const hasEmail = !!data.lead.email;
            if (!hasPhone && !hasEmail) return;

            let formatted = "";
            let pType: 'mobile' | 'landline' | 'unknown' = 'unknown';

            if (hasPhone) {
                formatted = formatPhoneNumber(data.lead.number);
                pType = data.lead.phoneType || getPhoneType(formatted);

                // Skip landlines if mobileOnly option is on AND lead has no email
                if (mobileOnly && (pType === "landline" || isLandlineNumber(formatted)) && !hasEmail) {
                    return;
                }
            }

            const normalizedLead: Lead = {
                ...data.lead,
                number: formatted || data.lead.number || "",
                phoneType: pType,
                email: data.lead.email || ""
            };

            setLeads(prev => {
                const exists = prev.some(l => 
                    (normalizedLead.number && l.number === normalizedLead.number) ||
                    (normalizedLead.email && l.email && l.email.toLowerCase() === normalizedLead.email.toLowerCase())
                );
                if (exists) return prev;
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
            setStatus({ type: 'error', message: "Veuillez préciser le mot-clé d'activité et la ville/localisation." });
            return;
        }

        setLoading(true);
        setStatus(null);
        setLeads([]);
        setSelectedIndexes([]);
        setScrapeStatus({
            step: "init",
            message: `Lancement de la recherche pour "${keyword}" à "${location}" (Cible: ${maxResults} leads via ${source.toUpperCase()})...`,
            progress: 5,
            current: 0,
            total: maxResults,
            mode: source
        });

        try {
            const res = await fetch(`${API_URL}/api/scrape-leads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    keyword: keyword.trim(),
                    location: location.trim(),
                    maxResults: Number(maxResults) || 50,
                    mobileOnly,
                    source,
                    extractEmails
                })
            });

            const data = await res.json();

            if (res.ok && data.success) {
                let fetchedLeads: Lead[] = (data.leads || []).map((l: any) => {
                    const formatted = l.number ? formatPhoneNumber(l.number) : "";
                    return {
                        ...l,
                        number: formatted,
                        email: l.email || "",
                        phoneType: l.phoneType || (formatted ? getPhoneType(formatted) : 'unknown')
                    };
                });

                if (mobileOnly) {
                    fetchedLeads = fetchedLeads.filter(l => !l.number || !isLandlineNumber(l.number) || l.email);
                }

                setLeads(fetchedLeads);
                setSelectedIndexes(fetchedLeads.map((_, i) => i));

                const emailCount = fetchedLeads.filter(l => l.email).length;
                const mobileCount = fetchedLeads.filter(l => l.number && !isLandlineNumber(l.number)).length;

                if (fetchedLeads.length === 0) {
                    setStatus({
                        type: 'error',
                        message: "Aucun prospect trouvé. Essayez d'élargir votre mot-clé, choisissez 'Toutes les sources' ou désactivez le filtre 'Smartphones uniquement'."
                    });
                } else {
                    setStatus({
                        type: 'success',
                        message: `Extraction réussie : ${fetchedLeads.length} prospects qualifiés trouvés (${mobileCount} mobiles, ${emailCount} adresses email vérifiées) !`
                    });
                }
            } else {
                setStatus({ type: 'error', message: data.error || data.details || "Échec de la recherche de leads." });
            }
        } catch (err: any) {
            setStatus({ type: 'error', message: "Impossible de contacter le serveur scraper. Vérifiez que le backend est bien en cours d'exécution." });
        } finally {
            setLoading(false);
        }
    };

    // Filter leads based on current view filter
    const displayedLeads = useMemo(() => {
        if (viewFilter === 'emails') {
            return leads.filter(l => !!l.email);
        }
        if (viewFilter === 'mobiles') {
            return leads.filter(l => l.number && !isLandlineNumber(l.number));
        }
        if (viewFilter === 'whatsapp') {
            return leads.filter(l => l.whatsappStatus === 'active');
        }
        return leads;
    }, [leads, viewFilter]);

    // Test numbers directly on WhatsApp Web via backend API
    const testWhatsAppNumbers = async () => {
        const numbersToTest = leads.filter(l => l.number && l.number.length >= 8).map(l => l.number);
        if (numbersToTest.length === 0) return;

        setTestingWhatsApp(true);
        setStatus({
            type: 'success',
            message: `Vérification de ${numbersToTest.length} numéros en direct sur WhatsApp Web...`
        });

        try {
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
                        message: "WhatsApp Web n'est pas connecté. Scannez le QR Code dans l'onglet 'Connect WhatsApp' pour tester en direct."
                    });
                    return;
                }

                const statusMap = new Map<string, { isWhatsApp: boolean; type: string }>();
                (data.results || []).forEach((r: any) => {
                    statusMap.set(r.number, { isWhatsApp: r.isWhatsApp, type: r.type });
                });

                setLeads(prev => prev.map(l => {
                    const check = statusMap.get(l.number);
                    if (!check) return l;
                    return {
                        ...l,
                        phoneType: (check.type as any) || l.phoneType,
                        whatsappStatus: check.isWhatsApp ? 'active' : 'inactive'
                    };
                }));

                setStatus({
                    type: 'success',
                    message: `Test WhatsApp terminé : ${data.whatsappCount} numéros actifs sur WhatsApp sur ${data.total} testés !`
                });
            } else {
                setStatus({ type: 'error', message: data.error || "Échec de la vérification WhatsApp." });
            }
        } catch (err: any) {
            setStatus({ type: 'error', message: "Erreur lors du test WhatsApp : " + err.message });
        } finally {
            setTestingWhatsApp(false);
        }
    };

    const toggleSelectAll = () => {
        if (selectedIndexes.length === displayedLeads.length) {
            setSelectedIndexes([]);
        } else {
            setSelectedIndexes(displayedLeads.map((_, i) => i));
        }
    };

    const toggleSelectIndex = (idx: number) => {
        setSelectedIndexes(prev =>
            prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
        );
    };

    const copyPhoneToClipboard = (text: string, idx: number) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedPhoneIndex(idx);
        setTimeout(() => setCopiedPhoneIndex(null), 2000);
    };

    const copyEmailToClipboard = (text: string, idx: number) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedEmailIndex(idx);
        setTimeout(() => setCopiedEmailIndex(null), 2000);
    };

    const exportToCsv = () => {
        const toExport = selectedIndexes.length > 0
            ? displayedLeads.filter((_, i) => selectedIndexes.includes(i))
            : displayedLeads;

        if (toExport.length === 0) return;

        const headers = ["Name", "Phone Number", "Email", "Address", "Website", "Rating", "Source"];
        const rows = toExport.map(l => [
            `"${(l.name || "").replace(/"/g, '""')}"`,
            `"${(l.number || "").replace(/"/g, '""')}"`,
            `"${(l.email || "").replace(/"/g, '""')}"`,
            `"${(l.address || "").replace(/"/g, '""')}"`,
            `"${(l.website || "").replace(/"/g, '""')}"`,
            `"${(l.rating || "").replace(/"/g, '""')}"`,
            `"${(l.source || "").replace(/"/g, '""')}"`
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
        const toExport = selectedIndexes.length > 0
            ? displayedLeads.filter((_, i) => selectedIndexes.includes(i))
            : displayedLeads;

        if (toExport.length === 0) return;

        try {
            const raw = localStorage.getItem("whatsapp_contacts");
            const existing = raw ? JSON.parse(raw) : [];
            const existingNumbers = new Set(existing.map((c: any) => c.number));

            let addedCount = 0;
            const updated = [...existing];
            toExport.forEach(l => {
                if (l.number && !existingNumbers.has(l.number)) {
                    existingNumbers.add(l.number);
                    updated.push({
                        name: l.name || "Lead",
                        number: l.number,
                        email: l.email || ""
                    });
                    addedCount++;
                }
            });

            localStorage.setItem("whatsapp_contacts", JSON.stringify(updated));
            setStatus({
                type: 'success',
                message: `${addedCount} nouveau(x) contact(s) sauvegardé(s) dans le Carnet d'adresses !`
            });
        } catch (_) {
            setStatus({ type: 'error', message: "Échec de l'enregistrement dans les contacts locaux." });
        }
    };

    const sendToBulkCampaign = () => {
        const toExport = selectedIndexes.length > 0
            ? displayedLeads.filter((_, i) => selectedIndexes.includes(i))
            : displayedLeads;

        if (toExport.length === 0) return;

        const recipients = toExport
            .filter(l => l.number && l.number.length >= 6)
            .map(l => ({
                number: l.number,
                name: l.name || "",
                email: l.email || ""
            }));

        localStorage.setItem("bulk_imported_recipients", JSON.stringify(recipients));

        if (onSendToBulk) {
            onSendToBulk(recipients);
        } else {
            setStatus({
                type: 'success',
                message: `${recipients.length} prospects préparés pour la Campagne en Masse ! Ouvrez l'onglet Messages en masse.`
            });
        }
    };

    const emailCountTotal = leads.filter(l => !!l.email).length;
    const mobileCountTotal = leads.filter(l => l.number && !isLandlineNumber(l.number)).length;
    const waActiveCountTotal = leads.filter(l => l.whatsappStatus === 'active').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-600 to-indigo-600 flex items-center justify-center text-white shadow-sm">
                            <Layers className="w-5 h-5" />
                        </div>
                        Générateur de Leads Multi-Sources Pro
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Extraction massive de prospects B2B : Noms, Téléphones, Emails, Adresses et Réseaux Sociaux (Google Maps, Bing, Yahoo, Yelp, Facebook, LinkedIn)
                    </p>
                </div>

                {/* Sources badges */}
                <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Sources actives :</span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <MapPin className="w-3 h-3" /> Maps
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                        <Compass className="w-3 h-3" /> Bing
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                        <Globe className="w-3 h-3" /> Yahoo
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                        <Star className="w-3 h-3" /> Yelp
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-pink-50 text-pink-700 border border-pink-200">
                        <Share2 className="w-3 h-3" /> Social
                    </span>
                </div>
            </div>

            {/* Search Form Card */}
            <div className="bg-gray-50/80 border border-gray-200/90 rounded-2xl p-5 shadow-2xs">
                <form onSubmit={handleSearch} className="space-y-4">
                    {/* Top Inputs: Keyword, Location, Target */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                        <div className="sm:col-span-4 relative">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Activité / Mot-Clé
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="ex: Dentiste, Restaurant, Plombier, Agence Web..."
                                    value={keyword}
                                    onChange={(e) => setKeyword(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-gray-900 shadow-2xs"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="sm:col-span-3 relative">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Ville / Localisation
                            </label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="ex: Paris, Casablanca, Lyon, Bruxelles..."
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-gray-900 shadow-2xs"
                                    disabled={loading}
                                />
                            </div>
                        </div>

                        <div className="sm:col-span-3">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Source de Recherche
                            </label>
                            <select
                                value={source}
                                onChange={(e) => setSource(e.target.value)}
                                disabled={loading}
                                className="w-full py-2.5 px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-gray-900 shadow-2xs font-medium"
                            >
                                <option value="all">🌐 Toutes les sources (Combiné)</option>
                                <option value="google_maps">📍 Google Maps</option>
                                <option value="bing">🔎 Bing Web & Entreprises</option>
                                <option value="yahoo">🟪 Yahoo & PagesJaunes</option>
                                <option value="yelp">⭐ Yelp Annuaire Pro</option>
                                <option value="social">📱 Réseaux Sociaux (FB / IG / LinkedIn)</option>
                            </select>
                        </div>

                        <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-gray-700 mb-1">
                                Objectif Leads
                            </label>
                            <select
                                value={maxResults}
                                onChange={(e) => setMaxResults(Number(e.target.value))}
                                disabled={loading}
                                className="w-full py-2.5 px-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-gray-900 shadow-2xs font-semibold text-emerald-700"
                            >
                                <option value={10}>10 Leads</option>
                                <option value={25}>25 Leads</option>
                                <option value={50}>50 Leads</option>
                                <option value={100}>100 Leads</option>
                                <option value={200}>200 Leads</option>
                                <option value={500}>500 Leads</option>
                            </select>
                        </div>
                    </div>

                    {/* Options Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-200/60">
                        <div className="flex flex-wrap items-center gap-3">
                            {/* Phone filter toggle */}
                            <label className="inline-flex items-center gap-2 cursor-pointer bg-white px-3 py-2 border border-gray-200 rounded-xl hover:border-emerald-400 transition shadow-2xs">
                                <input
                                    type="checkbox"
                                    checked={mobileOnly}
                                    onChange={(e) => setMobileOnly(e.target.checked)}
                                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                                />
                                <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                    <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>Mobiles WhatsApp uniquement (06/07)</span>
                                </span>
                            </label>

                            {/* Email extraction toggle */}
                            <label className="inline-flex items-center gap-2 cursor-pointer bg-white px-3 py-2 border border-gray-200 rounded-xl hover:border-indigo-400 transition shadow-2xs">
                                <input
                                    type="checkbox"
                                    checked={extractEmails}
                                    onChange={(e) => setExtractEmails(e.target.checked)}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                />
                                <span className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                                    <Mail className="w-3.5 h-3.5 text-indigo-600" />
                                    <span>Extraire automatiquement les emails</span>
                                </span>
                            </label>

                            {!mobileOnly && (
                                <span className="text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg font-medium">
                                    ✨ Mode Large : Récupère tous les contacts professionnels (fixes + mobiles)
                                </span>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !keyword.trim() || !location.trim()}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:from-emerald-700 hover:to-indigo-700 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>Extraction en cours...</span>
                                </>
                            ) : (
                                <>
                                    <Search className="w-4 h-4" />
                                    <span>Lancer la Recherche Multi-Sources</span>
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
                <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 p-4 rounded-2xl border border-emerald-200/80 shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                            </span>
                            <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                                <Radio className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                                Statut de Recherche :
                                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold">
                                    {scrapeStatus.step.toUpperCase()}
                                </span>
                            </span>
                        </div>
                        <div className="flex items-center gap-3">
                            {scrapeStatus.currentBusiness && (
                                <span className="text-xs text-emerald-700 font-medium truncate max-w-[220px] hidden sm:inline" title={scrapeStatus.currentBusiness}>
                                    Cible : <strong>{scrapeStatus.currentBusiness}</strong>
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
                            className="bg-gradient-to-r from-emerald-600 via-teal-500 to-indigo-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(Math.max(scrapeStatus.progress || 5, 5), 100)}%` }}
                        />
                    </div>

                    <div className="flex items-center justify-between text-xs text-emerald-800">
                        <div className="flex items-center gap-1.5 truncate max-w-md">
                            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" /> : <Activity className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                            <span className="truncate">{scrapeStatus.message}</span>
                        </div>
                        <span className="font-semibold text-emerald-900 shrink-0 ml-2">
                            {leads.length} / {maxResults} Leads Découverts
                        </span>
                    </div>
                </div>
            )}

            {/* Results Table Card */}
            <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                {/* Control bar */}
                <div className="bg-gray-50/90 px-5 py-3.5 border-b border-gray-200 flex flex-wrap gap-3 justify-between items-center">
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            onClick={toggleSelectAll}
                            disabled={displayedLeads.length === 0}
                            className="text-xs font-semibold text-gray-700 hover:text-emerald-600 flex items-center gap-1.5 disabled:opacity-40"
                        >
                            {selectedIndexes.length === displayedLeads.length && displayedLeads.length > 0 ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                                <Square className="w-4 h-4 text-gray-400" />
                            )}
                            <span>{selectedIndexes.length} / {displayedLeads.length} Sélectionnés</span>
                        </button>

                        {/* View Filter Pills */}
                        {leads.length > 0 && (
                            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-200 text-xs">
                                <button
                                    onClick={() => setViewFilter('all')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold transition ${
                                        viewFilter === 'all'
                                            ? 'bg-emerald-600 text-white shadow-xs'
                                            : 'text-gray-600 hover:text-gray-900'
                                    }`}
                                >
                                    Tous ({leads.length})
                                </button>
                                <button
                                    onClick={() => setViewFilter('emails')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 ${
                                        viewFilter === 'emails'
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'text-gray-600 hover:text-indigo-600'
                                    }`}
                                >
                                    <Mail className="w-3 h-3" /> Emails ({emailCountTotal})
                                </button>
                                <button
                                    onClick={() => setViewFilter('mobiles')}
                                    className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 ${
                                        viewFilter === 'mobiles'
                                            ? 'bg-teal-600 text-white shadow-xs'
                                            : 'text-gray-600 hover:text-teal-600'
                                    }`}
                                >
                                    <Smartphone className="w-3 h-3" /> Mobiles ({mobileCountTotal})
                                </button>
                                {waActiveCountTotal > 0 && (
                                    <button
                                        onClick={() => setViewFilter('whatsapp')}
                                        className={`px-2.5 py-1 rounded-lg font-semibold transition flex items-center gap-1 ${
                                            viewFilter === 'whatsapp'
                                                ? 'bg-green-600 text-white shadow-xs'
                                                : 'text-gray-600 hover:text-green-600'
                                        }`}
                                    >
                                        <CheckCheck className="w-3 h-3" /> WhatsApp ({waActiveCountTotal})
                                    </button>
                                )}
                            </div>
                        )}

                        {loading && leads.length > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" /> Récupération en direct...
                            </span>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {leads.length > 0 && (
                            <>
                                {/* WhatsApp live verification button */}
                                <button
                                    onClick={testWhatsAppNumbers}
                                    disabled={testingWhatsApp}
                                    title="Tester la validité des numéros sur WhatsApp"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-xl transition shadow-2xs disabled:opacity-50"
                                >
                                    {testingWhatsApp ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                                    ) : (
                                        <CheckCheck className="w-3.5 h-3.5 text-teal-600" />
                                    )}
                                    {testingWhatsApp ? "Test WhatsApp..." : "Tester WhatsApp"}
                                </button>

                                <button
                                    onClick={saveToContactsManager}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition shadow-2xs"
                                >
                                    <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                                    Enregistrer Contacts
                                </button>
                                <button
                                    onClick={exportToCsv}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition shadow-2xs"
                                >
                                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                                    Exporter CSV
                                </button>
                                <button
                                    onClick={sendToBulkCampaign}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-95 rounded-xl transition shadow-sm"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    Campagne en Masse
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* Table container */}
                <div className="max-h-[480px] overflow-y-auto">
                    {loading && leads.length === 0 ? (
                        <div className="py-20 flex flex-col items-center justify-center text-gray-400 space-y-3">
                            <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
                            <p className="text-sm font-semibold text-gray-800">
                                {scrapeStatus ? scrapeStatus.message : "Connexion aux moteurs de recherche & extraction..."}
                            </p>
                            <p className="text-xs text-gray-400 max-w-md text-center">
                                Récupération en direct des fiches, numéros de téléphone et adresses emails depuis {source === 'all' ? 'Google Maps, Bing, Yahoo, Yelp et Réseaux Sociaux' : source}...
                            </p>
                        </div>
                    ) : displayedLeads.length === 0 ? (
                        <div className="py-20 text-center text-gray-400">
                            <Building2 className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                            <p className="text-sm font-semibold text-gray-700">Aucun prospect affiché</p>
                            <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                                {leads.length > 0
                                    ? "Aucun prospect ne correspond au filtre actif (ex. filtre email ou mobile)."
                                    : "Indiquez votre activité et votre ville ci-dessus pour lancer la prospection."}
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50/80 sticky top-0 shadow-2xs z-10">
                                <tr>
                                    <th className="px-4 py-3 w-10 text-center"></th>
                                    <th className="px-4 py-3 font-semibold">Entreprise / Nom</th>
                                    <th className="px-4 py-3 font-semibold">Téléphone</th>
                                    <th className="px-4 py-3 font-semibold">Email</th>
                                    <th className="px-4 py-3 font-semibold">Source</th>
                                    <th className="px-4 py-3 font-semibold">Adresse</th>
                                    <th className="px-4 py-3 font-semibold">Site Web</th>
                                    <th className="px-4 py-3 font-semibold text-center w-16">Copie</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {displayedLeads.map((lead, idx) => {
                                    const isSelected = selectedIndexes.includes(idx);
                                    const srcLower = (lead.source || "").toLowerCase();

                                    let badgeColor = "bg-gray-100 text-gray-700 border-gray-200";
                                    if (srcLower.includes("maps")) badgeColor = "bg-emerald-50 text-emerald-700 border-emerald-200";
                                    else if (srcLower.includes("bing")) badgeColor = "bg-blue-50 text-blue-700 border-blue-200";
                                    else if (srcLower.includes("yahoo")) badgeColor = "bg-purple-50 text-purple-700 border-purple-200";
                                    else if (srcLower.includes("yelp")) badgeColor = "bg-amber-50 text-amber-700 border-amber-200";
                                    else if (srcLower.includes("facebook")) badgeColor = "bg-sky-50 text-sky-700 border-sky-200";
                                    else if (srcLower.includes("instagram")) badgeColor = "bg-pink-50 text-pink-700 border-pink-200";
                                    else if (srcLower.includes("linkedin")) badgeColor = "bg-cyan-50 text-cyan-700 border-cyan-200";

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
                                                    <span className="truncate max-w-[200px]" title={lead.name}>
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
                                                {lead.number ? (
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
                                                ) : (
                                                    <span className="text-gray-300 text-xs italic">Sans numéro</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                {lead.email ? (
                                                    <div className="flex items-center gap-1.5 max-w-[210px]">
                                                        <a
                                                            href={`mailto:${lead.email}`}
                                                            className="text-indigo-600 hover:underline font-mono truncate"
                                                            title={lead.email}
                                                        >
                                                            {lead.email}
                                                        </a>
                                                        <button
                                                            onClick={() => copyEmailToClipboard(lead.email!, idx)}
                                                            title="Copier l'email"
                                                            className="p-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition shrink-0"
                                                        >
                                                            {copiedEmailIndex === idx ? (
                                                                <Check className="w-3 h-3 text-emerald-600" />
                                                            ) : (
                                                                <Copy className="w-3 h-3" />
                                                            )}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-300 italic">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${badgeColor}`}>
                                                    {lead.source || "Web"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-500 max-w-[180px] truncate" title={lead.address}>
                                                {lead.address || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-500 max-w-[130px] truncate">
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
                                                {lead.number ? (
                                                    <button
                                                        onClick={() => copyPhoneToClipboard(lead.number, idx)}
                                                        title="Copier le numéro de téléphone"
                                                        className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                                                    >
                                                        {copiedPhoneIndex === idx ? (
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                                        ) : (
                                                            <Copy className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                ) : "—"}
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
