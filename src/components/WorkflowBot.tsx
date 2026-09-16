"use client";

import { useState, useEffect } from "react";
import {
    Bot, Plus, Trash2, Power, Zap, Clock, ArrowRight, CheckCircle2,
    Settings, Play, AlertCircle, Save, Sparkles, MessageSquare, Mail,
    HelpCircle, ChevronRight, Shield
} from "lucide-react";
import { API_URL } from "@/lib/config";
import { playSuccessSound } from "@/utils/soundEffects";

interface Workflow {
    id: string;
    name: string;
    description?: string;
    trigger: string;
    action: string;
    active: boolean;
    delayMinutes?: number;
    payload?: string;
}

const TRIGGER_OPTIONS = [
    { value: "agent_requested", label: "👤 Demande d'agent humain", desc: "Détecte 'agent', 'humain', 'parler avec quelqu'un'" },
    { value: "first_incoming", label: "👋 Nouveau contact / 1er message", desc: "Premier message reçu d'un numéro inconnu" },
    { value: "no_reply_24h", label: "⏳ Inactivité 24 heures", desc: "Le client n'a pas répondu depuis 24h" },
    { value: "keyword_detected", label: "🔑 Mot-clé spécifique détecté", desc: "Déclenche si un mot-clé précis est présent" },
    { value: "cart_abandoned", label: "🛒 Panier abandonné", desc: "Panier e-commerce non finalisé" }
];

const ACTION_OPTIONS = [
    { value: "alert_and_switch_manual", label: "🚨 Alerte sonore & Basculer en Mode Manuel", desc: "Passe la conversation en manuel et sonne l'alarme" },
    { value: "send_whatsapp_message", label: "💬 Répondre avec un message WhatsApp", desc: "Envoie un message WhatsApp automatique" },
    { value: "send_email", label: "📧 Envoyer un email automatique", desc: "Envoie un email via la configuration SMTP" },
    { value: "tag_contact", label: "🏷️ Taguer le contact comme Prospect Chaud", desc: "Attribue un tag dans la base de données" },
    { value: "trigger_webhook", label: "🌐 Déclencher un Webhook (Zapier/Make)", desc: "Envoie les données du lead à une URL externe" }
];

export function WorkflowBot() {
    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState<string | null>(null);

    // Form states
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [trigger, setTrigger] = useState("agent_requested");
    const [action, setAction] = useState("alert_and_switch_manual");
    const [delayMinutes, setDelayMinutes] = useState(0);
    const [payload, setPayload] = useState("");

    const loadWorkflows = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/workflows`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setWorkflows(data);
                }
            }
        } catch (err) {
            console.error("Failed to load workflows", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadWorkflows();
    }, []);

    const toggleWorkflow = async (id: string) => {
        try {
            const res = await fetch(`${API_URL}/api/workflows/${id}/toggle`, {
                method: "POST"
            });
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.workflow) {
                    setWorkflows(prev => prev.map(w => w.id === id ? data.workflow : w));
                    playSuccessSound();
                }
            }
        } catch (err) {
            console.error("Failed to toggle workflow", err);
        }
    };

    const handleCreateWorkflow = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setSaving(true);
        const newWf: Workflow = {
            id: `wf-${Date.now()}`,
            name: name.trim(),
            description: description.trim(),
            trigger,
            action,
            active: true,
            delayMinutes: Number(delayMinutes) || 0,
            payload: payload.trim()
        };

        const updated = [...workflows, newWf];
        try {
            const res = await fetch(`${API_URL}/api/workflows`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflows: updated })
            });
            if (res.ok) {
                setWorkflows(updated);
                setShowCreateModal(false);
                setName("");
                setDescription("");
                setPayload("");
                setDelayMinutes(0);
                playSuccessSound();
                setNotification("Workflow créé et activé avec succès !");
                setTimeout(() => setNotification(null), 3500);
            }
        } catch (err) {
            alert("Erreur lors de l'enregistrement du workflow");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteWorkflow = async (id: string) => {
        if (!confirm("Voulez-vous vraiment supprimer ce workflow d'automatisation ?")) return;
        const updated = workflows.filter(w => w.id !== id);
        try {
            const res = await fetch(`${API_URL}/api/workflows`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ workflows: updated })
            });
            if (res.ok) {
                setWorkflows(updated);
                setNotification("Workflow supprimé.");
                setTimeout(() => setNotification(null), 3000);
            }
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="space-y-6">
            {/* Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                <div>
                    <h1 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <Zap className="w-6 h-6 text-amber-500 fill-amber-500" />
                        Workflow Bot &amp; Automatisations Marketing
                    </h1>
                    <p className="text-xs text-gray-500 mt-1">
                        Créez des chaînes d'actions automatiques selon le comportement et les demandes des clients
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-md shadow-blue-500/20"
                >
                    <Plus className="w-4 h-4" />
                    Nouveau Workflow
                </button>
            </div>

            {notification && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    {notification}
                </div>
            )}

            {/* Workflows List */}
            <div className="space-y-3">
                {loading ? (
                    <div className="p-12 text-center text-sm text-gray-400">Chargement des automatisations...</div>
                ) : workflows.length === 0 ? (
                    <div className="p-12 bg-white rounded-2xl border border-gray-100 text-center">
                        <Bot className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <h3 className="font-bold text-gray-800 text-sm">Aucun Workflow Actif</h3>
                        <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                            Automatisez les relances WhatsApp, les alertes d'intervention humaine ou les envois d'emails en créant votre premier workflow.
                        </p>
                    </div>
                ) : (
                    workflows.map((wf) => {
                        const trig = TRIGGER_OPTIONS.find(t => t.value === wf.trigger);
                        const act = ACTION_OPTIONS.find(a => a.value === wf.action);

                        return (
                            <div
                                key={wf.id}
                                className={`bg-white rounded-2xl border transition-all p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                                    wf.active ? "border-gray-200" : "border-gray-100 opacity-60 bg-gray-50/50"
                                }`}
                            >
                                <div className="flex items-start gap-3.5 flex-1">
                                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                                        wf.active ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-gray-100 text-gray-400"
                                    }`}>
                                        <Zap className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-black text-sm text-gray-900">{wf.name}</h3>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                wf.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-200 text-gray-600"
                                            }`}>
                                                {wf.active ? "Actif" : "En pause"}
                                            </span>
                                        </div>
                                        {wf.description && (
                                            <p className="text-xs text-gray-500 mt-0.5">{wf.description}</p>
                                        )}

                                        {/* Visual flow: Trigger -> Action */}
                                        <div className="flex flex-wrap items-center gap-2 mt-2.5 text-xs">
                                            <div className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 font-semibold flex items-center gap-1.5">
                                                <span>Si: {trig ? trig.label : wf.trigger}</span>
                                            </div>
                                            <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                                            {wf.delayMinutes ? (
                                                <>
                                                    <div className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 font-mono text-[11px] flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        Attendre {wf.delayMinutes} min
                                                    </div>
                                                    <ArrowRight className="w-3.5 h-3.5 text-gray-400" />
                                                </>
                                            ) : null}
                                            <div className="px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-100 text-purple-700 font-semibold">
                                                Alors: {act ? act.label : wf.action}
                                            </div>
                                        </div>

                                        {wf.payload && (
                                            <div className="mt-2 text-[11px] text-gray-500 bg-gray-50 p-2 rounded-lg border border-gray-100 max-w-xl truncate">
                                                Contenu: <span className="font-mono text-gray-700">{wf.payload}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 self-end md:self-center">
                                    <button
                                        onClick={() => toggleWorkflow(wf.id)}
                                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                                            wf.active
                                                ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                                        }`}
                                    >
                                        <Power className="w-3.5 h-3.5" />
                                        {wf.active ? "Désactiver" : "Activer"}
                                    </button>
                                    <button
                                        onClick={() => handleDeleteWorkflow(wf.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                                        title="Supprimer"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modal Create Workflow */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                            <h2 className="font-black text-gray-900 text-base flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-amber-500" />
                                Créer une Règle d'Automatisation
                            </h2>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleCreateWorkflow} className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Nom du Workflow *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ex: Alerte Demande Agent Urgent"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Description (facultatif)
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ex: Bascule immédiatement le chat en mode humain"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>

                            <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-100 space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-blue-900 mb-1">
                                        1. Événement Déclencheur (Trigger)
                                    </label>
                                    <select
                                        value={trigger}
                                        onChange={e => setTrigger(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl bg-white border border-blue-200 text-xs text-gray-900 font-semibold focus:outline-none"
                                    >
                                        {TRIGGER_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-blue-700 mt-1">
                                        {TRIGGER_OPTIONS.find(o => o.value === trigger)?.desc}
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-blue-900 mb-1">
                                        Délai d'attente avant exécution (minutes)
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={delayMinutes}
                                        onChange={e => setDelayMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                                        className="w-full px-3 py-2 rounded-xl bg-white border border-blue-200 text-xs text-gray-900 focus:outline-none"
                                        placeholder="0 = Immédiat"
                                    />
                                    <p className="text-[10px] text-gray-500 mt-0.5">0 = Déclenchement instantané</p>
                                </div>
                            </div>

                            <div className="p-3.5 rounded-2xl bg-purple-50/60 border border-purple-100 space-y-3">
                                <div>
                                    <label className="block text-xs font-bold text-purple-900 mb-1">
                                        2. Action Automatique à effectuer
                                    </label>
                                    <select
                                        value={action}
                                        onChange={e => setAction(e.target.value)}
                                        className="w-full px-3 py-2 rounded-xl bg-white border border-purple-200 text-xs text-gray-900 font-semibold focus:outline-none"
                                    >
                                        {ACTION_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-purple-700 mt-1">
                                        {ACTION_OPTIONS.find(o => o.value === action)?.desc}
                                    </p>
                                </div>

                                {(action === "send_whatsapp_message" || action === "send_email" || action === "trigger_webhook") && (
                                    <div>
                                        <label className="block text-xs font-bold text-purple-900 mb-1">
                                            {action === "trigger_webhook" ? "URL Webhook (POST)" : "Message / Contenu"}
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={payload}
                                            onChange={e => setPayload(e.target.value)}
                                            placeholder={
                                                action === "trigger_webhook"
                                                    ? "https://hooks.zapier.com/..."
                                                    : "Bonjour {{name}}, nous avons bien pris en compte votre message..."
                                            }
                                            className="w-full px-3 py-2 rounded-xl bg-white border border-purple-200 text-xs text-gray-900 focus:outline-none resize-none"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="px-4 py-2 rounded-xl border border-gray-200 text-xs text-gray-600 hover:bg-gray-50"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-500/20 disabled:opacity-50"
                                >
                                    <Save className="w-3.5 h-3.5" />
                                    {saving ? "Création..." : "Créer le Workflow"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
