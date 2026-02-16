"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, CheckCircle, Smartphone } from "lucide-react";

interface QRCodeDisplayProps {
    socket: any;
}

export function QRCodeDisplay({ socket }: QRCodeDisplayProps) {
    const [qrCode, setQrCode] = useState<string>("");
    const [isReady, setIsReady] = useState<boolean>(false);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

    useEffect(() => {
        if (!socket) return;

        socket.on("qr", (qr: string) => {
            console.log("QR received in component");
            setQrCode(qr);
            setIsReady(false);
            setIsAuthenticated(false);
        });

        socket.on("ready", () => {
            console.log("Ready received in component");
            setIsReady(true);
            setIsAuthenticated(true);
            setQrCode("");
        });

        socket.on("authenticated", () => {
            setIsAuthenticated(true);
        });

        // Request status on mount
        socket.emit("status");

        return () => {
            socket.off("qr");
            socket.off("ready");
            socket.off("authenticated");
        };
    }, [socket]);

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-white rounded-xl shadow-sm border border-gray-100 max-w-sm w-full mx-auto">
            <div className="mb-4">
                {isReady ? (
                    <div className="flex flex-col items-center text-green-600 animate-in fade-in zoom-in duration-500">
                        <CheckCircle className="w-16 h-16 mb-2" />
                        <h3 className="text-xl font-bold text-gray-800">WhatsApp Connected</h3>
                        <p className="text-sm text-gray-500 mt-1">Ready to send messages</p>
                    </div>
                ) : qrCode ? (
                    <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                        <div className="bg-white p-2 rounded-lg shadow-inner mb-4 border border-gray-200">
                            <QRCodeSVG value={qrCode} size={256} className="w-full h-auto" />
                        </div>
                        <p className="text-sm text-gray-500 font-medium flex items-center gap-2">
                            <Smartphone className="w-4 h-4" />
                            Scan with WhatsApp
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center text-gray-400 py-10">
                        <Loader2 className="w-10 h-10 animate-spin mb-3 text-blue-500" />
                        <p className="text-sm font-medium">Waiting for QR Code...</p>
                        <p className="text-xs text-gray-400 mt-1">Please wait while client initializes</p>
                    </div>
                )}
            </div>
        </div>
    );
}
