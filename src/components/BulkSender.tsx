"use client";

import { useState } from "react";
import { Send, Upload, Clock, AlertCircle } from "lucide-react";

export function BulkSender() {
    const [numbers, setNumbers] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<{ type: "success" | "error"; msg: string } | null>(null);

    const handleSend = async () => {
        setIsLoading(true);
        setStatus(null);

        try {
            // Basic validation
            const validNumbers = numbers
                .split(/[\n,]+/)
                .map((n) => n.trim())
                .filter((n) => n.length > 5); // Basic length check

            if (validNumbers.length === 0) {
                throw new Error("No valid numbers found.");
            }

            if (!message.trim()) {
                throw new Error("Message cannot be empty.");
            }

            const response = await fetch("http://localhost:3001/api/send-bulk", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ validNumbers, message }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || "Failed to start sending.");
            }

            setStatus({ type: "success", msg: `Bulk sending started for ${validNumbers.length} numbers.` });
            setNumbers("");
            setMessage("");
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
                <div className="flex justify-between mt-1">
                    <span className="text-xs text-gray-400">Supported formats: International format recommended</span>
                    <button className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                        <Upload className="w-3 h-3" /> Import CSV
                    </button>
                </div>
            </div>

            <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message Content
                </label>
                <textarea
                    className="w-full text-black h-40 p-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    placeholder="Type your message here..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                />
                <span className="text-xs text-gray-400 mt-1 block">
                    Variables like {`{{name}}`} are not supported in this version.
                </span>
            </div>

            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span>Delay: ~1-3s (Prevent Ban)</span>
                </div>
                <button
                    onClick={handleSend}
                    disabled={isLoading || !numbers || !message}
                    className={`px-6 py-2.5 rounded-lg text-white font-medium flex items-center gap-2 transition-all ${isLoading || !numbers || !message ? "bg-gray-300 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg"}`}
                >
                    {isLoading ? "Sending..." : "Send Campaign"}
                    {!isLoading && <Send className="w-4 h-4" />}
                </button>
            </div>
        </div>
    );
}
