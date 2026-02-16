export type Language = "en" | "fr";

export const translations = {
    en: {
        // General
        appName: "WApp - Bulk Sender",
        dashboard: "Dashboard",
        contacts: "Contacts",
        settings: "Settings",
        loading: "Loading...",
        success: "Success",
        error: "Error",

        // QR Code
        scanQr: "Scan QR Code",
        openWhatsapp: "Open WhatsApp on your phone",
        tapMenu: "Tap Menu or Settings and select Linked Devices",
        tapLink: "Tap on Link a Device",
        pointPhone: "Point your phone to this screen to capture the code",
        whatsappReady: "WhatsApp Ready",
        whatsappReadyDesc: "You can now send messages.",
        disconnect: "Disconnect",

        // Bulk Sender
        download: "Report",
        campaignDetails: "Campaign Details",
        recipients: "Recipients",
        importCsv: "Import CSV",
        downloadTemplate: "Download Template",
        csvMode: "CSV Mode Active",
        variablesFound: "Variables found",
        clearCsv: "Clear CSV",
        messageContent: "Message Content",
        typeMessage: "Type your message here...",
        attachFile: "Attach File",
        sending: "Sending...",
        sendCampaign: "Send Campaign",
        customDelay: "Uses configured delay settings",
        formattingTips: "Formatting Tips",
        bold: "Bold",
        italic: "Italic",
        strikethrough: "Strikethrough",
        variablesTip: "Use {{variable}} for dynamic content",
        livePreview: "Live Preview",
        recipient: "Recipient",
        lastSeen: "Last seen today at 10:00",

        // Contacts
        manageContacts: "Manage Contacts",
        addContact: "Add New Contact",
        namePlaceholder: "Name (e.g. John Doe)",
        numberPlaceholder: "Number (e.g. 0612345678)",
        add: "Add",
        exportCsv: "Export CSV",
        import: "Import",

        // Settings
        delaySettings: "Delay Settings (ms)",
        minDelay: "Minimum Delay",
        maxDelay: "Maximum Delay",
        saveSettings: "Save Settings",
        settingsSaved: "Settings saved successfully",

        // Variables
        noRecipients: "No recipients provided",
        messageRequired: "Message or attachment is required",
        bulkStarted: "Bulk sending started",
        variables: "Variables",
    },
    fr: {
        // General
        appName: "WApp - Envoi Groupé",
        dashboard: "Tableau de bord",
        contacts: "Contacts",
        settings: "Paramètres",
        loading: "Chargement...",
        success: "Succès",
        error: "Erreur",

        // QR Code
        scanQr: "Scanner le code QR",
        openWhatsapp: "Ouvrez WhatsApp sur votre téléphone",
        tapMenu: "Appuyez sur Menu ou Réglages et sélectionnez Appareils connectés",
        tapLink: "Appuyez sur Connecter un appareil",
        pointPhone: "Pointez votre téléphone vers cet écran pour scanner le code",
        whatsappReady: "WhatsApp Prêt",
        whatsappReadyDesc: "Vous pouvez maintenant envoyer des messages.",
        disconnect: "Déconnecter",

        // Bulk Sender
        download: "Rapport",
        campaignDetails: "Détails de la campagne",
        recipients: "Destinataires",
        importCsv: "Importer CSV",
        downloadTemplate: "Télécharger Modèle",
        csvMode: "Mode CSV Actif",
        variablesFound: "Variables trouvées",
        clearCsv: "Effacer CSV",
        messageContent: "Contenu du message",
        typeMessage: "Tapez votre message ici...",
        attachFile: "Joindre un fichier",
        sending: "Envoi en cours...",
        sendCampaign: "Envoyer la campagne",
        customDelay: "Utilise les paramètres de délai configurés",
        formattingTips: "Astuces de formatage",
        bold: "Gras",
        italic: "Italique",
        strikethrough: "Barré",
        variablesTip: "Utilisez {{variable}} pour le contenu dynamique",
        livePreview: "Aperçu en direct",
        recipient: "Destinataire",
        lastSeen: "Vu aujourd'hui à 10:00",

        // Contacts
        manageContacts: "Gérer les contacts",
        addContact: "Ajouter un contact",
        namePlaceholder: "Nom (ex: Jean Dupont)",
        numberPlaceholder: "Numéro (ex: 0612345678)",
        add: "Ajouter",
        exportCsv: "Exporter CSV",
        import: "Importer",

        // Settings
        delaySettings: "Paramètres de délai (ms)",
        minDelay: "Délai minimum",
        maxDelay: "Délai maximum",
        saveSettings: "Enregistrer",
        settingsSaved: "Paramètres enregistrés avec succès",

        // Variables
        noRecipients: "Aucun destinataire fourni",
        messageRequired: "Message ou pièce jointe requis",
        bulkStarted: "Envoi groupé démarré",
        variables: "Variables",
    }
};
