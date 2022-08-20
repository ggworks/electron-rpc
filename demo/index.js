const { app, BrowserWindow, webContents } = require("electron");
const EventEmitter = require("events");
const path = require("path");
const { Server } = require("../main");

class WindowService {
  constructor() {
    this._events = {};
  }
  getBrowser(ctx) {
    const { id } = ctx;
    const browser = BrowserWindow.fromWebContents(webContents.fromId(id));
    if (browser) {
      if (!this._events[browser.id]) {
        const event = new EventEmitter();
        this._events[browser.id] = event;
        browser.on("blur", () => {
          event.emit("blur");
        });
        browser.on("focus", () => {
          event.emit("focus");
        });
        browser.on("resize", () => {
          event.emit("resize", browser.getBounds());
        });
      }
    }
    return browser;
  }
  call(ctx, method, args) {
    const browser = this.getBrowser(ctx);
    switch (method) {
      case "minimize":
        return browser === null || browser === void 0
          ? void 0
          : browser.minimize();
      case "maximize":
        return browser === null || browser === void 0
          ? void 0
          : browser.maximize();
      case "restore":
        return browser === null || browser === void 0
          ? void 0
          : browser.restore();
    }
    throw new Error(`method not found: ${method}`);
  }
  listen(ctx, event, cb) {
    const browser = this.getBrowser(ctx);
    if (browser) {
      switch (event) {
        case "blur":
          this._events[browser.id].on("blur", cb);
          break;
        case "focus":
          this._events[browser.id].on("focus", cb);
          break;
        case "resize":
          this._events[browser.id].on("resize", cb);
          break;
      }
    }
  }
  unlisten(ctx, event, cb) {
    const browser = this.getBrowser(ctx);
    if (browser) {
      switch (event) {
        case "blur":
          this._events[browser.id].off("blur", cb);
          break;
        case "focus":
          this._events[browser.id].off("focus", cb);
          break;
        case "resize":
          this._events[browser.id].off("resize", cb);
          break;
      }
    }
  }
}

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  win.loadFile("index.html");
//   win.webContents.openDevTools({ mode: "detach" });
};

let rpc = new Server();

app.whenReady().then(() => {
  rpc.registerService("window", new WindowService());

  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
