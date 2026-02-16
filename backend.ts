import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import cors from "cors";
import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";

const port = process.env.PORT || 3001;
const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

const app = express();
const httpServer = createServer(app);

// Enable CORS and increase JSON limit for Base64 media
app.use(cors({
    origin: frontendUrl,
    methods: ["GET", "POST"],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));

const io = new Server(httpServer, {
    cors: {
        origin: frontendUrl,
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Valid only for this scope
let qrCodeData = "";
let isReady = false;
let client: Client;

const initializeClient = () => {
    client = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        },
    });

    client.on("qr", (qr) => {
        console.log("QR RECEIVED", qr);
        qrCodeData = qr;
        isReady = false;
        io.emit("qr", qr);
    });

    client.on("ready", () => {
        console.log("Client is ready!");
        isReady = true;
        qrCodeData = "";
        io.emit("ready", true);
    });

    client.on("authenticated", () => {
        console.log("Authenticated");
        io.emit("authenticated", true);
    });

    client.on("auth_failure", (msg) => {
        console.error("AUTHENTICATION FAILURE", msg);
        io.emit("auth_failure", msg);
        isReady = false;
    });

    client.on("loading_screen", (percent, message) => {
        console.log("LOADING SCREEN", percent, message);
        io.emit("loading_screen", { percent, message });
    });

    client.on("disconnected", (reason) => {
        console.log("Client was disconnected", reason);
        isReady = false;
        qrCodeData = "";
        io.emit("disconnected", reason);
        client.initialize();
    });

    client.initialize().catch(err => {
        console.error("Initialization failed:", err);
        io.emit("error", "Failed to initialize WhatsApp client");
    });
};

initializeClient();

// Socket.IO connection
io.on("connection", (socket: any) => {
    console.log("Client connected");

    // Send current status
    if (isReady) {
        socket.emit("ready", true);
    } else if (qrCodeData) {
        socket.emit("qr", qrCodeData);
    } else {
        // Immediate feedback on connection
        socket.emit("loading_screen", { percent: 10, message: "Starting server..." });
    }

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });

    socket.on("refresh_qr", async () => {
        console.log("Manual refresh requested");
        try {
            if (client) {
                await client.destroy();
            }
        } catch (e) {
            console.error("Error destroying client:", e);
        }
        isReady = false;
        qrCodeData = "";
        io.emit("loading_screen", { percent: 0, message: "Restarting client..." });
        initializeClient();
    });

    // Handle sending messages via socket (or use REST API)
    socket.on("sendMessage", async (data: { number: string; message: string }) => {
        const { number, message } = data;
        try {
            // Ensure number format is correct (suffix @c.us)
            const formattedNumber = number.includes("@c.us") ? number : `${number}@c.us`;
            await client.sendMessage(formattedNumber, message);
            socket.emit("messageSent", { number, status: "success" });
        } catch (error: any) {
            console.error("Error sending message:", error);
            socket.emit("messageError", { number, error: "Failed to send" });
        }
    });

    // Handle status request from frontend
    socket.on("status", () => {
        if (isReady) {
            socket.emit("ready", true);
            socket.emit("authenticated", true);
        } else if (qrCodeData) {
            socket.emit("qr", qrCodeData);
        } else {
            // If neither, we might be loading or waiting for QR
            socket.emit("loading_screen", { percent: 0, message: "Initializing WhatsApp..." });
        }
    });
});

interface BulkSendRequest {
    recipients: { number: string; variables?: Record<string, string> }[];
    message?: string;
    minDelay?: number;
    maxDelay?: number;
    attachments?: {
        mimetype: string;
        data: string;
        filename: string;
    }[];
}

function replaceVariables(template: string, variables?: Record<string, string>): string {
    if (!variables || !template) return template;
    return template.replace(/{{(\w+)}}/g, (_, key) => variables[key] || `{{${key}}}`);
}

// Custom API endpoint
app.post("/api/send-bulk", async (req, res) => {
    const { recipients, message, minDelay = 1000, maxDelay = 3000, attachments = [] } = req.body as BulkSendRequest;

    if (!isReady) {
        res.status(503).json({ error: "WhatsApp client not ready" });
        return;
    }

    if ((!recipients || recipients.length === 0)) {
        res.status(400).json({ error: "No recipients provided" });
        return;
    }

    // Process in background
    (async () => {
        let successCount = 0;
        let failedCount = 0;
        const total = recipients.length;

        for (let i = 0; i < total; i++) {
            const recipient = recipients[i];

            // Emit progress
            io.emit("bulk_progress", {
                total,
                current: i + 1,
                success: successCount,
                failed: failedCount,
                status: `Sending to ${recipient.number}...`
            });

            try {
                let number = recipient.number;
                // Basic cleanup if needed, though frontend should handle it
                number = number.replace(/\D/g, "");

                const formattedNumber = number.includes("@c.us") ? number : `${number}@c.us`;

                // Personalize message
                const personalizedMessage = replaceVariables(message || "", recipient.variables);
                const hasAttachments = attachments && attachments.length > 0;

                if (hasAttachments) {
                    // Send first attachment with caption (if message exists)
                    const firstAtt = attachments[0];
                    const media = new MessageMedia(firstAtt.mimetype, firstAtt.data, firstAtt.filename);

                    const options: any = {};
                    if (personalizedMessage && personalizedMessage.trim()) {
                        options.caption = personalizedMessage;
                    }

                    await client.sendMessage(formattedNumber, media, options);

                    // Send remaining attachments
                    for (let j = 1; j < attachments.length; j++) {
                        const att = attachments[j];
                        const media = new MessageMedia(att.mimetype, att.data, att.filename);
                        await client.sendMessage(formattedNumber, media);
                    }
                } else {
                    // Send text message if exists and no attachments
                    if (personalizedMessage && personalizedMessage.trim()) {
                        await client.sendMessage(formattedNumber, personalizedMessage);
                    }
                }

                console.log(`Sent to ${number}`);
                successCount++;

                // Emit success for this item
                io.emit("bulk_progress", {
                    total,
                    current: i + 1,
                    success: successCount,
                    failed: failedCount,
                    status: `Sent to ${recipient.number}`,
                    lastResult: {
                        number: recipient.number,
                        status: "success"
                    }
                });

                // Random delay between min and max
                const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (e: any) {
                console.error(`Failed to send to ${recipient.number}`, e);
                failedCount++;
                io.emit("bulk_progress", {
                    total,
                    current: i + 1,
                    success: successCount,
                    failed: failedCount,
                    status: `Failed to send to ${recipient.number}: ${e.message || "Unknown error"}`,
                    lastResult: {
                        number: recipient.number,
                        status: "failed",
                        error: e.message || "Unknown error"
                    }
                });
            }
        }

        // Final completion event
        io.emit("bulk_progress", {
            total,
            current: total,
            success: successCount,
            failed: failedCount,
            status: "Completed"
        });

    })();

    res.json({ success: true, message: `Bulk sending started for ${recipients.length} recipients` });
});

app.post("/api/logout", async (req, res) => {
    try {
        await client.logout();
        // Client re-initialization is handled by the 'disconnected' event listener
        // But for safety/explicit constraints, we could trigger it if needed.
        // The 'disconnected' event above already calls client.initialize()
        isReady = false;
        qrCodeData = "";
        res.json({ success: true, message: "Logged out successfully" });
    } catch (e: any) {
        console.error("Logout failed", e);
        // Force destroy if logout fails
        try {
            await client.destroy();
            client.initialize();
            res.json({ success: true, message: "Logged out (forced)" });
        } catch (err: any) {
            res.status(500).json({ error: "Logout failed: " + err.message });
        }
    }
});

httpServer.listen(port, () => {
    console.log(`> Backend Ready on http://localhost:${port}`);
});
