const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

let mainWindow;
let backendProcess;

function createWindow() {
    const iconPath = process.platform === 'win32' && fs.existsSync(path.join(__dirname, 'public/icon.ico'))
        ? path.join(__dirname, 'public/icon.ico')
        : path.join(__dirname, 'public/logo.png');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0a0e1a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: iconPath,
        titleBarStyle: 'default',
        title: 'WA Manager Pro v2026.4.0'
    });

    mainWindow.loadURL('http://localhost:3001').catch(() => {
        const indexPath = path.join(__dirname, 'out', 'index.html');
        mainWindow.loadFile(indexPath);
    });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function findBrowser() {
    const candidates = [
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
        process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe"),
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft/Edge/Application/msedge.exe"),
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }
    return undefined;
}

function startBackend() {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath, { recursive: true });

    const logPath = path.join(userDataPath, 'wapp-debug.log');
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });

    const wappDataPath = path.join(userDataPath, 'data');
    if (!fs.existsSync(wappDataPath)) fs.mkdirSync(wappDataPath, { recursive: true });

    const wwebjsDataPath = path.join(userDataPath, '.wwebjs_auth');
    const chromePath = findBrowser();

    const backendEnv = {
        ...process.env,
        WAPP_DATA_PATH: wappDataPath,
        WWEBJS_DATA_PATH: wwebjsDataPath,
        CHROME_PATH: chromePath,
        ELECTRON_RUN_AS_NODE: '1'
    };

    let backendCmd;
    let backendArgs;

    if (process.env.NODE_ENV === 'development') {
        backendCmd = 'npm.cmd'; // Use .cmd for Windows
        backendArgs = ['run', 'backend'];
    } else {
        backendCmd = process.execPath;
        backendArgs = [path.join(__dirname, 'backend.js')];
    }

    logStream.write(`\n\n--- Starting Backend: ${new Date().toISOString()} ---\n`);
    logStream.write(`Command: ${backendCmd} ${backendArgs.join(' ')}\n`);
    logStream.write(`Chrome Path: ${chromePath || 'Not Found'}\n`);

    const runCwd = process.env.NODE_ENV === 'development' ? __dirname : path.dirname(process.execPath);

    backendProcess = spawn(backendCmd, backendArgs, {
        cwd: runCwd,
        env: backendEnv,
        windowsHide: true,
        shell: process.env.NODE_ENV === 'development' // Only use shell in dev
    });

    backendProcess.stdout.on('data', (data) => logStream.write(`[BACKEND] ${data}`));
    backendProcess.stderr.on('data', (data) => logStream.write(`[BACKEND ERR] ${data}`));

    backendProcess.on('error', (err) => {
        logStream.write(`[BACKEND PROCESS ERROR] ${err.message}\n`);
    });

    backendProcess.on('exit', (code) => {
        logStream.write(`[BACKEND] exited with code ${code}\n`);
    });
}

function waitForBackendAndCreateWindow(maxWaitMs = 12000) {
    const startTime = Date.now();
    const interval = setInterval(() => {
        const req = http.get('http://localhost:3001/api/health', (res) => {
            if (res.statusCode === 200) {
                clearInterval(interval);
                if (!mainWindow) {
                    createWindow();
                    if (process.env.DEBUG_WAPP === 'true') {
                        mainWindow.webContents.openDevTools({ mode: 'detach' });
                    }
                }
            }
        });
        req.on('error', () => {
            if (Date.now() - startTime > maxWaitMs) {
                clearInterval(interval);
                if (!mainWindow) {
                    createWindow();
                    if (process.env.DEBUG_WAPP === 'true') {
                        mainWindow.webContents.openDevTools({ mode: 'detach' });
                    }
                }
            }
        });
        req.setTimeout(500, () => req.destroy());
    }, 400);
}

app.on('ready', () => {
    // Ensures that the taskbar uses the correct application icon on Windows
    if (process.platform === 'win32') {
        app.setAppUserModelId("com.wapp.manager");
    }

    const checkReq = http.get('http://localhost:3001/api/health', (res) => {
        console.log("Backend already running on port 3001, opening window directly.");
        createWindow();
        if (process.env.DEBUG_WAPP === 'true') {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    });

    checkReq.on('error', () => {
        console.log("Backend not detected on 3001, launching backend process...");
        try {
            startBackend();
        } catch (err) {
            console.error("Critical: Failed to start backend:", err);
        }
        waitForBackendAndCreateWindow();
    });

    checkReq.setTimeout(800, () => {
        checkReq.destroy();
    });
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('quit', () => {
    if (backendProcess) {
        try {
            // Kill the process tree on Windows
            spawn('taskkill', ['/F', '/T', '/PID', backendProcess.pid]);
        } catch (e) {
            backendProcess.kill();
        }
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
