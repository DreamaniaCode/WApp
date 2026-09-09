"use client";

import React, { useState } from "react";
import { API_URL } from "@/lib/config";
import { Users, Download, Loader2, FolderClosed, Search, FileDown } from "lucide-react";
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
}

export function GroupExtractor({ isReady }: GroupExtractorProps) {
    const [groups, setGroups] = useState<Group[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [extractingId, setExtractingId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [error, setError] = useState<string | null>(null);

    const fetchGroups = async () => {
        if (!isReady) return;
        setLoadingGroups(true);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/api/groups`);
            const data = await res.json();
            if (data.success) {
                setGroups(data.groups);
            } else {
                setError(data.error || "Failed to fetch groups");
            }
        } catch (e) {
            setError("Could not connect to backend");
        } finally {
            setLoadingGroups(false);
        }
    };

    const extractParticipants = async (groupId: string, groupName: string) => {
        if (!isReady) return;
        setExtractingId(groupId);
        setError(null);
        try {
            const res = await fetch(`${API_URL}/api/groups/${encodeURIComponent(groupId)}/participants`);
            const data = await res.json();
            if (data.success) {
                exportToCsv(data.participants, groupName);
            } else {
                setError(data.error || "Failed to extract participants");
            }
        } catch (e) {
            setError("Could not connect to backend");
        } finally {
            setExtractingId(null);
        }
    };

    const exportToCsv = (participants: Participant[], groupName: string) => {
        const headers = ["Number", "Name"];
        const rows = participants.map(p => [
            p.number || "",
            (p.name || "").replace(/,/g, "") // remove commas to prevent csv issues
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

    const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <Users className="w-6 h-6 text-[#00a884]" />
                        Group Contacts Extractor
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Extract and download phone numbers from your WhatsApp groups
                    </p>
                </div>
                <button
                    onClick={fetchGroups}
                    disabled={!isReady || loadingGroups}
                    className="whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loadingGroups ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderClosed className="w-4 h-4" />}
                    {groups.length > 0 ? "Refresh Groups" : "Fetch Groups"}
                </button>
            </div>

            {error && (
                <div className="mb-4 bg-red-50 text-red-600 p-3 rounded-lg text-sm border border-red-100 relative">
                    {error}
                    <button onClick={() => setError(null)} className="absolute right-3 top-3 opacity-50 hover:opacity-100">✕</button>
                </div>
            )}

            {!isReady ? (
                <div className="py-12 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-100">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>Connect your WhatsApp to view your groups</p>
                </div>
            ) : groups.length === 0 && !loadingGroups ? (
                <div className="py-12 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-100">
                    <p>Click "Fetch Groups" to see your WhatsApp groups</p>
                </div>
            ) : loadingGroups && groups.length === 0 ? (
                <div className="py-12 text-center text-gray-500 bg-gray-50 rounded-lg border border-gray-100 flex flex-col items-center">
                    <Loader2 className="w-8 h-8 animate-spin text-[#00a884] mb-3" />
                    <p>Fetching your groups...</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Search groups..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#00a884]/20 focus:border-[#00a884] text-sm transition-all"
                        />
                    </div>

                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="max-h-[400px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-sm">
                                    <tr>
                                        <th className="px-4 py-3 font-medium">Group Name</th>
                                        <th className="px-4 py-3 font-medium text-center">Participants</th>
                                        <th className="px-4 py-3 font-medium text-right">Action</th>
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
                                                <td className="px-4 py-3 font-medium text-gray-800">
                                                    {group.name}
                                                </td>
                                                <td className="px-4 py-3 text-center text-gray-600">
                                                    {group.participantsCount}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <button
                                                        onClick={() => extractParticipants(group.id, group.name)}
                                                        disabled={extractingId === group.id}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#00a884] bg-[#00a884]/10 hover:bg-[#00a884]/20 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        {extractingId === group.id ? (
                                                            <>
                                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                Extracting...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <FileDown className="w-3.5 h-3.5" />
                                                                Export CSV
                                                            </>
                                                        )}
                                                    </button>
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
