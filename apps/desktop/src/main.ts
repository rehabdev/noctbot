import path from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, screen } from "electron";
import { registerWorkspace } from "./workspace";

const pagePath = path.join(__dirname, "../src/index.html");

function createWindow() {
  const {
    x,
    y,
    width: workAreaWidth,
    height: workAreaHeight,
  } = screen.getPrimaryDisplay().workArea;
  const width = Math.floor(workAreaWidth * 0.75);
  const height = Math.floor(workAreaHeight * 0.75);

  const window = new BrowserWindow({
    width,
    height,
    x: x + Math.floor((workAreaWidth - width) / 2),
    y: y + Math.floor((workAreaHeight - height) / 2),
    frame: false,
    backgroundColor: "#050505",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  void window.loadFile(pagePath);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.whenReady().then(() => {
    registerWorkspace(
      pathToFileURL(pagePath).href,
      path.join(app.getPath("userData"), "workspace.sqlite"),
    );
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
