import "dotenv/config";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import express from "express";
import cors from "cors";
const { Client, RemoteAuth, MessageMedia } = require("whatsapp-web.js");
import { PostgresStore } from "./src/utils/PostgresStore";
import { prisma } from "./src/lib/prisma";
import * as cookie from "cookie";
import { decode } from "next-auth/jwt";
import bcrypt from "bcryptjs";
import next from "next";
import { parse } from "url";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

const app = express();
const httpServer = createServer(app);

// Prevent crashes from RemoteAuth race conditions
process.on('unhandledRejection', (reason: any, promise) => {
    if (reason && reason.code === 'ENOENT' && reason.path?.includes('wwebjs_temp_session')) {
        console.warn('Suppressing known RemoteAuth race condition error:', reason.message);
        return;
    }
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error: any) => {
    if (error && error.code === 'ENOENT' && error.path?.includes('wwebjs_temp_session')) {
        console.warn('Suppressing known RemoteAuth race condition error:', error.message);
        return;
    }
    console.error('Uncaught Exception:', error);
});

// Allowed origins - logic slightly different now since we are same origin mostly, but keep for safety
const allowedOrigins = [
    "http://localhost:3000",
    "https://w-app-beryl.vercel.app",
    "https://w-app-sigma.vercel.app",
    process.env.FRONTEND_URL
].filter((origin): origin is string => !!origin);

const corsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith("http://localhost")) {
            callback(null, true);
        } else {
            console.log("Blocked by CORS:", origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ["GET", "POST"],
    credentials: true // Important for passing cookies
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));

// Note: Removed the root GET "/" route to let Next.js handle it.

const io = new Server(httpServer, {
    cors: corsOptions,
    transports: ["websocket", "polling"]
});

// --- Multi-Tenancy Session Management ---

interface UserSession {
    client: any;
    qrCode: string;
    isReady: boolean;
    loadingPercent: number;
    loadingMessage: string;
}

// Map to store sessions: userId -> UserSession
const sessions = new Map<string, UserSession>();
const store = new PostgresStore();

/**
 * Retrieves or creates a session for a given user.
 * Initializes the WhatsApp client if it doesn't exist.
 */
const getOrCreateSession = async (userId: string, socket?: Socket): Promise<UserSession> => {
    let session = sessions.get(userId);

    if (!session) {
        console.log(`Creating new session for user: ${userId}`);
        session = {
            client: null,
            qrCode: "",
            isReady: false,
            loadingPercent: 0,
            loadingMessage: "Initializing..."
        };
        sessions.set(userId, session);
        await initializeClient(userId, session);
    } 
    
    // If socket is provided, join the user's room
    if (socket) {
        socket.join(userId);
    }
    
    return session;
};

const initializeClient = async (userId: string, session: UserSession) => {
    console.log(`Initializing Client for ${userId}...`);
    
    // Ensure we don't re-initialize an existing client that is working
    if (session.client) {
         return;
    }

    session.loadingMessage = "Starting WhatsApp Client...";
    session.loadingPercent = 10;
    io.to(userId).emit("loading_screen", { percent: 10, message: "Starting WhatsApp Client..." });

    const client = new Client({
        authStrategy: new RemoteAuth({
            clientId: `session-${userId}`, // Unique session ID per user
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

    session.client = client;

    client.on("qr", (qr: string) => {
        console.log(`QR RECEIVED for ${userId}`);
        session.qrCode = qr;
        session.isReady = false;
        session.loadingMessage = "Scan QR Code";
        session.loadingPercent = 0;
        io.to(userId).emit("qr", qr);
    });

    client.on("ready", () => {
        console.log(`Client Ready for ${userId}!`);
        session.isReady = true;
        session.qrCode = "";
        session.loadingMessage = "Client Ready";
        session.loadingPercent = 100;
        io.to(userId).emit("ready", true);
    });

    client.on("remote_session_saved", () => {
        console.log(`Session saved for ${userId}`);
    });

    client.on("authenticated", () => {
        console.log(`Authenticated ${userId}`);
        session.loadingMessage = "Authenticated";
        session.loadingPercent = 50;
        io.to(userId).emit("authenticated", true);
    });

    client.on("auth_failure", (msg: string) => {
        console.error(`Auth Failure for ${userId}`, msg);
        io.to(userId).emit("auth_failure", msg);
        session.isReady = false;
    });

    // Capture generic errors to prevent crashes
    client.on("error", (err: any) => {
        console.error(`Client Error for ${userId}:`, err);
        // Don't emit to UI unless critical, just log
    });

    client.on("loading_screen", (percent: number, message: string) => {
        if (percent !== 0 && message !== "") {
             session.loadingPercent = percent;
             session.loadingMessage = message;
             io.to(userId).emit("loading_screen", { percent, message });
        }
    });

    client.on("disconnected", (reason: string) => {
        console.log(`Disconnected ${userId}:`, reason);
        const currentSession = sessions.get(userId);
        if (currentSession) {
            currentSession.isReady = false;
            currentSession.qrCode = "";
        }
        io.to(userId).emit("disconnected", reason);
        
        // If the disconnection was NOT initiated by logout (e.g. phone disconnected), 
        // we might want to clean up or let the user reconnect manually.
        // For now, we leave the session object but mark as not ready.
    });

    try {
        await client.initialize();
    } catch (err: any) {
         console.error(`Initialization error for ${userId}:`, err);
         session.isReady = false;
         io.to(userId).emit("disconnected", "Initialization failed");
    }
};

// Start a timer to clean up inactive sessions periodically?
// For now, we rely on memory or manual logout.

// --- Socket.IO Connection Handling ---

io.use(async (socket, next) => {
    try {
        // Authenticate Socket connection using NextAuth session cookie
        const cookies = cookie.parse(socket.request.headers.cookie || "");
        const sessionToken = cookies["next-auth.session-token"] || cookies["__Secure-next-auth.session-token"];

        if (!sessionToken) {
            return next(new Error("Authentication error: No session token"));
        }

        const decoded = await decode({
            token: sessionToken,
            secret: process.env.NEXTAUTH_SECRET || "",
        });

        if (!decoded || !decoded.email) {
            return next(new Error("Authentication error: Invalid token"));
        }
        
        // Find user in DB to get ID
        const user = await prisma.user.findUnique({
             where: { email: decoded.email as string }
        });

        if (!user) {
            return next(new Error("Authentication error: User not found"));
        }

        // Attach user info to socket
        socket.data.userId = user.id;
        socket.data.email = user.email;
        next();

    } catch (err) {
        console.error("Socket Auth Error:", err);
        next(new Error("Authentication error"));
    }
});

io.on("connection", async (socket: any) => {
    const userId = socket.data.userId;
    console.log(`Socket connected: ${userId} (${socket.data.email})`);
    
    // Join a room named after the userId for targeted emitting
    socket.join(userId);

    // Get or Create Session
    const session = await getOrCreateSession(userId, socket);

    // Send current state to newly connected socket
    if (session.isReady) {
        socket.emit("ready", true);
        socket.emit("authenticated", true);
    } else if (session.qrCode) {
        socket.emit("qr", session.qrCode);
    } else {
        socket.emit("loading_screen", { 
            percent: session.loadingPercent, 
            message: session.loadingMessage 
        });
    }

    socket.on("disconnect", () => {
        // We do NOT destroy the session on socket disconnect (tab close), 
        // ensuring persistence.
        console.log(`Socket disconnected: ${userId}`);
    });

    socket.on("request_pairing_code", async (data: { phoneNumber: string }) => {
        const currentSession = sessions.get(userId);
        if (!currentSession || !currentSession.client) {
             socket.emit("error", { message: "Client not initialized" });
             return;
        }
        
        try {
            const sanitizedNumber = data.phoneNumber.replace(/\D/g, "");
            const page = currentSession.client.pupPage;
             if (page) {
                try {
                    await page.exposeFunction('onCodeReceivedEvent', (code: string) => code);
                } catch (e) {}
            }
            const code = await currentSession.client.requestPairingCode(sanitizedNumber);
            socket.emit("pairing_code", { code });
        } catch (err: any) {
            socket.emit("error", { message: "Failed: " + err.message });
        }
    });

    socket.on("refresh_qr", async () => {
        console.log(`Refresh QR requested by ${userId}`);
        const currentSession = sessions.get(userId);
        if (currentSession && currentSession.client) {
             try {
                await currentSession.client.destroy();
             } catch(e) { console.error("Error destroying client", e); }
        }
        
        // Reset session state
        if (currentSession) {
            currentSession.client = null;
            currentSession.qrCode = "";
            currentSession.isReady = false;
            currentSession.loadingMessage = "Restarting...";
            currentSession.loadingPercent = 0;
            io.to(userId).emit("loading_screen", { percent: 0, message: "Restarting client..." });
            
            // Re-init
            await initializeClient(userId, currentSession);
        }
    });

    // Handle sending messages via socket (or use REST API)
    socket.on("sendMessage", async (data: { number: string; message: string }) => {
        const currentSession = sessions.get(userId);
        if (!currentSession || !currentSession.client || !currentSession.isReady) {
            socket.emit("messageError", { number: data.number, error: "WhatsApp client not ready" });
            return;
        }

        const { number, message } = data;
        try {
            const formattedNumber = number.includes("@c.us") ? number : `${number}@c.us`;
            await currentSession.client.sendMessage(formattedNumber, message);
            socket.emit("messageSent", { number, status: "success" });
        } catch (error: any) {
            console.error("Error sending message:", error);
            socket.emit("messageError", { number, error: "Failed to send" });
        }
    });

    socket.on("status", () => {
        // Re-emit status
        const currentSession = sessions.get(userId);
        if (!currentSession) return;
        
        if (currentSession.isReady) {
            socket.emit("ready", true);
            socket.emit("authenticated", true);
        } else if (currentSession.qrCode) {
            socket.emit("qr", currentSession.qrCode);
        } else {
             socket.emit("loading_screen", { 
                percent: currentSession.loadingPercent, 
                message: currentSession.loadingMessage 
            });
        }
    });
});


// --- Helper Functions ---

const replaceVariables = (template: string, variables?: Record<string, string>) => {
    if (!variables) return template;
    return template.replace(/{{(\w+)}}/g, (_, key) => variables[key] || `{{${key}}}`);
};

const getUserFromRequest = async (req: express.Request): Promise<string | null> => {
    try {
        const cookies = cookie.parse(req.headers.cookie || "");
        const sessionToken = cookies["next-auth.session-token"] || cookies["__Secure-next-auth.session-token"];
        
        if (!sessionToken) return null;

        const decoded = await decode({
            token: sessionToken,
            secret: process.env.NEXTAUTH_SECRET || ""
        });

        if (!decoded || !decoded.email) return null;
        
        // Cache this? For now, DB lookup ensures validity
        const user = await prisma.user.findUnique({
            where: { email: decoded.email as string },
            select: { id: true }
        });
        
        return user ? user.id : null;
    } catch (e) {
        console.error("Auth check failed:", e);
        return null;
    }
};

interface BulkSendRequest {
    recipients: { number: string; variables?: Record<string, string> }[];
    message: string;
    minDelay?: number;
    maxDelay?: number;
    attachments?: { filename: string; mimetype: string; data: string }[];
}

// REST API endpoint for bulk sending
app.post("/api/send-bulk", async (req, res) => {
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const session = sessions.get(userId);

    if (!session || !session.client || !session.isReady) {
        res.status(503).json({ error: "WhatsApp client not connected/ready" });
        return;
    }

    const { recipients, message, minDelay = 1000, maxDelay = 3000, attachments = [] } = req.body as BulkSendRequest;

    if ((!recipients || recipients.length === 0)) {
        res.status(400).json({ error: "No recipients provided" });
        return;
    }

    // Acknowledge request immediately
    res.json({ message: `Started sending to ${recipients.length} recipients` });

    // Process in background
    (async () => {
        let successCount = 0;
        let failedCount = 0;
        const total = recipients.length;
        const client = session.client;

        for (let i = 0; i < total; i++) {
            const recipient = recipients[i];
            
            // Calculate delay for NEXT message (if not last)
            const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay);

            // Emit progress with Status
            io.to(userId).emit("bulk_progress", {
                total,
                current: i + 1,
                success: successCount,
                failed: failedCount,
                status: `Sending to ${recipient.number}...`
            });

            let number = recipient.number.replace(/\D/g, "");
            let msgStatus = "failed";
            let errorMessage = "";

            try {
                const formattedNumber = number.includes("@c.us") ? number : `${number}@c.us`;
                const personalizedMessage = replaceVariables(message || "", recipient.variables);
                const hasAttachments = attachments && attachments.length > 0;

                if (hasAttachments) {
                    const firstAtt = attachments[0];
                    const media = new MessageMedia(firstAtt.mimetype, firstAtt.data, firstAtt.filename);
                    const options: any = {};
                    if (personalizedMessage && personalizedMessage.trim()) options.caption = personalizedMessage;
                    
                    await client.sendMessage(formattedNumber, media, options);

                    for (let j = 1; j < attachments.length; j++) {
                        const att = attachments[j];
                        const media = new MessageMedia(att.mimetype, att.data, att.filename);
                        await client.sendMessage(formattedNumber, media);
                    }
                } else {
                    if (personalizedMessage && personalizedMessage.trim()) {
                        await client.sendMessage(formattedNumber, personalizedMessage);
                    }
                }

                console.log(`User ${userId} sent to ${number}`);
                successCount++;
                msgStatus = "success";
                
                // Save Contact
                try {
                    await prisma.contact.upsert({
                        where: { number_userId: { number, userId } },
                        update: { name: recipient.variables?.name || number },
                        create: { number, userId, name: recipient.variables?.name || number }
                    });
                } catch(e) { console.error("Contact save error", e); }

            } catch (error: any) {
                console.error(`Send error for ${number}:`, error);
                errorMessage = error.message;
                failedCount++;
            }

            // Save History
            try {
                await prisma.messageHistory.create({
                    data: {
                        userId,
                        number,
                        message: replaceVariables(message || "", recipient.variables),
                        status: msgStatus,
                        error: errorMessage
                    }
                });
            } catch (e) { console.error("History save error", e); }

            // Update Report UI
            io.to(userId).emit("bulk_progress", {
                total,
                current: i + 1,
                success: successCount,
                failed: failedCount,
                status: msgStatus === "success" ? "Sent" : "Failed",
                lastResult: {
                    number,
                    status: msgStatus,
                    error: errorMessage,
                    time: new Date().toISOString()
                }
            });

            // Delay with Countdown (only if not last)
            if (i < total - 1) {
                const step = 1000;
                let remaining = randomDelay;
                
                while (remaining > 0) {
                     io.to(userId).emit("bulk_progress", {
                        total,
                        current: i + 1,
                        success: successCount,
                        failed: failedCount,
                        status: `Waiting ${Math.ceil(remaining/1000)}s...`,
                        countdown: Math.ceil(remaining/1000) // Helper for UI
                    });
                    
                    const waitTime = Math.min(remaining, step);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    remaining -= waitTime;
                }
            }
        }

        io.to(userId).emit("bulk_progress", {
            total,
            current: total,
            success: successCount,
            failed: failedCount,
            status: "Completed",
            countdown: 0
        });

    })();
});


// Polling fallback endpoint
app.get("/api/qr-status", (req, res) => {
    // This endpoint is less useful with multi-tenancy, as it can't know which user's status to return.
    // It would need a userId in the request, e.g., from a query param or auth token.
    // For now, returning a generic message or requiring auth.
    res.status(400).json({ error: "Please use authenticated socket connection for status updates." });
});


// Stats API
app.get("/api/stats", async (req, res) => {
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const history = await (prisma as any).messageHistory.findMany({ 
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 100 // Limit for now
        });

        // Simple aggregation
        const successful = history.filter((m: any) => m.status === 'success').length;
        const failed = history.filter((m: any) => m.status === 'failed').length;
        
        // This month stats
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const thisMonth = history.filter((m: any) => new Date(m.createdAt) >= firstDay).length;

        res.json({
            successful,
            failed,
            total: successful + failed,
            thisMonth,
            history // also return history for the list
        });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// History API (Full/Paginated)
app.get("/api/messages", async (req, res) => {
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const messages = await prisma.messageHistory.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: 100
        });
        res.json(messages);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

// User Management API
app.get("/api/users", async (req, res) => {
    // Ideally check if admin, but for now allow any authenticated user to view
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const users = await prisma.user.findMany({
            select: { id: true, name: true, email: true, createdAt: true }
        });
        res.json(users);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/users", async (req, res) => {
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const { email, password, name } = req.body;
        if (!email || !password) {
            res.status(400).json({ error: "Email and password required" });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name
            },
            select: { id: true, name: true, email: true, createdAt: true }
        });
        res.json(user);
    } catch (e: any) {
        if (e.code === 'P2002') {
             res.status(400).json({ error: "User already exists" });
             return;
        }
        res.status(500).json({ error: e.message });
    }
});

app.delete("/api/users", async (req, res) => {
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const { id } = req.query;
        if (!id || typeof id !== 'string') {
            res.status(400).json({ error: "User ID required" });
            return;
        }

        if (id === userId) {
            res.status(400).json({ error: "Cannot delete yourself" });
            return;
        }

        await prisma.user.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});


// Contact Management API
app.get("/api/contacts", async (req, res) => {
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    try {
        const contacts = await prisma.contact.findMany({
            where: { userId },
            orderBy: { name: 'asc' }
        });
        res.json(contacts);
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/contacts", async (req, res) => {
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const { contacts } = req.body; // Expects an array of { number, name? }

    if (!Array.isArray(contacts)) {
        res.status(400).json({ error: "Invalid format" });
        return;
    }

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
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const { id } = req.query;
    if (!id || typeof id !== 'string') {
        res.status(400).json({ error: "Contact ID required" });
        return;
    }

    try {
        // Ensure ownership
        const contact = await prisma.contact.findUnique({ where: { id } });
        if (!contact || contact.userId !== userId) {
             res.status(403).json({ error: "Forbidden" });
             return;
        }

        await prisma.contact.delete({ where: { id } });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/logout", async (req, res) => {
    const userId = await getUserFromRequest(req);
    if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }

    const session = sessions.get(userId);

    if (!session || !session.client) {
        // Even if no active session in memory, we should return success to allow frontend to clear state
        res.json({ success: true, message: "No active session to logout" });
        return;
    }

    try {
        // Attempt graceful logout
        try {
            await session.client.logout();
        } catch (e: any) {
            console.warn(`Logout failed for user ${userId} (might be already logged out):`, e.message);
        }

        // Destroy the client
        try {
            await session.client.destroy();
        } catch (e: any) {
             console.error(`Destroy failed for user ${userId}:`, e.message);
        }

        // Always remove from sessions map
        sessions.delete(userId);
        
        // Notify client
        io.to(userId).emit("disconnected", "User initiated logout");
        
        res.json({ success: true, message: "Logged out successfully" });
    } catch (e: any) {
        console.error("Critical error during logout:", e);
        // Ensure cleanup happens even on critical error
        sessions.delete(userId);
        res.status(500).json({ error: "Logout failed: " + e.message });
    }
});

// Prepare Next.js and then start server
nextApp.prepare().then(() => {
    // Handle all other requests with Next.js
    // Handle all other requests with Next.js
    app.use(async (req, res) => {
        await handle(req, res);
    });

    httpServer.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });
});
