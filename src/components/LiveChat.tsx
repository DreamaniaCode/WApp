"use client";

import React, { useState, useEffect, useRef } from "react";
import {
    MessageCircle,
    Search,
    Send,
    Bot,
    User,
    AlertTriangle,
    CheckCheck,
    Phone,
    Copy,
    Check,
    RefreshCw,
    Sparkles,
    Filter,
    Clock,
    X,
    Bell
} from "lucide-react";
import { soundEffects } from "@/utils/soundEffects";
import { API_URL } from "@/lib/config";

interface ChatMessage {
    id: string;
    fromMe: boolean;
    body: string;
    timestamp: number;
    isAiReply?: boolean;
    source?: string;
    confidence?: string | null;
}

interface Conversation {
    id: string;
    name: string;
    number: string;
    lastMessage: string;
    lastTimestamp: number;
    unreadCount: number;
    mode: "ai" | "manual";
    requestedAgent: boolean;
    agentRequestTimestamp?: number | null;
}

interface LiveChatProps {
    socket: any;
    isReady?: boolean;
}

export function LiveChat({ socket, isReady = true }: LiveChatProps) {
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [searchQuery, setSearchQuery] = useState("");
    const [filterMode, setFilterMode] = useState<"all" | "unread" | "ai" | "manual" | "agent">("all");
    const [loadingConvs, setLoadingConvs] = useState(true);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [sending, setSending] = useState(false);
    const [isSyncing, setIsSyncing] = useState(false);
    const [agentAlert, setAgentAlert] = useState<{ name: string; number: string; body: string } | null>(null);
    const [copiedPhone, setCopiedPhone] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    const fetchConversations = async () => {
        try {
            const res = await fetch(`${API_URL}/api/chat/conversations`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setConversations(data);
                if (!selectedChatId && data.length > 0) {
                    setSelectedChatId(data[0].id);
                }
            }
        } catch (e) {
            console.error("Failed to load conversations", e);
        } finally {
            setLoadingConvs(false);
        }
    };

    const syncWhatsAppChats = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch(`${API_URL}/api/chat/sync`);
            const data = await res.json();
            if (data.success && Array.isArray(data.conversations)) {
                setConversations(data.conversations);
                soundEffects.playSuccessSound();
                if (!selectedChatId && data.conversations.length > 0) {
                    setSelectedChatId(data.conversations[0].id);
                }
            } else if (data.error) {
                alert(data.error);
            }
        } catch (e) {
            console.error("Failed to sync chats", e);
            alert("Erreur lors de la synchronisation des conversations");
        } finally {
            setIsSyncing(false);
        }
    };

    const fetchMessages = async (chatId: string) => {
        setLoadingMsgs(true);
        try {
            const res = await fetch(`${API_URL}/api/chat/messages/${encodeURIComponent(chatId)}`);
            const data = await res.json();
            if (data.success) {
                setMessages(data.messages || []);
                // Mark as read locally
                setConversations(prev =>
                    prev.map(c => c.id === chatId ? { ...c, unreadCount: 0 } : c)
                );
            }
        } catch (e) {
            console.error("Failed to load messages", e);
        } finally {
            setLoadingMsgs(false);
            setTimeout(scrollToBottom, 100);
        }
    };

    useEffect(() => {
        fetchConversations();
    }, []);

    useEffect(() => {
        if (selectedChatId) {
            fetchMessages(selectedChatId);
        }
    }, [selectedChatId]);

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    // Socket.io real-time updates
    useEffect(() => {
        if (!socket) return;

        const onIncoming = (data: any) => {
            soundEffects.playIncomingMessageSound();
            fetchConversations();
            if (selectedChatId && (data.from === selectedChatId || data.from.includes(selectedChatId))) {
                setMessages(prev => [
                    ...prev,
                    {
                        id: data.id || String(Date.now()),
                        fromMe: false,
                        body: data.body,
                        timestamp: data.timestamp || Date.now()
                    }
                ]);
            }
        };

        const onOutgoing = (data: any) => {
            fetchConversations();
            if (selectedChatId && (data.to === selectedChatId || data.to.includes(selectedChatId))) {
                setMessages(prev => [
                    ...prev,
                    {
                        id: data.id || String(Date.now()),
                        fromMe: true,
                        body: data.body,
                        timestamp: data.timestamp || Date.now()
                    }
                ]);
            }
        };

        const onMessageAdded = (payload: any) => {
            fetchConversations();
            if (selectedChatId && payload.chatId === selectedChatId) {
                setMessages(prev => {
                    if (prev.some(m => m.id === payload.message.id)) return prev;
                    return [...prev, payload.message];
                });
            }
        };

        const onAgentRequested = (data: any) => {
            soundEffects.playAgentRequestedSound();
            setAgentAlert({
                name: data.name || data.number,
                number: data.number,
                body: data.body
            });
            fetchConversations();
            if (selectedChatId && selectedChatId === data.chatId) {
                fetchMessages(data.chatId);
            }
        };

        const onModeChanged = (payload: any) => {
            setConversations(prev =>
                prev.map(c => c.id === payload.chatId ? { ...c, mode: payload.mode } : c)
            );
        };

        const onAgentResolved = (payload: any) => {
            setConversations(prev =>
                prev.map(c => c.id === payload.chatId ? { ...c, requestedAgent: false } : c)
            );
        };

        const onChatSynced = (list: any) => {
            if (Array.isArray(list)) {
                setConversations(list);
            }
        };

        socket.on("incoming_message", onIncoming);
        socket.on("outgoing_message", onOutgoing);
        socket.on("chat:message_added", onMessageAdded);
        socket.on("agent_requested", onAgentRequested);
        socket.on("chat:mode_changed", onModeChanged);
        socket.on("chat:agent_request_resolved", onAgentResolved);
        socket.on("chat:synced", onChatSynced);

        return () => {
            socket.off("incoming_message", onIncoming);
            socket.off("outgoing_message", onOutgoing);
            socket.off("chat:message_added", onMessageAdded);
            socket.off("agent_requested", onAgentRequested);
            socket.off("chat:mode_changed", onModeChanged);
            socket.off("chat:agent_request_resolved", onAgentResolved);
            socket.off("chat:synced", onChatSynced);
        };
    }, [socket, selectedChatId]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newMessage.trim() || !selectedChatId || sending) return;

        const textToSend = newMessage.trim();
        setNewMessage("");
        setSending(true);

        try {
            const res = await fetch(`${API_URL}/api/chat/send`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chatId: selectedChatId,
                    message: textToSend
                })
            });
            const data = await res.json();
            if (data.success) {
                soundEffects.playSuccessSound();
                setMessages(prev => [
                    ...prev,
                    {
                        id: `msg-${Date.now()}`,
                        fromMe: true,
                        body: textToSend,
                        timestamp: Date.now(),
                        source: "manual"
                    }
                ]);
            } else {
                alert(data.error || "Erreur lors de l'envoi du message");
            }
        } catch (err) {
            console.error("Send error", err);
            alert("Erreur de connexion lors de l'envoi");
        } finally {
            setSending(false);
            setTimeout(scrollToBottom, 50);
        }
    };

    const handleToggleMode = async () => {
        if (!selectedChatId) return;
        const currentConv = conversations.find(c => c.id === selectedChatId);
        const targetMode = currentConv?.mode === "manual" ? "ai" : "manual";

        try {
            const res = await fetch(`${API_URL}/api/chat/mode`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId: selectedChatId, mode: targetMode })
            });
            const data = await res.json();
            if (data.success) {
                setConversations(prev =>
                    prev.map(c => c.id === selectedChatId ? { ...c, mode: targetMode } : c)
                );
            }
        } catch (e) {
            console.error("Failed to toggle mode", e);
        }
    };

    const handleResolveAgent = async () => {
        if (!selectedChatId) return;
        try {
            await fetch(`${API_URL}/api/chat/resolve-agent-request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chatId: selectedChatId })
            });
            setConversations(prev =>
                prev.map(c => c.id === selectedChatId ? { ...c, requestedAgent: false } : c)
            );
            if (agentAlert && selectedChatId.includes(agentAlert.number)) {
                setAgentAlert(null);
            }
        } catch (e) {
            console.error("Failed to resolve agent request", e);
        }
    };

    const selectedConv = conversations.find(c => c.id === selectedChatId);

    const filteredConversations = conversations.filter(c => {
        const matchesSearch =
            (c.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            (c.number || "").includes(searchQuery) ||
            (c.lastMessage || "").toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return false;
        if (filterMode === "unread") return c.unreadCount > 0;
        if (filterMode === "ai") return c.mode === "ai";
        if (filterMode === "manual") return c.mode === "manual";
        if (filterMode === "agent") return c.requestedAgent;
        return true;
    });

    const copyPhone = (num: string) => {
        navigator.clipboard.writeText(num);
        setCopiedPhone(true);
        setTimeout(() => setCopiedPhone(false), 2000);
    };

    const quickReplies = [
        "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
        "Je prends en charge votre demande immédiatement.",
        "Un instant s'il vous plaît, je vérifie vos informations.",
        "Merci pour votre message ! Notre équipe revient vers vous."
    ];

    return (
        <div className="space-y-4">
            {/* Human Agent Notification Banner Toast */}
            {agentAlert && (
                <div className="bg-gradient-to-r from-red-600 via-amber-600 to-orange-600 text-white rounded-2xl p-4 shadow-lg flex items-center justify-between animate-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                            <Bell className="w-6 h-6 animate-bounce" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="font-extrabold text-sm uppercase tracking-wide bg-white/30 px-2 py-0.5 rounded-full">
                                    Demande d'Agent Humain
                                </span>
                                <span className="font-semibold text-xs text-white/90">
                                    {agentAlert.name} ({agentAlert.number})
                                </span>
                            </div>
                            <p className="text-xs text-white/95 mt-1 line-clamp-1 italic">
                                "{agentAlert.body}"
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            onClick={() => {
                                const target = conversations.find(c => c.number === agentAlert.number || c.id.includes(agentAlert.number));
                                if (target) setSelectedChatId(target.id);
                                setAgentAlert(null);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-white text-gray-900 font-bold text-xs shadow-sm hover:bg-gray-100 transition"
                        >
                            Ouvrir la Conversation
                        </button>
                        <button
                            onClick={() => setAgentAlert(null)}
                            className="p-1 rounded-lg text-white/70 hover:text-white transition"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Main Chat Container */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden h-[750px] flex flex-col md:flex-row">
                {/* Left Pane: Conversations List */}
                <div className="w-full md:w-80 lg:w-96 border-r border-gray-200 flex flex-col bg-gray-50/50">
                    {/* Header & Search */}
                    <div className="p-4 border-b border-gray-200 bg-white space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <MessageCircle className="w-5 h-5 text-emerald-600" />
                                <h2 className="font-bold text-gray-900 text-sm">Live Chat WhatsApp</h2>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <button
                                    onClick={syncWhatsAppChats}
                                    disabled={isSyncing}
                                    title="Synchroniser avec WhatsApp (récupérer les discussions du téléphone)"
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-50"
                                >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-emerald-600" : ""}`} />
                                    <span className="hidden sm:inline">{isSyncing ? "Sync..." : "Sync WhatsApp"}</span>
                                </button>
                                <button
                                    onClick={fetchConversations}
                                    title="Actualiser la liste locale"
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Search Bar */}
                        <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Rechercher un contact ou message..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                            />
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex gap-1 overflow-x-auto pb-1 text-[11px] font-semibold text-gray-600 scrollbar-none">
                            <button
                                onClick={() => setFilterMode("all")}
                                className={`px-2.5 py-1 rounded-lg shrink-0 transition ${filterMode === "all" ? "bg-emerald-600 text-white" : "hover:bg-gray-100"}`}
                            >
                                Tous ({conversations.length})
                            </button>
                            <button
                                onClick={() => setFilterMode("agent")}
                                className={`px-2.5 py-1 rounded-lg shrink-0 transition flex items-center gap-1 ${filterMode === "agent" ? "bg-red-600 text-white" : "text-red-700 bg-red-50 hover:bg-red-100"}`}
                            >
                                🔔 Agents ({conversations.filter(c => c.requestedAgent).length})
                            </button>
                            <button
                                onClick={() => setFilterMode("manual")}
                                className={`px-2.5 py-1 rounded-lg shrink-0 transition ${filterMode === "manual" ? "bg-amber-600 text-white" : "hover:bg-gray-100"}`}
                            >
                                👤 Manuel
                            </button>
                            <button
                                onClick={() => setFilterMode("ai")}
                                className={`px-2.5 py-1 rounded-lg shrink-0 transition ${filterMode === "ai" ? "bg-indigo-600 text-white" : "hover:bg-gray-100"}`}
                            >
                                🤖 IA
                            </button>
                        </div>
                    </div>

                    {/* Conversations Scrollable List */}
                    <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                        {loadingConvs ? (
                            <div className="p-8 text-center text-xs text-gray-400">
                                Chargement des conversations...
                            </div>
                        ) : filteredConversations.length === 0 ? (
                            <div className="p-8 text-center text-xs text-gray-400 space-y-2">
                                <MessageCircle className="w-8 h-8 mx-auto text-gray-300" />
                                <p>Aucune conversation trouvée.</p>
                            </div>
                        ) : (
                            filteredConversations.map(c => {
                                const isSelected = c.id === selectedChatId;
                                const isManual = c.mode === "manual";
                                return (
                                    <div
                                        key={c.id}
                                        onClick={() => setSelectedChatId(c.id)}
                                        className={`p-3.5 cursor-pointer transition flex items-start gap-3 relative ${
                                            isSelected ? "bg-emerald-50/70 border-l-4 border-emerald-600" : "hover:bg-gray-100/70 bg-white"
                                        }`}
                                    >
                                        {/* Avatar */}
                                        <div className="relative shrink-0">
                                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white font-bold flex items-center justify-center text-sm shadow-2xs">
                                                {(c.name || c.number || "C").slice(0, 2).toUpperCase()}
                                            </div>
                                            {c.requestedAgent && (
                                                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-600 border-2 border-white animate-pulse" />
                                            )}
                                        </div>

                                        {/* Details */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between">
                                                <h4 className="font-bold text-gray-900 text-xs truncate max-w-[140px]">
                                                    {c.name || c.number}
                                                </h4>
                                                <span className="text-[10px] text-gray-400 shrink-0">
                                                    {c.lastTimestamp ? new Date(c.lastTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </div>

                                            <p className="text-[11px] text-gray-500 truncate mt-0.5 line-clamp-1">
                                                {c.lastMessage || "Nouveau message"}
                                            </p>

                                            {/* Badges Row */}
                                            <div className="flex items-center gap-1.5 mt-1.5">
                                                {c.requestedAgent ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 animate-pulse">
                                                        🔔 Demande Agent
                                                    </span>
                                                ) : isManual ? (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">
                                                        👤 Manuel
                                                    </span>
                                                ) : (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200 flex items-center gap-1">
                                                        <Bot className="w-2.5 h-2.5" /> IA
                                                    </span>
                                                )}

                                                {c.unreadCount > 0 && (
                                                    <span className="ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                                                        {c.unreadCount}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* Right Pane: Active Chat Window */}
                <div className="flex-1 flex flex-col bg-white">
                    {selectedConv ? (
                        <>
                            {/* Chat Header */}
                            <div className="p-3.5 px-5 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-emerald-600 text-white font-bold flex items-center justify-center text-sm">
                                        {(selectedConv.name || selectedConv.number).slice(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-gray-900 text-sm">
                                                {selectedConv.name}
                                            </h3>
                                            <button
                                                onClick={() => copyPhone(selectedConv.number)}
                                                className="text-[11px] text-gray-500 hover:text-gray-900 flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-2 py-0.5 rounded-md transition"
                                            >
                                                {copiedPhone ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                                +{selectedConv.number}
                                            </button>
                                        </div>
                                        <p className="text-[11px] text-gray-400">
                                            WhatsApp Contact • ID: {selectedConv.id}
                                        </p>
                                    </div>
                                </div>

                                {/* State Action Controls */}
                                <div className="flex items-center gap-2">
                                    {/* Resolve Agent Request Button */}
                                    {selectedConv.requestedAgent && (
                                        <button
                                            onClick={handleResolveAgent}
                                            className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-xs font-bold transition flex items-center gap-1.5 shadow-2xs"
                                        >
                                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                                            Prendre en charge (Résolu)
                                        </button>
                                    )}

                                    {/* Interactive Toggle: AI Mode vs Manual Mode */}
                                    <button
                                        onClick={handleToggleMode}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-2xs ${
                                            selectedConv.mode === "manual"
                                                ? "bg-amber-500 text-white hover:bg-amber-600"
                                                : "bg-indigo-600 text-white hover:bg-indigo-700"
                                        }`}
                                    >
                                        {selectedConv.mode === "manual" ? (
                                            <>
                                                <User className="w-3.5 h-3.5" />
                                                <span>Mode: Opérateur Manuel</span>
                                            </>
                                        ) : (
                                            <>
                                                <Bot className="w-3.5 h-3.5" />
                                                <span>Mode: Répondeur IA</span>
                                            </>
                                        )}
                                        <span className="text-[10px] opacity-80 underline ml-1">Changer</span>
                                    </button>
                                </div>
                            </div>

                            {/* Alert Banner if Agent is Requested */}
                            {selectedConv.requestedAgent && (
                                <div className="bg-red-50 border-b border-red-200 p-2.5 px-5 flex items-center justify-between text-xs text-red-800">
                                    <div className="flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                                        <span className="font-semibold">
                                            Le client a demandé l'intervention d'un agent humain. Le répondeur IA est suspendu.
                                        </span>
                                    </div>
                                    <button
                                        onClick={handleResolveAgent}
                                        className="text-xs underline font-bold hover:text-red-900 ml-4"
                                    >
                                        Marquer comme pris en charge
                                    </button>
                                </div>
                            )}

                            {/* Messages Stream View */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#efeae2]/30">
                                {loadingMsgs ? (
                                    <div className="h-full flex items-center justify-center text-xs text-gray-400">
                                        Chargement de la discussion...
                                    </div>
                                ) : messages.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-xs text-gray-400 space-y-2">
                                        <MessageCircle className="w-10 h-10 text-gray-300" />
                                        <p>Aucun message dans cette conversation.</p>
                                        <p className="text-[11px] text-gray-400">Envoyez un message ci-dessous pour démarrer l'échange.</p>
                                    </div>
                                ) : (
                                    messages.map((m, idx) => {
                                        const isOutgoing = m.fromMe;
                                        return (
                                            <div
                                                key={m.id || idx}
                                                className={`flex flex-col ${isOutgoing ? "items-end" : "items-start"}`}
                                            >
                                                <div
                                                    className={`max-w-[75%] rounded-2xl p-3 text-xs relative shadow-2xs ${
                                                        isOutgoing
                                                            ? m.isAiReply
                                                                ? "bg-indigo-600 text-white rounded-tr-none"
                                                                : "bg-emerald-600 text-white rounded-tr-none"
                                                            : "bg-white text-gray-900 border border-gray-200 rounded-tl-none"
                                                    }`}
                                                >
                                                    {/* AI Badge for bot replies */}
                                                    {m.isAiReply && (
                                                        <div className="flex items-center gap-1 text-[10px] font-bold text-indigo-200 mb-1 pb-1 border-b border-indigo-500/30">
                                                            <Bot className="w-3 h-3" />
                                                            <span>Réponse Automatique ({m.source || "IA"})</span>
                                                        </div>
                                                    )}

                                                    <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>

                                                    <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${isOutgoing ? "text-white/75" : "text-gray-400"}`}>
                                                        <span>
                                                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        {isOutgoing && <CheckCheck className="w-3 h-3" />}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Quick Replies Carousel */}
                            <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/70 flex gap-2 overflow-x-auto text-[11px] scrollbar-none">
                                <span className="font-semibold text-gray-400 shrink-0 flex items-center gap-1">
                                    <Sparkles className="w-3 h-3 text-amber-500" /> Réponses rapides :
                                </span>
                                {quickReplies.map((qr, idx) => (
                                    <button
                                        key={idx}
                                        onClick={() => setNewMessage(qr)}
                                        className="px-2.5 py-1 rounded-full bg-white border border-gray-200 hover:border-emerald-500 text-gray-700 hover:text-emerald-700 transition shrink-0 shadow-2xs"
                                    >
                                        {qr}
                                    </button>
                                ))}
                            </div>

                            {/* Compose Box */}
                            <form onSubmit={handleSendMessage} className="p-3 border-t border-gray-200 bg-white flex items-center gap-2">
                                <input
                                    type="text"
                                    placeholder={selectedConv.mode === "manual" ? "Tapez votre réponse humaine ici (Mode Manuel actif)..." : "Tapez un message pour répondre au client..."}
                                    value={newMessage}
                                    onChange={e => setNewMessage(e.target.value)}
                                    className="flex-1 p-2.5 px-4 text-xs rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
                                />
                                <button
                                    type="submit"
                                    disabled={!newMessage.trim() || sending}
                                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 shadow-2xs shrink-0"
                                >
                                    <Send className="w-3.5 h-3.5" />
                                    <span>{sending ? "Envoi..." : "Envoyer"}</span>
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center">
                            <MessageCircle className="w-12 h-12 text-gray-300 mb-3" />
                            <h3 className="font-bold text-gray-700 text-sm">Sélectionnez une conversation</h3>
                            <p className="text-xs text-gray-400 mt-1">
                                Cliquez sur un contact dans la liste de gauche pour afficher et répondre en direct.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
