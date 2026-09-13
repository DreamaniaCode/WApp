"use client";

import React, { useState, useEffect } from "react";
import { Lock, Key, CheckCircle, AlertCircle, RefreshCw, Cpu, Globe, ExternalLink, Check } from "lucide-react";
import { API_URL } from "@/lib/config";
import { useLanguage } from "@/contexts/LanguageContext";

interface LicenseScreenProps {
    onActivated: () => void;
}

const UI_TEXT = {
    en: {
        title: "Activation Required",
        sub: "Please enter your license key to activate WApp Manager Leads Pro.",
        device: "Device Identity (Machine ID)",
        copy: "Copy ID",
        copied: "Copied!",
        placeholder: "WAPP-XXXX-XXXX-XXXX",
        activate: "Activate Now",
        activating: "Verifying License...",
        noCode: "Don't have a license key?",
        support: "Contact Support on WhatsApp",
        waMsg: "Hello DreamaniaCode, I want to activate WApp Manager Leads Pro. My Machine ID is: "
    },
    fr: {
        title: "Activation Requise",
        sub: "Veuillez saisir votre clé de licence pour activer WApp Manager Leads Pro.",
        device: "Identifiant Appareil (Machine ID)",
        copy: "Copier l'ID",
        copied: "Copié !",
        placeholder: "WAPP-XXXX-XXXX-XXXX",
        activate: "Activer Maintenant",
        activating: "Vérification de la Licence...",
        noCode: "Vous n'avez pas de clé ?",
        support: "Contacter le Support sur WhatsApp",
        waMsg: "Bonjour DreamaniaCode, je souhaite activer WApp Manager Leads Pro. Mon Machine ID est : "
    },
    ar: {
        title: "تفعيل البرنامج مطلوب",
        sub: "يرجى إدخال مفتاح الترخيص لتفعيل برنامج WApp Manager Leads Pro.",
        device: "معرّف الجهاز (Machine ID)",
        copy: "نسخ المعرّف",
        copied: "تم النسخ!",
        placeholder: "WAPP-XXXX-XXXX-XXXX",
        activate: "تفعيل الترخيص الآن",
        activating: "جاري التحقق من المفتاح...",
        noCode: "ليس لديك مفتاح ترخيص؟",
        support: "تواصل مع الدعم عبر واتساب",
        waMsg: "مرحباً DreamaniaCode، أريد تفعيل برنامج WApp Manager Leads Pro. معرّف جهازي هو: "
    }
};

export function LicenseScreen({ onActivated }: LicenseScreenProps) {
    const { language, setLanguage } = useLanguage();
    const currentLang = (language === "fr" || language === "ar") ? language : "en";
    const text = UI_TEXT[currentLang];

    const [code, setCode] = useState("");
    const [status, setStatus] = useState<{
        machineId: string;
        license: any;
        isActivated: boolean;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isActivating, setIsActivating] = useState(false);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        fetchStatus();
    }, []);

    const fetchStatus = async (retries = 5) => {
        try {
            const res = await fetch(`${API_URL}/api/license-status`);
            if (!res.ok) throw new Error("Server error");
            const data = await res.json();
            setStatus(data);
            setIsLoading(false);
            setError("");
            if (data.isActivated) {
                onActivated();
            }
        } catch (err) {
            if (retries > 0) {
                setError(`Connecting to backend... (${retries} retries left)`);
                setTimeout(() => fetchStatus(retries - 1), 2000);
            } else {
                setError("Failed to connect to backend service. Please check if the application is running.");
                setIsLoading(false);
            }
        }
    };

    const handleCopy = () => {
        if (!status?.machineId) return;
        navigator.clipboard.writeText(status.machineId);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim()) return;

        setIsActivating(true);
        setError("");

        try {
            const res = await fetch(`${API_URL}/api/activate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: code.trim() })
            });
            const data = await res.json();

            if (data.success) {
                onActivated();
            } else {
                setError(data.error || "Invalid activation code. Please contact support.");
            }
        } catch (err) {
            setError("Connection error. Please check your network connection.");
        } finally {
            setIsActivating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#060911] flex flex-col items-center justify-center text-white font-sans">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mb-4" />
                <p className="text-xs text-gray-400 font-medium tracking-wide">Checking License Status...</p>
            </div>
        );
    }

    const waLink = `https://wa.me/212707031614?text=${encodeURIComponent(text.waMsg + (status?.machineId || ""))}`;

    return (
        <div className="min-h-screen bg-[#060911] flex items-center justify-center p-4 relative overflow-hidden text-white font-sans" dir={currentLang === "ar" ? "rtl" : "ltr"}>
            {/* Background ambient orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Language switcher */}
            <div className={`absolute top-6 ${currentLang === "ar" ? "left-6" : "right-6"} bg-white/5 border border-white/10 rounded-2xl flex gap-1 p-1.5 backdrop-blur-md z-20`}>
                <Globe className="w-4 h-4 text-slate-400 m-1.5" />
                {(['en', 'fr', 'ar'] as const).map(lang => (
                    <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`px-3 py-1.5 text-xs rounded-xl font-medium transition-all ${language === lang
                            ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/30'
                            : 'text-slate-400 hover:text-white'
                            }`}
                    >
                        {lang.toUpperCase()}
                    </button>
                ))}
            </div>

            <div className="bg-[#0e1626] border border-white/10 rounded-3xl p-8 sm:p-10 w-full max-w-md shadow-2xl relative z-10 animate-in zoom-in-95 duration-200">
                <div className="flex flex-col items-center mb-8 text-center">
                    <div className="relative mb-4">
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl blur-xl animate-pulse" />
                        <div className="w-18 h-18 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl flex items-center justify-center relative z-10 p-3 shadow-lg shadow-emerald-500/20">
                            <Lock className="w-9 h-9 text-emerald-400" />
                        </div>
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
                        <span>🔒 DreamaniaCode Security</span>
                    </div>
                    <h1 className="text-2xl font-black text-white tracking-tight">{text.title}</h1>
                    <p className="text-slate-400 text-xs mt-1.5 leading-relaxed">{text.sub}</p>
                </div>

                {/* Device Machine ID Box */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 relative overflow-hidden group">
                    <div className="flex items-center gap-2 mb-2">
                        <Cpu className="w-4 h-4 text-emerald-400" />
                        <span className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{text.device}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-[#070b14] px-3.5 py-2.5 rounded-xl border border-white/5">
                        <code className="text-sm font-mono text-emerald-400 font-black tracking-wider select-all truncate">{status?.machineId || "DETECTING..."}</code>
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-emerald-400 transition-colors font-bold shrink-0"
                        >
                            {copied ? (
                                <>
                                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    <span className="text-emerald-400">{text.copied}</span>
                                </>
                            ) : (
                                <span>{text.copy}</span>
                            )}
                        </button>
                    </div>
                </div>

                <form onSubmit={handleActivate} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                            License Activation Key
                        </label>
                        <div className="relative">
                            <Key className={`w-4 h-4 absolute ${currentLang === "ar" ? "right-4" : "left-4"} top-1/2 -translate-y-1/2 transition-colors ${error ? 'text-red-400' : 'text-slate-500'}`} />
                            <input
                                type="text"
                                placeholder={text.placeholder}
                                className={`w-full ${currentLang === "ar" ? "pr-11 pl-4" : "pl-11 pr-4"} py-3.5 bg-[#070b14] border rounded-xl text-sm font-mono tracking-widest text-white placeholder-gray-600 focus:outline-none transition ${error
                                    ? 'border-red-500/50 bg-red-500/5 focus:border-red-500/70'
                                    : 'border-white/10 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                                    }`}
                                value={code}
                                onChange={(e) => setCode(e.target.value.toUpperCase())}
                                autoFocus
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2.5 text-red-400 text-xs bg-red-500/10 border border-red-500/20 p-3 rounded-xl animate-in fade-in">
                            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span className="leading-relaxed">{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isActivating || !code.trim()}
                        className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition transform hover:-translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none"
                    >
                        {isActivating ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                <span>{text.activating}</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                <span>{text.activate}</span>
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-white/5 text-center">
                    <p className="text-xs text-slate-400 font-medium tracking-wide">
                        {text.noCode}{" "}
                        <a
                            href={waLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 transition-colors font-bold inline-flex items-center gap-1 ml-1"
                        >
                            {text.support} <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
