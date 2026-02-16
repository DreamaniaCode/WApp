"use client";

import { useState, useRef } from "react";
import { Send, Upload, Clock, AlertCircle, FileText, X } from "lucide-react";

interface Attachment {
    filename: string;
    mimetype: string;
    data: string; // Base64
}

export function BulkSender() {
    const [numbers, setNumbers] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);
    const [attachments, setAttachments] = useState<Attachment[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();

            reader.onload = () => {
                const base64String = reader.result as string;
                // Remove data URL prefix (e.g., "data:image/png;base64,")
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


    const handleSend = async () => {
        setIsLoading(true);
        setStatus(null);

        // Get settings
        const minDelay = parseInt(localStorage.getItem("whatsapp_min_delay") || "1000");
        const maxDelay = parseInt(localStorage.getItem("whatsapp_max_delay") || "3000");


        try {
            // Basic validation
            const validNumbers = numbers
                .split(/[\n,]+/)
                .map((n) => n.trim())
                .filter((n) => n.length > 5); // Basic length check

            if (validNumbers.length === 0) {
                throw new Error("No valid numbers found.");
            }

            if (!message.trim() && attachments.length === 0) {
                throw new Error("Message or attachment is required.");
            }

            const response = await fetch("http://localhost:3001/api/send-bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    validNumbers,
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

            setStatus({ type: "success", msg: `Bulk sending started for ${validNumbers.length} numbers.` });
            setNumbers("");
            setMessage("");
            setAttachments([]);
        } catch (err: any) {
            setStatus({ type: "error", msg: err.message });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-2xl w-full mx-auto">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Send className="w-5 h-5 text-blue-600" /> Specify Recipients & Message
            </h2>

            {status && (
                <div className={`p-3 mb-4 rounded-lg text-sm flex items-center gap-2 ${status.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {status.type === "error" && <AlertCircle className="w-4 h-4" />}
                    {status.msg}
                </div>
            )}

            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Recipients (One per line or comma separated)
                </label>
                <textarea
                    className="w-full text-black h-32 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-mono text-sm"
                    placeholder="1234567890&#10;9876543210"
                    value={numbers}
                    onChange={(e) => setNumbers(e.target.value)}
                />
            </div>

            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message Content
                </label>
                <textarea
                    className="w-full text-black h-40 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all mb-2"
                    placeholder="Type your message here..."
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
                        <Upload className="w-4 h-4" /> Attach File
                    </button>

                    <span className="text-xs text-gray-400">
                        Variables like {`{{name}}`} are not supported.
                    </span>
                </div>
            </div>

            <div className="flex items-center justify-between border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span>Using Custom Delay Settings</span>
                </div>
                <button
                    onClick={handleSend}
                    disabled={isLoading || !numbers || (!message && attachments.length === 0)}
                    className={`px-6 py-2.5 rounded-lg text-white font-medium flex items-center gap-2 transition-all ${isLoading || !numbers || (!message && attachments.length === 0) ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg"}`}
                >
                    {isLoading ? "Sending..." : "Send Campaign"}
                    {!isLoading && <Send className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
