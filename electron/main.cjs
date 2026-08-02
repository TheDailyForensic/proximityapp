const { app, BrowserWindow, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const http = require("http");

let serverProcess = null;
let mainWindow = null;

const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

// dist/server.cjs is the already-bundled Express backend (built by "npm run build").
// In a packaged app it ships as an extraResource; in dev it's just the repo's dist/ folder.
function resolveServerEntry() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "dist", "server.cjs")
    : path.join(__dirname, "..", "dist", "server.cjs");
}

function waitForServer(url, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const attempt = () => {
      http
        .get(url, (res) => {
          res.destroy();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) {
            reject(new Error("Timed out waiting for the local server to start"));
          } else {
            setTimeout(attempt, 300);
          }
        });
    };
    attempt();
  });
}

function startServer() {
  const serverEntry = resolveServerEntry();

  // Run the bundled server with Electron's own Node runtime (ELECTRON_RUN_AS_NODE)
  // so end users don't need Node.js installed separately.
  serverProcess = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      ELECTRON_RUN_AS_NODE: "1",
    },
    stdio: "inherit",
  });

  serverProcess.on("exit", (code) => {
    console.log(`Backend server exited with code ${code}`);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: "#09090b",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(SERVER_URL);

  // Anything trying to open a new window (e.g. an external lyrics link) opens in the
  // OS's default browser instead of inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(async () => {
  startServer();

  try {
    await waitForServer(SERVER_URL);
  } catch (err) {
    console.error("Backend server did not come up in time:", err);
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});
