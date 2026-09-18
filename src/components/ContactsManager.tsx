"use client";

import { useState, useEffect, useRef } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { formatPhoneNumber, isLandlineNumber } from "@/lib/numberFormatter";
import {
    UserPlus, Users, Trash2, Download, Upload, Smartphone, Search,
    FileSpreadsheet, CheckCircle2, AlertCircle, RefreshCw, Sparkles, Building, Mail, MapPin,
    Folder, FolderPlus, Tag, CheckSquare, Square, Check, X, ShieldAlert
} from "lucide-react";
import { API_URL } from "@/lib/config";
import { playSuccessSound } from "@/utils/soundEffects";

export interface Contact {
    id?: string;
    name: string;
    number: string;
    email?: string;
    company?: string;
    city?: string;
    tags?: string;
    group?: string;
    createdAt?: string;
}

export function ContactsManager() {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Groups & Multi-selection
    const [groupsList, setGroupsList] = useState<{ name: string; count: number }[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<string>("all");
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isDeleting, setIsDeleting] = useState(false);

    // Form inputs (Single contact)
    const [newName, setNewName] = useState("");
    const [newNumber, setNewNumber] = useState("");
    const [newEmail, setNewEmail] = useState("");
    const [newCompany, setNewCompany] = useState("");
    const [newCity, setNewCity] = useState("");
    const [newGroup, setNewGroup] = useState("Général");

    // Import with Group Name Modal
    const [importModalOpen, setImportModalOpen] = useState(false);
    const [importGroupName, setImportGroupName] = useState("");
    const [pendingImportRows, setPendingImportRows] = useState<any[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadGroups = async () => {
        try {
            const res = await fetch(`${API_URL}/api/contacts/groups`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && Array.isArray(data.groups)) {
                    setGroupsList(data.groups);
                }
            }
        } catch (_) {}
    };

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
                    await loadGroups();
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
                const parsed = JSON.parse(saved);
                setContacts(parsed);
                // compute local groups
                const groupMap = new Map();
                parsed.forEach((c: any) => {
                    const g = c.group || "Général";
                    groupMap.set(g, (groupMap.get(g) || 0) + 1);
                });
                setGroupsList(Array.from(groupMap.entries()).map(([name, count]) => ({ name, count })));
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
            city: newCity.trim(),
            group: newGroup.trim() || "Général",
            createdAt: new Date().toISOString()
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
            showNotification("success", `Contact ${contactObj.name} ajouté dans le groupe "${contactObj.group}" !`);
            setNewName("");
            setNewNumber("");
            setNewEmail("");
            setNewCompany("");
            setNewCity("");
            loadGroups();
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
        setSelectedIds(prev => {
            const copy = new Set(prev);
            if (target.id) copy.delete(target.id);
            return copy;
        });
        loadGroups();
        showNotification("success", "Contact supprimé.");
    };

    // ─── Mass Selection & Deletion ───────────────────────────────────────────────

    const handleToggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const copy = new Set(prev);
            if (copy.has(id)) copy.delete(id);
            else copy.add(id);
            return copy;
        });
    };

    const handleSelectAllFiltered = () => {
        if (selectedIds.size === filteredContacts.length && filteredContacts.length > 0) {
            setSelectedIds(new Set());
        } else {
            const allIds = new Set<string>();
            filteredContacts.forEach(c => {
                if (c.id) allIds.add(c.id);
            });
            setSelectedIds(allIds);
        }
    };

    const deleteSelectedContacts = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Êtes-vous sûr de vouloir supprimer définitivement les ${selectedIds.size} contact(s) sélectionné(s) ?`)) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`${API_URL}/api/contacts/delete-bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            });
            const data = await res.json();
            if (data.success) {
                setContacts(data.contacts || []);
                localStorage.setItem("whatsapp_contacts", JSON.stringify(data.contacts || []));
                setSelectedIds(new Set());
                loadGroups();
                playSuccessSound();
                showNotification("success", `${data.deletedCount} contact(s) supprimé(s) avec succès.`);
            } else {
                showNotification("error", data.error || "Erreur de suppression.");
            }
        } catch (e: any) {
            showNotification("error", "Erreur réseau: " + e.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const deleteCurrentGroup = async () => {
        if (selectedGroup === "all") return;
        if (!confirm(`Êtes-vous certain de vouloir supprimer TOUS les contacts du groupe "${selectedGroup}" ?`)) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`${API_URL}/api/contacts/delete-bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ group: selectedGroup })
            });
            const data = await res.json();
            if (data.success) {
                setContacts(data.contacts || []);
                localStorage.setItem("whatsapp_contacts", JSON.stringify(data.contacts || []));
                setSelectedGroup("all");
                setSelectedIds(new Set());
                loadGroups();
                playSuccessSound();
                showNotification("success", `Groupe "${selectedGroup}" supprimé (${data.deletedCount} contacts).`);
            } else {
                showNotification("error", data.error || "Erreur de suppression du groupe.");
            }
        } catch (e: any) {
            showNotification("error", "Erreur réseau: " + e.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const clearAllContacts = async () => {
        if (!confirm("⚠️ ATTENTION : Voulez-vous vraiment vider TOUT l'annuaire de contacts ? Cette action supprimera tous les contacts et groupes.")) return;
        if (!confirm("Veuillez confirmer une seconde fois le vidage complet de la base de contacts.")) return;

        setIsDeleting(true);
        try {
            const res = await fetch(`${API_URL}/api/contacts/delete-bulk`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ all: true })
            });
            const data = await res.json();
            if (data.success) {
                setContacts([]);
                localStorage.setItem("whatsapp_contacts", "[]");
                setSelectedGroup("all");
                setSelectedIds(new Set());
                loadGroups();
                showNotification("success", "Annuaire vidé avec succès.");
            }
        } catch (e: any) {
            showNotification("error", "Erreur: " + e.message);
        } finally {
            setIsDeleting(false);
        }
    };

    const filterOnlyMobiles = () => {
        const mobiles = contacts.filter(c => !isLandlineNumber(c.number));
        const removed = contacts.length - mobiles.length;
        setContacts(mobiles);
        localStorage.setItem("whatsapp_contacts", JSON.stringify(mobiles));
        showNotification("success", `${removed} numéro(s) fixe(s) retiré(s).`);
    };

    // ─── 1. Download Model Templates ──────────────────────────────────────────

    const downloadCsvTemplate = () => {
        const csvContent =
            "Nom,Telephone,Email,Entreprise,Ville,Tags\n" +
            "Karim Alami,+212661000001,karim@example.com,Alami Tech,Casablanca,VIP\n" +
            "Sara Mansouri,+212662000002,sara@example.com,Digital Marketing,Rabat,Prospect\n" +
            "Omar Bennani,+212663000003,omar@example.com,Logistics Plus,Tanger,Client Actif\n" +
            "Fatima Zahra,+212664000004,fatima@example.com,Cabinet FZ,Marrakech,Nouveau";

        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "modele_import_contacts_wapp.csv";
        a.click();
        URL.revokeObjectURL(url);
        playSuccessSound();
    };

    const downloadXlsxTemplate = () => {
        const rows = [
            ["Nom", "Telephone", "Email", "Entreprise", "Ville", "Tags"],
            ["Karim Alami", "+212661000001", "karim@example.com", "Alami Tech", "Casablanca", "VIP"],
            ["Sara Mansouri", "+212662000002", "sara@example.com", "Digital Marketing", "Rabat", "Prospect"],
            ["Omar Bennani", "+212663000003", "omar@example.com", "Logistics Plus", "Tanger", "Client Actif"],
            ["Fatima Zahra", "+212664000004", "fatima@example.com", "Cabinet FZ", "Marrakech", "Nouveau"]
        ];

        const ws = XLSX.utils.aoa_to_sheet(rows);
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

    // ─── 2. Handle File Import (Prompt for Contact Group Name) ──────────────────

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
        const defaultGroupName = `Campagne ${new Date().toLocaleDateString("fr-FR").replace(/\//g, "-")}`;
        setImportGroupName(defaultGroupName);

        if (isExcel) {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: "array" });
                    const firstSheet = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[firstSheet];
                    const jsonRows = XLSX.utils.sheet_to_json<any>(sheet);
                    setPendingImportRows(jsonRows);
                    setImportModalOpen(true);
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
                    setPendingImportRows(results.data as any[]);
                    setImportModalOpen(true);
                }
            });
        }

        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const confirmImportWithGroup = async () => {
        if (pendingImportRows.length === 0) return;
        const targetGroup = importGroupName.trim() || "Général";
        setImportModalOpen(false);

        const parsedList: Contact[] = [];
        for (const row of pendingImportRows) {
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
                tags: tagKey ? String(row[tagKey] || "").trim() : "",
                group: targetGroup
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
                body: JSON.stringify({ contacts: parsedList, group: targetGroup })
            });
            if (res.ok) {
                const data = await res.json();
                setContacts(data.contacts || []);
                localStorage.setItem("whatsapp_contacts", JSON.stringify(data.contacts || []));
                setSelectedGroup(targetGroup);
                loadGroups();
                playSuccessSound();
                showNotification("success", `${data.added || parsedList.length} contact(s) enregistrés dans le groupe "${targetGroup}" !`);
                return;
            }
        } catch (_) {}

        // Fallback local merge
        const merged = [...contacts];
        let addedCount = 0;
        parsedList.forEach(p => {
            const exIdx = merged.findIndex(c => c.number === p.number);
            if (exIdx === -1) {
                merged.push({ ...p, id: `cnt-${Date.now()}-${Math.random()}` });
                addedCount++;
            } else {
                merged[exIdx].group = targetGroup;
            }
        });
        setContacts(merged);
        localStorage.setItem("whatsapp_contacts", JSON.stringify(merged));
        setSelectedGroup(targetGroup);
        loadGroups();
        playSuccessSound();
        showNotification("success", `${addedCount} contact(s) enregistrés dans le groupe "${targetGroup}".`);
    };

    // ─── 3. Professional Excel Export ──────────────────────────────────────────

    const exportProfessionalExcel = async () => {
        if (filteredContacts.length === 0) {
            showNotification("error", "Aucun contact à exporter.");
            return;
        }

        try {
            const workbook = new ExcelJS.Workbook();
            workbook.creator = "WApp Manager Leads Pro";
            workbook.created = new Date();

            const sheetName = selectedGroup === "all" ? "Tous les Contacts" : selectedGroup.slice(0, 30);
            const sheet = workbook.addWorksheet(sheetName, {
                views: [{ showGridLines: true }]
            });

            // 1. Title Banner
            sheet.mergeCells("A1:G1");
            const titleRow = sheet.getCell("A1");
            titleRow.value = `WApp Manager Leads Pro — Annuaire (${selectedGroup === "all" ? "Tous les groupes" : `Groupe: ${selectedGroup}`})`;
            titleRow.font = { name: "Arial", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
            titleRow.fill = {
                type: "pattern",
                pattern: "solid",
                fgColor: { argb: "FF1E3A8A" }
            };
            titleRow.alignment = { vertical: "middle", horizontal: "center" };
            sheet.getRow(1).height = 35;

            // 2. Metadata subtitle
            sheet.mergeCells("A2:G2");
            const subRow = sheet.getCell("A2");
            subRow.value = `Exporté le : ${new Date().toLocaleString("fr-FR")} | Total contacts : ${filteredContacts.length}`;
            subRow.font = { name: "Arial", size: 9, italic: true, color: { argb: "FF475569" } };
            subRow.alignment = { vertical: "middle", horizontal: "center" };
            sheet.getRow(2).height = 20;

            // Empty row 3
            sheet.getRow(3).height = 10;

            // 3. Table Column Headers
            const headers = [
                { header: "Nom Complet", key: "name", width: 26 },
                { header: "Numéro WhatsApp", key: "number", width: 22 },
                { header: "Groupe d'envoi", key: "group", width: 20 },
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
                    fgColor: { argb: "FF2563EB" }
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

            headers.forEach((col, idx) => {
                sheet.getColumn(idx + 1).width = col.width;
            });

            // 4. Data Rows
            filteredContacts.forEach((c, i) => {
                const rowNum = 5 + i;
                const row = sheet.getRow(rowNum);
                const isEven = i % 2 === 0;

                row.values = [
                    c.name || "N/A",
                    c.number || "",
                    c.group || "Général",
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
                        fgColor: { argb: isEven ? "FFFFFFFF" : "FFF8FAFC" }
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

            const buffer = await workbook.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `Contacts_${selectedGroup === "all" ? "Tous" : selectedGroup}_${new Date().toISOString().split("T")[0]}.xlsx`;
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
        // Group filter
        if (selectedGroup !== "all") {
            const g = (c.group || "Général").trim().toLowerCase();
            if (g !== selectedGroup.trim().toLowerCase()) return false;
        }

        // Search query
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            (c.name && c.name.toLowerCase().includes(q)) ||
            (c.number && c.number.includes(q)) ||
            (c.email && c.email.toLowerCase().includes(q)) ||
            (c.company && c.company.toLowerCase().includes(q)) ||
            (c.city && c.city.toLowerCase().includes(q)) ||
            (c.group && c.group.toLowerCase().includes(q))
        );
    });

    const isAllSelected = filteredContacts.length > 0 && selectedIds.size === filteredContacts.length;

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-5xl w-full mx-auto space-y-6">
            {/* Top Title & Header Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
                <div>
                    <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-purple-600" />
                        Gestionnaire de Contacts & Groupes d'Envoi
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Créez des groupes d'envoi pour ne jamais perdre vos contacts, suppression en masse et export soigné
                    </p>
                </div>

                {/* Templates & Import/Export Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".csv, .xlsx, .xls"
                        onChange={handleImportFile}
                    />

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
                        Importer dans un Groupe
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

            {/* Contact Groups Tabs Filter */}
            <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-gray-700">
                    <span className="flex items-center gap-1.5">
                        <Folder className="w-4 h-4 text-purple-600" /> Groupes d'Envoi Disponibles :
                    </span>
                    <div className="flex items-center gap-2">
                        {selectedGroup !== "all" && (
                            <button
                                onClick={deleteCurrentGroup}
                                disabled={isDeleting}
                                title="Supprimer tous les contacts du groupe sélectionné"
                                className="text-[11px] font-bold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 px-2.5 py-1 rounded-lg flex items-center gap-1 transition disabled:opacity-50"
                            >
                                <Trash2 className="w-3 h-3" />
                                Supprimer le groupe "{selectedGroup}"
                            </button>
                        )}
                        {contacts.length > 0 && (
                            <button
                                onClick={clearAllContacts}
                                disabled={isDeleting}
                                title="Vider tous les contacts de tous les groupes"
                                className="text-[11px] font-bold text-gray-500 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition disabled:opacity-50"
                            >
                                Vider tout
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                    <button
                        onClick={() => setSelectedGroup("all")}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            selectedGroup === "all"
                                ? "bg-purple-600 text-white shadow-sm"
                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                    >
                        <Users className="w-3.5 h-3.5" />
                        Tous les contacts ({contacts.length})
                    </button>

                    {groupsList.map(g => (
                        <button
                            key={g.name}
                            onClick={() => setSelectedGroup(g.name)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                                selectedGroup === g.name
                                    ? "bg-purple-600 text-white shadow-sm"
                                    : "bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200"
                            }`}
                        >
                            <Folder className="w-3.5 h-3.5 text-purple-500" />
                            {g.name} ({g.count})
                        </button>
                    ))}
                </div>
            </div>

            {/* Mass Selection Bar (when items are selected) */}
            {selectedIds.size > 0 && (
                <div className="bg-gradient-to-r from-red-50 to-orange-50 p-3.5 rounded-2xl border border-red-200 flex items-center justify-between gap-4 animate-in fade-in">
                    <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-red-600 text-white font-bold text-xs flex items-center justify-center">
                            {selectedIds.size}
                        </span>
                        <span className="text-xs font-bold text-red-900">
                            {selectedIds.size} contact(s) sélectionné(s) sur {filteredContacts.length}
                        </span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setSelectedIds(new Set())}
                            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition"
                        >
                            Désélectionner tout
                        </button>
                        <button
                            onClick={deleteSelectedContacts}
                            disabled={isDeleting}
                            className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Supprimer la sélection
                        </button>
                    </div>
                </div>
            )}

            {/* Add Single Contact Form */}
            <form onSubmit={addContact} className="bg-gray-50/80 p-4 rounded-2xl border border-gray-100 space-y-3">
                <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-purple-600" /> Ajouter un Contact Rapide
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
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
                        type="text"
                        placeholder="Groupe (ex: VIPs, Salon...)"
                        className="p-2.5 bg-white border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
                        value={newGroup}
                        onChange={(e) => setNewGroup(e.target.value)}
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
                            className="bg-purple-600 text-white px-3 py-2.5 rounded-xl hover:bg-purple-700 transition font-bold text-xs flex items-center gap-1 shrink-0"
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
                        placeholder="Rechercher par nom, numéro, groupe, email ou ville..."
                        className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2">
                    {filteredContacts.length > 0 && (
                        <button
                            onClick={handleSelectAllFiltered}
                            className="text-xs text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-semibold transition cursor-pointer"
                        >
                            {isAllSelected ? <CheckSquare className="w-3.5 h-3.5 text-purple-600" /> : <Square className="w-3.5 h-3.5 text-purple-600" />}
                            {isAllSelected ? "Tout désélectionner" : "Tout sélectionner"}
                        </button>
                    )}
                    {contacts.length > 0 && (
                        <button
                            onClick={filterOnlyMobiles}
                            title="Supprimer les numéros fixes non WhatsApp (05...)"
                            className="text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-1.5 font-semibold transition cursor-pointer"
                        >
                            <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                            Mobiles Uniquement
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
                        <p className="text-xs text-gray-400 mt-1">Importez un fichier Excel/CSV ou ajoutez un contact manuellement dans un groupe.</p>
                    </div>
                ) : filteredContacts.length === 0 ? (
                    <div className="p-8 text-center text-xs text-gray-400">
                        Aucun résultat dans le groupe sélectionné.
                    </div>
                ) : (
                    <div className="max-h-[480px] overflow-y-auto divide-y divide-gray-100">
                        {filteredContacts.map((contact, index) => {
                            const isSelected = contact.id ? selectedIds.has(contact.id) : false;
                            return (
                                <div
                                    key={contact.id || index}
                                    className={`flex items-center justify-between p-3.5 transition group ${
                                        isSelected ? "bg-purple-50/60" : "hover:bg-gray-50/70"
                                    }`}
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <button
                                            type="button"
                                            onClick={() => contact.id && handleToggleSelect(contact.id)}
                                            className="text-gray-400 hover:text-purple-600 transition shrink-0 cursor-pointer"
                                        >
                                            {isSelected ? (
                                                <CheckSquare className="w-4 h-4 text-purple-600" />
                                            ) : (
                                                <Square className="w-4 h-4 text-gray-300" />
                                            )}
                                        </button>

                                        <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs shrink-0">
                                            {contact.name.charAt(0).toUpperCase()}
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-bold text-xs text-gray-900 truncate">{contact.name}</p>

                                                {/* Group Badge */}
                                                <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-2 py-0.5 rounded-full border border-purple-200 flex items-center gap-1">
                                                    <Folder className="w-2.5 h-2.5 text-purple-500" />
                                                    {contact.group || "Général"}
                                                </span>

                                                {contact.company && (
                                                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                                        <Building className="w-2.5 h-2.5" />
                                                        {contact.company}
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400 mt-0.5">
                                                <span className="font-mono text-gray-700 font-bold">{contact.number}</span>
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
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Import Group Name Modal */}
            {importModalOpen && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                                <FolderPlus className="w-5 h-5 text-purple-600" />
                                Créer ou Choisir un Groupe d'Envoi
                            </h3>
                            <button
                                onClick={() => setImportModalOpen(false)}
                                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <p className="text-xs text-gray-600">
                            <strong>{pendingImportRows.length} lignes détectées.</strong> Associez ces contacts à un groupe d'envoi pour ne jamais les perdre et pouvoir leur envoyer des campagnes ciblées en 1 clic.
                        </p>

                        <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-700">Nom du Groupe d'Envoi :</label>
                            <input
                                type="text"
                                value={importGroupName}
                                onChange={(e) => setImportGroupName(e.target.value)}
                                placeholder="ex: Campagne Salon, Clients VIP, Relances..."
                                className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>

                        {groupsList.length > 0 && (
                            <div className="space-y-1.5">
                                <span className="text-[11px] font-semibold text-gray-500">Ou choisir un groupe existant :</span>
                                <div className="flex flex-wrap gap-1.5">
                                    {groupsList.map(g => (
                                        <button
                                            key={g.name}
                                            type="button"
                                            onClick={() => setImportGroupName(g.name)}
                                            className={`text-[11px] px-2.5 py-1 rounded-lg font-bold border transition ${
                                                importGroupName === g.name
                                                    ? "bg-purple-600 text-white border-purple-600"
                                                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                                            }`}
                                        >
                                            {g.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => setImportModalOpen(false)}
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50 transition"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={confirmImportWithGroup}
                                className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition shadow-sm"
                            >
                                Valider et Enregistrer
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
