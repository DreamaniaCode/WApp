"use client";

import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { formatPhoneNumber, isLandlineNumber } from "@/lib/numberFormatter";
import {
    UserPlus, Users, Trash2, Download, Upload, Smartphone, Search,
    FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Building, Mail, MapPin
} from "lucide-react";
import { API_URL } from "@/lib/config";
import { playSuccessSound } from "@/utils/soundEffects";

interface Contact {
    id?: string;
    name: string;
    number: string;
    email?: string;
    company?: string;
    city?: string;
    tags?: string;
}

export function ContactsManager() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Form inputs
    const [newName, setNewName] = useState("");
    const [newNumber, setNewNumber] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newCompany, setNewCompany] = useState("");
    const [newCity, setNewCity] = useState("");

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load contacts from backend API (with localStorage fallback)
    const loadContacts = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/api/contacts`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setContacts(data);
                    localStorage.setItem("whatsapp_contacts", JSON.stringify(data));
                    return;
                }
            }
        } catch (e) {
            console.warn("API contacts load failed, reading from localStorage", e);
        } finally {
            setLoading(false);
        }

        // Fallback to localStorage
        const saved = localStorage.getItem("whatsapp_contacts");
        if (saved) {
            try {
                setContacts(JSON.parse(saved));
            } catch (_) {}
        }
    };

    useEffect(() => {
        loadContacts();
    }, []);

    const showNotification = (type: "success" | "error", text: string) => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg(null), 4000);
    };

    const addContact = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!newNumber.trim()) {
            showNotification("error", "Le numéro de téléphone est obligatoire.");
            return;
        }

        const formatted = formatPhoneNumber(newNumber);
        const contactObj: Contact = {
            id: `cnt-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: newName.trim() || "Contact",
            number: formatted,
            email: newEmail.trim(),
            company: newCompany.trim(),
            city: newCity.trim()
        };

        try {
            const res = await fetch(`${API_URL}/api/contacts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(contactObj)
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.contacts)) {
                    setContacts(data.contacts);
                    localStorage.setItem("whatsapp_contacts", JSON.stringify(data.contacts));
                } else {
                    setContacts(prev => [contactObj, ...prev]);
                }
            } else {
                setContacts(prev => [contactObj, ...prev]);
            }
            playSuccessSound();
            showNotification("success", `Contact ${contactObj.name} ajouté avec succès !`);
            setNewName("");
            setNewNumber("");
            setNewEmail("");
            setNewCompany("");
            setNewCity("");
        } catch (err) {
            setContacts(prev => [contactObj, ...prev]);
            showNotification("success", "Contact enregistré localement.");
        }
    };

    const removeContact = async (idOrIndex: string | number) => {
        const target = typeof idOrIndex === "number" ? contacts[idOrIndex] : contacts.find(c => c.id === idOrIndex);
        if (!target) return;

        if (target.id) {
            try {
                await fetch(`${API_URL}/api/contacts/${target.id}`, { method: "DELETE" });
            } catch (_) {}
        }

        const updated = contacts.filter(c => c !== target && c.id !== target.id);
        setContacts(updated);
        localStorage.setItem("whatsapp_contacts", JSON.stringify(updated));
        showNotification("success", "Contact supprimé.");
    };

    const filterOnlyMobiles = () => {
        const mobiles = contacts.filter(c => !isLandlineNumber(c.number));
        const removed = contacts.length - mobiles.length;
        setContacts(mobiles);
        localStorage.setItem("whatsapp_contacts", JSON.stringify(mobiles));
        showNotification("success", `${removed} numéro(s) fixe(s) retiré(s).`);
    };

    // ─── 1. Download Model Templates (2 Formats: CSV & Excel .xlsx) ──────────────

    const downloadCsvTemplate = () => {
        const headers = "Nom,Téléphone,Email,Entreprise,Ville,Tags\n";
        const sampleRows = [
            "Karim Alami,+212612345678,karim@example.com,Alami Trading,Casablanca,Client VIP",
            "Sophie Dupont,+33612345678,sophie@example.com,Dupont SARL,Paris,Prospect",
            "Ahmed Benali,+212698765432,ahmed@example.com,Digital Solutions,Rabat,Partenaire"
        ].join("\n");

        const blob = new Blob(["\uFEFF" + headers + sampleRows], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "modele_import_contacts_wapp.csv";
        a.click();
        URL.revokeObjectURL(url);
        playSuccessSound();
    };

    const downloadXlsxTemplate = () => {
        const data = [
            {
                "Nom": "Karim Alami",
                "Téléphone": "+212612345678",
                "Email": "karim@example.com",
                "Entreprise": "Alami Trading",
                "Ville": "Casablanca",
                "Tags": "Client VIP"
            },
            {
                "Nom": "Sophie Dupont",
                "Téléphone": "+33612345678",
                "Email": "sophie@example.com",
                "Entreprise": "Dupont SARL",
                "Ville": "Paris",
                "Tags": "Prospect"
            },
            {
                "Nom": "Ahmed Benali",
                "Téléphone": "+212698765432",
                "Email": "ahmed@example.com",
                "Entreprise": "Digital Solutions",
                "Ville": "Rabat",
                "Tags": "Partenaire"
            }
        ];

        const ws = XLSX.utils.json_to_sheet(data);
        // Column widths
        ws["!cols"] = [
            { wch: 20 },
            { wch: 18 },
            { wch: 25 },
            { wch: 20 },
            { wch: 15 },
            { wch: 15 }
        ];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Contacts Template");
        XLSX.writeFile(wb, "modele_import_contacts_wapp.xlsx");
        playSuccessSound();
    };

    // ─── 2. Handle File Import (CSV & XLSX) ──────────────────────────────────────

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");

        if (isExcel) {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: "array" });
                    const firstSheet = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[firstSheet];
                    const jsonRows = XLSX.utils.sheet_to_json<any>(sheet);
                    await processImportedRows(jsonRows);
                } catch (err: any) {
                    showNotification("error", "Erreur lors de la lecture du fichier Excel: " + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: async (results) => {
                    await processImportedRows(results.data as any[]);
                }
            });
        }

        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const processImportedRows = async (rows: any[]) => {
        if (!rows || rows.length === 0) {
            showNotification("error", "Le fichier importé ne contient aucune ligne.");
            return;
        }

        const parsedList: Contact[] = [];
        for (const row of rows) {
            const keys = Object.keys(row);
            const nameKey = keys.find(k => /name|nom/i.test(k)) || keys[0];
            const numKey = keys.find(k => /num|phone|tel|téléphone/i.test(k)) || keys[1];
            const emailKey = keys.find(k => /email|mail/i.test(k));
            const compKey = keys.find(k => /company|entreprise|société/i.test(k));
            const cityKey = keys.find(k => /city|ville/i.test(k));
            const tagKey = keys.find(k => /tag|note/i.test(k));

            const rawNum = String(row[numKey] || "").trim();
            if (!rawNum) continue;

            const formatted = formatPhoneNumber(rawNum);
            if (formatted.length < 6) continue;

            parsedList.push({
                name: String(row[nameKey] || "Contact").trim(),
                number: formatted,
                email: emailKey ? String(row[emailKey] || "").trim() : "",
                company: compKey ? String(row[compKey] || "").trim() : "",
                city: cityKey ? String(row[cityKey] || "").trim() : "",
                tags: tagKey ? String(row[tagKey] || "").trim() : ""
            });
        }

        if (parsedList.length === 0) {
            showNotification("error", "Aucun numéro de téléphone valide détecté.");
            return;
        }

        try {
            const res = await fetch(`${API_URL}/api/contacts/import`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contacts: parsedList })
            });
            if (res.ok) {
                const data = await res.json();
                setContacts(data.contacts || []);
                localStorage.setItem("whatsapp_contacts", JSON.stringify(data.contacts || []));
                playSuccessSound();
                showNotification("success", `${data.added || parsedList.length} nouveaux contacts importés !`);
                return;
            }
        } catch (_) {}

        // Fallback local merge
        const merged = [...contacts];
        let addedCount = 0;
        parsedList.forEach(p => {
            if (!merged.some(c => c.number === p.number)) {
                merged.push({ ...p, id: `cnt-${Date.now()}-${Math.random()}` });
                addedCount++;
            }
        });
        setContacts(merged);
        localStorage.setItem("whatsapp_contacts", JSON.stringify(merged));
        playSuccessSound();
        showNotification("success", `${addedCount} contacts importés avec succès.`);
    };

    // ─── 3. Professional Excel Export with ExcelJS ──────────────────────────────

    const exportProfessionalExcel = async () => {
        if (contacts.length === 0) {
            showNotification("error", "Aucun contact à exporter.");
            return;
        }

        try {
            const workbook = new ExcelJS.Workbook();
            workbook.creator = "WApp Manager Leads Pro";
            workbook.created = new Date();

            const sheet = workbook.addWorksheet("Contacts Qualifiés", {
                views: [{ showGridLines: true }]
            });

            // 1. Title Banner
            sheet.mergeCells("A1:F1");
            const titleRow = sheet.getCell("A1");
            titleRow.value = "WApp Manager Leads Pro — Annuaire & Contacts Qualifiés";
            titleRow.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
            titleRow.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF1E3A8A" } // Dark Royal Navy Blue
            };
            titleRow.alignment = { vertical: "middle", horizontal: "center" };
            sheet.getRow(1).height = 35;

            // 2. Metadata subtitle
            sheet.mergeCells("A2:F2");
            const subRow = sheet.getCell("A2");
            subRow.value = `Exporté le : ${new Date().toLocaleString("fr-FR")} | Total contacts : ${contacts.length}`;
            subRow.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF475569" } };
            subRow.alignment = { vertical: "middle", horizontal: "center" };
            sheet.getRow(2).height = 20;

            // Empty row 3
            sheet.getRow(3).height = 10;

            // 3. Table Column Headers (Row 4)
            const headers = [
                { header: "Nom Complet", key: "name", width: 26 },
                { header: "Numéro WhatsApp", key: "number", width: 22 },
                { header: "Adresse Email", key: "email", width: 28 },
                { header: "Entreprise / Société", key: "company", width: 24 },
                { header: "Ville", key: "city", width: 18 },
                { header: "Catégorie / Tags", key: "tags", width: 20 }
            ];

            const headerRow = sheet.getRow(4);
            headers.forEach((h, idx) => {
                const cell = headerRow.getCell(idx + 1);
                cell.value = h.header;
                cell.font = { name: "Arial", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
                cell.fill = {
                    type: "pattern",
                    pattern: "solid",
                    fgColor: { argb: "FF2563EB" } // Blue 600
                };
                cell.alignment = { vertical: "middle", horizontal: "left" };
                cell.border = {
                    top: { style: "thin", color: { argb: "FFCBD5E1" } },
                    bottom: { style: "medium", color: { argb: "FF1E3A8A" } },
                    left: { style: "thin", color: { argb: "FFCBD5E1" } },
                    right: { style: "thin", color: { argb: "FFCBD5E1" } }
                };
            });
            headerRow.height = 28;

            // Set column widths
            headers.forEach((col, idx) => {
                sheet.getColumn(idx + 1).width = col.width;
            });

            // 4. Data Rows
            contacts.forEach((c, i) => {
                const rowNum = 5 + i;
                const row = sheet.getRow(rowNum);
                const isEven = i % 2 === 0;

                row.values = [
                    c.name || "N/A",
                    c.number || "",
                    c.email || "",
                    c.company || "",
                    c.city || "",
                    c.tags || "Général"
                ];

                row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
                    cell.font = { name: "Arial", size: 10, color: { argb: "FF0F172A" } };
                    cell.fill = {
                        type: "pattern",
                        pattern: "solid",
                        fgColor: { argb: isEven ? "FFFFFFFF" : "FFF8FAFC" } // Zebra subtle striping
                    };
                    cell.alignment = {
                        vertical: "middle",
                        horizontal: colNumber === 2 ? "center" : "left"
                    };
                    cell.border = {
                        top: { style: "thin", color: { argb: "FFE2E8F0" } },
                        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
                        left: { style: "thin", color: { argb: "FFE2E8F0" } },
                        right: { style: "thin", color: { argb: "FFE2E8F0" } }
                    };
                });
                row.height = 22;
            });

            // 5. Generate and download file
            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Contacts_WApp_Pro_${new Date().toISOString().split("T")[0]}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
            playSuccessSound();
            showNotification("success", "Exportation Excel Pro générée avec succès !");
        } catch (err: any) {
            console.error("ExcelJS Export Error", err);
            showNotification("error", "Erreur lors de l'export Excel: " + err.message);
        }
    };

    const filteredContacts = contacts.filter(c => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.number && c.number.includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.company && c.company.toLowerCase().includes(q)) ||
            (c.city && c.city.toLowerCase().includes(q))
        );
    });

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-5xl w-full mx-auto space-y-6">
            {/* Top Title & Header Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div>
                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-purple-600" />
                        Gestionnaire de Contacts Pro
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Importation multi-formats, détection mobile intelligente et export Excel soigné
                    </p>
                </div>

                {/* Templates & Import/Export Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Hidden file input */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".csv, .xlsx, .xls"
                        onChange={handleImportFile}
                    />

                    {/* Template downloads dropdown/buttons */}
                    <button
                        onClick={downloadXlsxTemplate}
                        title="Télécharger le modèle Excel pré-rempli"
                        className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                        Modèle Excel (.xlsx)
                    </button>

                    <button
                        onClick={downloadCsvTemplate}
                        title="Télécharger le modèle CSV pré-rempli"
                        className="px-3 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <Download className="w-3.5 h-3.5 text-gray-500" />
                        Modèle CSV
                    </button>

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                    >
                        <Upload className="w-3.5 h-3.5" />
                        Importer (Excel / CSV)
                    </button>

                    {contacts.length > 0 && (
                        <button
                            onClick={exportProfessionalExcel}
                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5" />
                            Exporter Excel Pro
                        </button>
                    )}
                </div>
            </div>

            {/* Notification alert */}
            {statusMsg && (
                <div className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    statusMsg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-red-50 border border-red-200 text-red-700"
                }`}>
                    {statusMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-red-600" />}
                    {statusMsg.text}
                </div>
            )}

            {/* Add Contact Form */}
            <form onSubmit={addContact} className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 space-y-3">
                <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-purple-600" /> Ajouter un Contact Rapide
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
                    <input
                        type="text"
                        placeholder="Nom complet *"
                        required
                        className="p-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Numéro WhatsApp (+212...) *"
                        required
                        className="p-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                        value={newNumber}
                        onChange={(e) => setNewNumber(e.target.value)}
                    />
                    <input
                        type="email"
                        placeholder="Email (facultatif)"
                        className="p-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Entreprise"
                        className="p-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={newCompany}
                        onChange={(e) => setNewCompany(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Ville"
                            className="flex-1 p-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            value={newCity}
                            onChange={(e) => setNewCity(e.target.value)}
                        />
                        <button
                            type="submit"
                            className="bg-purple-600 text-white px-4 py-2.5 rounded-xl hover:bg-purple-700 transition font-bold text-xs flex items-center gap-1 shrink-0"
                        >
                            <UserPlus className="w-4 h-4" />
                            Ajouter
                        </button>
                    </div>
                </div>
            </form>

            {/* Filter and Search bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div className="relative flex-1 max-w-sm">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                    <input
                        type="text"
                        placeholder="Rechercher par nom, numéro, email ou ville..."
                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    {contacts.length > 0 && (
                        <button
                            onClick={filterOnlyMobiles}
                            title="Supprimer les numéros fixes non WhatsApp (05...)"
                            className="text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-semibold transition cursor-pointer"
                        >
                            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                            Conserver Mobiles Uniquement
                        </button>
                    )}
                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1.5 rounded-xl">
                        {filteredContacts.length} / {contacts.length} contacts
                    </span>
                </div>
            </div>

            {/* Contacts Table */}
            <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-xs">
                {contacts.length === 0 ? (
                    <div className="p-12 text-center text-gray-400">
                        <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm font-semibold text-gray-600">Aucun contact enregistré</p>
                        <p className="text-xs text-gray-400 mt-1">Importez un fichier Excel/CSV ou ajoutez un contact manuellement.</p>
                    </div>
                ) : filteredContacts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-400">
                        Aucun résultat correspondant à votre recherche.
                    </div>
                ) : (
                    <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                        {filteredContacts.map((contact, index) => (
                            <div key={contact.id || index} className="flex items-center justify-between p-3 hover:bg-gray-50/70 transition group">
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                                        {contact.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-xs text-gray-900 truncate">{contact.name}</p>
                                            {contact.company && (
                                                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                                    <Building className="w-2.5 h-2.5" />
                                                    {contact.company}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                                            <span className="font-mono text-gray-600 font-semibold">{contact.number}</span>
                                            {contact.email && (
                                                <span className="flex items-center gap-1 text-gray-500">
                                                    <Mail className="w-3 h-3 text-gray-400" />
                                                    {contact.email}
                                                </span>
                                            )}
                                            {contact.city && (
                                                <span className="flex items-center gap-1 text-gray-500">
                                                    <MapPin className="w-3 h-3 text-gray-400" />
                                                    {contact.city}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => removeContact(contact.id || index)}
                                    className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition opacity-0 group-hover:opacity-100"
                                    title="Supprimer ce contact"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
