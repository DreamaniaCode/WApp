"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
    Loader2, CheckCircle, Smartphone, RefreshCw, RotateCcw,
    Phone, Key, AlertCircle, Copy, Check
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { API_URL } from "@/lib/config";

interface QRCodeDisplayProps {
    socket: any;
}

export function QRCodeDisplay({ socket }: QRCodeDisplayProps) {
    const { t } = useLanguage();
    const [mode, setMode] = useState<"qr" | "phone">("qr");
    const [qrCode, setQrCode] = useState<string>("");
    const [isReady, setIsReady] = useState<boolean>(false);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>("");

    // Phone pairing state
    const [phoneNumber, setPhoneNumber] = useState("");
    const [pairingCode, setPairingCode] = useState("");
    const [isRequestingCode, setIsRequestingCode] = useState(false);
    const [phoneError, setPhoneError] = useState("");
    const [copied, setCopied] = useState(false);

    // Reset state
    const [isResetting, setIsResetting] = useState(false);
    const [resetNotice, setResetNotice] = useState("");

    useEffect(() => {
        if (!socket) return;

        socket.on("qr", (qr: string) => {
            setQrCode(qr);
            setIsReady(false);
            setIsAuthenticated(false);
            setLoadingMessage("");
            setIsResetting(false);
        });

        socket.on("ready", () => {
            setIsReady(true);
            setIsAuthenticated(true);
            setQrCode("");
            setLoadingMessage("");
            setIsResetting(false);
        });

        socket.on("authenticated", () => {
            setIsAuthenticated(true);
        });

        socket.on("loading_screen", (data: { percent: number; message: string }) => {
            setLoadingMessage(data.message);
        });

        socket.on("disconnected", () => {
            setIsReady(false);
            setIsAuthenticated(false);
        });

        socket.on("mode_switching", (data: { mode: string }) => {
            if (data.mode === "qr") {
                setLoadingMessage("Switching back to QR mode...");
            }
        });

        // Request initial status
        socket.emit("status");

        return () => {
            socket.off("qr");
            socket.off("ready");
            socket.off("authenticated");
            socket.off("loading_screen");
            socket.off("disconnected");
            socket.off("mode_switching");
        };
    }, [socket]);

    const handleLogout = async () => {
        try {
            await fetch(`${API_URL}/api/logout`, { method: "POST" });
            setIsAuthenticated(false);
            setIsReady(false);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const handleReset = async () => {
        if (!confirm("Reset session? This will clear stale connections and generate a fresh QR code.")) return;
        setIsResetting(true);
        setResetNotice("Resetting session and clearing locks... Fresh QR will appear in seconds.");
        setPairingCode("");
        setPhoneError("");
        try {
            await fetch(`${API_URL}/api/reset-session`, { method: "POST" });
            setTimeout(() => {
                setResetNotice("");
                setIsResetting(false);
            }, 6000);
        } catch (err) {
            console.error("Reset failed", err);
            setResetNotice("Error reaching server. Please check your backend.");
            setIsResetting(false);
        }
    };

    const handleRequestPairingCode = async (e: React.FormEvent) => {
        e.preventDefault();
        const clean = phoneNumber.replace(/[^0-9]/g, "");
        if (!clean || clean.length < 7) {
            setPhoneError("Please enter a valid phone number with country code (e.g. 212638273545).");
            return;
        }

        setIsRequestingCode(true);
        setPhoneError("");
        setPairingCode("");

        try {
            const res = await fetch(`${API_URL}/api/request-pairing-code`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phoneNumber: clean })
            });
            const data = await res.json();
            if (data.success && data.code) {
                setPairingCode(data.code);
            } else {
                setPhoneError(data.error || "Failed to generate pairing code. Please try QR scan instead.");
            }
        } catch (err) {
            setPhoneError("Could not reach backend server.");
        } finally {
            setIsRequestingCode(false);
        }
    };

    const copyPairingCode = () => {
        if (!pairingCode) return;
        navigator.clipboard.writeText(pairingCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="max-w-xl mx-auto space-y-6">
            {/* Mode Switcher Tabs */}
            <div className="flex bg-gray-100 p-1 rounded-xl">
                <button
                    onClick={() => setMode("qr")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        mode === "qr"
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-900"
                    }`}
                >
                    <Smartphone className="w-4 h-4 text-blue-600" />
                    Scan QR Code
                </button>
                <button
                    onClick={() => setMode("phone")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        mode === "phone"
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-900"
                    }`}
                >
                    <Phone className="w-4 h-4 text-indigo-600" />
                    Link with Phone Number
                </button>
            </div>

            {/* Reset Notification Banner */}
            {resetNotice && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-xl p-3 flex items-center gap-2 animate-in fade-in">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600 shrink-0" />
                    <span>{resetNotice}</span>
                </div>
            )}

            {/* Connected State View */}
            {isReady ? (
                <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm flex flex-col items-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-green-50 border border-green-200 flex items-center justify-center mb-4 text-green-600 shadow-sm">
                        <CheckCircle className="w-8 h-8" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">WhatsApp Web Connected</h3>
                    <p className="text-sm text-gray-500 mb-6 max-w-sm">
                        Your WhatsApp session is active and synchronized. You can send individual messages, bulk campaigns, or extract group contacts.
                    </p>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleLogout}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
                        >
                            Log Out
                        </button>
                        <button
                            onClick={handleReset}
                            disabled={isResetting}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition border border-red-200"
                        >
                            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
                            Reset Session
                        </button>
                    </div>
                </div>
            ) : mode === "qr" ? (
                /* QR Code Mode View */
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm flex flex-col items-center">
                    {isAuthenticated ? (
                        <div className="flex flex-col items-center py-12 text-blue-600">
                            <Loader2 className="w-12 h-12 mb-3 animate-spin" />
                            <h3 className="text-base font-bold text-gray-800">Authenticating with WhatsApp...</h3>
                            <p className="text-xs text-gray-400 mt-1 max-w-xs text-center">
                                {loadingMessage || "Synchronizing chats. This takes a few seconds on first connect."}
                            </p>
                        </div>
                    ) : qrCode ? (
                        <div className="flex flex-col items-center w-full">
                            <div className="bg-white p-4 rounded-2xl shadow-md border border-gray-100 mb-5">
                                <QRCodeSVG value={qrCode} size={220} className="w-full h-auto" />
                            </div>
                            <div className="bg-gray-50 rounded-xl p-3.5 w-full text-xs text-gray-600 space-y-1.5 border border-gray-100 mb-4">
                                <div className="font-semibold text-gray-900 mb-1">How to connect:</div>
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-[10px]">1</span>
                                    <span>Open WhatsApp on your phone</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-[10px]">2</span>
                                    <span>Tap <b>Menu (⋮)</b> or <b>Settings</b> &rarr; <b>Linked Devices</b></span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-600 font-bold flex items-center justify-center text-[10px]">3</span>
                                    <span>Tap <b>Link a Device</b> and point your camera at this QR code</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center py-12 text-gray-400">
                            <Loader2 className="w-10 h-10 animate-spin mb-3 text-blue-600" />
                            <p className="text-sm font-semibold text-gray-700">Generating Secure QR Code...</p>
                            <p className="text-xs text-gray-400 mt-1">Starting Chromium WhatsApp Web sandbox</p>
                        </div>
                    )}

                    {/* Reset Button for QR */}
                    <div className="w-full pt-4 border-t border-gray-100 flex flex-col items-center">
                        <button
                            onClick={handleReset}
                            disabled={isResetting}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition border border-red-200 shadow-sm"
                        >
                            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
                            {isResetting ? "Resetting Session..." : "Reset Session & Fresh QR"}
                        </button>
                        <span className="text-[10px] text-gray-400 mt-1.5">
                            Use this if the QR code is stuck or you want to connect a new number.
                        </span>
                    </div>
                </div>
            ) : (
                /* Phone Number Pairing Mode View */
                <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm space-y-6">
                    <div>
                        <h3 className="text-base font-bold text-gray-900 mb-1">Link with Phone Number</h3>
                        <p className="text-xs text-gray-500">
                            Receive an 8-character pairing code directly on your screen without needing to scan a QR code with your camera.
                        </p>
                    </div>

                    {!pairingCode ? (
                        <form onSubmit={handleRequestPairingCode} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                    Phone Number (with Country Code)
                                </label>
                                <div className="relative">
                                    <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="e.g. 212638273545 (no + or spaces)"
                                        value={phoneNumber}
                                        onChange={e => setPhoneNumber(e.target.value)}
                                        disabled={isRequestingCode}
                                    />
                                </div>
                                <div className="text-[11px] text-gray-400 mt-1">
                                    Include full country prefix (e.g. <b>212</b> for Morocco, <b>33</b> for France, <b>1</b> for USA).
                                </div>
                            </div>

                            {phoneError && (
                                <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                                    <span>{phoneError}</span>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isRequestingCode || !phoneNumber.trim()}
                                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
                            >
                                {isRequestingCode ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Requesting Code from WhatsApp...
                                    </>
                                ) : (
                                    <>
                                        <Key className="w-4 h-4" />
                                        Get 8-Digit Pairing Code
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-5 animate-in fade-in">
                            <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-6 flex flex-col items-center text-center">
                                <div className="text-[11px] uppercase tracking-widest text-indigo-600 font-bold mb-2">
                                    Your WhatsApp Pairing Code
                                </div>
                                <div className="text-3xl sm:text-4xl font-mono font-extrabold text-indigo-900 tracking-widest selection:bg-indigo-200">
                                    {pairingCode.length === 8 ? `${pairingCode.slice(0, 4)} - ${pairingCode.slice(4)}` : pairingCode}
                                </div>
                                <button
                                    onClick={copyPairingCode}
                                    className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 transition shadow-sm"
                                >
                                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                    {copied ? "Copied!" : "Copy Code"}
                                </button>
                            </div>

                            <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-700 space-y-2 border border-gray-100">
                                <div className="font-bold text-gray-900">How to enter on phone:</div>
                                <ol className="list-decimal list-inside space-y-1 text-gray-600">
                                    <li>Open <b>WhatsApp</b> on your phone</li>
                                    <li>Go to <b>Linked Devices</b> &rarr; <b>Link a Device</b></li>
                                    <li>Tap <b>"Link with phone number instead"</b> at the bottom</li>
                                    <li>Enter the 8-character code shown above</li>
                                </ol>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setPairingCode("")}
                                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition"
                                >
                                    Request Another Code
                                </button>
                                <button
                                    onClick={handleReset}
                                    className="px-4 py-2.5 rounded-xl border border-red-200 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Reset Button */}
                    <div className="pt-4 border-t border-gray-100 flex justify-center">
                        <button
                            onClick={handleReset}
                            disabled={isResetting}
                            className="flex items-center gap-2 text-xs font-semibold text-gray-500 hover:text-red-600 transition"
                        >
                            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? "animate-spin" : ""}`} />
                            Reset All Sessions & Re-initialize
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

