"use client";

import React, { useState, useEffect } from "react";
import { API_URL } from "@/lib/config";
import { MessageSquareReply, Plus, Trash2, Save, Loader2, Globe, Brain, Sparkles, AlertCircle, CheckCircle2 } from "lucide-react";

export interface AutoResponseRule {
    keyword: string;
    response: string;
    exactMatch: boolean;
}

export interface LearnedPair {
    id: string;
    question: string;
    answer: string;
    uses?: number;
    source?: string;
    createdAt?: string;
}

export interface RagSource {
    id: string;
    title: string;
    url: string;
    chunkCount: number;
    characterCount?: number;
    createdAt?: string;
}

export function SettingsBot() {
    const [rules, setRules] = useState<AutoResponseRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
    const [tab, setTab] = useState<'rules' | 'learning' | 'rag'>('rules');

    // Self-Learning state
    const [knowledge, setKnowledge] = useState<LearnedPair[]>([]);
    const [settings, setSettings] = useState({ autoLearn: true, autoReply: true, useRag: true, similarityThreshold: 0.45 });
    const [newQuestion, setNewQuestion] = useState("");
    const [newAnswer, setNewAnswer] = useState("");
    const [showAddPair, setShowAddPair] = useState(false);

    // RAG Website Ingestion state
    const [sources, setSources] = useState<RagSource[]>([]);
    const [webUrl, setWebUrl] = useState("");
    const [crawling, setCrawling] = useState(false);
    const [docTitle, setDocTitle] = useState("");
    const [docContent, setDocContent] = useState("");
    const [showDocInput, setShowDocInput] = useState(false);
    const [testQuery, setTestQuery] = useState("");
    const [testResult, setTestResult] = useState<any>(null);
    const [testingQuery, setTestingQuery] = useState(false);

    useEffect(() => {
        loadAllData();
    }, []);

    const loadAllData = async () => {
        try {
            const resRules = await fetch(`${API_URL}/api/auto-responses`);
            const rulesData = await resRules.json();
            if (Array.isArray(rulesData)) setRules(rulesData);

            const resKnowledge = await fetch(`${API_URL}/api/chatbot/knowledge`);
            const knowData = await resKnowledge.json();
            if (knowData.success) {
                setKnowledge(knowData.pairs || []);
                if (knowData.settings) setSettings(knowData.settings);
            }

            const resSources = await fetch(`${API_URL}/api/chatbot/sources`);
            const sourcesData = await resSources.json();
            if (sourcesData.success) setSources(sourcesData.sources || []);
        } catch (e) {
            setAlert({ type: 'error', message: 'Failed to load bot rules and knowledge' });
        } finally {
            setLoading(false);
        }
    };

    const saveRules = async () => {
        setSaving(true);
        setAlert(null);
        try {
            const res = await fetch(`${API_URL}/api/auto-responses`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ rules })
            });
            const data = await res.json();
            if (data.success) {
                setAlert({ type: 'success', message: 'Bot configuration saved successfully' });
                setTimeout(() => setAlert(null), 3000);
            } else {
                setAlert({ type: 'error', message: data.error || 'Failed to save rules' });
            }
        } catch (e) {
            setAlert({ type: 'error', message: 'Could not connect to backend' });
        } finally {
            setSaving(false);
        }
    };

    const toggleLearnSetting = async () => {
        const updated = { ...settings, autoLearn: !settings.autoLearn };
        setSettings(updated);
        try {
            await fetch(`${API_URL}/api/chatbot/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updated)
            });
        } catch (e) { }
    };

    const addManualPair = async () => {
        if (!newQuestion.trim() || !newAnswer.trim()) return;
        try {
            const res = await fetch(`${API_URL}/api/chatbot/knowledge`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ question: newQuestion, answer: newAnswer })
            });
            const data = await res.json();
            if (data.success) {
                setKnowledge(prev => [{ id: data.id, question: newQuestion, answer: newAnswer, uses: 0, source: 'manual' }, ...prev]);
                setNewQuestion("");
                setNewAnswer("");
                setShowAddPair(false);
                setAlert({ type: 'success', message: 'New learned pair added successfully' });
                setTimeout(() => setAlert(null), 3000);
            }
        } catch (e) {
            setAlert({ type: 'error', message: 'Failed to add learned pair' });
        }
    };

    const deletePair = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/chatbot/knowledge/${id}`, { method: "DELETE" });
            setKnowledge(prev => prev.filter(p => p.id !== id));
        } catch (e) { }
    };

    const handleIngestUrl = async () => {
        if (!webUrl.trim() || !webUrl.startsWith("http")) {
            setAlert({ type: 'error', message: 'Please enter a valid URL (http:// or https://)' });
            return;
        }
        setCrawling(true);
        setAlert(null);
        try {
            const res = await fetch(`${API_URL}/api/chatbot/ingest-url`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: webUrl.trim() })
            });
            const data = await res.json();
            if (data.success) {
                setAlert({ type: 'success', message: `Successfully crawled and indexed ${data.chunkCount} chunks!` });
                setWebUrl("");
                const r = await fetch(`${API_URL}/api/chatbot/sources`);
                const d = await r.json();
                if (d.success) setSources(d.sources || []);
                setTimeout(() => setAlert(null), 4000);
            } else {
                setAlert({ type: 'error', message: data.error || 'Failed to crawl website' });
            }
        } catch (e) {
            setAlert({ type: 'error', message: 'Crawling network error' });
        } finally {
            setCrawling(false);
        }
    };

    const handleIngestDoc = async () => {
        if (!docTitle.trim() || !docContent.trim()) return;
        try {
            const res = await fetch(`${API_URL}/api/chatbot/ingest-text`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: docTitle, content: docContent })
            });
            const data = await res.json();
            if (data.success) {
                setAlert({ type: 'success', message: `Document indexed (${data.chunkCount} chunks)` });
                setDocTitle("");
                setDocContent("");
                setShowDocInput(false);
                const r = await fetch(`${API_URL}/api/chatbot/sources`);
                const d = await r.json();
                if (d.success) setSources(d.sources || []);
                setTimeout(() => setAlert(null), 3000);
            }
        } catch (e) { }
    };

    const deleteSource = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/chatbot/sources/${id}`, { method: "DELETE" });
            setSources(prev => prev.filter(s => s.id !== id));
        } catch (e) { }
    };

    const handleTestQuery = async () => {
        if (!testQuery.trim()) return;
        setTestingQuery(true);
        setTestResult(null);
        try {
            const res = await fetch(`${API_URL}/api/chatbot/test-query`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: testQuery })
            });
            const data = await res.json();
            setTestResult(data.match || { notFound: true });
        } catch (e) {
            setTestResult({ error: 'Failed to test query' });
        } finally {
            setTestingQuery(false);
        }
    };

    const addRule = () => setRules([...rules, { keyword: "", response: "", exactMatch: true }]);
    const removeRule = (idx: number) => setRules(rules.filter((_, i) => i !== idx));
    const updateRule = (idx: number, field: keyof AutoResponseRule, val: any) => {
        const copy = [...rules];
        copy[idx] = { ...copy[idx], [field]: val };
        setRules(copy);
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#00a884]" />
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-6 flex flex-col gap-5">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-100 pb-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        <MessageSquareReply className="w-6 h-6 text-[#00a884]" />
                        Auto-Reply & AI Chatbot
                    </h2>
                    <p className="text-xs text-gray-500 mt-1">
                        Configure keyword rules, conversation self-learning, and RAG website knowledge.
                    </p>
                </div>
                {tab === 'rules' && (
                    <button
                        onClick={saveRules}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-[#00a884] hover:bg-[#008f6f] text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Config
                    </button>
                )}
            </div>

            {/* Sub-tabs */}
            <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg text-xs font-semibold text-gray-600">
                <button
                    onClick={() => setTab('rules')}
                    className={`flex-1 py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 ${tab === 'rules' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
                >
                    <MessageSquareReply className="w-3.5 h-3.5 text-[#00a884]" />
                    Keyword Rules ({rules.length})
                </button>
                <button
                    onClick={() => setTab('learning')}
                    className={`flex-1 py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 ${tab === 'learning' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
                >
                    <Brain className="w-3.5 h-3.5 text-purple-600" />
                    Self-Learning ({knowledge.length})
                </button>
                <button
                    onClick={() => setTab('rag')}
                    className={`flex-1 py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 ${tab === 'rag' ? 'bg-white text-gray-900 shadow-sm' : 'hover:text-gray-900'}`}
                >
                    <Globe className="w-3.5 h-3.5 text-sky-600" />
                    Website & RAG ({sources.length})
                </button>
            </div>

            {/* Alert */}
            {alert && (
                <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${alert.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {alert.type === 'success' ? <CheckCircle2 className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
                    {alert.message}
                </div>
            )}

            {/* Tab 1: Keyword Rules */}
            {tab === 'rules' && (
                <div className="space-y-4">
                    {rules.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg border border-gray-100 border-dashed">
                            <p className="text-sm">No auto-reply rules configured yet.</p>
                            <button onClick={addRule} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#00a884] hover:text-[#008f6f]">
                                <Plus className="w-4 h-4" />
                                Add your first rule
                            </button>
                        </div>
                    ) : (
                        rules.map((rule, idx) => (
                            <div key={idx} className="flex flex-col md:flex-row gap-4 p-4 border border-gray-200 rounded-lg bg-gray-50 relative group">
                                <div className="flex-1 space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Incoming Keyword</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., pricing, hello"
                                            value={rule.keyword}
                                            onChange={e => updateRule(idx, 'keyword', e.target.value)}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] text-sm text-gray-900"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id={`exact-${idx}`}
                                            checked={rule.exactMatch}
                                            onChange={e => updateRule(idx, 'exactMatch', e.target.checked)}
                                            className="rounded border-gray-300 text-[#00a884] focus:ring-[#00a884]"
                                        />
                                        <label htmlFor={`exact-${idx}`} className="text-xs text-gray-600 cursor-pointer">
                                            Exact match only (ignores case and spaces)
                                        </label>
                                    </div>
                                </div>
                                <div className="flex-[2] space-y-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Auto Response</label>
                                        <textarea
                                            placeholder="Type your automated response here..."
                                            value={rule.response}
                                            onChange={e => updateRule(idx, 'response', e.target.value)}
                                            rows={3}
                                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:border-[#00a884] focus:ring-1 focus:ring-[#00a884] text-sm text-gray-900 resize-none"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeRule(idx)}
                                    className="absolute right-2 top-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                                    title="Remove rule"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))
                    )}
                    {rules.length > 0 && (
                        <button onClick={addRule} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[#00a884] bg-[#00a884]/10 hover:bg-[#00a884]/20 rounded-lg transition-colors">
                            <Plus className="w-4 h-4" />
                            Add another rule
                        </button>
                    )}
                </div>
            )}

            {/* Tab 2: Self-Learning */}
            {tab === 'learning' && (
                <div className="space-y-4">
                    <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between">
                        <div>
                            <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wide flex items-center gap-1.5">
                                <Sparkles className="w-4 h-4 text-emerald-600" />
                                Auto-Learning from Sent Replies
                            </h4>
                            <p className="text-xs text-emerald-700 mt-0.5">
                                When active, the bot remembers how you reply to customers on WhatsApp and re-uses those answers.
                            </p>
                        </div>
                        <button
                            onClick={toggleLearnSetting}
                            className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition shadow-sm ${settings.autoLearn ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-gray-300 text-gray-700'}`}
                        >
                            {settings.autoLearn ? 'ACTIVE' : 'PAUSED'}
                        </button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                        <span className="text-xs font-bold text-gray-700">{knowledge.length} Learned Conversation Pairs</span>
                        <button
                            onClick={() => setShowAddPair(!showAddPair)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#00a884] hover:underline"
                        >
                            <Plus className="w-3.5 h-3.5" />
                            {showAddPair ? 'Cancel' : 'Add Manual Pair'}
                        </button>
                    </div>

                    {showAddPair && (
                        <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2.5">
                            <input
                                type="text"
                                placeholder="Customer Question (e.g. When are you open?)"
                                value={newQuestion}
                                onChange={e => setNewQuestion(e.target.value)}
                                className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:border-[#00a884]"
                            />
                            <textarea
                                placeholder="Bot Answer (e.g. We are open Mon-Sat 9AM-7PM)"
                                value={newAnswer}
                                onChange={e => setNewAnswer(e.target.value)}
                                rows={2}
                                className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded text-xs resize-none focus:outline-none focus:border-[#00a884]"
                            />
                            <button
                                onClick={addManualPair}
                                className="px-3.5 py-1.5 bg-[#00a884] text-white text-xs font-semibold rounded hover:bg-[#008f6f]"
                            >
                                Save Pair
                            </button>
                        </div>
                    )}

                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                        {knowledge.length === 0 ? (
                            <p className="text-center py-6 text-xs text-gray-400">
                                No learned conversation pairs yet. Reply to contacts on WhatsApp to start learning automatically!
                            </p>
                        ) : (
                            knowledge.map(pItem => (
                                <div key={pItem.id} className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-start justify-between gap-3 text-xs">
                                    <div className="flex-1 space-y-1">
                                        <p className="font-semibold text-gray-800">Q: {pItem.question}</p>
                                        <p className="text-gray-600">A: {pItem.answer}</p>
                                        <span className="text-[10px] text-gray-400 inline-block">
                                            Used {pItem.uses || 0} times • {pItem.source || 'conversation'}
                                        </span>
                                    </div>
                                    <button onClick={() => deletePair(pItem.id)} className="text-gray-400 hover:text-red-500 p-1">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Tab 3: Website & RAG */}
            {tab === 'rag' && (
                <div className="space-y-4">
                    <div className="p-4 bg-sky-50/70 border border-sky-200 rounded-lg space-y-2.5">
                        <h4 className="text-xs font-bold text-sky-900 uppercase tracking-wide flex items-center gap-1.5">
                            <Globe className="w-4 h-4 text-sky-600" />
                            Learn from Website or Documentation Link
                        </h4>
                        <div className="flex gap-2">
                            <input
                                type="url"
                                placeholder="https://yourwebsite.com/pricing-or-faq"
                                value={webUrl}
                                onChange={e => setWebUrl(e.target.value)}
                                disabled={crawling}
                                className="flex-1 px-3 py-2 bg-white border border-sky-300 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-sky-500"
                            />
                            <button
                                onClick={handleIngestUrl}
                                disabled={crawling}
                                className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 disabled:opacity-50"
                            >
                                {crawling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                                {crawling ? 'Crawling...' : 'Ingest Website'}
                            </button>
                        </div>
                        <p className="text-[11px] text-sky-700">
                            Automatically crawls web pages, extracts article text, and indexes semantic chunks for high-precision retrieval.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-700">Indexed Knowledge Sources ({sources.length})</span>
                            <button
                                onClick={() => setShowDocInput(!showDocInput)}
                                className="text-xs text-[#00a884] font-medium hover:underline"
                            >
                                {showDocInput ? 'Hide' : '+ Paste Custom Text'}
                            </button>
                        </div>

                        {showDocInput && (
                            <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                                <input
                                    type="text"
                                    placeholder="Document / Section Title"
                                    value={docTitle}
                                    onChange={e => setDocTitle(e.target.value)}
                                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded text-xs"
                                />
                                <textarea
                                    placeholder="Paste content, FAQs, or policies here..."
                                    value={docContent}
                                    onChange={e => setDocContent(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-1.5 bg-white border border-gray-300 rounded text-xs resize-none"
                                />
                                <button onClick={handleIngestDoc} className="px-3.5 py-1.5 bg-[#00a884] text-white text-xs font-medium rounded hover:bg-[#008f6f]">
                                    Index Text
                                </button>
                            </div>
                        )}

                        <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                            {sources.length === 0 ? (
                                <p className="text-center py-4 text-xs text-gray-400">
                                    No website links or documents indexed yet. Enter a website above to start!
                                </p>
                            ) : (
                                sources.map(sItem => (
                                    <div key={sItem.id} className="p-3 bg-white border border-gray-200 rounded-lg flex items-center justify-between gap-3 text-xs shadow-sm">
                                        <div className="flex-1 truncate">
                                            <p className="font-semibold text-gray-800 truncate">{sItem.title || sItem.url}</p>
                                            <p className="text-[10px] text-gray-400 truncate">
                                                {sItem.url ? `${sItem.url} • ` : ''}{sItem.chunkCount} chunks
                                            </p>
                                        </div>
                                        <button onClick={() => deleteSource(sItem.id)} className="text-gray-400 hover:text-red-500 p-1">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                        <h5 className="text-xs font-bold text-gray-700">Test Chatbot Knowledge (Query Simulator)</h5>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Ask any customer question to test retrieval..."
                                value={testQuery}
                                onChange={e => setTestQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleTestQuery()}
                                className="flex-1 px-3 py-1.5 bg-white border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#00a884]"
                            />
                            <button
                                onClick={handleTestQuery}
                                disabled={testingQuery}
                                className="px-3.5 py-1.5 bg-[#00a884] hover:bg-[#008f6f] text-white rounded text-xs font-semibold disabled:opacity-50"
                            >
                                {testingQuery ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ask Bot'}
                            </button>
                        </div>
                        {testResult && (
                            <div className="p-2.5 bg-white border border-gray-200 rounded text-xs space-y-1">
                                {testResult.notFound ? (
                                    <span className="text-amber-600 italic font-medium">No confident match found. (Threshold: 45%)</span>
                                ) : (
                                    <>
                                        <div className="flex items-center justify-between text-[11px] font-bold text-[#00a884]">
                                            <span>Confidence: {testResult.score}% ({testResult.sourceType})</span>
                                            <span className="text-gray-400 font-normal truncate max-w-[150px]">{testResult.sourceTitle}</span>
                                        </div>
                                        <p className="text-gray-800 text-xs mt-1">Bot will reply: &quot;{testResult.answer}&quot;</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
