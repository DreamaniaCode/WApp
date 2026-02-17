const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const util = require('util');

const logPath = path.join(app.getPath('userData'), 'main.log');
const logFile = fs.createWriteStream(logPath, { flags: 'w' });
const logStdout = process.stdout;

console.log = function () {
  logFile.write(util.format.apply(null, arguments) + '\n');
  logStdout.write(util.format.apply(null, arguments) + '\n');
};
console.error = function () {
  logFile.write(util.format.apply(null, arguments) + '\n');
  logStdout.write(util.format.apply(null, arguments) + '\n');
};

console.log("Log file path:", logPath);
console.log("App Path:", app.getAppPath());
console.log("UserData Path:", app.getPath('userData'));

// FIX: Ensure production environment for Next.js
process.env.NODE_ENV = 'production';
// FIX: Set CWD to app path so Next.js finds .next folder
try {
  process.chdir(app.getAppPath());
  console.log("Changed CWD to:", process.cwd());
} catch (err) {
  console.error("Failed to change CWD:", err);
}

let mainWindow;
let splashWindow;
const PORT = 3000;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    alwaysOnTop: true,
    transparent: false, // Set to true if you want transparency
    webPreferences: {
      nodeIntegration: true, // For current splash.html script
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
    show: false, // Wait until ready to show
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      role: 'window'
    },
  });

  const startUrl = 'http://localhost:' + PORT;
  mainWindow.loadURL(startUrl).catch(err => {
    console.error("Failed to load URL:", err);
  });

  // Handle external links in main window too
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow.show();
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function checkServerReady(callback) {
  const req = http.get('http://localhost:' + PORT, (res) => {
    if (res.statusCode === 200) {
      callback();
    } else {
      setTimeout(() => checkServerReady(callback), 500);
    }
  });

  req.on('error', (err) => {
    setTimeout(() => checkServerReady(callback), 1000);
  });
  req.end();
}

app.whenReady().then(() => {
  createSplashWindow();

  // Start Backend
  try {
    console.log("Starting backend...");
    process.env.PORT = PORT; // Ensure port is set
    require('./dist/backend.js');
  } catch (err) {
    console.error("Failed to start backend:", err);
  }

  // Wait for server to be ready
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
