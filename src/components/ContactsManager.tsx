"use client";

import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import { formatPhoneNumber, isLandlineNumber } from "@/lib/numberFormatter";
import { UserPlus, Users, Trash2, Download, Upload, Smartphone } from "lucide-react";

export function ContactsManager() {
    const [contacts, setContacts] = useState<{ name: string; number: string }[]>([]);
    const [newName, setNewName] = useState("");
    const [newNumber, setNewNumber] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load contacts from localStorage on mount
    useEffect(() => {
        const savedContacts = localStorage.getItem("whatsapp_contacts");
        if (savedContacts) {
            try {
                setContacts(JSON.parse(savedContacts));
            } catch (e) {
                console.error("Failed to parse contacts", e);
            }
        }
    }, []);

    // Save contacts to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem("whatsapp_contacts", JSON.stringify(contacts));
    }, [contacts]);

    const addContact = () => {
        if (newName && newNumber) {
            setContacts([...contacts, { name: newName, number: formatPhoneNumber(newNumber) }]);
            setNewName("");
            setNewNumber("");
        }
    };

    const removeContact = (index: number) => {
        const newContacts = [...contacts];
        newContacts.splice(index, 1);
        setContacts(newContacts);
    };

    const filterOnlyMobiles = () => {
        const mobiles = contacts.filter(c => !isLandlineNumber(c.number));
        setContacts(mobiles);
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

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
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

                    setContacts(prev => [...prev, ...newContacts]);
                }
            }
        });

        // Reset input
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-2xl w-full mx-auto">
            <h2 className="text-xl font-bold mb-4 flex items-center justify-between">
                <span className="flex items-center gap-2"><Users className="w-5 h-5 text-purple-600" /> Manage Contacts</span>
                <div className="flex items-center gap-2">
                    {contacts.length > 0 && (
                        <button
                            onClick={filterOnlyMobiles}
                            title="Remove landlines (05...)"
                            className="text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-1 rounded-lg flex items-center gap-1 font-semibold transition"
                        >
                            <Smartphone className="w-3.5 h-3.5 text-emerald-600" /> Mobiles Only
                        </button>
                    )}
                    <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
                    <button onClick={() => fileInputRef.current?.click()} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
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
                    className="bg-purple-600 text-white p-2 rounded-lg hover:bg-purple-700 transition-colors"
                >
                    <UserPlus className="w-5 h-5" />
                </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto">
                {contacts.length === 0 ? (
                    <p className="text-gray-400 text-center py-4">No contacts added yet.</p>
                ) : (
                    contacts.map((contact, index) => (
                        <div key={index} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                            <div>
                                <p className="font-medium text-gray-800">{contact.name}</p>
                                <p className="text-sm text-gray-500">{contact.number}</p>
                            </div>
                            <button
                                onClick={() => removeContact(index)}
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
