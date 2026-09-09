"use client";

import { useState } from "react";
import { Shield, Lock, CheckCircle, AlertCircle, Eye, EyeOff } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export function UserManager() {
    const { t } = useLanguage();
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState(false);
    const [success, setSuccess] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleUpdatePassword = (e: React.FormEvent) => {
        e.preventDefault();
        setError(false);
        setSuccess(false);
        if (newPassword !== confirmPassword) { setError(true); return; }
        if (newPassword.length < 4) { setError(true); return; }
        localStorage.setItem("wapp_admin_password", newPassword);
        setSuccess(true);
        setNewPassword(""); setConfirmPassword("");
        setTimeout(() => setSuccess(false), 3000);
    };

    const passwordStrength = (pw: string) => {
        if (!pw) return null;
        if (pw.length < 4) return { label: "Too short", color: "text-red-400", width: "15%" };
        if (pw.length < 6) return { label: "Weak", color: "text-orange-400", width: "35%" };
        if (pw.length < 8) return { label: "Fair", color: "text-amber-400", width: "60%" };
        return { label: "Strong", color: "text-emerald-400", width: "100%" };
    };

    const strength = passwordStrength(newPassword);
    const match = confirmPassword && newPassword === confirmPassword;

    return (
        <div className="glass rounded-2xl p-6 border border-white/5 space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/10 flex items-center justify-center">
                    <Shield className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                    <h2 className="text-sm font-semibold text-white">{t("securitySettings")}</h2>
                    <p className="text-xs text-slate-500">{t("managePassword")}</p>
                </div>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-4">
                {/* New password */}
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">{t("newPassword")}</label>
                    <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                        <input
                            type={showNew ? "text" : "password"}
                            className="input-dark w-full pl-10 pr-10 py-2.5 rounded-xl text-sm"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Enter new password"
                            minLength={4}
                        />
                        <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {strength && (
                        <div className="mt-2">
                            <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-300 ${strength.label === "Strong" ? "bg-emerald-500" :
                                        strength.label === "Fair" ? "bg-amber-500" :
                                            strength.label === "Weak" ? "bg-orange-500" : "bg-red-500"
                                    }`} style={{ width: strength.width }} />
                            </div>
                            <p className={`text-[10px] mt-1 font-medium ${strength.color}`}>{strength.label}</p>
                        </div>
                    )}
                </div>

                {/* Confirm password */}
                <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2">{t("confirmPassword")}</label>
                    <div className="relative">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                        <input
                            type={showConfirm ? "text" : "password"}
                            className={`input-dark w-full pl-10 pr-10 py-2.5 rounded-xl text-sm ${confirmPassword && !match ? 'border-red-500/40' : confirmPassword && match ? 'border-emerald-500/40' : ''
                                }`}
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                        />
                        <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 transition-colors">
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {confirmPassword && (
                        <p className={`text-[10px] mt-1 font-medium flex items-center gap-1 ${match ? 'text-emerald-400' : 'text-red-400'}`}>
                            {match ? <><CheckCircle className="w-3 h-3" /> Passwords match</> : <><AlertCircle className="w-3 h-3" /> Passwords do not match</>}
                        </p>
                    )}
                </div>

                {error && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg animate-fade-in-up">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {t("passwordMismatch")}
                    </div>
                )}

                {success && (
                    <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-lg animate-fade-in-up">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0" /> {t("passwordUpdated")}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={!newPassword || !confirmPassword}
                    className="btn-primary w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                >
                    <Shield className="w-4 h-4" /> {t("updatePassword")}
                </button>
            </form>

            <div className="border-t border-white/5 pt-4">
                <p className="text-[10px] text-slate-600 leading-relaxed">
                    Default password is <code className="text-slate-500 bg-white/5 px-1.5 py-0.5 rounded">admin123</code>. Change it immediately for security.
                </p>
            </div>
        </div>
    );
}
