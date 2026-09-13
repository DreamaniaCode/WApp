"use client";

import React, { useState, useEffect, useRef } from "react";
import { API_URL } from "@/lib/config";
import {
    ShoppingCart, Clock, MessageSquare, CheckCircle, TrendingUp, Upload,
    Plus, Send, Search, Copy, Check, X, Trash2, Sparkles, Settings as SettingsIcon,
    ExternalLink, Package, Loader2
} from "lucide-react";
import Papa from "papaparse";
import { AiMessageGenerator } from "./AiMessageGenerator";

export interface CartRecoveryProps {
    socket?: any;
}

interface CartEntry {
    id: string;
    customerName: string;
    customerPhone: string;
    cartItems: { name: string; qty: number; price: number; imageUrl?: string }[];
    cartUrl: string;
    cartTotal: number;
    currency: string;
    status: 'pending' | 'contacted' | 'recovered' | 'expired';
    receivedAt: string;
    contactedAt?: string;
    recoveredAt?: string;
    source: 'webhook' | 'csv' | 'manual';
    followUpCount: number;
    lastFollowUpAt?: string;
}

interface CartSettings {
    autoSendEnabled: boolean;
    firstContactDelay: number;
    followUpEnabled: boolean;
    followUpDelay: number;
    maxFollowUps: number;
    recoveryMessageTemplate: string;
    followUpTemplate: string;
    deviceId: string | null;
}

export function CartRecovery({ socket }: CartRecoveryProps) {
    const [activeTab, setActiveTab] = useState<'dashboard' | 'settings'>('dashboard');
    const [carts, setCarts] = useState<CartEntry[]>([]);
    const [stats, setStats] = useState<any>({ total: 0, pending: 0, contacted: 0, recovered: 0, conversionRate: 0 });
    const [settings, setSettings] = useState<CartSettings>({
        autoSendEnabled: false,
        firstContactDelay: 15,
        followUpEnabled: false,
        followUpDelay: 1440,
        maxFollowUps: 2,
        recoveryMessageTemplate: "Hi {{name}}, we noticed you left some items in your cart. Complete your purchase here: {{cartUrl}}",
        followUpTemplate: "Hi {{name}}, just a reminder about your cart! {{cartUrl}}",
        deviceId: null
    });
    const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState<string>('All');
    const [searchQuery, setSearchQuery] = useState("");
    
    // Modals
    const [showImport, setShowImport] = useState(false);
    const [showManual, setShowManual] = useState(false);
    const [aiModalTarget, setAiModalTarget] = useState<'recovery' | 'followup' | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load data
    useEffect(() => {
        fetchCarts();
        fetchStats();
        fetchSettings();
        fetchDevices();
    }, []);

    useEffect(() => {
        if (!socket) return;
        socket.on('cart:new', (cart: CartEntry) => {
            setCarts(prev => [cart, ...prev]);
            fetchStats();
        });
        socket.on('cart:updated', ({ id, status }: { id: string, status: string }) => {
            setCarts(prev => prev.map(c => c.id === id ? { ...c, status: status as any } : c));
            fetchStats();
        });
        socket.on('cart:sent', ({ id, success }: { id: string, success: boolean }) => {
            if (success) {
                setCarts(prev => prev.map(c => c.id === id ? { ...c, status: 'contacted' } : c));
                fetchStats();
            }
        });
        return () => {
            socket.off('cart:new');
            socket.off('cart:updated');
            socket.off('cart:sent');
        };
    }, [socket]);

    const fetchCarts = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/carts`);
            if (res.ok) setCarts(await res.json());
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await fetch(`${API_URL}/api/carts/stats`);
            if (res.ok) setStats(await res.json());
        } catch (e) {
            console.error(e);
        }
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch(`${API_URL}/api/carts/settings`);
            if (res.ok) setSettings(await res.json());
        } catch (e) {
            console.error(e);
        }
    };

    const fetchDevices = async () => {
        try {
            const res = await fetch(`${API_URL}/api/devices`);
            if (res.ok) setDevices(await res.json());
        } catch (e) {
            console.error(e);
        }
    };

    const handleSaveSettings = async () => {
        try {
            await fetch(`${API_URL}/api/carts/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            alert('Settings saved!');
        } catch (e) {
            alert('Error saving settings');
        }
    };

    const handleDeleteCart = async (id: string) => {
        if (!confirm('Delete this cart?')) return;
        try {
            await fetch(`${API_URL}/api/carts/${id}`, { method: 'DELETE' });
            setCarts(prev => prev.filter(c => c.id !== id));
            fetchStats();
        } catch (e) {
            console.error(e);
        }
    };

    const handleSendRecovery = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/carts/${id}/send`, { method: 'POST' });
            setCarts(prev => prev.map(c => c.id === id ? { ...c, status: 'contacted' } : c));
            fetchStats();
        } catch (e) {
            console.error(e);
        }
    };

    const handleMarkRecovered = async (id: string) => {
        try {
            await fetch(`${API_URL}/api/carts/${id}/recover`, { method: 'POST' });
            setCarts(prev => prev.map(c => c.id === id ? { ...c, status: 'recovered' } : c));
            fetchStats();
        } catch (e) {
            console.error(e);
        }
    };

    const handleSendAllPending = async () => {
        if (!confirm('Send recovery to all pending carts?')) return;
        try {
            await fetch(`${API_URL}/api/carts/campaign`, { method: 'POST' });
            alert('Campaign started');
            fetchCarts();
            fetchStats();
        } catch (e) {
            console.error(e);
        }
    };

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                try {
                    await fetch(`${API_URL}/api/carts/import`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(results.data)
                    });
                    fetchCarts();
                    fetchStats();
                    setShowImport(false);
                } catch (err) {
                    alert('Import failed');
                }
            }
        });
    };

    const handleManualAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);
        const data = {
            customerName: fd.get('customerName'),
            customerPhone: fd.get('customerPhone'),
            cartTotal: Number(fd.get('cartTotal')),
            currency: fd.get('currency'),
            cartUrl: fd.get('cartUrl'),
            cartItems: [{ name: fd.get('itemName'), qty: Number(fd.get('qty')), price: Number(fd.get('price')) }]
        };
        try {
            await fetch(`${API_URL}/api/carts/add`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            fetchCarts();
            fetchStats();
            setShowManual(false);
        } catch (err) {
            alert('Failed to add');
        }
    };

    const filteredCarts = carts.filter(c => {
        if (statusFilter !== 'All' && c.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return c.customerName?.toLowerCase().includes(q) || c.customerPhone?.includes(q);
        }
        return true;
    });

    return (
        <div className="w-full max-w-7xl mx-auto p-4 md:p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">Cart Recovery</h1>
                    <p className="text-sm text-gray-500">Recover abandoned carts automatically via WhatsApp</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <ShoppingCart className="w-4 h-4 inline mr-2" /> Dashboard
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-blue-50 text-blue-700 shadow-sm' : 'text-gray-500 hover:bg-gray-50'}`}
                    >
                        <SettingsIcon className="w-4 h-4 inline mr-2" /> Settings
                    </button>
                </div>
            </div>

            {activeTab === 'dashboard' ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><ShoppingCart className="w-5 h-5" /></div>
                                <div className="text-sm text-gray-500">Total Carts</div>
                            </div>
                            <div className="text-2xl font-semibold mt-2">{stats.total}</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-100 text-amber-600 rounded-xl"><Clock className="w-5 h-5" /></div>
                                <div className="text-sm text-gray-500">Pending</div>
                            </div>
                            <div className="text-2xl font-semibold mt-2">{stats.pending}</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 text-blue-600 rounded-xl"><MessageSquare className="w-5 h-5" /></div>
                                <div className="text-sm text-gray-500">Contacted</div>
                            </div>
                            <div className="text-2xl font-semibold mt-2">{stats.contacted}</div>
                        </div>
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-green-100 text-green-600 rounded-xl"><CheckCircle className="w-5 h-5" /></div>
                                <div className="text-sm text-gray-500">Recovered</div>
                            </div>
                            <div className="text-2xl font-semibold mt-2">{stats.recovered}</div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
                        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
                            <div className="flex flex-wrap gap-2">
                                {['All', 'Pending', 'Contacted', 'Recovered', 'Expired'].map(s => (
                                    <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${statusFilter === s ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 w-full md:w-auto">
                                <div className="relative flex-1 md:w-64">
                                    <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                                    <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500" />
                                </div>
                                <button onClick={() => setShowImport(true)} className="p-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100" title="Import CSV"><Upload className="w-4 h-4" /></button>
                                <button onClick={() => setShowManual(true)} className="p-2 bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100" title="Add Manual"><Plus className="w-4 h-4" /></button>
                                <button onClick={handleSendAllPending} className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl text-sm font-medium hover:shadow-md transition-all">
                                    <Send className="w-4 h-4" /> Send Pending
                                </button>
                            </div>
                        </div>

                        <div className="bg-blue-50/50 rounded-xl p-4 mb-4 flex items-center justify-between border border-blue-100">
                            <div>
                                <h3 className="text-sm font-medium text-blue-900">Webhook URL</h3>
                                <p className="text-xs text-blue-600 mt-1">Send POST requests here from Shopify/WooCommerce</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <code className="bg-white px-3 py-1.5 rounded-lg text-xs border border-blue-200 text-blue-800 select-all">{API_URL}/api/carts/webhook</code>
                                <button onClick={() => navigator.clipboard.writeText(`${API_URL}/api/carts/webhook`)} className="p-1.5 bg-white border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-50"><Copy className="w-4 h-4" /></button>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead>
                                    <tr className="text-gray-500 border-b border-gray-100">
                                        <th className="font-medium pb-3 px-4">Customer</th>
                                        <th className="font-medium pb-3 px-4">Cart Summary</th>
                                        <th className="font-medium pb-3 px-4">Total</th>
                                        <th className="font-medium pb-3 px-4">Status</th>
                                        <th className="font-medium pb-3 px-4">Time</th>
                                        <th className="font-medium pb-3 px-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCarts.length === 0 ? (
                                        <tr><td colSpan={6} className="text-center py-8 text-gray-500">No carts found</td></tr>
                                    ) : filteredCarts.map(cart => (
                                        <tr key={cart.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                            <td className="py-3 px-4">
                                                <div className="font-medium text-gray-900">{cart.customerName}</div>
                                                <div className="text-xs text-gray-500">{cart.customerPhone}</div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center gap-2 text-gray-600">
                                                    <Package className="w-4 h-4" />
                                                    <span className="truncate max-w-[150px]">{cart.cartItems?.[0]?.name || 'Unknown item'}</span>
                                                    {cart.cartItems?.length > 1 && <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-md text-gray-500">+{cart.cartItems.length - 1}</span>}
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 font-medium">{cart.currency} {cart.cartTotal}</td>
                                            <td className="py-3 px-4">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                                                    cart.status === 'recovered' ? 'bg-green-100 text-green-700' :
                                                    cart.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                                                    cart.status === 'contacted' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-gray-100 text-gray-700'
                                                }`}>{cart.status}</span>
                                            </td>
                                            <td className="py-3 px-4 text-xs text-gray-500">
                                                {new Date(cart.receivedAt).toLocaleString()}
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="flex items-center justify-end gap-2">
                                                    {cart.status === 'pending' && <button onClick={() => handleSendRecovery(cart.id)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg" title="Send Recovery"><Send className="w-4 h-4" /></button>}
                                                    {cart.status === 'contacted' && <button onClick={() => handleMarkRecovered(cart.id)} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg" title="Mark Recovered"><CheckCircle className="w-4 h-4" /></button>}
                                                    <a href={cart.cartUrl} target="_blank" rel="noreferrer" className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-lg" title="View Cart"><ExternalLink className="w-4 h-4" /></a>
                                                    <button onClick={() => handleDeleteCart(cart.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
                    <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-100 pb-4">Automation Settings</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                                <input type="checkbox" checked={settings.autoSendEnabled} onChange={e => setSettings({...settings, autoSendEnabled: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                                <div>
                                    <div className="font-medium text-sm">Auto-Send Recovery</div>
                                    <div className="text-xs text-gray-500">Automatically send messages for new carts</div>
                                </div>
                            </label>

                            <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                                <label className="block text-sm font-medium text-gray-700">First Contact Delay (minutes)</label>
                                <input type="number" value={settings.firstContactDelay} onChange={e => setSettings({...settings, firstContactDelay: Number(e.target.value)})} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
                            </div>

                            <label className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer">
                                <input type="checkbox" checked={settings.followUpEnabled} onChange={e => setSettings({...settings, followUpEnabled: e.target.checked})} className="w-4 h-4 text-blue-600 rounded" />
                                <div>
                                    <div className="font-medium text-sm">Enable Follow-ups</div>
                                    <div className="text-xs text-gray-500">Send reminder if not recovered</div>
                                </div>
                            </label>

                            {settings.followUpEnabled && (
                                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                                    <label className="block text-sm font-medium text-gray-700">Follow-up Delay (minutes)</label>
                                    <input type="number" value={settings.followUpDelay} onChange={e => setSettings({...settings, followUpDelay: Number(e.target.value)})} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500" />
                                    <label className="block text-sm font-medium text-gray-700 mt-3">Max Follow-ups (1-5)</label>
                                    <input type="range" min="1" max="5" value={settings.maxFollowUps} onChange={e => setSettings({...settings, maxFollowUps: Number(e.target.value)})} className="w-full" />
                                    <div className="text-xs text-gray-500 text-center">{settings.maxFollowUps} times</div>
                                </div>
                            )}
                            
                            <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                                <label className="block text-sm font-medium text-gray-700">Sending Device</label>
                                <select value={settings.deviceId || ''} onChange={e => setSettings({...settings, deviceId: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white">
                                    <option value="">Select a device</option>
                                    {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-gray-700">Recovery Template</label>
                                    <button
                                        type="button"
                                        onClick={() => setAiModalTarget('recovery')}
                                        className="text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                    >
                                        <Sparkles className="w-3 h-3 text-yellow-300" /> AI Generate
                                    </button>
                                </div>
                                <textarea rows={4} value={settings.recoveryMessageTemplate} onChange={e => setSettings({...settings, recoveryMessageTemplate: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-mono"></textarea>
                                <div className="flex flex-wrap gap-1">
                                    {['{{name}}', '{{items}}', '{{total}}', '{{currency}}', '{{cartUrl}}'].map(v => (
                                        <span key={v} className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-xs text-gray-600 cursor-pointer" onClick={() => setSettings({...settings, recoveryMessageTemplate: settings.recoveryMessageTemplate + ' ' + v})}>{v}</span>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <label className="text-sm font-medium text-gray-700">Follow-up Template</label>
                                    <button
                                        type="button"
                                        onClick={() => setAiModalTarget('followup')}
                                        className="text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                                    >
                                        <Sparkles className="w-3 h-3 text-yellow-300" /> AI Generate
                                    </button>
                                </div>
                                <textarea rows={4} value={settings.followUpTemplate} onChange={e => setSettings({...settings, followUpTemplate: e.target.value})} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-mono"></textarea>
                            </div>
                        </div>
                    </div>
                    
                    <div className="pt-4 border-t border-gray-100 flex justify-end">
                        <button onClick={handleSaveSettings} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 hover:shadow-md transition-all">
                            Save Settings
                        </button>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showImport && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">Import CSV</h3>
                            <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleImportCSV} className="hidden" />
                        <button onClick={() => fileInputRef.current?.click()} className="w-full py-8 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-500 hover:bg-gray-50 hover:border-gray-300 transition-colors">
                            <Upload className="w-8 h-8 mb-2 text-gray-400" />
                            <span className="text-sm font-medium">Click to upload CSV</span>
                            <span className="text-xs mt-1">name, phone, items, total, currency, url</span>
                        </button>
                    </div>
                </div>
            )}

            {showManual && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-gray-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">Add Manual Cart</h3>
                            <button onClick={() => setShowManual(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleManualAdd} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs text-gray-500">Name</label><input required name="customerName" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                                <div><label className="text-xs text-gray-500">Phone</label><input required name="customerPhone" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                            </div>
                            <div><label className="text-xs text-gray-500">Item Name</label><input required name="itemName" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs text-gray-500">Qty</label><input required name="qty" type="number" defaultValue="1" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                                <div><label className="text-xs text-gray-500">Price</label><input required name="price" type="number" step="0.01" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-xs text-gray-500">Total</label><input required name="cartTotal" type="number" step="0.01" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                                <div><label className="text-xs text-gray-500">Currency</label><input required name="currency" defaultValue="USD" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                            </div>
                            <div><label className="text-xs text-gray-500">Cart URL</label><input required name="cartUrl" type="url" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" /></div>
                            <button type="submit" className="w-full py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700">Add Cart</button>
                        </form>
                    </div>
                </div>
            )}

            {/* AI Message Generator Modal for Cart Recovery */}
            {aiModalTarget && (
                <AiMessageGenerator
                    isOpen={!!aiModalTarget}
                    onClose={() => setAiModalTarget(null)}
                    onSelect={(genMsg) => {
                        if (aiModalTarget === 'recovery') {
                            setSettings(prev => ({ ...prev, recoveryMessageTemplate: genMsg }));
                        } else if (aiModalTarget === 'followup') {
                            setSettings(prev => ({ ...prev, followUpTemplate: genMsg }));
                        }
                        setAiModalTarget(null);
                    }}
                    defaultType="cart_recovery"
                />
            )}
        </div>
    );
}
