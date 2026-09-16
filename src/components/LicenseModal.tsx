"use client";

import React, { useState, useEffect } from "react";
import {
    ShieldCheck, Key, Copy, Check, AlertTriangle, RefreshCw,
    X, ExternalLink, Cpu, Calendar, Lock, CheckCircle2, AlertCircle
} from "lucide-react";
import { API_URL } from "@/lib/config";

interface LicenseModalProps {
    isOpen: boolean;
    onClose: () => void;
    onReset: () => void;
    onLicenseChanged?: () => void;
}

export function LicenseModal({ isOpen, onClose, onReset, onLicenseChanged }: LicenseModalProps) {
    const [licenseInfo, setLicenseInfo] = useState<{
        machineId: string;
        license: any;
        isActivated: boolean;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [copiedMachineId, setCopiedMachineId] = useState(false);
    const [copiedKey, setCopiedKey] = useState(false);

    // Change Key State
    const [newKey, setNewKey] = useState("");
    const [isActivating, setIsActivating] = useState(false);
    const [changeMsg, setChangeMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Reset State
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    // Reveal Key
    const [revealKey, setRevealKey] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchLicenseStatus();
            setChangeMsg(null);
            setShowResetConfirm(false);
            setNewKey("");
        }
    }, [isOpen]);

    const fetchLicenseStatus = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/license-status`);
            if (res.ok) {
                const data = await res.json();
                setLicenseInfo(data);
            }
        } catch (e) {
            console.error("Failed to fetch license status", e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopyMachineId = () => {
        if (!licenseInfo?.machineId) return;
        navigator.clipboard.writeText(licenseInfo.machineId);
        setCopiedMachineId(true);
        setTimeout(() => setCopiedMachineId(false), 2000);
    };

    const handleCopyKey = (key: string) => {
        if (!key) return;
        navigator.clipboard.writeText(key);
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
    };

    const handleChangeKey = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKey.trim()) return;

        setIsActivating(true);
        setChangeMsg(null);

        try {
            const res = await fetch(`${API_URL}/api/activate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: newKey.trim() })
            });
            const data = await res.json();

            if (data.success) {
                setChangeMsg({ type: "success", text: "License activated successfully!" });
                setNewKey("");
                await fetchLicenseStatus();
                if (onLicenseChanged) onLicenseChanged();
            } else {
                setChangeMsg({ type: "error", text: data.error || "Invalid license key." });
            }
        } catch (err: any) {
            setChangeMsg({ type: "error", text: "Network error while activating license." });
        } finally {
            setIsActivating(false);
        }
    };

    const handleResetLicense = async () => {
        setIsResetting(true);
        try {
            const res = await fetch(`${API_URL}/api/license/reset`, { method: "POST" });
            const data = await res.json();
            if (data.success) {
                setShowResetConfirm(false);
                onReset();
            } else {
                alert("Failed to reset license: " + (data.error || "Unknown error"));
            }
        } catch (e: any) {
            alert("Error connecting to server: " + e.message);
        } finally {
            setIsResetting(false);
        }
    };

    if (!isOpen) return null;

    const license = licenseInfo?.license;
    const planType = license?.type || "Enterprise ViP";
    const currentCode = license?.code || "DREAMANIA-VIP-2026";
    const machineId = licenseInfo?.machineId || "";
    const expiresAt = license?.expiresAt;
    const activatedAt = license?.activatedAt;

    const formatExpiry = (exp: string | null | undefined) => {
        if (!exp) return "Lifetime — Never Expires";
        try {
            return new Date(exp).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
        } catch {
            return exp;
        }
    };

    const maskKey = (key: string) => {
        if (!key) return "••••-••••-••••";
        if (key.length <= 8) return key;
        return key.slice(0, 4) + " •••• •••• " + key.slice(-4);
    };

    const waMsg = encodeURIComponent(`Hello DreamaniaCode, I am inquiring about my WApp Manager Leads Pro license. Machine ID: ${machineId}`);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200">
            <div
                className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white dark:from-gray-900 dark:to-gray-850">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
                            <ShieldCheck className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                License & Subscription
                                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                    Active
                                </span>
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Manage your software key, hardware binding, and renewal
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-6 text-sm">
                    {isLoading ? (
                        <div className="py-12 flex flex-col items-center justify-center">
                            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-3" />
                            <p className="text-xs text-gray-500 font-medium">Fetching license details...</p>
                        </div>
                    ) : (
                        <>
                            {/* Current License Details Card */}
                            <div className="bg-gradient-to-br from-gray-900 via-gray-900 to-indigo-950 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="text-xs font-semibold text-gray-300">Software Edition</span>
                                    </div>
                                    <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 shadow-xs">
                                        {planType}
                                    </span>
                                </div>

                                <div className="space-y-3">
                                    {/* Machine ID */}
                                    <div>
                                        <div className="text-[11px] font-medium text-gray-400 mb-1 flex items-center justify-between">
                                            <span className="flex items-center gap-1">
                                                <Cpu className="w-3 h-3 text-blue-400" /> Device Hardware ID (Machine ID)
                                            </span>
                                            <button
                                                onClick={handleCopyMachineId}
                                                className="text-[11px] text-blue-400 hover:text-blue-300 font-semibold flex items-center gap-1 transition cursor-pointer"
                                            >
                                                {copiedMachineId ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                {copiedMachineId ? "Copied!" : "Copy"}
                                            </button>
                                        </div>
                                        <div className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-gray-200 tracking-wider flex items-center justify-between">
                                            <span>{machineId || "N/A"}</span>
                                        </div>
                                    </div>

                                    {/* Current License Key */}
                                    <div>
                                        <div className="text-[11px] font-medium text-gray-400 mb-1 flex items-center justify-between">
                                            <span className="flex items-center gap-1">
                                                <Key className="w-3 h-3 text-amber-400" /> Active License Key
                                            </span>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => setRevealKey(!revealKey)}
                                                    className="text-[11px] text-gray-400 hover:text-gray-200 transition cursor-pointer"
                                                >
                                                    {revealKey ? "Hide" : "Reveal"}
                                                </button>
                                                <button
                                                    onClick={() => handleCopyKey(currentCode)}
                                                    className="text-[11px] text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 transition cursor-pointer"
                                                >
                                                    {copiedKey ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                                    {copiedKey ? "Copied!" : "Copy"}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="bg-black/40 border border-white/10 rounded-xl px-3 py-2 font-mono text-xs text-amber-300 tracking-wider">
                                            {revealKey ? currentCode : maskKey(currentCode)}
                                        </div>
                                    </div>

                                    {/* Expiry & Hardware Lock */}
                                    <div className="grid grid-cols-2 gap-3 pt-1">
                                        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                                            <div className="text-[10px] text-gray-400 flex items-center gap-1 mb-0.5">
                                                <Calendar className="w-2.5 h-2.5 text-indigo-400" /> Validity Period
                                            </div>
                                            <div className="text-xs font-semibold text-emerald-400">
                                                {formatExpiry(expiresAt)}
                                            </div>
                                        </div>
                                        <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                                            <div className="text-[10px] text-gray-400 flex items-center gap-1 mb-0.5">
                                                <ShieldCheck className="w-2.5 h-2.5 text-blue-400" /> Hardware Binding
                                            </div>
                                            <div className="text-xs font-semibold text-blue-300">
                                                Locked to this PC
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Change License Key */}
                            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-5 border border-gray-200 dark:border-gray-700">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1.5">
                                    <Key className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                    Change or Upgrade License Key
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                    Purchased a renewal or received an upgrade key? Enter your new code below to re-authenticate immediately.
                                </p>

                                <form onSubmit={handleChangeKey} className="space-y-2">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newKey}
                                            onChange={(e) => setNewKey(e.target.value)}
                                            placeholder="e.g. WAPP-XXXX-XXXX-XXXX"
                                            className="flex-1 px-3.5 py-2 rounded-xl text-xs font-mono bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-white"
                                        />
                                        <button
                                            type="submit"
                                            disabled={isActivating || !newKey.trim()}
                                            className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 transition flex items-center gap-1.5 shrink-0 cursor-pointer"
                                        >
                                            {isActivating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                                            {isActivating ? "Verifying..." : "Apply Key"}
                                        </button>
                                    </div>

                                    {changeMsg && (
                                        <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${changeMsg.type === "success" ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" : "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"}`}>
                                            {changeMsg.type === "success" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                                            <span>{changeMsg.text}</span>
                                        </div>
                                    )}
                                </form>
                            </div>

                            {/* Section: Deactivate / Reset (Danger Zone) */}
                            <div className="bg-red-50/50 dark:bg-red-950/20 rounded-2xl p-5 border border-red-200 dark:border-red-900/50">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="text-xs font-bold uppercase tracking-wider text-red-800 dark:text-red-400 mb-1 flex items-center gap-1.5">
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                            Reset / Deactivate License
                                        </h3>
                                        <p className="text-xs text-red-700/80 dark:text-red-300/80 max-w-md">
                                            Clears the saved license from this device. The software will immediately lock and return to the initial Activation Screen. Use this if transferring the app to a customer or testing a fresh license.
                                        </p>
                                    </div>
                                </div>

                                {!showResetConfirm ? (
                                    <button
                                        type="button"
                                        onClick={() => setShowResetConfirm(true)}
                                        className="mt-3 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-800 dark:bg-red-900/40 dark:hover:bg-red-900/60 dark:text-red-200 border border-red-300 dark:border-red-800 transition flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Lock className="w-3 h-3" />
                                        Deactivate This Device
                                    </button>
                                ) : (
                                    <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/40 rounded-xl border border-red-300 dark:border-red-700 space-y-2">
                                        <p className="text-xs font-bold text-red-900 dark:text-red-200">
                                            Are you sure you want to reset the license?
                                        </p>
                                        <p className="text-[11px] text-red-800 dark:text-red-300">
                                            You will need an active license key to reactivate and access the dashboard again.
                                        </p>
                                        <div className="flex items-center gap-2 pt-1">
                                            <button
                                                type="button"
                                                onClick={handleResetLicense}
                                                disabled={isResetting}
                                                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50 flex items-center gap-1 cursor-pointer"
                                            >
                                                {isResetting ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                                                {isResetting ? "Resetting..." : "Yes, Reset & Lock"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setShowResetConfirm(false)}
                                                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 transition cursor-pointer"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Need Support / Contact */}
                            <div className="pt-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                <span>Need a renewal or technical help?</span>
                                <a
                                    href={`https://wa.me/212707031614?text=${waMsg}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1 transition"
                                >
                                    WhatsApp Support <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
