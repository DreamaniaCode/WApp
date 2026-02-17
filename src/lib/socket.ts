"use client";

import { useEffect, useState } from "react";
import io from "socket.io-client";
import { useSession } from "next-auth/react";
import { API_URL } from "./config";

let socket: any;

export const useSocket = () => {
    const [isConnected, setIsConnected] = useState(false);
    const { data: session, status } = useSession();

    useEffect(() => {
        if (status === "loading") return;

        if (!session) {
            if (socket) {
                console.log("Disconnecting socket (no session)...");
                socket.disconnect();
                socket = undefined;
                setIsConnected(false);
            }
            return;
        }

        if (!socket) {
            console.log("Initializing Socket.io...", API_URL);
            socket = io(API_URL, {
                withCredentials: true,
                transports: ["polling", "websocket"],
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                autoConnect: true,
            } as any);

            // Debugging
            socket.on("connect_error", (err: any) => {
                console.error("Socket connection error:", err.message); 
            });
        } else if (!socket.connected) {
             socket.connect();
        }

        function onConnect() {
            setIsConnected(true);
            console.log("Socket connected!");
        }

        function onDisconnect(reason: any) {
            setIsConnected(false);
            console.log("Socket disconnected:", reason);
        }

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        if (socket.connected) {
            setIsConnected(true);
        }

        return () => {
            if (socket) {
                socket.off("connect", onConnect);
                socket.off("disconnect", onDisconnect);
            }
        };
    }, [session, status]);

    return { socket, isConnected };
};
