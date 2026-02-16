"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, CheckCircle, Smartphone } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { API_URL } from "@/lib/config";
import { RefreshButton } from "./RefreshButton";

interface QRCodeDisplayProps {
    socket: any;
}

export function QRCodeDisplay({ socket }: QRCodeDisplayProps) {
    const { t } = useLanguage();
    const [qrCode, setQrCode] = useState<string>("");
    const [isReady, setIsReady] = useState<boolean>(false);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [loadingMessage, setLoadingMessage] = useState<string>("");

    useEffect(() => {
        if (!socket) return;

        socket.on("qr", (qr: string) => {
            console.log("QR received in component", qr.substring(0, 20) + "...");
            setQrCode(qr);
            setIsReady(false);
            setIsAuthenticated(false);
            setLoadingMessage("");
        });

        socket.on("ready", () => {
            console.log("Ready received in component");
            setIsReady(true);
            setIsAuthenticated(true);
            setQrCode("");
            setLoadingMessage("");
        });

        socket.on("authenticated", () => {
            console.log("Authenticated event received");
            setIsAuthenticated(true);
        });

        socket.on("loading_screen", (data: { percent: number; message: string }) => {
            console.log("Loading:", data.message);
            setLoadingMessage(data.message);
        });

        // Request status on mount
        socket.emit("status");

        return () => {
            socket.off("qr");
            socket.off("ready");
            socket.off("authenticated");
            socket.off("loading_screen");
        };
    }, [socket]);

    const handleLogout = async () => {
        try {
            await fetch(`${API_URL}/api/logout`, { method: "POST" });
            // State will be updated by socket events (disconnected/qr)
            setIsAuthenticated(false);
            setIsReady(false);
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-sm border border-gray-100 max-w-sm w-full mx-auto">
            <div className="mb-4 w-full">
                {isReady ? (
                    <div className="flex flex-col items-center text-green-600 animate-in fade-in zoom-in duration-500">
                        <CheckCircle className="w-16 h-16 mb-2" />
                        <h3 className="text-xl font-bold text-gray-800">{t("whatsappReady")}</h3>
                        <p className="text-sm text-gray-500 mt-1 mb-4">{t("whatsappReadyDesc")}</p>
                        <button
                            onClick={handleLogout}
                            className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1 rounded border border-red-200 transition-colors"
                        >
                            {t("disconnect") || "Log out"}
                        </button>
                    </div>
                ) : isAuthenticated ? (
                    <div className="flex flex-col items-center text-blue-600 animate-pulse duration-1000">
                        <Loader2 className="w-12 h-12 mb-3 animate-spin" />
                        <h3 className="text-lg font-semibold text-gray-800">{t("loading")}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                            {loadingMessage || "Authenticated, loading..."}
                        </p>
                    </div>
                ) : qrCode ? (
                    <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                        <div className="bg-white p-2 rounded-lg shadow-inner mb-4 border border-gray-200">
                            <QRCodeSVG value={qrCode} size={256} className="w-full h-auto" />
                        </div>
                        <p className="text-sm text-gray-500 font-medium flex items-center gap-2">
                            <Smartphone className="w-4 h-4" />
                            {t("scanQr")}
                        </p>
                        <button
                            onClick={() => socket.emit("refresh_qr")}
                            className="mt-4 text-xs text-gray-400 hover:text-blue-600 underline"
                        >
                            Refresh QR Code
                        </button>
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-gray-400 py-10">
                        <Loader2 className="w-10 h-10 animate-spin mb-3 text-blue-500" />
                        <p className="text-sm font-medium text-gray-700 mb-1">
                            {loadingMessage || "Initializing Server..."}
                        </p>
                        <p className="text-xs text-gray-400 text-center max-w-[200px]">
                            This may take up to 60s on free hosting.
                        </p>

                        {/* Manual Refresh Button after Timeout Effect */}
                        <RefreshButton socket={socket} />
                    </div>
                )}
            </div>
        </div>
    );
}
