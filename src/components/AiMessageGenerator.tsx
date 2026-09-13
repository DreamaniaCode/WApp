"use client";

import React, { useState, useEffect } from 'react';
import { 
    Sparkles, X, Wand2, Copy, Check, AlertCircle, RefreshCw, ChevronDown 
} from 'lucide-react';
import { API_URL } from '@/lib/config';

interface AiMessageGeneratorProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (message: string) => void;
    defaultType?: 'promotional' | 'follow_up' | 'cart_recovery' | 'welcome' | 'reminder' | 'custom';
    defaultLanguage?: string;
    cartData?: { 
        customerName?: string; 
        cartItems?: string; 
        cartTotal?: string; 
        currency?: string; 
        cartUrl?: string; 
    };
}

const TONES = [
    { id: 'professional', label: 'Professional' },
    { id: 'friendly', label: 'Friendly' },
    { id: 'casual', label: 'Casual' },
    { id: 'urgent', label: 'Urgent' },
];

const LANGUAGES = [
    { id: 'en', label: 'English' },
    { id: 'fr', label: 'Français' },
    { id: 'ar', label: 'العربية' },
];

const TYPES = [
    { id: 'promotional', label: 'Promotional' },
    { id: 'follow_up', label: 'Follow-Up' },
    { id: 'cart_recovery', label: 'Cart Recovery' },
    { id: 'welcome', label: 'Welcome' },
    { id: 'reminder', label: 'Reminder' },
    { id: 'custom', label: 'Custom' },
];

export function AiMessageGenerator({ 
    isOpen, 
    onClose, 
    onSelect, 
    defaultType = 'promotional',
    defaultLanguage = 'en',
    cartData 
}: AiMessageGeneratorProps) {
    const [type, setType] = useState(defaultType);
    const [tone, setTone] = useState('friendly');
    const [language, setLanguage] = useState(defaultLanguage);
    const [productName, setProductName] = useState('');
    const [customInstructions, setCustomInstructions] = useState('');
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<{ message: string; alternatives: string[] } | null>(null);

    // Reset state when opened with new defaults
    useEffect(() => {
        if (isOpen) {
            setType(defaultType);
            setLanguage(defaultLanguage);
            setResults(null);
            setError(null);
            setIsLoading(false);
        }
    }, [isOpen, defaultType, defaultLanguage]);

    // Handle Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const generateMessage = async () => {
        setIsLoading(true);
        setError(null);
        setResults(null);

        try {
            const response = await fetch(`${API_URL}/api/ai/generate-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type,
                    context: {
                        productName,
                        tone,
                        language,
                        customInstructions
                    },
                    cartData
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate message');
            }

            setResults({
                message: data.message,
                alternatives: data.alternatives || []
            });
        } catch (err: any) {
            console.error('AI Generation error:', err);
            setError(err.message || 'An error occurred during generation');
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-2">
                        <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-semibold text-gray-800">AI Message Generator</h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content Area */}
                <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
                    {/* Error State */}
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="font-medium text-sm">{error}</p>
                                {error.toLowerCase().includes('configured') && (
                                    <p className="text-xs mt-1 opacity-80">
                                        Please check your AI Settings configuration.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {!results && !isLoading ? (
                        /* Form Section */
                        <div className="space-y-5">
                            {/* Message Type */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Message Type
                                </label>
                                <div className="relative">
                                    <select 
                                        value={type}
                                        onChange={(e) => setType(e.target.value as any)}
                                        className="w-full appearance-none bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3 pr-10 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors cursor-pointer"
                                    >
                                        {TYPES.map(t => (
                                            <option key={t.id} value={t.id}>{t.label}</option>
                                        ))}
                                    </select>
                                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                                </div>
                            </div>

                            {/* Tone */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Tone
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {TONES.map(t => (
                                        <button
                                            key={t.id}
                                            onClick={() => setTone(t.id)}
                                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                                                tone === t.id 
                                                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md' 
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Language */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Language
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {LANGUAGES.map(l => (
                                        <button
                                            key={l.id}
                                            onClick={() => setLanguage(l.id)}
                                            className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                                                language === l.id 
                                                    ? 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white shadow-md' 
                                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                            }`}
                                        >
                                            {l.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Product/Service Name */}
                            <div>
                                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                    Product / Service Name <span className="text-gray-400 normal-case font-normal">(Optional)</span>
                                </label>
                                <input
                                    type="text"
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                    placeholder="e.g. Summer Collection 2024"
                                    className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors"
                                />
                            </div>

                            {/* Custom Instructions */}
                            {(type === 'custom' || true) && (
                                <div>
                                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                        Custom Instructions <span className="text-gray-400 normal-case font-normal">(Optional)</span>
                                    </label>
                                    <textarea
                                        value={customInstructions}
                                        onChange={(e) => setCustomInstructions(e.target.value)}
                                        placeholder="Add any specific details you want included..."
                                        rows={3}
                                        className="w-full bg-gray-50 border border-gray-200 text-gray-800 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-colors resize-none custom-scrollbar"
                                    />
                                </div>
                            )}

                        </div>
                    ) : isLoading ? (
                        /* Loading State */
                        <div className="flex flex-col items-center justify-center py-16 space-y-4">
                            <div className="relative">
                                <div className="absolute inset-0 bg-purple-200 rounded-full blur-xl animate-pulse"></div>
                                <Wand2 className="w-12 h-12 text-purple-600 relative animate-bounce" />
                            </div>
                            <p className="text-gray-600 font-medium animate-pulse">Generating your message...</p>
                        </div>
                    ) : results ? (
                        /* Results Section */
                        <div className="space-y-6">
                            {/* Primary Result */}
                            <div>
                                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-purple-500" />
                                    Primary Option
                                </h3>
                                <div className="bg-purple-50/50 border border-purple-100 rounded-2xl p-4 shadow-sm relative group">
                                    <p className="text-gray-800 whitespace-pre-wrap text-sm leading-relaxed mb-4">
                                        {results.message}
                                    </p>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => {
                                                onSelect(results.message);
                                                onClose();
                                            }}
                                            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl transition-colors shadow-sm"
                                        >
                                            <Check className="w-4 h-4" />
                                            Use This
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Alternatives */}
                            {results.alternatives && results.alternatives.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                                        Alternative Options
                                    </h3>
                                    <div className="space-y-3">
                                        {results.alternatives.map((alt, idx) => (
                                            <div key={idx} className="bg-gray-50 border border-gray-100 rounded-xl p-4 hover:border-purple-200 transition-colors">
                                                <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed mb-3 line-clamp-3">
                                                    {alt}
                                                </p>
                                                <div className="flex justify-end">
                                                    <button
                                                        onClick={() => {
                                                            onSelect(alt);
                                                            onClose();
                                                        }}
                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-purple-300 hover:text-purple-600 text-gray-600 text-xs font-medium rounded-lg transition-colors"
                                                    >
                                                        Use
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex justify-between items-center">
                    {results && !isLoading ? (
                        <button
                            onClick={generateMessage}
                            className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors text-sm font-medium"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Regenerate
                        </button>
                    ) : (
                        <div></div> // Spacer
                    )}
                    
                    {!results && !isLoading && (
                        <button
                            onClick={generateMessage}
                            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl shadow-md transition-all duration-200 font-medium"
                        >
                            <Sparkles className="w-4 h-4" />
                            Generate Message
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
