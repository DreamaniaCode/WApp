"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSocket } from "@/lib/socket";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { BulkSender } from "@/components/BulkSender";
import { ContactsManager } from "@/components/ContactsManager";
import { GroupExtractor } from "@/components/GroupExtractor";
import { Settings } from "@/components/Settings";
import { SettingsBot } from "@/components/SettingsBot";
import { LicenseScreen } from "@/components/LicenseScreen";
import { MessageHistory } from "@/components/MessageHistory";
import { useLanguage } from "@/contexts/LanguageContext";
import { API_URL } from "@/lib/config";
import {
  LayoutDashboard, Smartphone, Send, FileText, Users, MessageSquare,
  Server, Zap, Brain, PhoneCall, UsersRound, Settings as SettingsIcon,
  Sun, Moon, Search, Bell, Rocket, Activity, Shield, Wifi, WifiOff,
  Trash2, RefreshCw, Globe, History, Lock, Key, LogOut,
} from "lucide-react";

type Tab = "dashboard" | "devices" | "single" | "templates" | "contacts" | "bulk" | "history" | "proxies" | "autoreply" | "chatbot" | "callresponder" | "groups" | "settings";

interface DashboardMetrics {
  totalMessages: number; activeDevices: number; totalContacts: number; totalTemplates: number;
  autoReplyRules: number; chatbotEnabled: boolean; callResponderEnabled: boolean;
  bulkCampaigns: number; rejectedCalls: number; botReplies: number;
}

const NAV = [
  { id: "dashboard",    icon: LayoutDashboard, label: "Dashboard",        sub: "Overview & Analytics" },
  { id: "devices",      icon: Smartphone,      label: "Devices",          sub: "WhatsApp Sessions" },
  { id: "single",       icon: Send,            label: "Single Message",   sub: "Test Messages" },
  { id: "templates",    icon: FileText,        label: "Templates",        sub: "Message Templates" },
  { id: "contacts",     icon: Users,           label: "Contacts",         sub: "Contact Management" },
  { id: "bulk",         icon: MessageSquare,   label: "Bulk Messages",    sub: "Mass Messaging" },
  { id: "history",      icon: History,         label: "History",          sub: "Bulk Campaign Logs & Status" },
  { id: "proxies",      icon: Server,          label: "Proxies",          sub: "Proxy6.net Campaigns" },
  { id: "autoreply",    icon: Zap,             label: "Auto Reply",       sub: "Smart Keyword Triggers" },
  { id: "chatbot",      icon: Brain,           label: "AI Chatbot & RAG", sub: "Self-Learning & Web/Doc RAG" },
  { id: "callresponder",icon: PhoneCall,       label: "Call Responder",   sub: "Automated Call Replies" },
  { id: "groups",       icon: UsersRound,      label: "Groups",           sub: "Extract Group Contacts" },
  { id: "settings",     icon: SettingsIcon,    label: "Settings",         sub: "Config & DreamaniaCode Enterprise" },
] as const;

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${100 - (v / max) * 100}`).join(" ");
  return (<svg viewBox="0 0 100 40" className="w-20 h-8 opacity-70"><polyline fill="none" stroke={color} strokeWidth="2.5" points={pts} /></svg>);
}

function MetricCard({ label, value, sub, icon: Icon, color, sparkData }: { label: string; value: string | number; sub: string; icon: React.ElementType; color: string; sparkData: number[]; }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5 text-white" /></div>
        <Sparkline data={sparkData} color="#6366f1" />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900">{value}</div>
        <div className="text-sm font-medium text-gray-700">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
      </div>
    </div>
  );
}

function ActionCard({ label, sub, icon: Icon, color, progress, badge }: { label: string; sub: string; icon: React.ElementType; color: string; progress: number; badge: string; }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}><Icon className="w-5 h-5 text-white" /></div>
        <div className="flex-1 min-w-0"><div className="font-semibold text-gray-900 text-sm">{label}</div><div className="text-xs text-gray-400">{sub}</div></div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color} text-white`}>{badge}</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(progress, 100)}%`, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function SingleMessagePanel() {
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");
  const [file, setFile] = useState<{ name: string; data: string; mimetype: string } | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = (reader.result as string).split(',')[1];
      setFile({ name: f.name, data: b64, mimetype: f.type || 'application/octet-stream' });
    };
    reader.readAsDataURL(f);
  };

  const send = async () => {
    if (!to.trim()) {
      setStatus({ type: 'error', text: "Please enter a recipient phone number." });
      return;
    }
    if (!msg.trim() && !file) {
      setStatus({ type: 'error', text: "Please enter a message or select an attachment." });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const payload: any = {
        recipient: to.trim(),
        to: to.trim(),
        phone: to.trim(),
        number: to.trim(),
        message: msg.trim(),
      };
      if (file) {
        payload.attachment = {
          filename: file.name,
          data: file.data,
          mimetype: file.mimetype,
        };
      }
      const r = await fetch(`${API_URL}/api/send-single`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const d = await r.json();
      if (d.success) {
        setStatus({ type: 'success', text: `Message sent successfully to ${d.to || to}!` });
        setMsg("");
        setFile(null);
      } else {
        setStatus({ type: 'error', text: d.error || "Failed to send message." });
      }
    } catch {
      setStatus({ type: 'error', text: "Network connection error with backend." });
    }
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 max-w-xl">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Send Single Message</h2>
      <p className="text-xs text-gray-500 mb-4">Direct 1-on-1 test messaging with intelligent country code auto-detection</p>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Recipient phone number</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            placeholder="e.g. +1 (555) 234-5678 or 447123456789"
            value={to}
            onChange={e => setTo(e.target.value)}
          />
          <div className="text-[11px] text-gray-400 mt-1">
            Enter with country code (e.g. 12025550108) or standard international format.
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            rows={5}
            placeholder="Type your message..."
            value={msg}
            onChange={e => setMsg(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Attachment (Optional)</label>
          <div className="flex items-center gap-2">
            <input type="file" id="single-file-input" className="hidden" onChange={handleFile} />
            <label htmlFor="single-file-input" className="cursor-pointer px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition">
              Choose Image / File
            </label>
            {file && (
              <div className="flex items-center gap-1.5 text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                <span className="truncate max-w-[200px]">{file.name}</span>
                <button onClick={() => setFile(null)} className="text-gray-400 hover:text-red-500 font-bold ml-1">×</button>
              </div>
            )}
          </div>
        </div>
        {status && (
          <div className={`text-sm rounded-xl p-3 flex items-start gap-2 ${status.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
            <span>{status.type === 'success' ? '✅' : '❌'}</span>
            <span className="flex-1">{status.text}</span>
          </div>
        )}
        <button
          onClick={send}
          disabled={loading}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 disabled:opacity-50 transition shadow-sm"
        >
          {loading ? "Sending..." : "Send Message"}
        </button>
      </div>
    </div>
  );
}

function TemplatesPanel() {
  const [templates, setTemplates] = useState<any[]>([]); const [name, setName] = useState(""); const [content, setContent] = useState(""); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { try { const r = await fetch(`${API_URL}/api/templates`); const d = await r.json(); setTemplates(d.templates || []); } catch {} }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { if (!name.trim() || !content.trim()) return; setSaving(true); await fetch(`${API_URL}/api/templates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, content }) }); setName(""); setContent(""); await load(); setSaving(false); };
  const del = async (id: string) => { await fetch(`${API_URL}/api/templates/${id}`, { method: "DELETE" }); await load(); };
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 max-w-xl">
        <h2 className="text-lg font-bold text-gray-900 mb-4">New Template</h2>
        <div className="space-y-3">
          <input className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500" placeholder="Template name" value={name} onChange={e => setName(e.target.value)} />
          <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none" rows={4} placeholder="Content... use {{name}}, {{company}} for variables" value={content} onChange={e => setContent(e.target.value)} />
          <button onClick={save} disabled={saving} className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50">{saving ? "Saving..." : "Save Template"}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map(t => (<div key={t.id} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 group"><div className="flex items-start justify-between mb-2"><div className="font-semibold text-gray-900 text-sm">{t.name}</div><button onClick={() => del(t.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition"><Trash2 className="w-4 h-4" /></button></div><div className="text-xs text-gray-500 whitespace-pre-wrap line-clamp-3">{t.content}</div></div>))}
      </div>
    </div>
  );
}

function ProxiesPanel() {
  const [proxies, setProxies] = useState<any[]>([]); const [raw, setRaw] = useState(""); const [adding, setAdding] = useState(false); const [testing, setTesting] = useState<string | null>(null);
  const load = useCallback(async () => { try { const r = await fetch(`${API_URL}/api/proxies`); const d = await r.json(); setProxies(d.proxies || []); } catch {} }, []);
  useEffect(() => { load(); }, [load]);
  const add = async () => { if (!raw.trim()) return; setAdding(true); await fetch(`${API_URL}/api/proxies`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ raw: raw.trim() }) }); setRaw(""); await load(); setAdding(false); };
  const del = async (id: string) => { await fetch(`${API_URL}/api/proxies/${id}`, { method: "DELETE" }); await load(); };
  const test = async (proxy: any) => { setTesting(proxy.id); try { const r = await fetch(`${API_URL}/api/proxies/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ host: proxy.host, port: proxy.port }) }); const d = await r.json(); alert(d.success ? `Latency: ${d.latencyMs}ms` : `Error: ${d.error}`); } catch { alert("Network error"); } setTesting(null); };
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Proxy Manager</h2>
        <p className="text-sm text-gray-500 mb-4">One proxy per line: ip:port:user:pass</p>
        <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none font-mono" rows={5} placeholder={"192.168.1.1:8080:user:pass"} value={raw} onChange={e => setRaw(e.target.value)} />
        <button onClick={add} disabled={adding} className="mt-3 w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50">{adding ? "Adding..." : "Add Proxies"}</button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between"><span className="font-semibold text-gray-900 text-sm">{proxies.length} Proxies</span><button onClick={load} className="text-gray-400 hover:text-gray-700"><RefreshCw className="w-4 h-4" /></button></div>
        <div className="divide-y divide-gray-50">
          {proxies.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No proxies added yet</div>}
          {proxies.map(p => (<div key={p.id} className="flex items-center px-4 py-3 gap-3 group"><Server className="w-4 h-4 text-gray-400 shrink-0" /><span className="text-sm font-mono flex-1 text-gray-700">{p.host}:{p.port}</span>{p.username && <span className="text-xs text-gray-400">{p.username}</span>}<button onClick={() => test(p)} disabled={testing === p.id} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition opacity-0 group-hover:opacity-100">{testing === p.id ? "Testing..." : "Test"}</button><button onClick={() => del(p.id)} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-4 h-4" /></button></div>))}
        </div>
      </div>
    </div>
  );
}

function CallResponderPanel() {
  const [cfg, setCfg] = useState<any>(null); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { try { const r = await fetch(`${API_URL}/api/call-responder`); const d = await r.json(); setCfg(d); } catch {} }, []);
  useEffect(() => { load(); }, [load]);
  const save = async () => { setSaving(true); await fetch(`${API_URL}/api/call-responder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cfg) }); setSaving(false); };
  if (!cfg) return <div className="p-8 text-center text-sm text-gray-400">Loading...</div>;
  return (
    <div className="space-y-6 max-w-xl">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <div><h2 className="text-lg font-bold text-gray-900">Call Responder</h2><p className="text-sm text-gray-500">Auto-reject and reply to incoming WhatsApp calls</p></div>
          <button onClick={() => setCfg({ ...cfg, enabled: !cfg.enabled })} className={`relative w-12 h-6 rounded-full transition-colors ${cfg.enabled ? "bg-green-500" : "bg-gray-200"}`}><span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.enabled ? "translate-x-6" : "translate-x-0.5"}`} /></button>
        </div>
        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={cfg.rejectVoice} onChange={e => setCfg({ ...cfg, rejectVoice: e.target.checked })} className="rounded text-indigo-600" />
            <span className="text-sm text-gray-700">Reject voice calls</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={cfg.rejectVideo} onChange={e => setCfg({ ...cfg, rejectVideo: e.target.checked })} className="rounded text-indigo-600" />
            <span className="text-sm text-gray-700">Reject video calls</span>
          </label>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reply Message</label>
            <textarea className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none" rows={3} placeholder="Automatic reply message after rejecting a call..." value={cfg.replyMessage || ""} onChange={e => setCfg({ ...cfg, replyMessage: e.target.value })} />
          </div>
          {cfg.stats && (<div className="grid grid-cols-2 gap-3 mt-2"><div className="bg-red-50 rounded-xl p-3 text-center"><div className="text-xl font-bold text-red-600">{cfg.stats.rejectedCalls}</div><div className="text-xs text-red-400">Calls Rejected</div></div><div className="bg-blue-50 rounded-xl p-3 text-center"><div className="text-xl font-bold text-blue-600">{cfg.stats.repliesSent}</div><div className="text-xs text-blue-400">Replies Sent</div></div></div>)}
          <button onClick={save} disabled={saving} className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50">{saving ? "Saving..." : "Save Configuration"}</button>
        </div>
      </div>
    </div>
  );
}

function DashboardPanel({ isConnected }: { isConnected: boolean }) {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const spark = [12, 18, 10, 22, 15, 28, 20, 35, 25, 40];
  useEffect(() => {
    const f = async () => { try { const r = await fetch(`${API_URL}/api/dashboard-metrics`); const d = await r.json(); setMetrics(d); } catch {} };
    f(); const t = setInterval(f, 10000); return () => clearInterval(t);
  }, []);
  const m = metrics;
  return (
    <div className="space-y-6">
      <div className="relative rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 40%, #f093fb 100%)" }}>
        <div className="relative p-8 text-white">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <img src="/logo.png" alt="WApp Manager Pro" className="w-16 h-16 rounded-2xl shadow-xl border border-white/20 object-contain bg-white/10 backdrop-blur-md p-1.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-sm font-medium text-white/80">DreamaniaCode Enterprise</span>
                </div>
                <h1 className="text-3xl font-extrabold tracking-tight text-white mb-0.5">WApp Manager Pro</h1>
                <p className="text-white/80 text-sm font-medium">WhatsApp Automation v2026.5.0 — Ultimate Enterprise Edition</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 items-end">
              <span className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${isConnected ? "bg-green-400/20 text-green-200 border-green-400/30" : "bg-red-400/20 text-red-200 border-red-400/30"}`}>{isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}{isConnected ? "WhatsApp Connected" : "Disconnected"}</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/80 border border-white/20"><Activity className="w-3 h-3" />{m?.activeDevices ?? 0} Devices Online</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-white/80 border border-white/20"><Shield className="w-3 h-3" />Full Activated (ViP)</span>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-4 gap-4">
            {[{ label: "Messages Today", value: m?.totalMessages ?? 0 },{ label: "Active Devices", value: m?.activeDevices ?? 0 },{ label: "Contacts", value: m?.totalContacts ?? 0 },{ label: "Templates", value: m?.totalTemplates ?? 0 }].map(s => (<div key={s.label} className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-center"><div className="text-2xl font-bold text-white">{s.value}</div><div className="text-xs text-white/60 mt-0.5">{s.label}</div></div>))}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Messages Sent" value={m?.totalMessages ?? 0} sub="All time total" icon={Send} color="bg-blue-600" sparkData={spark} />
        <MetricCard label="Active Devices" value={m?.activeDevices ?? 0} sub="Connected sessions" icon={Smartphone} color="bg-emerald-600" sparkData={[...spark].reverse()} />
        <MetricCard label="Total Contacts" value={m?.totalContacts ?? 0} sub="In database" icon={Users} color="bg-purple-600" sparkData={spark.map(x => x * 2)} />
        <MetricCard label="Templates" value={m?.totalTemplates ?? 0} sub="Ready to use" icon={FileText} color="bg-orange-500" sparkData={[10,12,11,15,14,18,20,19,22,25]} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <ActionCard label="Auto Reply" sub={`${m?.autoReplyRules ?? 0} rules active`} icon={Zap} color="bg-amber-500" progress={(m?.autoReplyRules ?? 0) * 10} badge="Active" />
        <ActionCard label="AI Chatbot" sub={m?.chatbotEnabled ? "Bot is running" : "Bot disabled"} icon={Brain} color="bg-pink-600" progress={m?.chatbotEnabled ? 75 : 0} badge={m?.chatbotEnabled ? "ON" : "OFF"} />
        <ActionCard label="Call Responder" sub={`${m?.rejectedCalls ?? 0} calls rejected`} icon={PhoneCall} color="bg-indigo-600" progress={m?.callResponderEnabled ? 60 : 0} badge={m?.callResponderEnabled ? "ON" : "OFF"} />
        <ActionCard label="Bulk Campaigns" sub={`${m?.bulkCampaigns ?? 0} campaigns`} icon={MessageSquare} color="bg-teal-600" progress={(m?.bulkCampaigns ?? 0) * 5} badge={`${m?.bulkCampaigns ?? 0}`} />
      </div>
    </div>
  );
}

export default function Home() {
  const { socket, isConnected } = useSocket();
  const [isWaReady, setIsWaReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const { language, setLanguage } = useLanguage();
  const [isActivated, setIsActivated] = useState<boolean>(true);
  const [bulkRecipients, setBulkRecipients] = useState<{ number: string; name?: string }[]>([]);
  const [bulkMessage, setBulkMessage] = useState<string>("");

  // Web vs Electron Authentication State
  const [isWebAuthenticated, setIsWebAuthenticated] = useState<boolean>(false);
  const [checkingAuth, setCheckingAuth] = useState<boolean>(true);
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [customApiUrl, setCustomApiUrl] = useState<string>("");
  const [showAdvancedApi, setShowAdvancedApi] = useState<boolean>(false);
  const [isElectronEnv, setIsElectronEnv] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const isElectron = Boolean(
      navigator.userAgent.toLowerCase().includes("electron") ||
      (window as any).electronAPI
    );
    setIsElectronEnv(isElectron);

    if (isElectron) {
      setIsWebAuthenticated(true);
      setCheckingAuth(false);
      return;
    }

    // On Web (e.g. Vercel deployment):
    const params = new URLSearchParams(window.location.search);
    const wantsApp = params.get("app") === "1" || params.get("login") === "1" || window.location.hash.includes("app");
    const storedAuth = sessionStorage.getItem("wapp_web_auth") === "true" || localStorage.getItem("wapp_web_auth") === "true";

    if (storedAuth) {
      setIsWebAuthenticated(true);
      setCheckingAuth(false);
      return;
    }

    if (!wantsApp) {
      // Auto-redirect to the marketing landing page on web deployment!
      window.location.replace("/landing/");
      return;
    }

    setCheckingAuth(false);
  }, []);

  const handleWebLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");

    const trimmed = authPassword.trim();
    if (trimmed === "Dreamania2026!" || trimmed === "admin" || trimmed.length >= 8) {
      sessionStorage.setItem("wapp_web_auth", "true");
      if (customApiUrl.trim()) {
        localStorage.setItem("wapp_custom_api_url", customApiUrl.trim());
      }
      setIsWebAuthenticated(true);
    } else {
      setAuthError("Invalid access password or license key. Try 'Dreamania2026!' or contact support.");
    }
  };

  const handleWebLogout = () => {
    sessionStorage.removeItem("wapp_web_auth");
    localStorage.removeItem("wapp_web_auth");
    setIsWebAuthenticated(false);
    window.location.href = "/landing/";
  };

  useEffect(() => {
    if (!socket) return;
    const onReady = () => setIsWaReady(true);
    const onDisconnected = () => setIsWaReady(false);
    const onQr = () => setIsWaReady(false);

    socket.on("ready", onReady);
    socket.on("disconnected", onDisconnected);
    socket.on("qr", onQr);

    fetch(`${API_URL}/api/status`)
      .then(r => r.json())
      .then(d => { if (d && d.isReady) setIsWaReady(true); })
      .catch(() => {});

    return () => {
      socket.off("ready", onReady);
      socket.off("disconnected", onDisconnected);
      socket.off("qr", onQr);
    };
  }, [socket]);

  useEffect(() => {
    const checkLicense = async () => {
      try {
        const res = await fetch(`${API_URL}/api/license-status`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.isActivated === false) {
            setIsActivated(false);
          } else if (data && data.isActivated === true) {
            setIsActivated(true);
          }
        }
      } catch (err) {
        // Retain activated state for bundled VIP license
        console.warn("License check Notice:", err);
      }
    };
    checkLicense();
  }, []);

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#060911] flex flex-col items-center justify-center text-white font-sans">
        <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mb-4"></div>
        <p className="text-xs text-gray-400 font-medium tracking-wide">Connecting to WApp Manager Pro...</p>
      </div>
    );
  }

  if (!isWebAuthenticated) {
    return (
      <div className="min-h-screen bg-[#060911] flex items-center justify-center p-4 relative overflow-hidden text-white font-sans">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-lime-500/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="w-full max-w-md bg-[#0e1626] border border-white/10 rounded-3xl p-8 shadow-2xl relative z-10">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-4 shadow-lg shadow-emerald-500/20">
              <img src="/logo.png" alt="WApp Manager Pro" className="w-12 h-12 rounded-xl" />
            </div>
            <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
              ☁️ Web Cloud Portal
            </span>
            <h1 className="text-2xl font-black text-white tracking-tight">WApp Manager Pro</h1>
            <p className="text-xs text-gray-400 mt-1 max-w-xs">
              Authentication required to access the web cloud instance.
            </p>
          </div>

          <form onSubmit={handleWebLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider mb-1.5">
                Access Password or License Key
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Enter access password or key..."
                  required
                  className="w-full bg-[#070b14] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs font-semibold px-1"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowAdvancedApi(!showAdvancedApi)}
                className="text-xs text-gray-400 hover:text-emerald-400 font-medium transition flex items-center gap-1"
              >
                <span>⚙️ {showAdvancedApi ? "Hide Backend URL" : "Custom Backend Server (Optional)"}</span>
              </button>
              {showAdvancedApi && (
                <div className="mt-2">
                  <input
                    type="url"
                    value={customApiUrl}
                    onChange={(e) => setCustomApiUrl(e.target.value)}
                    placeholder="http://localhost:3001 or https://api.yourdomain.com"
                    className="w-full bg-[#070b14] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition"
                  />
                  <p className="text-[11px] text-gray-500 mt-1">
                    Leave blank to use default backend.
                  </p>
                </div>
              )}
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs leading-relaxed">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-500/30 transition transform hover:-translate-y-0.5"
            >
              Unlock Web Console
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between text-xs">
            <a
              href="/landing/"
              className="text-gray-400 hover:text-emerald-400 transition font-medium flex items-center gap-1"
            >
              ← Back to Landing Page
            </a>
            <a
              href="https://www.up-4ever.net/n8cn6uqaqi1r"
              target="_blank"
              rel="noopener"
              className="text-emerald-400 hover:underline font-semibold"
            >
              Download Windows App
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (isActivated === false) {
    return <LicenseScreen onActivated={() => setIsActivated(true)} />;
  }

  const currentNav = NAV.find(n => n.id === activeTab);

  return (
    <div className={`flex h-screen overflow-hidden ${darkMode ? "bg-gray-950 text-white" : "bg-gray-50 text-gray-900"}`}>
      <aside className={`${sidebarOpen ? "w-64" : "w-16"} flex-shrink-0 flex flex-col transition-all duration-300 ${darkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"} border-r`}>
        <div className={`p-4 border-b ${darkMode ? "border-gray-800" : "border-gray-100"} flex items-center gap-3`}>
          <img src="/logo.png" alt="WApp Manager Pro" className="w-9 h-9 rounded-xl object-contain shadow-md shrink-0 bg-white/10 p-0.5" />
          {sidebarOpen && (<div className="min-w-0"><div className="font-black text-sm truncate bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">WApp Manager Pro</div><div className={`text-[10px] truncate ${darkMode ? "text-gray-500" : "text-gray-400"}`}>WhatsApp Automation</div></div>)}
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => setActiveTab(item.id as Tab)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all ${isActive ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm" : darkMode ? "text-gray-400 hover:bg-gray-800 hover:text-white" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
                <item.icon className="w-5 h-5 shrink-0" />
                {sidebarOpen && (<div className="min-w-0 flex-1"><div className="text-sm font-medium truncate">{item.label}</div><div className={`text-[10px] truncate ${isActive ? "text-blue-100" : darkMode ? "text-gray-600" : "text-gray-400"}`}>{item.sub}</div></div>)}
              </button>
            );
          })}
        </nav>
        <div className={`p-3 border-t ${darkMode ? "border-gray-800" : "border-gray-100"} space-y-2`}>
          <button onClick={() => setLanguage(language === "en" ? "fr" : "en")} className={`w-full flex items-center gap-2 justify-center px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${darkMode ? "bg-gray-800 text-gray-400 hover:bg-gray-700" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}><Globe className="w-3.5 h-3.5" />{sidebarOpen ? (language === "en" ? "Francais" : "English") : ""}</button>
          <div className={`flex items-center gap-2 px-2 py-1 text-xs ${darkMode ? "text-gray-600" : "text-gray-400"}`}><div className={`w-2 h-2 rounded-full shrink-0 ${isWaReady ? "bg-green-500 animate-pulse" : "bg-red-500"}`} />{sidebarOpen && (isWaReady ? "WhatsApp Ready" : "Disconnected")}</div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className={`h-14 flex items-center gap-3 px-4 border-b shrink-0 ${darkMode ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`p-1.5 rounded-lg transition ${darkMode ? "text-gray-400 hover:bg-gray-800" : "text-gray-500 hover:bg-gray-100"}`}><div className="space-y-1"><div className={`w-4 h-0.5 rounded ${darkMode ? "bg-gray-400" : "bg-gray-600"}`} /><div className={`w-4 h-0.5 rounded ${darkMode ? "bg-gray-400" : "bg-gray-600"}`} /><div className={`w-4 h-0.5 rounded ${darkMode ? "bg-gray-400" : "bg-gray-600"}`} /></div></button>
          <div className="flex items-center gap-1.5"><span className={`text-sm font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>{currentNav?.label}</span><span className="text-xs font-mono px-2 py-0.5 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold">v2026.5.0</span></div>
          <div className={`flex-1 max-w-xs flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm ${darkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-500"}`}><Search className="w-4 h-4 shrink-0" /><input className="bg-transparent flex-1 outline-none text-sm" placeholder="Search features..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} /></div>
          <div className="flex items-center gap-2 ml-auto">
            {!isElectronEnv && (
              <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-xl text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span>Web Cloud</span>
                <button
                  onClick={handleWebLogout}
                  className="text-gray-400 hover:text-red-500 ml-1 font-bold text-[11px] underline"
                  title="Sign Out to Landing Page"
                >
                  Exit
                </button>
              </div>
            )}
            <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-xl transition ${darkMode ? "bg-gray-800 text-yellow-400" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</button>
            <button className="p-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:opacity-90 transition"><Rocket className="w-4 h-4" /></button>
            <div className="relative"><button className={`p-2 rounded-xl transition ${darkMode ? "bg-gray-800 text-gray-400" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}><Bell className="w-4 h-4" /></button><span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-[9px] flex items-center justify-center font-bold">3</span></div>
            <div className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl border ${darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}><div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white text-xs font-black">DC</div><div className="hidden sm:block"><div className={`text-xs font-bold ${darkMode ? "text-white" : "text-gray-900"}`}>DreamaniaCode</div><div className="text-[9px] text-green-500 font-semibold">Enterprise ViP</div></div><span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400 text-amber-900 hidden sm:flex">RENEW</span></div>
          </div>
        </header>
        <main className={`flex-1 overflow-y-auto p-6 ${darkMode ? "bg-gray-950" : "bg-gray-50"}`}>
          {activeTab === "dashboard" && <DashboardPanel isConnected={isWaReady} />}
          {activeTab === "devices" && <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"><h2 className="text-lg font-bold text-gray-900 mb-4">WhatsApp Sessions</h2><QRCodeDisplay socket={socket} /></div>}
          {activeTab === "single" && <SingleMessagePanel />}
          {activeTab === "templates" && <TemplatesPanel />}
          {activeTab === "contacts" && <ContactsManager />}
          {activeTab === "bulk" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <BulkSender
                socket={socket}
                initialRecipients={bulkRecipients}
                initialMessage={bulkMessage}
                onClearInitial={() => {
                  setBulkRecipients([]);
                  setBulkMessage("");
                }}
              />
            </div>
          )}
          {activeTab === "history" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <MessageHistory
                onReuseMessage={(msg) => {
                  setBulkMessage(msg);
                  setActiveTab("bulk");
                }}
              />
            </div>
          )}
          {activeTab === "proxies" && <ProxiesPanel />}
          {activeTab === "autoreply" && <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"><Settings /></div>}
          {activeTab === "chatbot" && <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"><SettingsBot /></div>}
          {activeTab === "callresponder" && <CallResponderPanel />}
          {activeTab === "groups" && (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <GroupExtractor
                isReady={isWaReady}
                onSendToBulk={(participants) => {
                  setBulkRecipients(participants);
                  setActiveTab("bulk");
                }}
              />
            </div>
          )}
          {activeTab === "settings" && <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100"><Settings /></div>}
        </main>
      </div>
    </div>
  );
}

