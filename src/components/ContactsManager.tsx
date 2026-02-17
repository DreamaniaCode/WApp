"use client";

import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { formatPhoneNumber } from "@/lib/numberFormatter";
import { UserPlus, Users, Trash2, Download, Upload, Loader2 } from "lucide-react";

export function ContactsManager() {
    const [contacts, setContacts] = useState<{ id?: string; name: string; number: string }[]>([]);
    const [newName, setNewName] = useState("");
    const [newNumber, setNewNumber] = useState("");
    const [loading, setLoading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load contacts from API on mount
    useEffect(() => {
        fetchContacts();
    }, []);

    const fetchContacts = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/contacts");
            if (res.ok) {
                const data = await res.json();
                setContacts(data);
            }
        } catch (error) {
            console.error("Failed to fetch contacts", error);
        } finally {
            setLoading(false);
        }
    };

    const addContact = async () => {
        if (newName && newNumber) {
            const formatted = formatPhoneNumber(newNumber);
            try {
                const res = await fetch("/api/contacts", {
                     method: "POST",
                     headers: { "Content-Type": "application/json" },
                     body: JSON.stringify({ name: newName, number: formatted })
                });
                
                if (res.ok) {
                    setNewName("");
                    setNewNumber("");
                    fetchContacts(); // Refresh list
                } else {
                    alert("Failed to save contact");
                }
            } catch (e) {
                alert("Error saving contact");
            }
        }
    };

    const removeContact = async (id?: string) => {
        if (!id) return;
        try {
            await fetch(`/api/contacts?id=${id}`, { method: "DELETE" });
            fetchContacts();
        } catch (e) {
            console.error("Failed to delete", e);
        }
    };

    const downloadCSV = () => {
        if (contacts.length === 0) return;
        const csvContent = "data:text/csv;charset=utf-8," + "name,number\n" + contacts.map(c => `${c.name},${c.number}`).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "contacts.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const data = results.data as Record<string, string>[];
                if (data.length > 0) {
                    const newContacts = data.map(row => {
                        // Try to find name and number columns
                        const nameKey = Object.keys(row).find(k => k.toLowerCase().includes("name")) || Object.keys(row)[0];
                        const numberKey = Object.keys(row).find(k => k.toLowerCase().includes("number") || k.toLowerCase().includes("phone")) || Object.keys(row)[1];

                        return {
                            name: row[nameKey] || "Unknown",
                            number: formatPhoneNumber(row[numberKey] || "")
                        };
                    }).filter(c => c.number.length > 5);

                    // Bulk create via API
                    try {
                         await fetch("/api/contacts", {
                             method: "POST",
                             headers: { "Content-Type": "application/json" },
                             body: JSON.stringify(newContacts)
                         });
                         fetchContacts();
                    } catch (e) {
                        alert("Failed to import contacts");
                    }
                }
                setLoading(false);
            }
        });

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-2xl w-full mx-auto">
            <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2"><Users className="w-5 h-5 text-purple-600" /> Manage Contacts</span>
                <div className="flex gap-2">
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
                    <button onClick={() => fileInputRef.current?.click()} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1" disabled={loading}>
                        <Upload className="w-4 h-4" /> Import
                    </button>
                    {contacts.length > 0 && (
                        <button onClick={downloadCSV} className="text-sm text-green-600 hover:text-green-800 flex items-center gap-1">
                            <Download className="w-4 h-4" /> Export
                        </button>
                    )}
                </div>
            </h2>

            <div className="flex gap-2 mb-4">
                <input
                    type="text"
                    placeholder="Name"
                    className="flex-1 p-2 border border-gray-200 rounded-lg text-black"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Number (with country code)"
                    className="flex-1 p-2 border border-gray-200 rounded-lg text-black"
                    value={newNumber}
                    onChange={(e) => setNewNumber(e.target.value)}
                />
                <button
                    onClick={addContact}
                    disabled={loading}
                    className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <UserPlus className="w-5 h-5" />}
                </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
                {contacts.length === 0 ? (
                    <p className="text-gray-400 text-center py-4">{loading ? "Loading..." : "No contacts added yet."}</p>
                ) : (
                    contacts.map((contact, index) => (
                        <div key={contact.id || index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div>
                                <p className="font-medium text-gray-800">{contact.name}</p>
                                <p className="text-sm text-gray-500">{contact.number}</p>
                            </div>
                            <button
                                onClick={() => removeContact(contact.id)}
                                className="text-red-500 hover:text-red-700 p-1"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
