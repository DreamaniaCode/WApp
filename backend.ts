import "dotenv/config";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import express from "express";
import cors from "cors";
const { Client, RemoteAuth, MessageMedia } = require("whatsapp-web.js");
import { PostgresStore } from "./src/utils/PostgresStore";
import { prisma } from "./src/lib/prisma";
import bcrypt from "bcryptjs";
import next from "next";

const DEFAULT_USER = "default_user";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const app = express();
const httpServer = createServer(app);

// Prevent crashes from RemoteAuth race conditions
process.on('unhandledRejection', (reason: any) => {
    if (reason?.code === 'ENOENT' && reason?.path?.includes('wwebjs_temp_session')) {
        console.warn('Suppressing RemoteAuth race condition:', reason.message);
        return;
    }
    console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error: any) => {
    if (error?.code === 'ENOENT' && error?.path?.includes('wwebjs_temp_session')) {
        console.warn('Suppressing RemoteAuth race condition:', error.message);
        return;
    }
    console.error('Uncaught Exception:', error);
});

const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        callback(null, true); // Allow all origins (desktop app)
    },
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH"],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

const io = new Server(httpServer, {
    cors: corsOptions,
    transports: ["websocket", "polling"]
});

// ─── Session Types ─────────────────────────────────────────────────────────────

interface DeviceSession {
    id: string;
    name: string;
    type: "webjs" | "official";
    client: any;
    qrCode: string;
    isReady: boolean;
    loadingPercent: number;
    loadingMessage: string;
    accessToken?: string;
    phoneNumberId?: string;
}

interface UserSession {
    devices: Map<string, DeviceSession>;
}

const sessions = new Map<string, UserSession>();
const store = new PostgresStore();

// ─── Session Helpers ────────────────────────────────────────────────────────────

const getOrCreateSession = async (userId: string): Promise<UserSession> => {
    let session = sessions.get(userId);
    if (!session) {
        console.log(`Creating new session for user: ${userId}`);
        session = { devices: new Map() };
        sessions.set(userId, session);

        // Load saved devices from DB
        try {
            const savedDevices = await prisma.whatsAppDevice.findMany({ where: { userId } });
            for (const device of savedDevices) {
                const deviceSession: DeviceSession = {
                    id: device.id,
                    name: device.name,
                    type: device.type as "webjs" | "official",
                    client: null,
                    qrCode: "",
                    isReady: false,
                    loadingPercent: 0,
                    loadingMessage: "Loading saved session...",
                    accessToken: device.accessToken || undefined,
                    phoneNumberId: device.phoneNumberId || undefined,
                };
                session.devices.set(device.id, deviceSession);

                if (device.type === "webjs") {
                    initializeClient(userId, device.id, deviceSession);
                } else {
                    deviceSession.isReady = true;
                    deviceSession.loadingPercent = 100;
                    deviceSession.loadingMessage = "Official API Ready";
                }
            }
        } catch (e) {
            console.error("Error loading saved devices:", e);
        }
    }
    return session;
};

// ─── WhatsApp Client Initializer ────────────────────────────────────────────────

const initializeClient = async (userId: string, deviceId: string, deviceSession: DeviceSession) => {
    console.log(`Initializing Client for ${userId} device ${deviceId}...`);
    if (deviceSession.client) return;

    deviceSession.loadingMessage = "Starting WhatsApp Client...";
    deviceSession.loadingPercent = 10;
    io.to(userId).emit("device_update", { deviceId, percent: 10, message: "Starting WhatsApp Client...", status: "initializing" });

    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: `session-${userId}-${deviceId}`,
            store: store,
            backupSyncIntervalMs: 300000
        }),
        puppeteer: {
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote",
                "--disable-gpu"
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        },
    });

    deviceSession.client = client;

    client.on("qr", (qr: string) => {
        console.log(`QR RECEIVED for ${userId} device ${deviceId}`);
        deviceSession.qrCode = qr;
        deviceSession.isReady = false;
        deviceSession.loadingMessage = "Scan QR Code";
        deviceSession.loadingPercent = 0;
        io.to(userId).emit("device_qr", { deviceId, qr });
        // Legacy single-device event for QRCodeDisplay compatibility
        io.to(userId).emit("qr", qr);
    });

    client.on("ready", () => {
        console.log(`Client Ready for ${userId} device ${deviceId}!`);
        deviceSession.isReady = true;
        deviceSession.qrCode = "";
        deviceSession.loadingMessage = "Client Ready";
        deviceSession.loadingPercent = 100;
        io.to(userId).emit("device_ready", { deviceId });
        // Legacy events
        io.to(userId).emit("ready", true);
        io.to(userId).emit("authenticated", true);
    });

    client.on("remote_session_saved", () => {
        console.log(`Session saved for ${userId} device ${deviceId}`);
    });

    client.on("authenticated", () => {
        console.log(`Authenticated ${userId} device ${deviceId}`);
        deviceSession.loadingMessage = "Authenticated";
        deviceSession.loadingPercent = 50;
        io.to(userId).emit("device_update", { deviceId, status: "authenticated" });
        io.to(userId).emit("authenticated", true); // Legacy
    });

    client.on("auth_failure", (msg: string) => {
        console.error(`Auth Failure for ${userId} device ${deviceId}`, msg);
        io.to(userId).emit("device_auth_failure", { deviceId, msg });
        deviceSession.isReady = false;
    });

    client.on("error", (err: any) => {
        console.error(`Client Error for ${userId} device ${deviceId}:`, err);
    });

    client.on("loading_screen", (percent: number, message: string) => {
        if (percent !== 0 && message !== "") {
            deviceSession.loadingPercent = percent;
            deviceSession.loadingMessage = message;
            io.to(userId).emit("device_update", { deviceId, percent, message });
            io.to(userId).emit("loading_screen", { percent, message }); // Legacy
        }
    });

    client.on("disconnected", (reason: string) => {
        console.log(`Disconnected ${userId} device ${deviceId}:`, reason);
        deviceSession.isReady = false;
        deviceSession.qrCode = "";
        io.to(userId).emit("device_disconnected", { deviceId, reason });
    });

    try {
        await client.initialize();
    } catch (err: any) {
        console.error(`Initialization error for ${userId} device ${deviceId}:`, err);
        deviceSession.isReady = false;
        io.to(userId).emit("device_disconnected", { deviceId, reason: "Initialization failed" });
    }
};

// ─── Socket.IO ─────────────────────────────────────────────────────────────────

io.use((socket, next) => {
    socket.data.userId = DEFAULT_USER;
    next();
});

io.on("connection", async (socket: any) => {
    const userId: string = socket.data.userId;
    console.log(`Socket connected: ${userId}`);
    socket.join(userId);

    const session = await getOrCreateSession(userId);

    // Send current devices state
    const deviceStates = Array.from(session.devices.values()).map(d => ({
        id: d.id,
        name: d.name,
        type: d.type,
        isReady: d.isReady,
        qrCode: d.qrCode,
        loadingPercent: d.loadingPercent,
        loadingMessage: d.loadingMessage
    }));
    socket.emit("devices_state", deviceStates);

    socket.on("disconnect", () => {
        console.log(`Socket disconnected: ${userId}`);
    });

    // ── Add Device ──────────────────────────────────────────────────────────────
    socket.on("add_device", async (data: { type: "webjs" | "official"; name: string; accessToken?: string; phoneNumberId?: string }) => {
        try {
            const newDevice = await prisma.whatsAppDevice.create({
                data: {
                    userId,
                    name: data.name,
                    type: data.type,
                    accessToken: data.accessToken,
                    phoneNumberId: data.phoneNumberId
                }
            });

            const deviceSession: DeviceSession = {
                id: newDevice.id,
                name: newDevice.name,
                type: data.type,
                client: null,
                qrCode: "",
                isReady: false,
                loadingPercent: 0,
                loadingMessage: "Initializing...",
                accessToken: data.accessToken,
                phoneNumberId: data.phoneNumberId
            };

            session.devices.set(newDevice.id, deviceSession);

            if (data.type === "webjs") {
                await initializeClient(userId, newDevice.id, deviceSession);
            } else {
                deviceSession.isReady = true;
                deviceSession.loadingPercent = 100;
                deviceSession.loadingMessage = "Official API Ready";
                socket.emit("device_ready", { deviceId: newDevice.id });
            }

            socket.emit("device_added", {
                id: newDevice.id,
                name: newDevice.name,
                type: newDevice.type,
                isReady: deviceSession.isReady,
                qrCode: deviceSession.qrCode,
                loadingPercent: deviceSession.loadingPercent,
                loadingMessage: deviceSession.loadingMessage
            });
        } catch (err: any) {
            socket.emit("error", { message: "Failed to add device: " + err.message });
        }
    });

    // ── Remove Device ───────────────────────────────────────────────────────────
    socket.on("remove_device", async (data: { deviceId: string }) => {
        const deviceSession = session.devices.get(data.deviceId);
        if (deviceSession?.client) {
            try { await deviceSession.client.destroy(); } catch (e) {}
        }
        session.devices.delete(data.deviceId);
        try { await prisma.whatsAppDevice.delete({ where: { id: data.deviceId } }); } catch (e) {}
        socket.emit("device_removed", { deviceId: data.deviceId });
    });

    // ── Request Pairing Code ────────────────────────────────────────────────────
    socket.on("request_pairing_code", async (data: { deviceId: string; phoneNumber: string }) => {
        const deviceSession = session.devices.get(data.deviceId);
        if (!deviceSession?.client) {
            socket.emit("error", { message: "Client not initialized" });
            return;
        }
        try {
            const sanitizedNumber = data.phoneNumber.replace(/\D/g, "");
            const page = deviceSession.client.pupPage;
            if (page) {
                try { await page.exposeFunction('onCodeReceivedEvent', (code: string) => code); } catch (e) {}
            }
            const code = await deviceSession.client.requestPairingCode(sanitizedNumber);
            socket.emit("pairing_code", { deviceId: data.deviceId, code });
        } catch (err: any) {
            socket.emit("error", { message: "Failed: " + err.message });
        }
    });

    // ── Refresh QR ──────────────────────────────────────────────────────────────
    socket.on("refresh_qr", async (data: { deviceId: string }) => {
        const deviceSession = session.devices.get(data.deviceId);
        if (deviceSession?.client) {
            try { await deviceSession.client.destroy(); } catch (e) {}
        }
        if (deviceSession) {
            deviceSession.client = null;
            deviceSession.qrCode = "";
            deviceSession.isReady = false;
            deviceSession.loadingMessage = "Restarting...";
            deviceSession.loadingPercent = 0;
            io.to(userId).emit("device_update", { deviceId: data.deviceId, percent: 0, message: "Restarting client..." });
            await initializeClient(userId, data.deviceId, deviceSession);
        }
    });
});

// ─── Helpers ────────────────────────────────────────────────────────────────────

const replaceVariables = (template: string, variables?: Record<string, string>) => {
    if (!variables) return template;
    return template.replace(/{{(\w+)}}/g, (_, key) => variables[key] || `{{${key}}}`);
};

// ─── REST APIs ──────────────────────────────────────────────────────────────────

interface BulkSendRequest {
    recipients: { number: string; variables?: Record<string, string> }[];
    message: string;
    minDelay?: number;
    maxDelay?: number;
    attachments?: { filename: string; mimetype: string; data: string }[];
}

app.post("/api/send-bulk", async (req, res) => {
    const userId = DEFAULT_USER;
    const session = sessions.get(userId);

    if (!session) {
        res.status(503).json({ error: "Session not initialized" });
        return;
    }

    const readyDevices = Array.from(session.devices.values()).filter(d => d.isReady);
    if (readyDevices.length === 0) {
        res.status(503).json({ error: "No WhatsApp devices connected/ready" });
        return;
    }

    const { recipients, message, minDelay = 1000, maxDelay = 3000, attachments = [] } = req.body as BulkSendRequest;

    if (!recipients || recipients.length === 0) {
        res.status(400).json({ error: "No recipients provided" });
        return;
    }

    res.json({ message: `Started sending to ${recipients.length} recipients across ${readyDevices.length} device(s)` });

    (async () => {
        let successCount = 0;
        let failedCount = 0;
        const total = recipients.length;

        for (let i = 0; i < total; i++) {
            const recipient = recipients[i];
            // Round-robin load balancing
            const device = readyDevices[i % readyDevices.length];
            const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);

            io.to(userId).emit("bulk_progress", {
                total, current: i + 1, success: successCount, failed: failedCount,
                status: `[${device.name}] Sending to ${recipient.number}...`
            });

            let number = recipient.number.replace(/\D/g, "");
            let msgStatus = "failed";
            let errorMessage = "";

            try {
                const formattedNumber = `${number}@c.us`;
                const personalizedMessage = replaceVariables(message || "", recipient.variables);

                if (device.type === "official" && device.accessToken && device.phoneNumberId) {
                    // Official WhatsApp Cloud API
                    const apiRes = await fetch(`https://graph.facebook.com/v17.0/${device.phoneNumberId}/messages`, {
                        method: "POST",
                        headers: { "Authorization": `Bearer ${device.accessToken}`, "Content-Type": "application/json" },
                        body: JSON.stringify({
                            messaging_product: "whatsapp", to: number,
                            type: "text", text: { body: personalizedMessage }
                        })
                    });
                    if (!apiRes.ok) throw new Error(await apiRes.text());
                } else if (device.type === "webjs" && device.client) {
                    if (attachments.length > 0) {
                        const firstAtt = attachments[0];
                        const media = new MessageMedia(firstAtt.mimetype, firstAtt.data, firstAtt.filename);
                        const options: any = { sendSeen: false };
                        if (personalizedMessage?.trim()) options.caption = personalizedMessage;
                        await device.client.sendMessage(formattedNumber, media, options);
                        for (let j = 1; j < attachments.length; j++) {
                            const att = attachments[j];
                            await device.client.sendMessage(formattedNumber, new MessageMedia(att.mimetype, att.data, att.filename), { sendSeen: false });
                        }
                    } else if (personalizedMessage?.trim()) {
                        await device.client.sendMessage(formattedNumber, personalizedMessage, { sendSeen: false });
                    }
                }

                console.log(`[${device.name}] Sent to ${number}`);
                successCount++;
                msgStatus = "success";

                // Save Contact
                try {
                    await prisma.contact.upsert({
                        where: { number_userId: { number, userId } },
                        update: { name: recipient.variables?.name || number },
                        create: { number, userId, name: recipient.variables?.name || number }
                    });
                } catch (e) {}
            } catch (error: any) {
                console.error(`Send error for ${number}:`, error);
                errorMessage = error.message;
                failedCount++;
            }

            // Save History
            try {
                await prisma.messageHistory.create({
                    data: { userId, number, message: replaceVariables(message || "", recipient.variables), status: msgStatus, error: errorMessage }
                });
            } catch (e) {}

            io.to(userId).emit("bulk_progress", {
                total, current: i + 1, success: successCount, failed: failedCount,
                status: msgStatus === "success" ? "Sent" : "Failed",
                lastResult: { number, status: msgStatus, error: errorMessage, time: new Date().toISOString() }
            });

            // Delay with countdown
            if (i < total - 1) {
                let remaining = randomDelay;
                while (remaining > 0) {
                    io.to(userId).emit("bulk_progress", {
                        total, current: i + 1, success: successCount, failed: failedCount,
                        status: `Waiting ${Math.ceil(remaining / 1000)}s...`,
                        countdown: Math.ceil(remaining / 1000)
                    });
                    const waitTime = Math.min(remaining, 1000);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    remaining -= waitTime;
                }
            }
        }

        io.to(userId).emit("bulk_progress", { total, current: total, success: successCount, failed: failedCount, status: "Completed", countdown: 0 });
    })();
});

// Stats
app.get("/api/stats", async (req, res) => {
    const userId = DEFAULT_USER;
    try {
        const history = await prisma.messageHistory.findMany({
            where: { userId }, orderBy: { createdAt: 'desc' }, take: 200
        });
        const successful = history.filter((m: any) => m.status === 'success').length;
        const failed = history.filter((m: any) => m.status === 'failed').length;
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonth = history.filter((m: any) => new Date(m.createdAt) >= firstDay).length;
        res.json({ successful, failed, total: successful + failed, thisMonth, success: successful, contacts: 0, history });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Message History
app.get("/api/messages", async (req, res) => {
    const userId = DEFAULT_USER;
    try {
        const messages = await prisma.messageHistory.findMany({
            where: { userId }, orderBy: { createdAt: 'desc' }, take: 100
        });
        res.json(messages);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Devices API
app.get("/api/devices", async (req, res) => {
    const userId = DEFAULT_USER;
    try {
        const devices = await prisma.whatsAppDevice.findMany({ where: { userId } });
        res.json(devices);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Contacts API
app.get("/api/contacts", async (req, res) => {
    const userId = DEFAULT_USER;
    try {
        const contacts = await prisma.contact.findMany({ where: { userId }, orderBy: { name: 'asc' } });
        res.json(contacts);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/contacts", async (req, res) => {
    const userId = DEFAULT_USER;
    const { contacts } = req.body;
    if (!Array.isArray(contacts)) { res.status(400).json({ error: "Invalid format" }); return; }
    try {
        let count = 0;
        for (const contact of contacts) {
            await prisma.contact.upsert({
                where: { number_userId: { number: contact.number, userId } },
                update: { name: contact.name || contact.number },
                create: { number: contact.number, userId, name: contact.name || contact.number }
            });
            count++;
        }
        res.json({ success: true, count });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.delete("/api/contacts", async (req, res) => {
    const { id } = req.query;
    if (!id || typeof id !== 'string') { res.status(400).json({ error: "Contact ID required" }); return; }
    try {
        await prisma.contact.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Logout a device (WhatsApp disconnect)
app.post("/api/logout", async (req, res) => {
    const userId = DEFAULT_USER;
    const { deviceId } = req.body;
    const session = sessions.get(userId);
    if (!session) { res.json({ success: true }); return; }

    if (deviceId) {
        const device = session.devices.get(deviceId);
        if (device?.client) {
            try { await device.client.logout(); } catch (e) {}
            try { await device.client.destroy(); } catch (e) {}
        }
        session.devices.delete(deviceId);
        io.to(userId).emit("device_disconnected", { deviceId, reason: "User logout" });
    } else {
        // Logout all
        for (const [id, device] of session.devices) {
            if (device.client) {
                try { await device.client.logout(); } catch (e) {}
                try { await device.client.destroy(); } catch (e) {}
            }
        }
        sessions.delete(userId);
        io.to(userId).emit("disconnected", "User initiated logout");
    }
    res.json({ success: true });
});

// ─── Ensure Default User Exists ─────────────────────────────────────────────────

const ensureDefaultUser = async () => {
    try {
        const existing = await prisma.user.findUnique({ where: { id: DEFAULT_USER } });
        if (!existing) {
            await prisma.user.create({
                data: { id: DEFAULT_USER, name: "Admin", email: "admin@wapp.local" }
            });
            console.log("Default user created.");
        }
    } catch (e) {
        console.error("Error ensuring default user:", e);
    }
};

// ─── Start Server ────────────────────────────────────────────────────────────────

nextApp.prepare().then(async () => {
    await ensureDefaultUser();

    app.use(async (req, res) => {
        await handle(req, res);
    });

    httpServer.listen(port, "127.0.0.1", () => {
        console.log(`> Ready on http://127.0.0.1:${port}`);
    });
});
