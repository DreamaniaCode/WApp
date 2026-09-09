"use client";

import React, { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import type { Socket } from "socket.io-client";
import { QRCodeSVG } from "qrcode.react";

interface Device {
    id: string;
    name: string;
    type: "webjs" | "official";
    isReady: boolean;
    qrCode: string;
    loadingPercent: number;
    loadingMessage: string;
}

export default function DeviceManager() {
    const [devices, setDevices] = useState<Device[]>([]);
    const [socket, setSocket] = useState<any>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addType, setAddType] = useState<"webjs" | "official">("webjs");
    const [deviceName, setDeviceName] = useState("");
    const [accessToken, setAccessToken] = useState("");
    const [phoneNumberId, setPhoneNumberId] = useState("");

    useEffect(() => {
        const newSocket = io({
            path: "/socket.io",
            transports: ["websocket", "polling"],
        });

        newSocket.on("devices_state", (state: Device[]) => {
            setDevices(state);
        });

        newSocket.on("device_update", (data: { deviceId: string, percent?: number, message?: string, status?: string }) => {
            setDevices(prev => prev.map(d => {
                if (d.id === data.deviceId) {
                    return { ...d, loadingPercent: data.percent ?? d.loadingPercent, loadingMessage: data.message ?? d.loadingMessage };
                }
                return d;
            }));
        });

        newSocket.on("device_qr", (data: { deviceId: string, qr: string }) => {
            setDevices(prev => prev.map(d => {
                if (d.id === data.deviceId) return { ...d, qrCode: data.qr, isReady: false };
                return d;
            }));
        });

        newSocket.on("device_ready", (data: { deviceId: string }) => {
            setDevices(prev => prev.map(d => {
                if (d.id === data.deviceId) return { ...d, isReady: true, qrCode: "" };
                return d;
            }));
            setShowAddModal(false); // Close modal on success if they were adding official
        });

        newSocket.on("device_disconnected", (data: { deviceId: string, reason: string }) => {
            setDevices(prev => prev.map(d => {
                if (d.id === data.deviceId) return { ...d, isReady: false, qrCode: "", loadingMessage: `Disconnected: ${data.reason}` };
                return d;
            }));
        });

        newSocket.on("error", (err: any) => {
            alert("Error: " + err.message);
        });

        setSocket(newSocket);

        return () => {
            newSocket.disconnect();
        };
    }, []);

    const handleAddDevice = (e: React.FormEvent) => {
        e.preventDefault();
        if (!socket || !deviceName) return;

        if (addType === "webjs") {
            socket.emit("add_device", { type: "webjs", name: deviceName });
        } else {
            socket.emit("add_device", { type: "official", name: deviceName, accessToken, phoneNumberId });
        }
        
        setShowAddModal(false);
        setDeviceName("");
        setAccessToken("");
        setPhoneNumberId("");
    };

    const handleRefreshQR = (deviceId: string) => {
        if (socket) socket.emit("refresh_qr", { deviceId });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Device Manager</h2>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-lg transition-all duration-200 font-medium flex items-center gap-2"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Device
                </button>
            </div>

            {devices.length === 0 ? (
                <div className="bg-white/50 dark:bg-gray-800/50 backdrop-blur-xl border border-gray-200 dark:border-gray-700 rounded-3xl p-12 text-center shadow-sm">
                    <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">No devices connected</h3>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Get started by adding a WhatsApp Web or Official API device.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {devices.map(device => (
                        <div key={device.id} className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col relative overflow-hidden group hover:shadow-md transition-all duration-300">
                            {/* Status Indicator Bar */}
                            <div className={`absolute top-0 left-0 w-full h-1 ${device.isReady ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                            
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{device.name}</h3>
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 mt-1">
                                        {device.type === 'webjs' ? 'WhatsApp Web' : 'Official API'}
                                    </span>
                                </div>
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${device.isReady ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${device.isReady ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></span>
                                    {device.isReady ? 'Ready' : 'Connecting'}
                                </span>
                            </div>

                            <div className="flex-1 flex flex-col items-center justify-center p-4 min-h-[200px]">
                                {device.isReady ? (
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Active & Ready</p>
                                    </div>
                                ) : device.qrCode ? (
                                    <div className="text-center w-full">
                                        <div className="bg-white p-3 rounded-2xl shadow-sm inline-block mb-3 border border-gray-100">
                                            <QRCodeSVG value={device.qrCode} size={150} level="M" />
                                        </div>
                                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">Scan with WhatsApp</p>
                                        <button 
                                            onClick={() => handleRefreshQR(device.id)}
                                            className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                        >
                                            Refresh QR
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-center w-full">
                                        <div className="w-full bg-gray-200 rounded-full h-2 mb-4 dark:bg-gray-700 overflow-hidden">
                                            <div className="bg-indigo-600 h-2 rounded-full transition-all duration-500 ease-out" style={{ width: `${Math.max(device.loadingPercent, 5)}%` }}></div>
                                        </div>
                                        <p className="text-sm font-medium text-gray-600 dark:text-gray-400 animate-pulse">{device.loadingMessage}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Add Device Modal */}
            {showAddModal && (
                <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
                        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity" aria-hidden="true" onClick={() => setShowAddModal(false)}></div>
                        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
                        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-3xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full border border-gray-100 dark:border-gray-700">
                            <form onSubmit={handleAddDevice}>
                                <div className="px-6 pt-6 pb-6">
                                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Add New Device</h3>
                                    
                                    <div className="flex gap-4 mb-6">
                                        <label className={`flex-1 cursor-pointer rounded-xl border-2 p-4 text-center transition-all ${addType === 'webjs' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'}`}>
                                            <input type="radio" className="hidden" name="type" value="webjs" checked={addType === 'webjs'} onChange={() => setAddType("webjs")} />
                                            <span className={`block font-medium ${addType === 'webjs' ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}`}>WhatsApp Web</span>
                                            <span className="block text-xs text-gray-500 mt-1">Scan QR Code</span>
                                        </label>
                                        <label className={`flex-1 cursor-pointer rounded-xl border-2 p-4 text-center transition-all ${addType === 'official' ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:border-indigo-300'}`}>
                                            <input type="radio" className="hidden" name="type" value="official" checked={addType === 'official'} onChange={() => setAddType("official")} />
                                            <span className={`block font-medium ${addType === 'official' ? 'text-indigo-700 dark:text-indigo-400' : 'text-gray-700 dark:text-gray-300'}`}>Official API</span>
                                            <span className="block text-xs text-gray-500 mt-1">Meta Cloud API</span>
                                        </label>
                                    </div>

                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Device Name</label>
                                            <input type="text" required value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="e.g. Sales Phone 1" className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white transition-all" />
                                        </div>

                                        {addType === 'official' && (
                                            <>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Meta Access Token</label>
                                                    <input type="password" required value={accessToken} onChange={e => setAccessToken(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white transition-all" />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone Number ID</label>
                                                    <input type="text" required value={phoneNumberId} onChange={e => setPhoneNumberId(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-white transition-all" />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-800/50 px-6 py-4 flex justify-end gap-3 rounded-b-3xl">
                                    <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 font-medium transition-colors">Cancel</button>
                                    <button type="submit" className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md font-medium transition-all">Add Device</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
