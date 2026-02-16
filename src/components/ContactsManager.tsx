"use client";

import { useState } from "react";
import { UserPlus, Users, Trash2 } from "lucide-react";

export function ContactsManager() {
    const [contacts, setContacts] = useState<{ name: string; number: string }[]>([]);
    const [newName, setNewName] = useState("");
    const [newNumber, setNewNumber] = useState("");

    const addContact = () => {
        if (newName && newNumber) {
            setContacts([...contacts, { name: newName, number: newNumber }]);
            setNewName("");
            setNewNumber("");
        }
    };

    const removeContact = (index: number) => {
        const newContacts = [...contacts];
        newContacts.splice(index, 1);
        setContacts(newContacts);
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-2xl w-full mx-auto">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-purple-600" /> Manage Contacts
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
