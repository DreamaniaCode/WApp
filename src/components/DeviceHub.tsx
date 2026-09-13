"use client";

import { useEffect, useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
    Loader2, CheckCircle, Smartphone, RefreshCw, RotateCcw,
    Phone, Key, AlertCircle, Copy, Check, Plus, Star, Trash2, Flame,
    WifiOff, Wifi, QrCode, X, PlayCircle, StopCircle
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { API_URL } from "@/lib/config";

interface DeviceHubProps {
    socket: any;
}

interface Device {
    id: string;
    label: string;
    phoneNumber: string;
    isReady: boolean;
    isAuthenticated: boolean;
    qrCode: string;
    isDefault: boolean;
    warmingStatus: 'off' | 'warming' | 'warmed' | 'paused';
    warmingDay: number;
    warmingMaxDay: number;
    messagesSentToday: number;
    dailyLimit: number;
    createdAt: string;
}

export function DeviceHub({ socket }: DeviceHubProps) {
    const { t } = useLanguage();
    const [devices, setDevices] = useState<Device[]>([]);
    
    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalLabel, setModalLabel] = useState("");
    const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
    const [mode, setMode] = useState<"qr" | "phone">("qr");

    // Phone pairing state
    const [phoneNumber, setPhoneNumber] = useState("");
    const [pairingCode, setPairingCode] = useState("");
    const [isRequestingCode, setIsRequestingCode] = useState(false);
    const [phoneError, setPhoneError] = useState("");
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const fetchDevices = () => {
            fetch(`${API_URL}/api/devices`)
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setDevices(data);
                    }
                })
                .catch(() => {});
        };

        fetchDevices();
        const pollInterval = setInterval(fetchDevices, 5000);

        if (!socket) return () => clearInterval(pollInterval);

        const onDeviceQr = ({ deviceId, qr }: { deviceId: string, qr: string }) => {
            setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, qrCode: qr, isReady: false, isAuthenticated: false } : d));
        };

        const onDeviceReady = ({ deviceId, phoneNumber }: { deviceId: string, phoneNumber: string }) => {
            setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, isReady: true, isAuthenticated: true, qrCode: "", phoneNumber: phoneNumber || d.phoneNumber } : d));
        };

        const onDeviceAuthenticated = ({ deviceId }: { deviceId: string }) => {
            setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, isAuthenticated: true } : d));
        };

        const onDeviceDisconnected = ({ deviceId, reason }: { deviceId: string, reason: string }) => {
            setDevices(prev => prev.map(d => d.id === deviceId ? { ...d, isReady: false, isAuthenticated: false } : d));
        };

        const onDeviceWarmingUpdate = (update: Partial<Device> & { deviceId: string }) => {
            setDevices(prev => prev.map(d => d.id === update.deviceId ? { ...d, ...update } : d));
        };

        const onDevicesList = (list: Device[]) => {
            setDevices(list);
        };

        socket.on("device:qr", onDeviceQr);
        socket.on("device:ready", onDeviceReady);
        socket.on("device:authenticated", onDeviceAuthenticated);
        socket.on("device:disconnected", onDeviceDisconnected);
        socket.on("device:warming_update", onDeviceWarmingUpdate);
        socket.on("devices:list", onDevicesList);

        return () => {
            clearInterval(pollInterval);
            socket.off("device:qr", onDeviceQr);
            socket.off("device:ready", onDeviceReady);
            socket.off("device:authenticated", onDeviceAuthenticated);
            socket.off("device:disconnected", onDeviceDisconnected);
            socket.off("device:warming_update", onDeviceWarmingUpdate);
            socket.off("devices:list", onDevicesList);
        };
    }, [socket]);

    const activeDevicesCount = devices.filter(d => d.isReady).length;

    const handleAddDevice = async () => {
        if (!modalLabel.trim()) return;
        try {
            const res = await fetch(`${API_URL}/api/devices`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ label: modalLabel })
            });
            const data = await res.json();
            if (data.id) {
                setActiveDeviceId(data.id);
                // The new device will be polled shortly, but we can also handle local update if needed
            }
        } catch (error) {
            console.error("Failed to add device", error);
        }
    };

    const handleDeleteDevice = async (id: string) => {
        if (!confirm("Are you sure you want to remove this device?")) return;
        try {
            await fetch(`${API_URL}/api/devices/${id}`, { method: "DELETE" });
            setDevices(prev => prev.filter(d => d.id !== id));
        } catch (error) {
            console.error("Failed to delete device", error);
        }
    };

    const handleSetDefault = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/devices/${id}/set-default`, { method: "POST" });
            setDevices(prev => prev.map(d => ({ ...d, isDefault: d.id === id })));
        } catch (error) {
            console.error("Failed to set default device", error);
        }
    };

    const handleReset = async (id: string) => {
        if (!confirm("Reset this device session?")) return;
        try {
            await fetch(`${API_URL}/api/devices/${id}/reset`, { method: "POST" });
        } catch (error) {
            console.error("Failed to reset device", error);
        }
    };

    const handleStartWarming = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/devices/${id}/warming/start`, { method: "POST" });
        } catch (error) {
            console.error("Failed to start warming", error);
        }
    };

    const handleStopWarming = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/devices/${id}/warming/stop`, { method: "POST" });
        } catch (error) {
            console.error("Failed to stop warming", error);
        }
    };

    const handleRequestPairingCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeDeviceId) return;
        const clean = phoneNumber.replace(/[^0-9]/g, "");
        if (!clean || clean.length < 7) {
            setPhoneError("Please enter a valid phone number with country code.");
            return;
        }

        setIsRequestingCode(true);
        setPhoneError("");
        setPairingCode("");

        try {
            const res = await fetch(`${API_URL}/api/devices/${activeDeviceId}/request-pairing-code`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phoneNumber: clean })
            });
            const data = await res.json();
            if (data.success && data.code) {
                setPairingCode(data.code);
            } else {
                setPhoneError(data.error || "Failed to generate pairing code.");
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

    const activeDevice = devices.find(d => d.id === activeDeviceId);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">WhatsApp Devices</h2>
                    <p className="text-sm text-gray-500">Manage multiple WhatsApp accounts</p>
                </div>
                <div className="flex items-center gap-4">
                    <span className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-bold rounded-full border border-blue-200">
                        {activeDevicesCount}/5 Connected
                    </span>
                    <button
                        onClick={() => {
                            if (devices.length >= 5) {
                                alert("Device Limit Reached");
                                return;
                            }
                            setModalLabel("");
                            setActiveDeviceId(null);
                            setShowModal(true);
                        }}
                        disabled={devices.length >= 5}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 shadow-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add Number
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {devices.map(device => (
                    <div key={device.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
                        <div className={`h-1.5 w-full ${
                            device.isReady ? 'bg-green-500' :
                            device.warmingStatus === 'warming' ? 'bg-amber-500' :
                            device.isAuthenticated ? 'bg-blue-500' :
                            device.qrCode ? 'bg-indigo-500' : 'bg-gray-300'
                        }`} />
                        <div className="p-5 flex-1 flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                        {device.label}
                                        {device.isDefault && <Star className="w-4 h-4 text-amber-400 fill-amber-400" />}
                                    </h3>
                                    <p className="text-sm text-gray-500 font-mono mt-0.5">
                                        {device.isReady && device.phoneNumber ? `+${device.phoneNumber}` :
                                         device.isAuthenticated ? 'Synchronizing with phone...' :
                                         device.qrCode ? 'Scan QR with WhatsApp' : 'Starting client...'}
                                    </p>
                                </div>
                                <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider ${
                                    device.isReady && device.warmingStatus === 'warming' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                                    device.isReady ? 'bg-green-50 text-green-700 border border-green-200' :
                                    device.isAuthenticated ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                                    device.qrCode ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                                    'bg-gray-100 text-gray-600 border border-gray-200'
                                }`}>
                                    {device.isReady && device.warmingStatus === 'warming' ? `Warming Day ${device.warmingDay}/${device.warmingMaxDay}` :
                                     device.isReady ? 'Ready' :
                                     device.isAuthenticated ? 'Syncing' :
                                     device.qrCode ? 'Scan QR' : 'Starting'}
                                </div>
                            </div>

                            <div className="flex-1 flex flex-col items-center justify-center py-4">
                                {device.isReady ? (
                                    <div className="flex flex-col items-center">
                                        <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center text-green-500 mb-2">
                                            <CheckCircle className="w-6 h-6" />
                                        </div>
                                    </div>
                                ) : device.isAuthenticated && !device.isReady ? (
                                    <div className="flex flex-col items-center text-blue-600 py-4">
                                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                        <span className="text-xs font-semibold">Synchronizing chats with phone...</span>
                                    </div>
                                ) : device.qrCode ? (
                                    <div className="bg-white p-2 rounded-xl border border-gray-100 shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => {
                                        setActiveDeviceId(device.id);
                                        setShowModal(true);
                                    }}>
                                        <QRCodeSVG value={device.qrCode} size={180} />
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center text-blue-600 py-6">
                                        <Loader2 className="w-8 h-8 animate-spin mb-2" />
                                        <span className="text-xs font-semibold text-gray-600">Starting WhatsApp Client...</span>
                                    </div>
                                )}
                            </div>

                            {device.warmingStatus === 'warming' && (
                                <div className="mt-2 mb-4">
                                    <div className="flex justify-between text-[10px] text-gray-500 mb-1 font-semibold">
                                        <span>Daily Limit: {device.messagesSentToday} / {device.dailyLimit}</span>
                                        <span>{Math.round((device.messagesSentToday / device.dailyLimit) * 100)}%</span>
                                    </div>
                                    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-amber-500 rounded-full transition-all"
                                            style={{ width: `${Math.min(100, (device.messagesSentToday / device.dailyLimit) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            <div className="mt-auto pt-4 border-t border-gray-100 flex flex-wrap gap-2 justify-between">
                                <div className="flex gap-2">
                                    <button 
                                        onClick={() => handleSetDefault(device.id)}
                                        title="Set Default"
                                        className="p-2 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition border border-transparent hover:border-gray-200"
                                    >
                                        <Star className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleReset(device.id)}
                                        title="Reset Session"
                                        className="p-2 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition border border-transparent hover:border-gray-200"
                                    >
                                        <RotateCcw className="w-4 h-4" />
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteDevice(device.id)}
                                        title="Remove Device"
                                        className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition border border-transparent hover:border-red-200"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    {device.warmingStatus === 'warming' ? (
                                        <button 
                                            onClick={() => handleStopWarming(device.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-700 text-xs font-semibold border border-red-200 hover:bg-red-100 transition"
                                        >
                                            <StopCircle className="w-3.5 h-3.5" /> Stop Warming
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleStartWarming(device.id)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold border border-amber-200 hover:bg-amber-100 transition"
                                        >
                                            <Flame className="w-3.5 h-3.5" /> Start Warming
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-xl">
                        <div className="flex justify-between items-center p-4 border-b border-gray-100">
                            <h3 className="font-bold text-gray-900">
                                {activeDeviceId ? 'Pair Device' : 'Add New Device'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-700">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6">
                            {!activeDeviceId ? (
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                                            Device Label
                                        </label>
                                        <input
                                            type="text"
                                            value={modalLabel}
                                            onChange={e => setModalLabel(e.target.value)}
                                            placeholder="e.g. Sales Number, Support 1"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            autoFocus
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddDevice}
                                        disabled={!modalLabel.trim()}
                                        className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold hover:opacity-90 transition disabled:opacity-50"
                                    >
                                        Continue
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-6">
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

                                    {mode === "qr" ? (
                                        <div className="flex flex-col items-center">
                                            {activeDevice?.qrCode ? (
                                                <>
                                                    <div className="bg-white p-4 rounded-2xl shadow-md border border-gray-100 mb-4">
                                                        <QRCodeSVG value={activeDevice.qrCode} size={180} />
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
                                                            <span>Tap <b>Link a Device</b> and point camera here</span>
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="py-12 flex flex-col items-center text-gray-400">
                                                    <Loader2 className="w-10 h-10 animate-spin mb-3 text-blue-600" />
                                                    <p className="text-sm font-semibold text-gray-700">Generating QR Code...</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {!pairingCode ? (
                                                <form onSubmit={handleRequestPairingCode} className="space-y-4">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                                                            Phone Number
                                                        </label>
                                                        <div className="relative">
                                                            <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                                                            <input
                                                                type="text"
                                                                className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                placeholder="e.g. 12025550108"
                                                                value={phoneNumber}
                                                                onChange={e => setPhoneNumber(e.target.value)}
                                                                disabled={isRequestingCode}
                                                            />
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
                                                        {isRequestingCode ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                                                        Get Pairing Code
                                                    </button>
                                                </form>
                                            ) : (
                                                <div className="bg-indigo-50/70 border border-indigo-200/80 rounded-2xl p-6 flex flex-col items-center text-center animate-in fade-in">
                                                    <div className="text-[11px] uppercase tracking-widest text-indigo-600 font-bold mb-2">
                                                        Pairing Code
                                                    </div>
                                                    <div className="text-3xl font-mono font-extrabold text-indigo-900 tracking-widest">
                                                        {pairingCode.length === 8 ? `${pairingCode.slice(0, 4)} - ${pairingCode.slice(4)}` : pairingCode}
                                                    </div>
                                                    <button
                                                        onClick={copyPairingCode}
                                                        className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs font-semibold text-indigo-700 shadow-sm"
                                                    >
                                                        {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                                                        {copied ? "Copied!" : "Copy Code"}
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
