const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');

// Enforce single instance so multiple clicks don't spawn duplicate instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    // Secondary instance: immediately exit without triggering quit cleanup hooks on the primary instance
    app.exit(0);
}

let mainWindow;
let backendProcess;
let isAppQuitting = false;
let backendStarted = false;

const SPLASH_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Starting WApp Manager Pro...</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: #0a0e1a;
    color: #f8fafc;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    user-select: none;
    overflow: hidden;
  }
  .card {
    text-align: center;
    padding: 44px 36px;
    border-radius: 24px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    max-width: 440px;
    width: 90%;
  }
  .spinner {
    width: 52px;
    height: 52px;
    margin: 0 auto 24px;
    border: 3.5px solid rgba(99, 102, 241, 0.15);
    border-top-color: #6366f1;
    border-right-color: #a855f7;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  h1 {
    margin: 0 0 8px;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
    background: linear-gradient(135deg, #60a5fa 0%, #a855f7 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  p {
    margin: 0;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.5;
  }
  .badge {
    display: inline-block;
    margin-top: 16px;
    padding: 4px 12px;
    border-radius: 9999px;
    font-size: 11px;
    font-weight: 600;
    color: #60a5fa;
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
  }
</style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>WApp Manager Leads Pro</h1>
    <p>Starting WhatsApp engine &amp; UI services...</p>
    <div class="badge">Enterprise Edition v2026.17.0</div>
  </div>
</body>
</html>
`)}`;

function createWindow() {
    let appIcon = null;
    const icoPath = path.join(__dirname, 'public/icon.ico');
    const pngPath = path.join(__dirname, 'public/logo.png');

    try {
        if (fs.existsSync(icoPath)) {
            appIcon = nativeImage.createFromPath(icoPath);
        } else if (fs.existsSync(pngPath)) {
            appIcon = nativeImage.createFromPath(pngPath);
        }
    } catch (_) {}

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 900,
        minHeight: 600,
        backgroundColor: '#0a0e1a',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js')
        },
        icon: appIcon || (fs.existsSync(icoPath) ? icoPath : pngPath),
        titleBarStyle: 'default',
        title: 'WApp Manager Leads Pro v2026.17.0 – Enterprise Edition [ DreamaniaCode ]'
    });

    // Show beautiful branded dark-theme splash card while backend boots
    mainWindow.loadURL(SPLASH_HTML);

    // Actively poll until http://localhost:3001 is healthy, then load the full Next.js UI
    let isAppLoaded = false;
    const pollBackend = () => {
        if (isAppLoaded || !mainWindow || mainWindow.isDestroyed()) return;

        http.get('http://localhost:3001/api/health', (res) => {
            if (res.statusCode === 200 && !isAppLoaded && mainWindow && !mainWindow.isDestroyed()) {
                isAppLoaded = true;
                mainWindow.loadURL('http://localhost:3001');
            } else if (!isAppLoaded) {
                setTimeout(pollBackend, 500);
            }
        }).on('error', () => {
            if (!isAppLoaded) {
                setTimeout(pollBackend, 500);
            }
        });
    };

    setTimeout(pollBackend, 300);

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function findBrowser() {
    const candidates = [
        // Windows
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google/Chrome/Application/chrome.exe"),
        process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Google/Chrome/Application/chrome.exe"),
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Microsoft/Edge/Application/msedge.exe"),
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
        // macOS
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        path.join(require('os').homedir(), "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        // Linux
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium"
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
        backendCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
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
        backendProcess = null;
        backendStarted = false;
        if (!isAppQuitting) {
            logStream.write(`[BACKEND] Backend exited unexpectedly while app is running. Respawning in 2s...\n`);
            setTimeout(() => {
                if (!isAppQuitting && !backendProcess) {
                    ensureBackendStarted();
                }
            }, 2000);
        }
    });
}

function ensureBackendStarted() {
    if (backendStarted) return;
    backendStarted = true;
    killStalePortProcesses(3001);
    try {
        startBackend();
    } catch (err) {
        console.error("Critical: Failed to start backend:", err);
    }
}

app.on('second-instance', () => {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

function killStalePortProcesses(targetPort = 3001) {
    if (process.platform === 'win32') {
        try {
            const { execSync } = require('child_process');
            const myPid = process.pid;
            const backendPid = backendProcess ? backendProcess.pid : 0;
            execSync(`powershell -NoProfile -NonInteractive -Command "Get-NetTCPConnection -LocalPort ${targetPort} -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -ne ${myPid} -and $_.OwningProcess -ne ${backendPid} } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }"`, { timeout: 4000 });
        } catch (_) {}
    } else {
        try {
            const { execSync } = require('child_process');
            execSync(`lsof -ti :${targetPort} | xargs kill -9 2>/dev/null || true`, { timeout: 4000 });
        } catch (_) {}
    }
}

app.on('ready', () => {
    // Ensures that the taskbar uses the correct application icon on Windows
    if (process.platform === 'win32') {
        app.setAppUserModelId("com.wapp.manager");
    }

    createWindow();

    let checked = false;
    const onCheckFinish = (isOnline) => {
        if (checked) return;
        checked = true;
        if (!isOnline) {
            ensureBackendStarted();
        } else {
            console.log("Backend already active on port 3001.");
        }
    };

    const checkReq = http.get('http://localhost:3001/api/health', (res) => {
        onCheckFinish(res.statusCode === 200);
    });

    checkReq.on('error', () => {
        onCheckFinish(false);
    });

    checkReq.setTimeout(800, () => {
        checkReq.destroy();
        onCheckFinish(false);
    });
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        isAppQuitting = true;
        app.quit();
    }
});

app.on('before-quit', () => {
    isAppQuitting = true;
});

app.on('quit', () => {
    isAppQuitting = true;
    if (backendProcess && backendProcess.pid) {
        try {
            if (process.platform === 'win32') {
                spawn('taskkill', ['/F', '/T', '/PID', backendProcess.pid]);
            } else {
                backendProcess.kill('SIGKILL');
            }
        } catch (e) {
            try { backendProcess.kill(); } catch (_) {}
        }
    }
    if (process.platform === 'win32') {
        try {
            const { exec } = require('child_process');
            exec('powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_Process -Filter \\"name = \'chrome.exe\'\\" | Where-Object { $_.CommandLine -like \'*wwebjs_auth*\' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"', () => {});
        } catch (_) {}
    } else {
        try {
            const { exec } = require('child_process');
            exec("pkill -f 'wwebjs_auth' 2>/dev/null || true", () => {});
        } catch (_) {}
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
