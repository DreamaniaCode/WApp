"use client";

import { useState, useEffect } from "react";
import { Save, Clock, AlertTriangle, ShieldCheck, Key } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface SettingsProps {
    onOpenLicenseModal?: () => void;
}

export function Settings({ onOpenLicenseModal }: SettingsProps) {
    const { t } = useLanguage();
    const [minDelay, setMinDelay] = useState(1000);
    const [maxDelay, setMaxDelay] = useState(3000);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const savedMin = localStorage.getItem("whatsapp_min_delay");
        const savedMax = localStorage.getItem("whatsapp_max_delay");
        if (savedMin) setMinDelay(parseInt(savedMin));
        if (savedMax) setMaxDelay(parseInt(savedMax));
    }, []);

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

    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 max-w-2xl w-full mx-auto">
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
                        {t("minDelay")}
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
                        {t("maxDelay")}
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

            {/* License & Device Identification */}
            <div className="mt-8 pt-6 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <ShieldCheck className="w-5 h-5 text-indigo-600" />
                        <h3 className="text-base font-bold text-gray-800">License & Software Edition</h3>
                    </div>
                    {onOpenLicenseModal && (
                        <button
                            type="button"
                            onClick={onOpenLicenseModal}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-semibold shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                        >
                            <Key className="w-3.5 h-3.5" />
                            <span>View / Change / Reset License</span>
                        </button>
                    )}
                </div>
                <p className="text-xs text-gray-500">
                    Manage your software license, view hardware Machine ID, upgrade activation key, or reset the installation.
                </p>
            </div>
        </div>
    );
}
