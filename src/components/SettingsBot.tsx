"use client";

import React, { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { MessageSquareReply, Plus, Trash2, Save, Loader2, Info } from "lucide-react";

export interface AutoResponseRule {
    keyword: string;
    response: string;
    exactMatch: boolean;
}

export function SettingsBot() {
    const [rules, setRules] = useState<AutoResponseRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => {
        fetchRules();
    }, []);

    const fetchRules = async () => {
        try {
            const res = await fetch(`${API_URL}/api/auto-responses`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setRules(data);
            }
        } catch (e) {
            setStatus({ type: 'error', message: 'Failed to load bot rules' });
        } finally {
            setLoading(false);
        }
    };

    const saveRules = async () => {
        setSaving(true);
        setStatus(null);
        try {
            const res = await fetch(`${API_URL}/api/auto-responses`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rules })
            });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', message: 'Bot configuration saved successfully' });
                setTimeout(() => setStatus(null), 3000);
            } else {
                setStatus({ type: 'error', message: data.error || 'Failed to save rules' });
            }
        } catch (e) {
            setStatus({ type: 'error', message: 'Could not connect to backend' });
        } finally {
            setSaving(false);
        }
    };

    const addRule = () => {
        setRules([...rules, { keyword: "", response: "", exactMatch: true }]);
    };

    const removeRule = (index: number) => {
        setRules(rules.filter((_, i) => i !== index));
    };

    const updateRule = (index: number, field: keyof AutoResponseRule, value: string | boolean) => {
        const newRules = [...rules];
        newRules[index] = { ...newRules[index], [field]: value };
        setRules(newRules);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#00a884]" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <MessageSquareReply className="w-6 h-6 text-[#00a884]" />
                        Auto-Reply Bot Configuration
                    </h2>
                    <p className="text-sm text-gray-500 mt-1">
                        Configure automated replies triggered when contacts message your WhatsApp.
                    </p>
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <button
                        onClick={addRule}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg font-medium transition text-sm"
                    >
                        <Plus className="w-4 h-4" />
                        Add Rule
                    </button>
                    <button
                        onClick={saveRules}
                        disabled={saving}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-[#00a884] text-white hover:bg-[#008f70] px-5 py-2 rounded-lg font-medium transition text-sm disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>

            {status && (
                <div className={`p-4 rounded-lg mb-6 text-sm font-medium ${status.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {status.message}
                </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-sm text-amber-800 flex items-start gap-3">
                <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                    <p className="font-semibold mb-1">How rules work:</p>
                    <ul className="list-disc list-inside space-y-1 text-amber-700 text-xs">
                        <li><strong>Exact Match:</strong> The incoming message must match the keyword exactly.</li>
                        <li><strong>Contains:</strong> Triggers if the keyword appears anywhere in the message.</li>
                    </ul>
                </div>
            </div>

            {rules.length === 0 ? (
                <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <MessageSquareReply className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                    <h3 className="font-semibold text-gray-700">No auto-reply rules configured</h3>
                    <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
                        Click "Add Rule" above to create your first automated response rule.
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {rules.map((rule, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col md:flex-row gap-4 items-start md:items-center">
                            <div className="flex-1 w-full space-y-3 md:space-y-0 md:flex md:gap-4">
                                <div className="md:w-1/3">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Trigger Keyword</label>
                                    <input
                                        type="text"
                                        value={rule.keyword}
                                        onChange={(e) => updateRule(index, "keyword", e.target.value)}
                                        placeholder="e.g. hello, price, info"
                                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00a884] focus:outline-none"
                                    />
                                </div>

                                <div className="flex-1">
                                    <label className="block text-xs font-semibold text-gray-600 mb-1">Auto-Response Message</label>
                                    <input
                                        type="text"
                                        value={rule.response}
                                        onChange={(e) => updateRule(index, "response", e.target.value)}
                                        placeholder="Type automated reply here..."
                                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#00a884] focus:outline-none"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end pt-2 md:pt-0 border-t md:border-t-0 border-gray-200">
                                <label className="flex items-center gap-2 text-xs font-medium text-gray-600 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={rule.exactMatch}
                                        onChange={(e) => updateRule(index, "exactMatch", e.target.checked)}
                                        className="rounded text-[#00a884] focus:ring-[#00a884] h-4 w-4"
                                    />
                                    Exact match
                                </label>

                                <button
                                    onClick={() => removeRule(index)}
                                    className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition"
                                    title="Delete Rule"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
