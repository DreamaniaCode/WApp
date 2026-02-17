"use client";

import { useState, useEffect } from "react";
import { Save, Clock, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export function Settings() {
    const { t } = useLanguage();
    const [minDelay, setMinDelay] = useState(1000);
    const [maxDelay, setMaxDelay] = useState(3000);
    const [saved, setSaved] = useState(false);

    // User Management State
    const [users, setUsers] = useState<{ id: string, name: string | null, email: string | null, createdAt: Date }[]>([]);
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserName, setNewUserName] = useState("");
    const [loadingUsers, setLoadingUsers] = useState(false);

    useEffect(() => {
        const savedMin = localStorage.getItem("whatsapp_min_delay");
        const savedMax = localStorage.getItem("whatsapp_max_delay");
        if (savedMin) setMinDelay(parseInt(savedMin));
        if (savedMax) setMaxDelay(parseInt(savedMax));
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        console.log("Frontend: Fetching users...");
        setLoadingUsers(true);
        try {
            const res = await fetch("/api/users");
            console.log("Frontend: Fetch response status:", res.status);
            if (res.ok) {
                const data = await res.json();
                console.log("Frontend: Users data:", data);
                setUsers(data);
            } else {
                console.error("Frontend: Fetch failed", res.statusText);
            }
        } catch (error) {
            console.error("Frontend: Failed to fetch users", error);
        } finally {
            setLoadingUsers(false);
        }
    };

    const handleSave = () => {
        if (minDelay < 100) {
            alert("Minimum delay must be at least 100ms");
            return;
        }
        if (maxDelay < minDelay) {
            alert("Maximum delay cannot be less than minimum delay");
            return;
        }

        localStorage.setItem("whatsapp_min_delay", minDelay.toString());
        localStorage.setItem("whatsapp_max_delay", maxDelay.toString());
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const handleAddUser = async () => {
        if (!newUserEmail || !newUserPassword) {
            alert("Email and password are required");
            return;
        }

        try {
            const res = await fetch("/api/users", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: newUserEmail, password: newUserPassword, name: newUserName })
            });

            if (res.ok) {
                alert("User created successfully");
                setNewUserEmail("");
                setNewUserPassword("");
                setNewUserName("");
                fetchUsers();
            } else {
                const data = await res.json();
                alert("Error: " + data.error);
            }
        } catch (error) {
            console.error("Failed to create user", error);
            alert("Failed to create user");
        }
    };

    const handleDeleteUser = async (id: string) => {
        if (!confirm("Are you sure you want to delete this user?")) return;

        try {
            const res = await fetch(`/api/users?id=${id}`, {
                method: "DELETE"
            });

            if (res.ok) {
                alert("User deleted");
                fetchUsers();
            } else {
                const data = await res.json();
                alert("Error: " + data.error);
            }
        } catch (error) {
            console.error("Failed to delete user", error);
            alert("Failed to delete user");
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-gray-700" /> {t("delaySettings")}
                </h2>

                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-yellow-800 text-sm">Anti-Ban Safety</h3>
                            <p className="text-sm text-yellow-700 mt-1">
                                WhatsApp monitors sending speed. To avoid being banned, it is recommended to keep delays random and above 3 seconds per message if sending to many strangers.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t("minDelay")} (ms)
                        </label>
                        <input
                            type="number"
                            className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-black"
                            value={minDelay}
                            onChange={(e) => setMinDelay(parseInt(e.target.value) || 0)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {t("maxDelay")} (ms)
                        </label>
                        <input
                            type="number"
                            className="w-full p-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-black"
                            value={maxDelay}
                            onChange={(e) => setMaxDelay(parseInt(e.target.value) || 0)}
                        />
                    </div>
                </div>

                <div className="flex justify-end">
                    <button
                        onClick={handleSave}
                        className={`px-6 py-2 rounded-lg font-medium flex items-center gap-2 transition-all ${saved ? "bg-green-600 hover:bg-green-700 text-white" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                    >
                        {saved ? t("settingsSaved") : t("saveSettings")}
                        <Save className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* User Management Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 w-full">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Save className="w-5 h-5 text-gray-700" /> User Management
                </h2>

                <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h3 className="font-semibold mb-4 text-gray-800">Add New User</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <input
                            type="text"
                            placeholder="Name"
                            className="p-2 border rounded border-gray-300"
                            value={newUserName}
                            onChange={(e) => setNewUserName(e.target.value)}
                        />
                        <input
                            type="email"
                            placeholder="Email"
                            className="p-2 border rounded border-gray-300"
                            value={newUserEmail}
                            onChange={(e) => setNewUserEmail(e.target.value)}
                        />
                        <input
                            type="password"
                            placeholder="Password"
                            className="p-2 border rounded border-gray-300"
                            value={newUserPassword}
                            onChange={(e) => setNewUserPassword(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleAddUser}
                        className="mt-4 bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                    >
                        Create User
                    </button>
                </div>

                <div>
                    <h3 className="font-semibold mb-4 text-gray-800">Existing Users</h3>
                    {loadingUsers ? (
                        <p>Loading...</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-100 border-b border-gray-200">
                                        <th className="p-3 font-medium text-gray-600">Name</th>
                                        <th className="p-3 font-medium text-gray-600">Email</th>
                                        <th className="p-3 font-medium text-gray-600">Created At</th>
                                        <th className="p-3 font-medium text-gray-600">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(user => (
                                        <tr key={user.id} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="p-3 text-gray-800">{user.name || "-"}</td>
                                            <td className="p-3 text-gray-800">{user.email}</td>
                                            <td className="p-3 text-gray-600 text-sm">
                                                {new Date(user.createdAt).toLocaleDateString()}
                                            </td>
                                            <td className="p-3">
                                                <button
                                                    onClick={() => handleDeleteUser(user.id)}
                                                    className="text-red-500 hover:text-red-700 text-sm font-medium"
                                                >
                                                    Delete
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {users.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-4 text-center text-gray-500">No users found</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
