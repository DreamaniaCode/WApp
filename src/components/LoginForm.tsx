"use client";

import { useState } from "react";
import { Lock, LogIn, AlertCircle, Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface LoginFormProps {
    onLogin: (password: string) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
    const { t, language, setLanguage } = useLanguage();
    const [password, setPassword] = useState("");
    const [error, setError] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        await new Promise(r => setTimeout(r, 400)); // Brief animation delay
        const savedPassword = localStorage.getItem("wapp_admin_password") || "admin123";
        if (password === savedPassword) {
            onLogin(password);
        } else {
            setError(true);
            setIsLoading(false);
            setTimeout(() => setError(false), 3000); // 3 second delay for wrong password
        }
    };

    return (
        <div className="min-h-screen gradient-bg flex items-center justify-center p-4 relative overflow-hidden" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* Background orbs */}
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

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

            {/* Login Card */}
            <div className="glass rounded-3xl p-10 w-full max-w-md animate-fade-in-up shadow-2xl shadow-black/40" style={{ maxWidth: '400px', width: '100%' }}>
                {/* Logo */}
                <div className="flex flex-col items-center mb-8" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <div className="relative mb-4" style={{ width: '80px', height: '80px' }}>
                        <div className="absolute inset-0 bg-emerald-500/20 rounded-3xl blur-xl" />
                        <img
                            src="/logo.png"
                            alt="WA Manager"
                            className="w-20 h-20 object-contain rounded-3xl relative z-10 drop-shadow-2xl"
                            style={{ width: '80px', height: '80px', objectFit: 'contain' }}
                        />
                    </div>
                    <h1 className="text-2xl font-bold text-white tracking-tight">{t("accessProtected")}</h1>
                    <p className="text-slate-400 text-sm mt-2 text-center">{t("enterAdminPassword")}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="relative">
                        <Lock className={`w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 transition-colors ${error ? 'text-red-400' : 'text-slate-500'}`} />
                        <input
                            type="password"
                            placeholder={t("password")}
                            className={`input-dark w-full pl-11 pr-4 py-3.5 rounded-xl text-sm ${error
                                ? 'border-red-500/50 bg-red-500/5 focus:border-red-500/70'
                                : ''
                                }`}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg animate-fade-in-up">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            {t("incorrectPassword")}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="btn-primary w-full py-3.5 rounded-xl flex items-center justify-center gap-2 text-sm"
                    >
                        {isLoading ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <LogIn className="w-4 h-4" />
                                {t("loginBtn")}
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-white/5 text-center">
                    <p className="text-xs text-slate-600 font-medium tracking-widest uppercase">
                        WA MANAGER {t("by")}{" "}
                        <a href="https://dreamaniacode.vercel.app" target="_blank" rel="noopener noreferrer" className="text-emerald-500/70 hover:text-emerald-400 transition-colors">
                            DreamaniaCode
                        </a>
                    </p>
                    <p className="text-xs text-slate-700 mt-1">{t("version")} 0.1.0</p>
                </div>
            </div>
        </div>
    );
}
