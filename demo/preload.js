const { contextBridge, ipcRenderer } = require("electron");

console.log("preload.js");

const ipc = {
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },

  on: (channel, listener) => {
    ipcRenderer.on(channel, (event, ...args) => {
      const ctx = event;
      listener(ctx, ...args);
    });
  },
};

contextBridge.exposeInMainWorld("ipcRenderer", ipc);
