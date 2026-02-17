"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Upload, Clock, AlertCircle, FileText, X, FileSpreadsheet, Plus, Download } from "lucide-react";
import Papa from "papaparse";
import { MessagePreview } from "./MessagePreview";
import { formatPhoneNumber } from "@/lib/numberFormatter";
import { useLanguage } from "@/contexts/LanguageContext";
import { API_URL } from "@/lib/config";

interface Attachment {
    filename: string;
    mimetype: string;
    data: string; // Base64
}

interface Recipient {
    number: string;
    variables?: Record<string, string>;
}

interface BulkSenderProps {
    socket?: any;
}

export function BulkSender({ socket }: BulkSenderProps) {
    const { t } = useLanguage();
    const [textInput, setTextInput] = useState("");
    const [recipients, setRecipients] = useState<Recipient[]>([]);
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const [availableVars, setAvailableVars] = useState<string[]>([]);
    const [progress, setProgress] = useState<{ total: number; current: number; success: number; failed: number; status: string; countdown?: number } | null>(null);
    const [reportData, setReportData] = useState<any[]>([]);

    const [history, setHistory] = useState<any[]>([]);

    const fetchHistory = async () => {
        try {
            const res = await fetch(`${API_URL}/api/messages`, {
                headers: { "Content-Type": "application/json" },
                credentials: "include"
            });
            if (res.ok) {
                const data = await res.json();
                setHistory(data);
            }
        } catch (error) {
            console.error("Failed to fetch history", error);
        }
    };

    useEffect(() => {
        fetchHistory();
    }, []);

    useEffect(() => {
        if (!socket) return;

        socket.on("bulk_progress", (data: any) => {
            console.log("Progress:", data);
            setProgress(data);

            if (data.lastResult) {
                setReportData(prev => [...prev, data.lastResult]);
            }

            if (data.current === data.total && data.status === "Completed") {
                setIsLoading(false);
                setStatus({
                    type: "success",
                    msg: `Finished: ${data.success} sent, ${data.failed} failed.`
                });
                fetchHistory(); // Refresh history after campaign
            }
        });

        return () => {
            socket.off("bulk_progress");
        };
    }, [socket]);

    const downloadReport = () => {
        if (reportData.length === 0) return;
        const csv = Papa.unparse(reportData);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `campaign_report_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);

    // Sync manual input with recipients list (simple mode)
    // If CSV is loaded, this might be disabled or separate
    const handleTextChange = (val: string) => {
        setTextInput(val);
        const lines = val.split(/[\n,]+/);
        const newRecipients = lines
            .map(l => l.trim())
            .filter(l => l.length > 5)
            .map(num => ({ number: formatPhoneNumber(num) }));

        // Only update if we are in "manual mode" (no variables detected yet)
        if (availableVars.length === 0) {
            setRecipients(newRecipients);
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

                    // Identify the phone column
                    // Priority: Explicit name > Content looks like number > First column
                    let phoneCol = headers.find(h => /phone|number|mobile|tel|contact/i.test(h));

                    if (!phoneCol) {
                        // Scan first row to find a column with phone-like data
                        phoneCol = headers.find(h => {
                            const val = data[0][h];
                            if (typeof val !== 'string') return false;
                            const cleaned = val.replace(/\D/g, '');
                            return cleaned.length >= 8 && cleaned.length <= 15;
                        }) || headers[0];
                    }

                    // Filter out the phone column from variables
                    const varHeaders = headers.filter(h => h !== phoneCol);
                    setAvailableVars(varHeaders);

                    const newRecipients: Recipient[] = data.map(row => {
                        const rawNumber = row[phoneCol!] || "";
                        const number = formatPhoneNumber(rawNumber);

                        return {
                            number,
                            variables: row
                        };
                    }).filter(r => r.number.length >= 8);

                    setRecipients(newRecipients);
                    // Update text input for visual confirmation
                    if (newRecipients.length < 500) {
                        setTextInput(newRecipients.map(r => r.number).join("\n"));
                    } else {
                        setTextInput(`${newRecipients.length} recipients loaded via CSV`);
                    }

                    setStatus({
                        type: "success",
                        msg: `${t("success") || "Loaded"}: ${newRecipients.length} ${t("recipients") || "recipients"}. ${t("variables") || "Variables"}: ${varHeaders.join(", ")}`
                    });
                }
            },
            error: (err) => {
                setStatus({ type: "error", msg: (t("error") || "Error") + ": " + err.message });
            }
        });
    };

    const downloadTemplate = () => {
        const csvContent = "data:text/csv;charset=utf-8,number,name,customVariable\n0612345678,John Doe,Value1";
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "template.csv");
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

        const minDelay = parseInt(localStorage.getItem("whatsapp_min_delay") || "1000");
        const maxDelay = parseInt(localStorage.getItem("whatsapp_max_delay") || "3000");

        try {
            if (recipients.length === 0) {
                throw new Error("No valid recipients found.");
            }

            if (!message.trim() && attachments.length === 0) {
                throw new Error("Message or attachment is required.");
            }

            const response = await fetch(`${API_URL}/api/send-bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include", // Required for NextAuth session cookie
                body: JSON.stringify({
                    recipients,
                    message,
                    minDelay,
                    maxDelay,
                    attachments
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to start sending.");
            }

            setStatus({ type: "success", msg: data.message });
            // Don't clear recipients if they loaded via CSV, usually user wants to keep them for a retry or next batch
            if (availableVars.length === 0) {
                setTextInput("");
                setRecipients([]);
            }
        } catch (err: any) {
            setStatus({ type: "error", msg: err.message });
        } finally {
            setIsLoading(false);
        }
    };

    // Get preview for the first recipient
    const previewVariables = recipients.length > 0 ? recipients[0].variables : {};
    const previewMessage = message.replace(/{{(\w+)}}/g, (_, key) => previewVariables?.[key] || `{{${key}}}`);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column: Inputs */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Send className="w-5 h-5 text-blue-600" /> {t("campaignDetails")}
                </h2>

                {status && (
                    <div className={`p-3 mb-4 rounded-lg text-sm flex items-center gap-2 ${status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {status.type === "error" && <AlertCircle className="w-4 h-4" />}
                        {status.msg}
                        {reportData.length > 0 && !isLoading && (
                            <button
                                onClick={downloadReport}
                                className="ml-auto flex items-center gap-1 text-xs bg-white border border-gray-300 px-2 py-1 rounded shadow-sm hover:bg-gray-50"
                            >
                                <Download className="w-3 h-3" />
                                {t("download") || "Report"}
                            </button>
                        )}
                    </div>
                )}

                {isLoading && progress && (
                    <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
                        <div className="flex justify-between text-xs font-semibold text-blue-800 mb-1">
                            <span>{progress.status}</span>
                            <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                        </div>
                        <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                            <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(progress.current / progress.total) * 100}%` }}
                            ></div>
                        </div>
                        <div className="flex justify-between text-[10px] text-blue-600 mt-1">
                            <span>{progress.current}/{progress.total}</span>
                            <span>Success: {progress.success} | Failed: {progress.failed}</span>
                        </div>
                        {progress.countdown !== undefined && progress.countdown > 0 && (
                             <div className="mt-2 text-center text-lg font-bold text-orange-500 animate-pulse">
                                 Next message in {progress.countdown}s...
                             </div>
                        )}
                    </div>
                )}

                <div className="mb-4">
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-gray-700">
                            {t("recipients")} ({recipients.length})
                        </label>
                        <div className="flex gap-2">
                            <input type="file" ref={csvInputRef} className="hidden" accept=".csv" onChange={handleCSVUpload} />

                            <button
                                onClick={downloadTemplate}
                                className="text-xs flex items-center gap-1 text-gray-500 hover:text-gray-700 font-medium"
                            >
                                <Download className="w-3 h-3" /> {t("downloadTemplate")}
                            </button>

                            <button
                                onClick={() => csvInputRef.current?.click()}
                                className="text-xs flex items-center gap-1 text-green-600 hover:text-green-700 font-medium"
                            >
                                <FileSpreadsheet className="w-3 h-3" /> {t("importCsv")}
                            </button>
                        </div>
                    </div>
                    {availableVars.length > 0 ? (
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 mb-2">
                            <p className="font-semibold mb-1">{t("csvMode")}</p>
                            <p>{t("variablesFound")}: {availableVars.join(", ")}</p>
                            <button onClick={() => { setAvailableVars([]); setRecipients([]); setTextInput(""); }} className="text-red-500 text-xs mt-1 underline">{t("clearCsv")}</button>
                        </div>
                    ) : (
                        <textarea
                            className="w-full text-black h-32 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                            placeholder={t("numberPlaceholder")}
                            value={textInput}
                            onChange={(e) => handleTextChange(e.target.value)}
                        />
                    )}
                </div>

                <div className="mb-6">
                    <div className="flex justify-between items-center mb-1">
                        <label className="block text-sm font-medium text-gray-700">
                            {t("messageContent")}
                        </label>
                        {availableVars.length > 0 && (
                            <div className="flex gap-1">
                                {availableVars.map(v => (
                                    <button
                                        key={v}
                                        onClick={() => insertVariable(v)}
                                        className="text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded border border-gray-300 flex items-center gap-1"
                                    >
                                        <Plus className="w-3 h-3" /> {v}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    <textarea
                        className="w-full text-black h-40 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all mb-2"
                        placeholder={t("typeMessage")}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                    />

                    {/* Attachments Section */}
                    <div className="flex flex-wrap gap-2 mb-3">
                        {attachments.map((att, i) => (
                            <div key={i} className="bg-gray-100 px-3 py-1 rounded-full flex items-center gap-2 text-sm text-gray-700 border border-gray-200">
                                <FileText className="w-3 h-3" />
                                <span className="max-w-[150px] truncate">{att.filename}</span>
                                <button onClick={() => removeAttachment(i)} className="text-gray-400 hover:text-red-500">
                                    <X className="w-3 h-3" />
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
                            className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                        >
                            <Upload className="w-4 h-4" /> {t("attachFile")}
                        </button>
                    </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                    <button
                        onClick={handleSend}
                        disabled={isLoading || recipients.length === 0 || (!message && attachments.length === 0)}
                        className={`w-full py-3 rounded-xl text-white font-bold flex items-center justify-center gap-2 transition-all ${isLoading || recipients.length === 0 || !message ? "bg-gray-300 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-purple-600 hover:shadow-lg scale-100 hover:scale-[1.02]"}`}
                    >
                        {isLoading ? t("sending") : `${t("sendCampaign")} (${recipients.length})`}
                        {!isLoading && <Send className="w-5 h-5" />}
                    </button>
                    <p className="text-center text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" /> {t("customDelay")}
                    </p>
                </div>
            </div>

            {/* Right Column: Preview */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold text-gray-800 mb-3">{t("livePreview")}</h2>
                    <div className="bg-gray-900 rounded-[30px] p-3 shadow-2xl border-4 border-gray-800">
                        <div className="bg-[#efeae2] rounded-[20px] overflow-hidden h-[500px] relative flex flex-col">
                            {/* Fake Header */}
                            <div className="bg-[#008069] p-3 flex items-center gap-3 text-white">
                                <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
                                <div>
                                    <div className="text-sm font-semibold">{recipients.length > 0 && recipients[0].variables?.name ? recipients[0].variables.name : (recipients[0]?.number || t("recipient"))}</div>
                                    <div className="text-[10px] opacity-80">{t("lastSeen")}</div>
                                </div>
                            </div>

                            {/* Messages Area */}
                            <div className="flex-1 p-4 overflow-y-auto" style={{ backgroundImage: "url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')" }}>
                                <MessagePreview message={previewMessage} attachments={attachments} />
                            </div>

                            {/* Fake Input */}
                            <div className="bg-[#f0f2f5] p-2 flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-white"></div>
                                <div className="flex-1 h-8 bg-white rounded-full"></div>
                                <div className="w-8 h-8 rounded-full bg-[#008069]"></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl">
                    <h3 className="font-semibold text-blue-900 mb-2 text-sm">{t("formattingTips")}</h3>
                    <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                        <li>*{t("bold")}*</li>
                        <li>_{t("italic")}_</li>
                        <li>~{t("strikethrough")}~</li>
                        <li>{t("variablesTip")}</li>
                    </ul>
                </div>
            </div>



            {/* History Section */ }
            <div className="col-span-1 lg:col-span-2 mt-8 bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-600" /> Recent History
                </h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                            <tr>
                                <th className="px-4 py-3">Time</th>
                                <th className="px-4 py-3">Number</th>
                                <th className="px-4 py-3">Message</th>
                                <th className="px-4 py-3">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-4 py-3 text-center text-gray-500">No recent messages</td>
                                </tr>
                            ) : (
                                history.map((msg: any) => (
                                    <tr key={msg.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-4 py-3">{new Date(msg.createdAt).toLocaleString()}</td>
                                        <td className="px-4 py-3 font-medium">{msg.number}</td>
                                        <td className="px-4 py-3 truncate max-w-xs" title={msg.message}>{msg.message}</td>
                                        <td className="px-4 py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs ${msg.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {msg.status}
                                            </span>
                                            {msg.error && <span className="ml-2 text-red-500 text-xs truncate" title={msg.error}>{msg.error}</span>}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
