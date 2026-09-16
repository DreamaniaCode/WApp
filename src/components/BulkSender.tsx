"use client";

import { useState, useRef, useEffect } from "react";
import {
    Send, Upload, Clock, AlertCircle, FileText, X, FileSpreadsheet, Plus, Download,
    CheckCircle2, XCircle, Square, RotateCw, Filter, Search, Users, Loader2, CheckSquare, Sparkles,
    Smartphone, CheckCheck, Bookmark, BookmarkPlus, ChevronDown
} from "lucide-react";
import Papa from "papaparse";
import { MessagePreview } from "./MessagePreview";
import { AiMessageGenerator } from "./AiMessageGenerator";
import { formatPhoneNumber, isLandlineNumber } from "@/lib/numberFormatter";
import { useLanguage } from "@/contexts/LanguageContext";
import { API_URL } from "@/lib/config";
import { playSuccessSound, playErrorSound } from "@/utils/soundEffects";

interface Attachment {
    filename: string;
    mimetype: string;
    data: string; // Base64
}

interface Recipient {
    number: string;
    name?: string;
    variables?: Record<string, string>;
}

interface RecipientResult {
    number: string;
    name?: string;
    status: "success" | "error" | "sending" | "pending";
    error?: string;
    timestamp?: string;
}

interface BulkSenderProps {
    socket?: any;
    initialRecipients?: Recipient[];
    initialMessage?: string;
    onClearInitial?: () => void;
}

export function BulkSender({ socket, initialRecipients, initialMessage, onClearInitial }: BulkSenderProps) {
    const { t } = useLanguage();
    const [textInput, setTextInput] = useState("");
    const [recipients, setRecipients] = useState<Recipient[]>([]);
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [availableVars, setAvailableVars] = useState<string[]>([]);
    const [progress, setProgress] = useState<{
        total: number;
        current: number;
        success: number;
        failed: number;
        status: string;
    } | null>(null);
    const [resultsList, setResultsList] = useState<RecipientResult[]>([]);
    const [activeTab, setActiveTab] = useState<"compose" | "results">("compose");
    const [searchFilter, setSearchFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error">("all");

    // Modals for importing from Groups and Contacts
    const [showGroupModal, setShowGroupModal] = useState(false);
    const [groupsList, setGroupsList] = useState<{ id: string; name: string; participantsCount: number }[]>([]);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
    const [importingGroups, setImportingGroups] = useState(false);

    const [showContactsModal, setShowContactsModal] = useState(false);
    const [savedContacts, setSavedContacts] = useState<{ name: string; number: string }[]>([]);

    // Multi-device sender selection & AI Generator modal
    const [availableDevices, setAvailableDevices] = useState<any[]>([]);
    const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
    const [showAiModal, setShowAiModal] = useState(false);

    // Templates state & management
    const [templatesList, setTemplatesList] = useState<{ id: string; title?: string; name?: string; content: string }[]>([]);
    const [showTemplatesDropdown, setShowTemplatesDropdown] = useState(false);
    const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
    const [templateTitleInput, setTemplateTitleInput] = useState("");
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);
    const [templateSuccessMsg, setTemplateSuccessMsg] = useState("");

    const loadTemplatesList = async () => {
        try {
            const res = await fetch(`${API_URL}/api/templates`);
            if (res.ok) {
                const data = await res.json();
                const list = Array.isArray(data) ? data : (data.templates || []);
                setTemplatesList(list);
            }
        } catch (e) {
            console.warn("Failed to load templates:", e);
        }
    };

    useEffect(() => {
        loadTemplatesList();
    }, []);

    const handleSelectTemplate = (tpl: { title?: string; name?: string; content: string }) => {
        setMessage(tpl.content);
        setShowTemplatesDropdown(false);
    };

    const handleSaveAsTemplate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!templateTitleInput.trim() || !message.trim()) return;
        setIsSavingTemplate(true);
        try {
            const res = await fetch(`${API_URL}/api/templates`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: templateTitleInput.trim(),
                    name: templateTitleInput.trim(),
                    content: message.trim()
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setTemplateSuccessMsg(`Template "${templateTitleInput.trim()}" saved!`);
                setShowSaveTemplateModal(false);
                setTemplateTitleInput("");
                await loadTemplatesList();
                setTimeout(() => setTemplateSuccessMsg(""), 3500);
            } else {
                alert(data.error || "Failed to save template");
            }
        } catch (err: any) {
            alert("Error saving template: " + err.message);
        } finally {
            setIsSavingTemplate(false);
        }
    };

    useEffect(() => {
        const fetchDevs = () => {
            fetch(`${API_URL}/api/devices`)
                .then(r => r.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setAvailableDevices(data);
                        setSelectedDeviceIds(prev => {
                            if (prev.length === 0) {
                                return data.filter((d: any) => d.isReady).map((d: any) => d.id);
                            }
                            return prev;
                        });
                    }
                })
                .catch(() => {});
        };
        fetchDevs();
        if (socket) {
            const onDevs = (list: any[]) => {
                if (Array.isArray(list)) {
                    setAvailableDevices(list);
                }
            };
            socket.on("devices:list", onDevs);
            return () => {
                socket.off("devices:list", onDevs);
            };
        }
    }, [socket]);

    // Check for initial recipients passed via props or localStorage
    useEffect(() => {
        if (initialRecipients && initialRecipients.length > 0) {
            const formatted = initialRecipients.map(r => ({
                ...r,
                number: formatPhoneNumber(r.number)
            }));
            setRecipients(formatted);
            setTextInput(formatted.map(r => r.number).join("\n"));
            setStatus({ type: "success", msg: `Loaded & normalized ${formatted.length} recipients for WhatsApp!` });
            if (onClearInitial) onClearInitial();
        } else {
            const cached = localStorage.getItem("bulk_imported_recipients");
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        const formatted = parsed.map((r: any) => ({
                            ...r,
                            number: formatPhoneNumber(r.number)
                        }));
                        setRecipients(formatted);
                        setTextInput(formatted.map(r => r.number).join("\n"));
                        setStatus({ type: "success", msg: `Imported & normalized ${formatted.length} contacts from group!` });
                        localStorage.removeItem("bulk_imported_recipients");
                    }
                } catch (_) {}
            } else {
                // Restore persistent draft
                const savedDraft = localStorage.getItem("wapp_bulk_draft");
                if (savedDraft) {
                    try {
                        const parsed = JSON.parse(savedDraft);
                        if (parsed.recipients && Array.isArray(parsed.recipients) && parsed.recipients.length > 0) {
                            setRecipients(parsed.recipients);
                        }
                        if (parsed.textInput) {
                            setTextInput(parsed.textInput);
                        }
                        if (parsed.message) {
                            setMessage(parsed.message);
                        }
                        if (parsed.selectedDeviceIds && Array.isArray(parsed.selectedDeviceIds) && parsed.selectedDeviceIds.length > 0) {
                            setSelectedDeviceIds(parsed.selectedDeviceIds);
                        }
                    } catch (_) {}
                }
            }
        }
        if (initialMessage) {
            setMessage(initialMessage);
        }
    }, [initialRecipients, initialMessage]);

    // Auto-save bulk composition draft
    useEffect(() => {
        if (recipients.length > 0 || message.trim().length > 0 || textInput.trim().length > 0) {
            try {
                localStorage.setItem("wapp_bulk_draft", JSON.stringify({
                    recipients,
                    textInput,
                    message,
                    selectedDeviceIds
                }));
            } catch (_) {}
        }
    }, [recipients, textInput, message, selectedDeviceIds]);

    const clearDraftSession = () => {
        setRecipients([]);
        setTextInput("");
        setMessage("");
        setAttachments([]);
        localStorage.removeItem("wapp_bulk_draft");
        if (onClearInitial) onClearInitial();
        setStatus({ type: "success", msg: "Brouillon de campagne effacé." });
    };

    const openGroupModal = async () => {
        setShowGroupModal(true);
        setLoadingGroups(true);
        try {
            const res = await fetch(`${API_URL}/api/groups`);
            const data = await res.json();
            if (data.success && Array.isArray(data.groups)) {
                setGroupsList(data.groups);
            }
        } catch {
            setStatus({ type: "error", msg: "Failed to load WhatsApp groups" });
        } finally {
            setLoadingGroups(false);
        }
    };

    const importSelectedGroups = async () => {
        if (selectedGroupIds.length === 0) return;
        setImportingGroups(true);
        const imported: Recipient[] = [];
        try {
            for (const gid of selectedGroupIds) {
                const res = await fetch(`${API_URL}/api/groups/${encodeURIComponent(gid)}/participants`);
                const data = await res.json();
                if (data.success && Array.isArray(data.participants)) {
                    data.participants.forEach((p: any) => {
                        const num = formatPhoneNumber(p.number || "");
                        if (num.length >= 6 && !imported.some(x => x.number === num)) {
                            imported.push({
                                number: num,
                                name: p.name || "",
                                variables: { name: p.name || "" }
                            });
                        }
                    });
                }
            }

            // Merge with existing recipients
            const existingNumbers = new Set(recipients.map(r => r.number));
            const newRecipients = [...recipients, ...imported.filter(r => !existingNumbers.has(r.number))];
            setRecipients(newRecipients);
            setTextInput(newRecipients.map(r => r.number).join("\n"));
            setShowGroupModal(false);
            setSelectedGroupIds([]);
            setStatus({
                type: "success",
                msg: `Successfully imported ${imported.length} group members! Total recipients: ${newRecipients.length}`
            });
        } catch (err: any) {
            setStatus({ type: "error", msg: "Error importing group members: " + err.message });
        } finally {
            setImportingGroups(false);
        }
    };

    const openContactsModal = () => {
        const raw = localStorage.getItem("whatsapp_contacts");
        if (raw) {
            try {
                setSavedContacts(JSON.parse(raw));
            } catch (_) {
                setSavedContacts([]);
            }
        } else {
            setSavedContacts([]);
        }
        setShowContactsModal(true);
    };

    const importAllSavedContacts = () => {
        if (savedContacts.length === 0) return;
        const mapped: Recipient[] = savedContacts.map(c => ({
            number: formatPhoneNumber(c.number),
            name: c.name,
            variables: { name: c.name }
        }));
        const existing = new Set(recipients.map(r => r.number));
        const merged = [...recipients, ...mapped.filter(r => !existing.has(r.number))];
        setRecipients(merged);
        setTextInput(merged.map(r => r.number).join("\n"));
        setShowContactsModal(false);
        setStatus({
            type: "success",
            msg: `Imported ${mapped.length} saved contacts! Total recipients: ${merged.length}`
        });
    };

    useEffect(() => {
        if (!socket) return;

        const handleProgress = (data: any) => {
            console.log("Bulk Progress Event:", data);
            setProgress(data);

            if (data.results && Array.isArray(data.results)) {
                setResultsList(data.results);
            } else if (data.lastResult) {
                setResultsList(prev => {
                    const idx = prev.findIndex(r => r.number === data.lastResult.number);
                    if (idx >= 0) {
                        const copy = [...prev];
                        copy[idx] = data.lastResult;
                        return copy;
                    }
                    return [...prev, data.lastResult];
                });
            }

            if (data.status === "Completed" || (data.current >= data.total && data.total > 0)) {
                setIsLoading(false);
                playSuccessSound();
                setStatus({
                    type: "success",
                    msg: `Campaign finished: ${data.success || data.sentCount || 0} sent successfully, ${data.failed || data.failCount || 0} failed.`
                });
            }
        };

        const handleComplete = (data: any) => {
            setIsLoading(false);
            playSuccessSound();
            if (data.results && Array.isArray(data.results)) {
                setResultsList(data.results);
            }
            setStatus({
                type: "success",
                msg: `Campaign Completed: ${data.sentCount || 0} sent, ${data.failCount || 0} failed.`
            });
        };

        socket.on("bulkProgress", handleProgress);
        socket.on("bulk_progress", handleProgress);
        socket.on("bulkComplete", handleComplete);

        return () => {
            socket.off("bulkProgress", handleProgress);
            socket.off("bulk_progress", handleProgress);
            socket.off("bulkComplete", handleComplete);
        };
    }, [socket]);

    const stopCampaign = async () => {
        try {
            await fetch(`${API_URL}/api/stop-bulk`, { method: "POST" });
            setIsLoading(false);
            playErrorSound();
            setStatus({ type: "error", msg: "Campaign stopping requested..." });
        } catch {
            setStatus({ type: "error", msg: "Failed to request stopping campaign." });
        }
    };

    const downloadReport = () => {
        if (resultsList.length === 0) return;
        const csvData = resultsList.map((r, i) => ({
            Index: i + 1,
            Phone: r.number,
            Name: r.name || "",
            Status: r.status === "success" ? "Sent" : "Failed",
            Error: r.error || "",
            Timestamp: r.timestamp ? new Date(r.timestamp).toLocaleString() : ""
        }));
        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `bulk_campaign_status_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    const handleTextChange = (val: string) => {
        setTextInput(val);
        const lines = val.split(/[\n,]+/);
        const newRecipients = lines
            .map(l => l.trim())
            .filter(l => l.length > 5)
            .map(num => ({ number: formatPhoneNumber(num) }));

        if (availableVars.length === 0) {
            setRecipients(newRecipients);
        }
    };

    const cleanAndFormatNumbers = () => {
        if (!textInput.trim()) return;
        const lines = textInput.split(/[\n,]+/);
        const cleaned = lines
            .map(l => l.trim())
            .filter(l => l.length > 5)
            .map(num => formatPhoneNumber(num));

        const unique = Array.from(new Set(cleaned));
        setTextInput(unique.join("\n"));
        setRecipients(unique.map(number => ({ number })));
        setStatus({
            type: "success",
            msg: `Cleaned & normalized ${unique.length} phone numbers to pure WhatsApp format!`
        });
    };

    const [isCheckingWhatsApp, setIsCheckingWhatsApp] = useState(false);

    // Remove landlines (e.g. 05...) and keep only smartphone/mobile numbers (06/07...)
    const filterOnlyMobiles = () => {
        if (availableVars.length > 0) {
            // In CSV mode
            const initialCount = recipients.length;
            const filtered = recipients.filter(r => !isLandlineNumber(r.number));
            const removed = initialCount - filtered.length;
            setRecipients(filtered);
            setStatus({
                type: "success",
                msg: `Filtered out ${removed} landline numbers (05...). Kept ${filtered.length} mobile smartphone numbers!`
            });
            return;
        }

        if (!textInput.trim()) return;
        const lines = textInput.split(/[\n,]+/);
        const cleaned = lines
            .map(l => l.trim())
            .filter(l => l.length > 5)
            .map(num => formatPhoneNumber(num));

        const unique = Array.from(new Set(cleaned));
        const mobiles = unique.filter(num => !isLandlineNumber(num));
        const removed = unique.length - mobiles.length;

        setTextInput(mobiles.join("\n"));
        setRecipients(mobiles.map(number => ({ number })));
        setStatus({
            type: "success",
            msg: `Filtered out ${removed} landlines (05...). Kept ${mobiles.length} mobile smartphone numbers!`
        });
    };

    // Test recipients on WhatsApp Web
    const testRecipientsOnWhatsApp = async () => {
        const numbersToTest = recipients.map(r => r.number).filter(n => n && n.length >= 6);
        if (numbersToTest.length === 0) {
            setStatus({ type: "error", msg: "No recipient numbers to test." });
            return;
        }

        setIsCheckingWhatsApp(true);
        setStatus({ type: "success", msg: `Testing ${numbersToTest.length} numbers live on WhatsApp Web...` });

        try {
            const res = await fetch(`${API_URL}/api/whatsapp/check-numbers`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ numbers: numbersToTest })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                if (data.connected === false) {
                    setStatus({
                        type: "error",
                        msg: "WhatsApp Web is not connected. Please scan the QR code in 'Connect WhatsApp' tab to test live accounts."
                    });
                    return;
                }

                const activeSet = new Set<string>();
                (data.results || []).forEach((r: any) => {
                    if (r.isWhatsApp) activeSet.add(r.number);
                });

                const inactiveCount = numbersToTest.length - activeSet.size;

                // Filter recipients to active WhatsApp accounts only
                const activeRecipients = recipients.filter(r => activeSet.has(r.number));
                setRecipients(activeRecipients);

                if (availableVars.length === 0) {
                    setTextInput(activeRecipients.map(r => r.number).join("\n"));
                }

                setStatus({
                    type: "success",
                    msg: `WhatsApp Check Complete: ${activeSet.size} active WhatsApp accounts verified. Removed ${inactiveCount} inactive numbers/landlines.`
                });
            } else {
                setStatus({ type: "error", msg: data.error || "Failed to verify WhatsApp numbers" });
            }
        } catch (err: any) {
            setStatus({ type: "error", msg: "Error checking WhatsApp numbers: " + err.message });
        } finally {
            setIsCheckingWhatsApp(false);
        }
    };

    const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data as Record<string, string>[];
                if (data.length > 0) {
                    const headers = Object.keys(data[0]);
                    let phoneCol = headers.find(h => /phone|number|mobile|tel|contact/i.test(h));

                    if (!phoneCol) {
                        phoneCol = headers.find(h => {
                            const val = data[0][h];
                            if (typeof val !== 'string') return false;
                            const cleaned = val.replace(/\D/g, '');
                            return cleaned.length >= 8 && cleaned.length <= 15;
                        }) || headers[0];
                    }

                    const varHeaders = headers.filter(h => h !== phoneCol);
                    setAvailableVars(varHeaders);

                    const newRecipients: Recipient[] = data.map(row => {
                        const rawNumber = row[phoneCol!] || "";
                        const number = formatPhoneNumber(rawNumber);
                        const name = row["name"] || row["Name"] || row["nom"] || "";

                        return {
                            number,
                            name,
                            variables: row
                        };
                    }).filter(r => r.number.length >= 8);

                    setRecipients(newRecipients);
                    if (newRecipients.length < 500) {
                        setTextInput(newRecipients.map(r => r.number).join("\n"));
                    } else {
                        setTextInput(`${newRecipients.length} recipients loaded via CSV`);
                    }

                    setStatus({
                        type: "success",
                        msg: `Loaded ${newRecipients.length} recipients with variables: ${varHeaders.join(", ") || "None"}`
                    });
                }
            },
            error: (err) => {
                setStatus({ type: "error", msg: "Error parsing CSV: " + err.message });
            }
        });
    };

    const downloadTemplate = () => {
        const csvContent = "data:text/csv;charset=utf-8,number,name,company\n0612345678,John Doe,Enterprise\n0700000000,Jane Smith,Agency";
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "bulk_recipients_template.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();

            reader.onload = () => {
                const base64String = reader.result as string;
                const base64Data = base64String.split(",")[1];

                setAttachments(prev => [...prev, {
                    filename: file.name,
                    mimetype: file.type,
                    data: base64Data
                }]);
            };

            reader.readAsDataURL(file);
        }
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const insertVariable = (varName: string) => {
        setMessage(prev => prev + ` {{${varName}}} `);
    };

    const handleSend = async () => {
        setIsLoading(true);
        setStatus(null);
        setResultsList([]);
        setProgress(null);
        setActiveTab("results");

        const minDelay = parseInt(localStorage.getItem("whatsapp_min_delay") || "1000");
        const maxDelay = parseInt(localStorage.getItem("whatsapp_max_delay") || "3000");

        try {
            if (recipients.length === 0) {
                throw new Error("No valid recipients found. Please add numbers or import a CSV.");
            }

            if (!message.trim() && attachments.length === 0) {
                throw new Error("A message text or file attachment is required.");
            }

            const response = await fetch(`${API_URL}/api/send-bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    recipients,
                    message,
                    minDelay,
                    maxDelay,
                    attachments,
                    deviceIds: selectedDeviceIds.length > 0 ? selectedDeviceIds : undefined
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to start bulk campaign.");
            }

            setStatus({ type: "success", msg: data.message || "Bulk campaign started. Tracking live status below." });
        } catch (err: any) {
            setStatus({ type: "error", msg: err.message });
            setIsLoading(false);
        }
    };

    const previewVariables = recipients.length > 0 ? recipients[0].variables : {};
    const previewMessage = message.replace(/{{(\w+)}}/g, (_, key) => previewVariables?.[key] || `{{${key}}}`);

    const filteredResults = resultsList.filter(r => {
        const matchesQuery = (r.number && r.number.includes(searchFilter)) ||
            (r.name && r.name.toLowerCase().includes(searchFilter.toLowerCase())) ||
            (r.error && r.error.toLowerCase().includes(searchFilter.toLowerCase()));
        if (!matchesQuery) return false;
        if (statusFilter === "success") return r.status === "success";
        if (statusFilter === "error") return r.status === "error";
        return true;
    });

    const successCount = resultsList.filter(r => r.status === "success").length;
    const errorCount = resultsList.filter(r => r.status === "error").length;

    return (
        <div className="space-y-6">
            {/* Top Navigation Switcher */}
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setActiveTab("compose")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${activeTab === "compose"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                    >
                        <Send className="w-4 h-4" />
                        Compose Campaign
                    </button>
                    <button
                        onClick={() => setActiveTab("results")}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all ${activeTab === "results"
                            ? "bg-blue-600 text-white shadow-sm"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                    >
                        <Clock className="w-4 h-4" />
                        Live Status & Message History
                        {resultsList.length > 0 && (
                            <span className="ml-1.5 px-2 py-0.5 text-xs rounded-full bg-white/20 font-bold">
                                {resultsList.length}
                            </span>
                        )}
                    </button>
                </div>

                {isLoading && (
                    <button
                        onClick={stopCampaign}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition"
                    >
                        <Square className="w-3.5 h-3.5 fill-red-600" />
                        Stop Campaign
                    </button>
                )}
            </div>

            {/* Notification Banner */}
            {status && (
                <div className={`p-4 rounded-xl text-sm flex items-center justify-between gap-3 ${status.type === "success" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"}`}>
                    <div className="flex items-center gap-2">
                        {status.type === "error" ? <AlertCircle className="w-5 h-5 text-red-500 shrink-0" /> : <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                        <span className="font-medium">{status.msg}</span>
                    </div>
                    {resultsList.length > 0 && (
                        <button
                            onClick={downloadReport}
                            className="flex items-center gap-1 text-xs bg-white border border-gray-300 px-3 py-1.5 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 shadow-xs shrink-0"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Download CSV Report
                        </button>
                    )}
                </div>
            )}

            {/* Live Progress Bar Widget */}
            {progress && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-2xl border border-blue-100 shadow-xs">
                    <div className="flex items-center justify-between text-xs font-bold text-blue-900 mb-2">
                        <div className="flex items-center gap-2">
                            {isLoading ? <RotateCw className="w-3.5 h-3.5 animate-spin text-blue-600" /> : <CheckCircle2 className="w-4 h-4 text-green-600" />}
                            <span>{progress.status}</span>
                        </div>
                        <span className="font-mono text-sm">
                            {progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0}%
                        </span>
                    </div>
                    <div className="w-full bg-blue-200/60 rounded-full h-3 overflow-hidden mb-2">
                        <div
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 h-3 rounded-full transition-all duration-300"
                            style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between text-xs text-blue-700">
                        <span>Progress: <strong>{progress.current} / {progress.total}</strong></span>
                        <div className="flex gap-4">
                            <span className="text-green-700 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> {progress.success || successCount} Sent
                            </span>
                            <span className="text-red-700 font-semibold flex items-center gap-1">
                                <XCircle className="w-3.5 h-3.5" /> {progress.failed || errorCount} Failed
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 1: Compose Campaign */}
            {activeTab === "compose" && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column: Inputs */}
                    <div className="space-y-5">
                        <div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2 gap-2">
                                <div className="flex items-center gap-2">
                                    <label className="block text-sm font-semibold text-gray-800">
                                        {t("recipients")} ({recipients.length})
                                    </label>
                                    {(recipients.length > 0 || message.length > 0) && (
                                        <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium border border-blue-100">
                                            💾 Brouillon sauvegardé
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    {(recipients.length > 0 || message.length > 0 || textInput.length > 0) && (
                                        <button
                                            type="button"
                                            onClick={clearDraftSession}
                                            className="text-xs flex items-center gap-1 text-red-600 hover:text-red-800 font-semibold bg-red-50 hover:bg-red-100 px-2 py-1.5 rounded-lg border border-red-200 transition"
                                            title="Réinitialiser le brouillon de campagne"
                                        >
                                            <X className="w-3 h-3" /> Effacer
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={openGroupModal}
                                        className="text-xs flex items-center gap-1 text-blue-700 hover:text-blue-800 font-semibold bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg border border-blue-200 transition"
                                        title="Extract and import contacts from any connected WhatsApp group"
                                    >
                                        <Users className="w-3.5 h-3.5" /> Import from Group
                                    </button>
                                    <button
                                        type="button"
                                        onClick={openContactsModal}
                                        className="text-xs flex items-center gap-1 text-purple-700 hover:text-purple-800 font-semibold bg-purple-50 hover:bg-purple-100 px-2.5 py-1.5 rounded-lg border border-purple-200 transition"
                                        title="Import from saved contacts list"
                                    >
                                        <Users className="w-3.5 h-3.5" /> Contacts
                                    </button>
                                    <input type="file" ref={csvInputRef} className="hidden" accept=".csv" onChange={handleCSVUpload} />
                                    <button
                                        type="button"
                                        onClick={() => csvInputRef.current?.click()}
                                        className="text-xs flex items-center gap-1 text-green-700 hover:text-green-800 font-semibold bg-green-50 hover:bg-green-100 px-2.5 py-1.5 rounded-lg border border-green-200 transition"
                                    >
                                        <FileSpreadsheet className="w-3.5 h-3.5" /> CSV
                                    </button>
                                    <button
                                        type="button"
                                        onClick={downloadTemplate}
                                        className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-800 font-medium px-2 py-1.5"
                                        title="Download CSV template"
                                    >
                                        <Download className="w-3 h-3" /> Template
                                    </button>
                                    <button
                                        type="button"
                                        onClick={cleanAndFormatNumbers}
                                        className="text-xs flex items-center gap-1 text-amber-700 hover:text-amber-800 font-semibold bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg border border-amber-200 transition shadow-2xs"
                                        title="Clean & normalize all numbers (converts 05/06/07 to country code, strips +, spaces, and redundant zeros)"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-amber-600" /> Clean & Format
                                    </button>
                                    <button
                                        type="button"
                                        onClick={filterOnlyMobiles}
                                        className="text-xs flex items-center gap-1 text-emerald-700 hover:text-emerald-800 font-semibold bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg border border-emerald-200 transition shadow-2xs"
                                        title="Exclude fixed/landline numbers (05...) and keep only smartphones (06/07...)"
                                    >
                                        <Smartphone className="w-3.5 h-3.5 text-emerald-600" /> Mobiles Only
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isCheckingWhatsApp}
                                        onClick={testRecipientsOnWhatsApp}
                                        className="text-xs flex items-center gap-1 text-teal-700 hover:text-teal-800 font-semibold bg-teal-50 hover:bg-teal-100 px-2.5 py-1.5 rounded-lg border border-teal-200 transition shadow-2xs disabled:opacity-50"
                                        title="Verify live on WhatsApp and remove numbers not registered on WhatsApp"
                                    >
                                        {isCheckingWhatsApp ? (
                                            <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-600" />
                                        ) : (
                                            <CheckCheck className="w-3.5 h-3.5 text-teal-600" />
                                        )}
                                        {isCheckingWhatsApp ? "Checking..." : "Test WhatsApp"}
                                    </button>
                                </div>
                            </div>

                            {availableVars.length > 0 ? (
                                <div className="p-3 bg-blue-50/50 border border-blue-200 rounded-xl text-sm text-blue-900 mb-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="font-semibold text-xs text-blue-700 uppercase">CSV Mode Active</span>
                                        <button
                                            onClick={() => { setAvailableVars([]); setRecipients([]); setTextInput(""); }}
                                            className="text-red-500 text-xs hover:underline font-semibold"
                                        >
                                            Clear CSV
                                        </button>
                                    </div>
                                    <p className="text-xs text-gray-600">Detected columns: {availableVars.join(", ")}</p>
                                </div>
                            ) : (
                                <textarea
                                    className="w-full text-black h-32 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                    placeholder="Enter phone numbers separated by newlines or commas&#10;e.g. 0612345678&#10;+212600000000"
                                    value={textInput}
                                    onChange={(e) => handleTextChange(e.target.value)}
                                />
                            )}
                        </div>

                        <div>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1.5 gap-2">
                                <div className="flex items-center gap-2 flex-wrap relative">
                                    <label className="block text-sm font-semibold text-gray-800">
                                        {t("messageContent")}
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => setShowAiModal(true)}
                                        className="text-xs bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-medium px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
                                        <span>AI Generate</span>
                                    </button>

                                    {/* Templates Dropdown */}
                                    <div className="relative">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setShowTemplatesDropdown(!showTemplatesDropdown);
                                                if (!showTemplatesDropdown) loadTemplatesList();
                                            }}
                                            className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 border border-gray-300 transition cursor-pointer"
                                            title="Choose a saved message template"
                                        >
                                            <Bookmark className="w-3.5 h-3.5 text-blue-600" />
                                            <span>Templates</span>
                                            <ChevronDown className="w-3 h-3 text-gray-500" />
                                        </button>

                                        {showTemplatesDropdown && (
                                            <div className="absolute left-0 top-full mt-1.5 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-2 z-40 space-y-1 animate-in fade-in">
                                                <div className="flex items-center justify-between px-2 py-1.5 border-b border-gray-100">
                                                    <span className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                                                        Saved Templates ({templatesList.length})
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowTemplatesDropdown(false)}
                                                        className="text-gray-400 hover:text-gray-600 cursor-pointer"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                                <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
                                                    {templatesList.length === 0 ? (
                                                        <div className="p-4 text-center text-xs text-gray-400">
                                                            No saved templates found.
                                                        </div>
                                                    ) : (
                                                        templatesList.map(tpl => (
                                                            <button
                                                                key={tpl.id}
                                                                type="button"
                                                                onClick={() => handleSelectTemplate(tpl)}
                                                                className="w-full text-left p-2 hover:bg-blue-50/70 rounded-lg transition group block cursor-pointer"
                                                            >
                                                                <div className="text-xs font-semibold text-gray-800 group-hover:text-blue-600 truncate">
                                                                    {tpl.title || tpl.name || "Untitled"}
                                                                </div>
                                                                <div className="text-[11px] text-gray-500 line-clamp-2 mt-0.5 whitespace-pre-wrap">
                                                                    {tpl.content}
                                                                </div>
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Save as Template Button */}
                                    <button
                                        type="button"
                                        disabled={!message.trim()}
                                        onClick={() => setShowSaveTemplateModal(true)}
                                        className="text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium px-2.5 py-1 rounded-lg flex items-center gap-1 border border-emerald-200 transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                        title={message.trim() ? "Save current message as a template" : "Type a message first to save as template"}
                                    >
                                        <BookmarkPlus className="w-3.5 h-3.5 text-emerald-600" />
                                        <span>Save Template</span>
                                    </button>
                                </div>

                                {availableVars.length > 0 && (
                                    <div className="flex gap-1 flex-wrap">
                                        {availableVars.map(v => (
                                            <button
                                                key={v}
                                                onClick={() => insertVariable(v)}
                                                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-800 px-2 py-0.5 rounded border border-gray-300 flex items-center gap-0.5 font-mono cursor-pointer"
                                            >
                                                <Plus className="w-3 h-3" /> {`{{${v}}}`}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {templateSuccessMsg && (
                                <div className="p-2 mb-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-1.5 animate-in fade-in">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                    <span>{templateSuccessMsg}</span>
                                </div>
                            )}

                            <textarea
                                className="w-full text-black h-36 p-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 transition-all mb-2"
                                placeholder="Write your message here... Use {{name}} to personalize with contact name."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                            />

                            {/* Attachments Section */}
                            <div className="flex flex-wrap gap-2 mb-3">
                                {attachments.map((att, i) => (
                                    <div key={i} className="bg-blue-50 px-3 py-1 rounded-lg flex items-center gap-2 text-xs text-blue-800 border border-blue-200">
                                        <FileText className="w-3.5 h-3.5" />
                                        <span className="max-w-[160px] truncate font-medium">{att.filename}</span>
                                        <button onClick={() => removeAttachment(i)} className="text-gray-400 hover:text-red-500">
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between items-center">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 border border-blue-200 px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors"
                                >
                                    <Upload className="w-3.5 h-3.5" /> Attach Image / File
                                </button>
                            </div>
                        </div>

                        {/* Multi-Device Sender Selection */}
                        <div className="bg-gray-50/80 border border-gray-200 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                    <Smartphone className="w-4 h-4 text-blue-600" />
                                    <span className="text-xs font-semibold text-gray-800">Sender Number(s)</span>
                                </div>
                                <span className="text-[11px] text-gray-500 font-medium">
                                    {selectedDeviceIds.length} of {availableDevices.filter(d => d.isReady).length} active numbers selected
                                </span>
                            </div>

                            {availableDevices.length === 0 ? (
                                <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-lg border border-amber-200">
                                    No WhatsApp numbers connected. Go to the <strong>Devices</strong> tab to connect numbers.
                                </p>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                    {availableDevices.map((dev) => {
                                        const isSelected = selectedDeviceIds.includes(dev.id);
                                        const isReady = dev.isReady;
                                        return (
                                            <label
                                                key={dev.id}
                                                className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                                    !isReady
                                                        ? "opacity-50 bg-gray-100 border-gray-200 cursor-not-allowed"
                                                        : isSelected
                                                        ? "bg-blue-50/80 border-blue-400 text-blue-900 shadow-xs"
                                                        : "bg-white border-gray-200 text-gray-700 hover:border-gray-300"
                                                }`}
                                            >
                                                <input
                                                    type="checkbox"
                                                    disabled={!isReady}
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                        if (e.target.checked) {
                                                            setSelectedDeviceIds(prev => [...prev, dev.id]);
                                                        } else {
                                                            setSelectedDeviceIds(prev => prev.filter(id => id !== dev.id));
                                                        }
                                                    }}
                                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1 font-semibold truncate">
                                                        <span>{dev.label}</span>
                                                        {dev.isDefault && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded">Primary</span>}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500 truncate">
                                                        {dev.phoneNumber ? `+${dev.phoneNumber}` : (isReady ? "Ready" : "Disconnected")}
                                                        {dev.warmingStatus === "warming" && (
                                                            <span className="ml-1 text-amber-600 font-medium">
                                                                (Warm D{dev.warmingDay}: {dev.messagesSentToday}/{dev.dailyLimit})
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="pt-2">
                            <button
                                onClick={handleSend}
                                disabled={isLoading || recipients.length === 0 || (!message && attachments.length === 0)}
                                className={`w-full py-3.5 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all ${isLoading || recipients.length === 0 || (!message && attachments.length === 0)
                                    ? "bg-gray-300 cursor-not-allowed"
                                    : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-lg hover:scale-[1.01]"
                                }`}
                            >
                                {isLoading ? (
                                    <>
                                        <RotateCw className="w-4 h-4 animate-spin" />
                                        Sending Campaign...
                                    </>
                                ) : (
                                    <>
                                        <Send className="w-4 h-4" />
                                        Send Campaign ({recipients.length} recipients)
                                    </>
                                )}
                            </button>
                            <p className="text-center text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
                                <Clock className="w-3 h-3" /> Anti-ban randomized delays configured in Settings
                            </p>
                        </div>
                    </div>

                    {/* Right Column: Preview */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-semibold text-gray-700">Preview</h3>
                        <div className="bg-gray-900 rounded-[28px] p-3 shadow-xl border-4 border-gray-800 max-w-sm mx-auto">
                            <div className="bg-[#efeae2] rounded-[20px] overflow-hidden h-[460px] relative flex flex-col">
                                <div className="bg-[#008069] p-3 flex items-center gap-2.5 text-white">
                                    <div className="w-8 h-8 bg-gray-300 rounded-full shrink-0"></div>
                                    <div className="min-w-0">
                                        <div className="text-xs font-semibold truncate">
                                            {recipients.length > 0 && recipients[0].name ? recipients[0].name : (recipients[0]?.number || "Recipient")}
                                        </div>
                                        <div className="text-[9px] opacity-80">Online</div>
                                    </div>
                                </div>
                                <div className="flex-1 p-3 overflow-y-auto">
                                    <MessagePreview message={previewMessage} attachments={attachments} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: Live Status & Recipient History Table */}
            {activeTab === "results" && (
                <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-4 rounded-xl border border-gray-200">
                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="Search number or name..."
                                    className="pl-9 pr-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs w-56 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={searchFilter}
                                    onChange={(e) => setSearchFilter(e.target.value)}
                                />
                            </div>
                            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5 text-xs">
                                <button
                                    onClick={() => setStatusFilter("all")}
                                    className={`px-2.5 py-1 rounded-md font-medium transition ${statusFilter === "all" ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                                >
                                    All ({resultsList.length})
                                </button>
                                <button
                                    onClick={() => setStatusFilter("success")}
                                    className={`px-2.5 py-1 rounded-md font-medium transition ${statusFilter === "success" ? "bg-green-600 text-white" : "text-green-700 hover:bg-green-50"}`}
                                >
                                    Sent ({successCount})
                                </button>
                                <button
                                    onClick={() => setStatusFilter("error")}
                                    className={`px-2.5 py-1 rounded-md font-medium transition ${statusFilter === "error" ? "bg-red-600 text-white" : "text-red-700 hover:bg-red-50"}`}
                                >
                                    Failed ({errorCount})
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            {resultsList.length > 0 && (
                                <button
                                    onClick={downloadReport}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 shadow-xs"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Export CSV Report
                                </button>
                            )}
                            <button
                                onClick={() => setActiveTab("compose")}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100"
                            >
                                <Plus className="w-3.5 h-3.5" />
                                New Campaign
                            </button>
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-xs">
                        <div className="max-h-[480px] overflow-y-auto">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-gray-50 text-gray-600 sticky top-0 border-b border-gray-200 z-10">
                                    <tr>
                                        <th className="py-3 px-4 font-semibold">#</th>
                                        <th className="py-3 px-4 font-semibold">Recipient Number</th>
                                        <th className="py-3 px-4 font-semibold">Name</th>
                                        <th className="py-3 px-4 font-semibold">Status</th>
                                        <th className="py-3 px-4 font-semibold">Details / Error Reason</th>
                                        <th className="py-3 px-4 font-semibold text-right">Time</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 font-mono">
                                    {filteredResults.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-12 text-center text-gray-400 font-sans">
                                                {resultsList.length === 0
                                                    ? "No messages sent yet. Click 'Send Campaign' to start."
                                                    : "No messages match your search filter."}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredResults.map((r, i) => (
                                            <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                                                <td className="py-2.5 px-4 text-gray-400">{i + 1}</td>
                                                <td className="py-2.5 px-4 font-semibold text-gray-900">{r.number}</td>
                                                <td className="py-2.5 px-4 font-sans text-gray-600">{r.name || "—"}</td>
                                                <td className="py-2.5 px-4">
                                                    {r.status === "success" ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-green-100 text-green-800 font-sans">
                                                            <CheckCircle2 className="w-3 h-3 text-green-600" />
                                                            Sent
                                                        </span>
                                                    ) : r.status === "error" ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800 font-sans">
                                                            <XCircle className="w-3 h-3 text-red-600" />
                                                            Failed
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 font-sans">
                                                            <RotateCw className="w-3 h-3 animate-spin text-blue-600" />
                                                            Sending...
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 font-sans">
                                                    {r.error ? (
                                                        <span className="text-red-600 text-xs font-medium">
                                                            {r.error}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400 text-xs">Delivered to WhatsApp</span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-4 text-right text-gray-400 text-[11px]">
                                                    {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : "Just now"}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Group Import Modal */}
            {showGroupModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 overflow-hidden animate-fade-in-up">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center border border-blue-100">
                                    <Users className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm">Import from WhatsApp Groups</h3>
                                    <p className="text-xs text-gray-500">Select groups to pull all members directly into campaign</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowGroupModal(false)}
                                className="text-gray-400 hover:text-gray-600 p-1"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 max-h-[350px] overflow-y-auto">
                            {loadingGroups ? (
                                <div className="py-12 flex flex-col items-center justify-center text-gray-400">
                                    <Loader2 className="w-7 h-7 animate-spin text-blue-600 mb-2" />
                                    <p className="text-xs">Fetching WhatsApp groups...</p>
                                </div>
                            ) : groupsList.length === 0 ? (
                                <div className="py-12 text-center text-gray-400 text-xs">
                                    No WhatsApp groups found. Ensure your phone is connected and groups are synchronized.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-gray-100 text-xs text-gray-500">
                                        <span>Found {groupsList.length} groups</span>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (selectedGroupIds.length === groupsList.length) {
                                                    setSelectedGroupIds([]);
                                                } else {
                                                    setSelectedGroupIds(groupsList.map(g => g.id));
                                                }
                                            }}
                                            className="text-blue-600 font-semibold hover:underline"
                                        >
                                            {selectedGroupIds.length === groupsList.length ? "Deselect All" : "Select All"}
                                        </button>
                                    </div>
                                    {groupsList.map(group => {
                                        const isSelected = selectedGroupIds.includes(group.id);
                                        return (
                                            <div
                                                key={group.id}
                                                onClick={() => {
                                                    setSelectedGroupIds(prev =>
                                                        isSelected ? prev.filter(x => x !== group.id) : [...prev, group.id]
                                                    );
                                                }}
                                                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${isSelected
                                                    ? "bg-blue-50/70 border-blue-300 shadow-2xs"
                                                    : "bg-gray-50/50 border-gray-200 hover:bg-gray-50"
                                                }`}
                                            >
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => {}}
                                                        className="w-4 h-4 rounded text-blue-600 pointer-events-none"
                                                    />
                                                    <div className="min-w-0">
                                                        <div className="text-xs font-bold text-gray-900 truncate">
                                                            {group.name}
                                                        </div>
                                                        <div className="text-[11px] text-gray-400 font-mono">
                                                            {group.participantsCount} participants
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                            <span className="text-xs text-gray-500">
                                {selectedGroupIds.length} group(s) selected
                            </span>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowGroupModal(false)}
                                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={importSelectedGroups}
                                    disabled={selectedGroupIds.length === 0 || importingGroups}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                                >
                                    {importingGroups ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            Extracting Numbers...
                                        </>
                                    ) : (
                                        <>
                                            <Users className="w-3.5 h-3.5" />
                                            Import Members ({selectedGroupIds.length})
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Saved Contacts Modal */}
            {showContactsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-gray-200 overflow-hidden animate-fade-in-up">
                        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center border border-purple-100">
                                    <Users className="w-5 h-5 text-purple-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-gray-900 text-sm">Import Saved Contacts</h3>
                                    <p className="text-xs text-gray-500">{savedContacts.length} contacts available in memory</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowContactsModal(false)}
                                className="text-gray-400 hover:text-gray-600 p-1"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-5 max-h-[300px] overflow-y-auto">
                            {savedContacts.length === 0 ? (
                                <div className="py-8 text-center text-gray-400 text-xs">
                                    No saved contacts found. Add contacts in the Contacts tab first or import from CSV.
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {savedContacts.slice(0, 50).map((c, i) => (
                                        <div key={i} className="py-2 flex items-center justify-between text-xs">
                                            <span className="font-semibold text-gray-800">{c.name || "Contact"}</span>
                                            <span className="font-mono text-gray-500">{c.number}</span>
                                        </div>
                                    ))}
                                    {savedContacts.length > 50 && (
                                        <div className="py-2 text-center text-xs text-gray-400">
                                            ...and {savedContacts.length - 50} more
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                            <button
                                type="button"
                                onClick={() => setShowContactsModal(false)}
                                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-200 rounded-lg transition"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={importAllSavedContacts}
                                disabled={savedContacts.length === 0}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                            >
                                Import All {savedContacts.length} Contacts
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* AI Message Generator Modal */}
            {showAiModal && (
                <AiMessageGenerator
                    isOpen={showAiModal}
                    onClose={() => setShowAiModal(false)}
                    onSelect={(genMsg) => {
                        setMessage(genMsg);
                        setShowAiModal(false);
                    }}
                    defaultType="promotional"
                />
            )}

            {/* Save Template Modal */}
            {showSaveTemplateModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
                    <div className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-2xl border border-gray-100">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                <BookmarkPlus className="w-4 h-4 text-emerald-600" />
                                Save as Template
                            </h3>
                            <button
                                type="button"
                                onClick={() => { setShowSaveTemplateModal(false); setTemplateTitleInput(""); }}
                                className="text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">
                            Give your template a name so you can reuse it in future campaigns.
                        </p>
                        <form onSubmit={handleSaveAsTemplate} className="space-y-3">
                            <input
                                type="text"
                                autoFocus
                                value={templateTitleInput}
                                onChange={(e) => setTemplateTitleInput(e.target.value)}
                                placeholder="e.g. Special Weekend Offer"
                                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 text-gray-900"
                            />
                            <div className="p-2.5 bg-gray-50 rounded-xl text-[11px] text-gray-500 line-clamp-2 italic border border-gray-200/60">
                                &quot;{message}&quot;
                            </div>
                            <div className="flex items-center justify-end gap-2 pt-1">
                                <button
                                    type="button"
                                    onClick={() => { setShowSaveTemplateModal(false); setTemplateTitleInput(""); }}
                                    className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingTemplate || !templateTitleInput.trim()}
                                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                    {isSavingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                                    {isSavingTemplate ? "Saving..." : "Save Template"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
