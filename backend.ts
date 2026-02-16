import { createServer } from "http";
import { Server } from "socket.io";
import express from "express";
import cors from "cors";
import { Client, LocalAuth, MessageMedia } from "whatsapp-web.js";

const port = 3001;

const app = express();
const httpServer = createServer(app);

// Enable CORS and increase JSON limit for Base64 media
app.use(cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
}));
app.use(express.json({ limit: '50mb' }));

const io = new Server(httpServer, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ["--no-sandbox"],
    },
});

// Valid only for this scope
let qrCodeData = "";
let isReady = false;

client.on("qr", (qr) => {
    console.log("QR RECEIVED", qr);
    qrCodeData = qr;
    io.emit("qr", qr);
});

client.on("ready", () => {
    console.log("Client is ready!");
    isReady = true;
    io.emit("ready", true);
});

client.on("authenticated", () => {
    console.log("Authenticated");
    io.emit("authenticated", true);
});

client.on("auth_failure", (msg) => {
    console.error("AUTHENTICATION FAILURE", msg);
    io.emit("auth_failure", msg);
});

client.on("loading_screen", (percent, message) => {
    console.log("LOADING SCREEN", percent, message);
    io.emit("loading_screen", { percent, message });
});

client.initialize();

// Socket.IO connection
io.on("connection", (socket) => {
    console.log("Client connected");

    // Send current status
    if (isReady) {
        socket.emit("ready", true);
    } else if (qrCodeData) {
        socket.emit("qr", qrCodeData);
    }

    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });

    // Handle sending messages via socket (or use REST API)
    socket.on("sendMessage", async (data) => {
        const { number, message } = data;
        try {
            // Ensure number format is correct (suffix @c.us)
            const formattedNumber = number.includes("@c.us") ? number : `${number}@c.us`;
            await client.sendMessage(formattedNumber, message);
            socket.emit("messageSent", { number, status: "success" });
        } catch (error) {
            console.error("Error sending message:", error);
            socket.emit("messageError", { number, error: "Failed to send" });
        }
    });
});

// Custom API endpoint
app.post("/api/send-bulk", async (req, res) => {
    // @ts-ignore
    const { validNumbers, message, minDelay = 1000, maxDelay = 3000, attachments = [] } = req.body;

    if (!isReady) {
        // @ts-ignore
        return res.status(503).json({ error: "WhatsApp client not ready" });
    }

    // Process in background
    (async () => {
        for (const number of validNumbers) {
            try {
                const formattedNumber = number.includes("@c.us") ? number : `${number}@c.us`;

                // Send text message if exists
                if (message && message.trim()) {
                    await client.sendMessage(formattedNumber, message);
                }

                // Send attachments
                for (const attachment of attachments) {
                    const { mimetype, data, filename } = attachment;
                    const media = new MessageMedia(mimetype, data, filename);
                    await client.sendMessage(formattedNumber, media);
                }

                console.log(`Sent to ${number}`);

                // Random delay between min and max
                const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
                await new Promise(resolve => setTimeout(resolve, delay));
            } catch (e) {
                console.error(`Failed to send to ${number}`, e);
            }
        }
    })();

    // @ts-ignore
    res.json({ success: true, message: "Bulk sending started" });
});

httpServer.listen(port, () => {
    console.log(`> Backend Ready on http://localhost:${port}`);
});
