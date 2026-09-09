const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { pathToFileURL } = require('url');

// Register the custom protocol as a standard web protocol
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'app',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            corsEnabled: true,
            bypassCSP: false
        }
    }
]);

let mainWindow;
let backendProcess;

function createWindow() {
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
        icon: path.join(__dirname, 'public/logo.png'),
        titleBarStyle: 'default',
        title: 'WA Manager'
    });

    // In production: load from the custom app protocol
    // In development: load from Next.js dev server
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadURL('app://wapp/');
    }

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[RENDERER] ${message} (${sourceId}:${line})`);
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

    backendProcess = spawn(backendCmd, backendArgs, {
        cwd: __dirname,
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
        // If it exited with error, maybe try to kill port 3001 if it's EADDRINUSE?
    });
}

app.on('ready', () => {
    // Handle the custom protocol
    protocol.handle('app', (request) => {
        const url = new URL(request.url);
        let pathname = url.pathname;
        if (pathname === '/' || pathname === '') {
            pathname = '/index.html';
        }
        const filePath = path.join(__dirname, 'out', pathname);
        return net.fetch(pathToFileURL(filePath).toString());
    });

    // Ensures that the taskbar uses the correct application icon on Windows
    if (process.platform === 'win32') {
        app.setAppUserModelId("com.wapp.manager");
    }

    try {
        startBackend();
    } catch (err) {
        console.error("Critical: Failed to start backend:", err);
    }

    setTimeout(() => {
        createWindow();
        // If we're debugging a "stuck" app, the dev tools are our best friend
        if (process.env.DEBUG_WAPP === 'true') {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        }
    }, 4000); // Increased to 4s for slower machines
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
