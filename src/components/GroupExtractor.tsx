"use client";

import React, { useState } from "react";
import { API_URL } from "@/lib/config";
import { Users, Loader2, FolderClosed, Search, FileDown, Send, CheckCircle2 } from "lucide-react";

interface Group {
    id: string;
    name: string;
    participantsCount: number;
}

interface Participant {
    number: string;
    name: string;
}

interface GroupExtractorProps {
    isReady: boolean;
    onSendToBulk?: (participants: { number: string; name: string }[]) => void;
}

export function GroupExtractor({ isReady, onSendToBulk }: GroupExtractorProps) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [extractingId, setExtractingId] = useState<string | null>(null);
    const [sendingBulkId, setSendingBulkId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const fetchGroups = async () => {
        if (!isReady) return;
        setLoadingGroups(true);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await fetch(`${API_URL}/api/groups`);
            const data = await res.json();
            if (data.success) {
                setGroups(data.groups || []);
            } else {
                setError(data.error || "Failed to fetch groups");
            }
        } catch {
            setError("Could not connect to backend");
        } finally {
            setLoadingGroups(false);
        }
    };

    const sendGroupToBulk = async (groupId: string, groupName: string) => {
        if (!isReady) return;
        setSendingBulkId(groupId);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await fetch(`${API_URL}/api/groups/${encodeURIComponent(groupId)}/participants`);
            const data = await res.json();
            if (data.success && data.participants) {
                const cleanParticipants = data.participants
                    .map((p: any) => ({
                        number: p.number || "",
                        name: p.name || ""
                    }))
                    .filter((p: any) => p.number && p.number.length >= 6);

                localStorage.setItem("bulk_imported_recipients", JSON.stringify(cleanParticipants));
                setSuccessMessage(`Loaded ${cleanParticipants.length} contacts from "${groupName}" into Bulk Sender!`);
                if (onSendToBulk) {
                    onSendToBulk(cleanParticipants);
                }
            } else {
                setError(data.error || "Failed to extract group participants");
            }
        } catch {
            setError("Could not connect to backend");
        } finally {
            setSendingBulkId(null);
        }
    };

    const extractParticipants = async (groupId: string, groupName: string) => {
        if (!isReady) return;
        setExtractingId(groupId);
        setError(null);
        setSuccessMessage(null);
        try {
            const res = await fetch(`${API_URL}/api/groups/${encodeURIComponent(groupId)}/participants`);
            const data = await res.json();
            if (data.success) {
                exportToCsv(data.participants, groupName);
            } else {
                setError(data.error || "Failed to extract participants");
            }
        } catch {
            setError("Could not connect to backend");
        } finally {
            setExtractingId(null);
        }
    };

    const exportToCsv = (participants: Participant[], groupName: string) => {
        const headers = ["Number", "Name"];
        const rows = participants.map(p => [
            p.number || "",
            (p.name || "").replace(/,/g, "")
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(e => e.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.setAttribute("download", `${groupName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_contacts.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredGroups = groups.filter(g => (g.name || "").toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Users className="w-6 h-6 text-blue-600" />
                        Group Contacts Extractor
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Extract, export, or send numbers directly from your WhatsApp groups into Bulk Messages
                    </p>
                </div>
                <button
                    onClick={fetchGroups}
                    disabled={!isReady || loadingGroups}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                >
                    {loadingGroups ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderClosed className="w-4 h-4" />}
                    {groups.length > 0 ? "Refresh Groups" : "Fetch Groups"}
                </button>
            </div>

            {error && (
                <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100 relative">
                    {error}
                    <button onClick={() => setError(null)} className="absolute right-3 top-3 opacity-50 hover:opacity-100">✕</button>
                </div>
            )}

            {successMessage && (
                <div className="mb-4 bg-green-50 text-green-700 p-3 rounded-xl text-sm border border-green-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    <span>{successMessage}</span>
                </div>
            )}

            {!isReady ? (
                <div className="py-12 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-100">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Connect your WhatsApp session to view and extract groups</p>
                </div>
            ) : groups.length === 0 && !loadingGroups ? (
                <div className="py-12 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-100">
                    <p>Click "Fetch Groups" to load all your WhatsApp groups</p>
                </div>
            ) : loadingGroups && groups.length === 0 ? (
                <div className="py-12 text-center text-gray-500 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
                    <p>Fetching your groups...</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search groups by name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm transition-all"
                        />
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                        <div className="max-h-[420px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-xs border-b border-gray-200">
                                    <tr>
                                        <th className="px-4 py-3 font-semibold">Group Name</th>
                                        <th className="px-4 py-3 font-semibold text-center">Participants</th>
                                        <th className="px-4 py-3 font-semibold text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredGroups.length === 0 ? (
                                        <tr>
                                            <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                                                No groups found matching "{searchQuery}"
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredGroups.map((group) => (
                                            <tr key={group.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-3 font-semibold text-gray-800">
                                                    {group.name}
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-600 font-mono text-xs">
                                                    {group.participantsCount} members
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <div className="inline-flex items-center gap-2">
                                                        <button
                                                            onClick={() => sendGroupToBulk(group.id, group.name)}
                                                            disabled={sendingBulkId === group.id}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors disabled:opacity-50"
                                                        >
                                                            {sendingBulkId === group.id ? (
                                                                <>
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    Importing...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Send className="w-3.5 h-3.5" />
                                                                    Send to Bulk
                                                                </>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => extractParticipants(group.id, group.name)}
                                                            disabled={extractingId === group.id}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                                                        >
                                                            {extractingId === group.id ? (
                                                                <>
                                                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    Exporting...
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <FileDown className="w-3.5 h-3.5" />
                                                                    Export CSV
                                                                </>
                                                            )}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="text-xs text-gray-400 text-right">
                        Showing {filteredGroups.length} of {groups.length} groups
                    </div>
                </div>
            )}
        </div>
    );
}
