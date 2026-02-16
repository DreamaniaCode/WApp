"use client";

import { useEffect, useState } from "react";
import io from "socket.io-client";

let socket: any;

export const useSocket = () => {
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!socket) {
            socket = io("http://localhost:3001");
        }

        function onConnect() {
            setIsConnected(true);
        }

        function onDisconnect() {
            setIsConnected(false);
        }

        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);

        // Initial status
        if (socket.connected) {
            setIsConnected(true);
        }

        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
        };
    }, []);

    return { socket, isConnected };
};
