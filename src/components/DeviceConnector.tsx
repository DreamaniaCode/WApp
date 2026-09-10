"use client";

import { useState } from "react";
import { API_URL } from "@/lib/config";
import { Phone, AlertCircle, RefreshCw, Smartphone } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export function DeviceConnector() {
    const { t } = useLanguage();
    const [phoneNumber, setPhoneNumber] = useState("");
    const [pairingCode, setPairingCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleRequestCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!phoneNumber) return;

        setLoading(true);
        setError("");
        setPairingCode("");

        try {
            const response = await fetch(`${API_URL}/api/request-pairing-code`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phoneNumber })
            });

            const data = await response.json();
            if (data.success) {
                setPairingCode(data.code);
            } else {
                setError(data.error || "Failed to get code");
            }
        } catch {
            setError("Could not connect to backend server.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass rounded-2xl p-6 border border-white/5 space-y-6">
            <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                    <h2 className="text-sm font-semibold text-white">Pair with Phone</h2>
                    <p className="text-xs text-slate-500">Connect using a pairing code if QR scanning is not working.</p>
                </div>
            </div>

            {!pairingCode ? (
                <form onSubmit={handleRequestCode} className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-400 mb-2">Phone Number</label>
                        <div className="relative">
                            <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                            <input
                                type="text"
                                className="input-dark w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
                                value={phoneNumber}
                                onChange={e => setPhoneNumber(e.target.value)}
                                placeholder="e.g. 12025550108 or 447123456789"
                            />
                        </div>
                        <p className="text-[10px] text-slate-600 mt-2">
                            Enter number with country code, no + or spaces.
                        </p>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg animate-fade-in-up">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading || !phoneNumber}
                        className="btn-primary w-full py-3 rounded-xl text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                    >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                        {loading ? "Requesting..." : "Get Pairing Code"}
                    </button>
                </form>
            ) : (
                <div className="space-y-6 animate-fade-in-up">
                    <div className="flex flex-col items-center justify-center p-8 bg-white/5 border border-white/10 rounded-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-emerald-500/5 blur-2xl group-hover:bg-emerald-500/10 transition-colors"></div>

                        <p className="text-xs text-slate-400 mb-4 uppercase tracking-[0.2em] font-semibold">Your Pairing Code</p>
                        <div className="text-4xl font-mono font-bold text-white tracking-[0.3em] relative z-10 selection:bg-emerald-500/30">
                            {pairingCode}
                        </div>

                        <div className="mt-6 flex items-center gap-2 text-emerald-400 text-[10px] font-medium uppercase tracking-wider">
                            <Smartphone className="w-3 h-3" />
                            Enter this on your phone
                        </div>
                    </div>

                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 space-y-3">
                        <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">How to use:</h4>
                        <ol className="text-xs text-slate-400 space-y-2 list-decimal list-inside">
                            <li>Open WhatsApp on your phone</li>
                            <li>Go to <span className="text-slate-200">Linked Devices</span></li>
                            <li>Tap <span className="text-slate-200">Link a Device</span></li>
                            <li>Tap <span className="text-slate-200">Link with phone number instead</span></li>
                            <li>Enter the code shown above</li>
                        </ol>
                    </div>

                    <button
                        onClick={() => setPairingCode("")}
                        className="w-full py-2.5 rounded-xl text-xs font-semibold text-slate-500 hover:text-white hover:bg-white/5 transition-all text-center border border-white/5"
                    >
                        Request another code
                    </button>
                </div>
            )}

            <div className="pt-4 border-t border-white/5">
                <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                    <h4 className="text-[10px] font-bold text-red-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <AlertCircle className="w-3 h-3" />
                        Troubleshooting
                    </h4>
                    <p className="text-[10px] text-slate-500 leading-relaxed mb-3">
                        If the connection is hanging or not responding, you can wipe the session and try again.
                    </p>
                    <button
                        onClick={async () => {
                            if (confirm("This will log you out completely and clear all session data. Continue?")) {
                                try {
                                    await fetch(`${API_URL}/api/reset-session`, { method: "POST" });
                                    alert("Session reset. The app will now re-initialize. Please wait a few moments.");
                                    setPairingCode("");
                                } catch {
                                    alert("Failed to connect to backend server.");
                                }
                            }
                        }}
                        className="text-[10px] font-semibold text-red-400/80 hover:text-red-400 transition-colors uppercase tracking-wider underline underline-offset-4"
                    >
                        Reset All Sessions
                    </button>
                </div>
            </div>
        </div>
    );
}
