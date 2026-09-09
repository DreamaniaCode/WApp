const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const util = require('util');

const userDataPath = app.getPath('userData');
const logPath = path.join(userDataPath, 'main.log');
const logFile = fs.createWriteStream(logPath, { flags: 'w' });
const logStdout = process.stdout;

console.log = function () {
  const msg = util.format.apply(null, arguments);
  logFile.write(msg + '\n');
  logStdout.write(msg + '\n');
};
console.error = function () {
  const msg = util.format.apply(null, arguments);
  logFile.write(msg + '\n');
  logStdout.write(msg + '\n');
};

console.log("Log file path:", logPath);
console.log("App Path:", app.getAppPath());
console.log("UserData Path:", userDataPath);

// Ensure production environment for Next.js
process.env.NODE_ENV = 'production';

// Ensure SQLite DB exists in UserData directory (read-write)
const dbPath = path.join(userDataPath, 'dev.db');
const defaultDbPath = path.join(app.getAppPath(), 'dev.db');
if (!fs.existsSync(dbPath)) {
  if (fs.existsSync(defaultDbPath)) {
    try {
      fs.copyFileSync(defaultDbPath, dbPath);
      console.log("Copied initial dev.db to UserData:", dbPath);
    } catch (err) {
      console.error("Failed to copy dev.db to UserData:", err);
    }
  } else {
    console.log("No initial dev.db found to copy, new SQLite DB will be created at:", dbPath);
  }
}
process.env.DATABASE_URL = `file:${dbPath}`;
console.log("DATABASE_URL set to:", process.env.DATABASE_URL);

// Set data paths for WhatsApp sessions inside UserData directory
process.env.WAPP_DATA_PATH = process.env.WAPP_DATA_PATH || path.join(userDataPath, 'wapp-data');
process.env.WWEBJS_DATA_PATH = process.env.WWEBJS_DATA_PATH || path.join(userDataPath, '.wwebjs_auth');

// Fix CWD so Next.js finds .next folder
try {
  const appDir = app.getAppPath().endsWith('.asar') ? path.dirname(app.getAppPath()) : app.getAppPath();
  process.chdir(appDir);
  console.log("Changed CWD to:", process.cwd());
} catch (err) {
  console.error("Failed to change CWD:", err);
}

let mainWindow;
let splashWindow;
const PORT = process.env.PORT || 3000;
const HOST = '127.0.0.1';

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    alwaysOnTop: true,
    transparent: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    resizable: false,
    center: true
  });

  splashWindow.loadFile(path.join(__dirname, 'shell', 'splash.html'));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      role: 'window'
    },
  });

  const startUrl = `http://${HOST}:${PORT}`;
  mainWindow.loadURL(startUrl).catch(err => {
    console.error("Failed to load URL:", err);
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
    }
    mainWindow.show();
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

let retryCount = 0;
const MAX_RETRIES = 60; // 60 retries * 500ms = 30s timeout

function checkServerReady(callback) {
  const req = http.get(`http://${HOST}:${PORT}`, (res) => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      callback();
    } else {
      retryCount++;
      if (retryCount >= MAX_RETRIES) {
        handleServerError("Backend server responded with status code: " + res.statusCode);
      } else {
        setTimeout(() => checkServerReady(callback), 500);
      }
    }
  });

  req.on('error', (err) => {
    retryCount++;
    if (retryCount >= MAX_RETRIES) {
      handleServerError("Could not connect to backend server: " + err.message);
    } else {
      setTimeout(() => checkServerReady(callback), 500);
    }
  });
  req.end();
}

function handleServerError(message) {
  console.error("Server health check failed:", message);
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  dialog.showErrorBox(
    "Application Launch Error",
    `Failed to start application backend.\n\nError: ${message}\n\nLog file location: ${logPath}`
  );
  app.quit();
}

app.whenReady().then(() => {
  createSplashWindow();

  if (process.env.DEV_MODE !== 'true') {
    try {
      console.log("Starting backend...");
      process.env.PORT = PORT;
      require('./dist/backend.js');
    } catch (err) {
      console.error("Failed to start backend:", err);
      handleServerError("Failed to require backend.js: " + err.message);
      return;
    }
  } else {
    console.log("Dev mode: skipping backend start in electron");
  }

  checkServerReady(() => {
    console.log("Server is ready!");
    createMainWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', function () {
  if (mainWindow === null) {
    createMainWindow();
  }
});
