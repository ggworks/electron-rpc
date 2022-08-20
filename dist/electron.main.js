"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Server = void 0;
const rpc_1 = require("./rpc");
const electron_1 = require("electron");
const createContext = (id) => {
    return { id };
};
class IpcConnection {
    constructor(sender) {
        this.sender = sender;
        this.remoteCtx = createContext(sender.id);
    }
    remoteContext() {
        return this.remoteCtx;
    }
    send(...args) {
        this.sender.send('rpc:message', ...args);
    }
    on(listener) {
        electron_1.ipcMain.on('rpc:message', (event, ...args) => {
            listener(...args);
        });
    }
}
class Server extends rpc_1.RpcServer {
    constructor() {
        super({ id: 'main' });
        electron_1.ipcMain.on('rpc:hello', (event, ...args) => {
            this.onClientHello(event.sender);
            event.sender.send('rpc:hello');
        });
    }
    onClientHello(sender) {
        super.addConnection(new IpcConnection(sender));
    }
}
exports.Server = Server;
