"use client";

import React, { useState, useEffect } from "react";
import { Lock, Key, CheckCircle, AlertCircle, RefreshCw, Cpu, Globe, ExternalLink } from "lucide-react";
import { API_URL } from "@/lib/config";
import { useLanguage } from "@/contexts/LanguageContext";

interface LicenseScreenProps {
    onActivated: () => void;
}

export function LicenseScreen({ onActivated }: LicenseScreenProps) {
    const { t, language, setLanguage } = useLanguage();
    const [code, setCode] = useState("");
    const [status, setStatus] = useState<{
        machineId: string;
        license: any;
        isActivated: boolean;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isActivating, setIsActivating] = useState(false);
    const [error, setError] = useState("");

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
            setError(""); // Clear any connection errors
            if (data.isActivated) {
                onActivated();
            }
        } catch (err) {
            if (retries > 0) {
                setError(`Connecting to backend... (${retries} retries left)`);
                setTimeout(() => fetchStatus(retries - 1), 2000);
            } else {
                setError("Failed to connect to backend. Please check if the app is running correctly.");
                setIsLoading(false);
            }
        }
    };

    const handleActivate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code) return;

        setIsActivating(true);
        setError("");

        try {
            const res = await fetch(`${API_URL}/api/activate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code })
            });
            const data = await res.json();

            if (data.success) {
                onActivated();
            } else {
                setError(data.error || "Activation failed");
            }
        } catch (err) {
            setError("Connection error. Please check your internet.");
        } finally {
            setIsActivating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen gradient-bg flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
            </div>
        );
    }

    return (
        <div className="min-h-screen gradient-bg flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

            {/* Language switcher */}
            <div className="absolute top-6 right-6 glass rounded-xl flex gap-1 p-1">
                <Globe className="w-4 h-4 text-slate-400 m-1.5" />
                {(['en', 'fr', 'ar'] as const).map(lang => (
                    <button
                        key={lang}
                        onClick={() => setLanguage(lang)}
                        className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${language === lang
                            ? 'bg-emerald-500/20 text-emerald-400 font-bold'
                            : 'text-slate-500 hover:text-slate-300'
                            }`}
                    >
                        {lang.toUpperCase()}
                    </button>
                ))}
            </div>

            <div className="glass rounded-3xl p-10 w-full max-w-md animate-fade-in-up shadow-2xl relative z-10 border border-white/10">
                <div className="flex flex-col items-center mb-8 text-center">
                    <div className="relative mb-6">
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-3xl blur-xl animate-pulse" />
                        <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center relative z-10">
                            <Lock className="w-10 h-10 text-emerald-400" />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">Activation Required</h1>
                    <p className="text-slate-400 text-sm mt-2">Please enter your activation code to continue using WA Manager.</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6 relative overflow-hidden group">
                    <div className="flex items-center gap-3 mb-2">
                        <Cpu className="w-4 h-4 text-emerald-400" />
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-500">Device Identity (Appareil ID)</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <code className="text-sm font-mono text-emerald-400 font-bold tracking-wider">{status?.machineId}</code>
                        <button
                            onClick={() => {
                                navigator.clipboard.writeText(status?.machineId || "");
                                // Could add a toast here
                            }}
                            className="text-[10px] text-slate-500 hover:text-emerald-400 transition-colors underline uppercase tracking-tighter"
                        >
                            Copy ID
                        </button>
                    </div>
                </div>

                <form onSubmit={handleActivate} className="space-y-4">
                    <div className="relative">
                        <Key className={`w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${error ? 'text-red-400' : 'text-slate-500'}`} />
                        <input
                            type="text"
                            placeholder="XXXX-XXXX-XXXX-XXXX"
                            className={`input-dark w-full pl-11 pr-4 py-3.5 rounded-xl text-sm font-mono tracking-widest ${error
                                ? 'border-red-500/50 bg-red-500/5 focus:border-red-500/70'
                                : 'focus:border-emerald-500/50'
                                }`}
                            value={code}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg animate-fade-in-up">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isActivating || !code}
                        className="btn-primary w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                    >
                        {isActivating ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                <CheckCircle className="w-4 h-4" />
                                Activate Now
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-white/5 text-center">
                    <p className="text-xs text-slate-500 font-medium tracking-wide">
                        Don't have a code?{" "}
                        <a
                            href="https://wa.me/212755837268"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:text-emerald-300 transition-colors font-bold inline-flex items-center gap-1"
                        >
                            Contact Support <ExternalLink className="w-3 h-3" />
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
