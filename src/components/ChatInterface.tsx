"use client";

import React, { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";
import { Send, User, Bot, Clock } from "lucide-react";
import io from "socket.io-client";

interface ChatMessage {
    id: string;
    from: string;
    number?: string;
    name?: string;
    body: string;
    timestamp: number;
    isGroup?: boolean;
    to?: string;
    direction: "in" | "out";
}

interface ChatInterfaceProps {
    isReady: boolean;
}

export function ChatInterface({ isReady }: ChatInterfaceProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const socket = io(API_URL);

        socket.on("incoming_message", (msg: Omit<ChatMessage, "direction">) => {
            if (!msg.isGroup) {
                setMessages(prev => [...prev, { ...msg, direction: "in" }]);
            }
        });

        socket.on("outgoing_message", (msg: Omit<ChatMessage, "direction">) => {
            setMessages(prev => [...prev, { ...msg, direction: "out" }]);
        });

        return () => {
            socket.off("incoming_message");
            socket.off("outgoing_message");
            socket.disconnect();
        };
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const formatTime = (ts: number) => {
        return new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true
        }).format(new Date(ts));
    };

    if (!isReady) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-8 text-center text-gray-500">
                <Bot className="w-12 h-12 mx-auto mb-3 opacity-20 text-[#00a884]" />
                <p>Connect your WhatsApp to start receiving real-time messages</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 flex flex-col h-[600px] overflow-hidden">
            <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between z-10">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#00a884]/10 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-[#00a884]" />
                    </div>
                    <div>
                        <h2 className="font-semibold text-gray-800">Live Chat Logs</h2>
                        <p className="text-xs text-[#00a884] flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-[#00a884] animate-pulse"></span>
                            Listening for incoming messages & bot replies...
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-[#efeae2] relative">
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'url("https://w0.peakpx.com/wallpaper/508/886/HD-wallpaper-whatsapp-background-theme-pattern-wallpapers.jpg")', backgroundSize: '400px' }}></div>

                {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4 relative z-10">
                        <div className="bg-white/80 backdrop-blur-sm px-6 py-4 rounded-xl shadow-sm border border-gray-200/50">
                            <Clock className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                            <h3 className="font-medium text-gray-800 mb-1">Waiting for messages</h3>
                            <p className="text-sm text-gray-500 max-w-xs">
                                New incoming messages and automated replies will appear here in real-time.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 relative z-10 flex flex-col">
                        {messages.map((msg, idx) => {
                            const showHeader = idx === 0 || messages[idx - 1].from !== msg.from;
                            return (
                                <div key={`${msg.id}-${idx}`} className={`flex flex-col ${msg.direction === "out" ? "items-end" : "items-start"}`}>
                                    <div className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm relative ${msg.direction === "out" ? "bg-[#d9fdd3] rounded-tr-none" : "bg-white rounded-tl-none border border-gray-100"}`}>
                                        {msg.direction === "in" && showHeader && (
                                            <div className="text-[11px] font-bold text-gray-600 mb-1 flex items-center gap-1">
                                                <User className="w-3 h-3" />
                                                {msg.name || msg.number || msg.from}
                                            </div>
                                        )}
                                        <div className="text-[14px] text-gray-800 whitespace-pre-wrap font-sans break-words">
                                            {msg.body}
                                        </div>
                                        <div className="text-[10px] text-gray-500 mt-1 text-right flex items-center justify-end gap-1">
                                            {formatTime(msg.timestamp)}
                                            {msg.direction === "out" && (
                                                <span className="text-[#53bdeb]">✓✓</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </div>
                )}
            </div>
        </div>
    );
}
