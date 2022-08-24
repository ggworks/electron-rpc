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
        this.onRpcMessage = (event, ...args) => {
            if (this.listener) {
                if (event.sender.id === this.remoteCtx.id) {
                    this.listener(...args);
                }
            }
        };
    }
    remoteContext() {
        return this.remoteCtx;
    }
    send(...args) {
        this.sender.send('rpc:message', ...args);
    }
    on(listener) {
        this.listener = listener;
        electron_1.ipcMain.on('rpc:message', this.onRpcMessage);
    }
    disconnect() {
        this.sender.send('rpc:disconnect');
    }
    onDisconnect(cb) {
        electron_1.ipcMain.on('rpc:disconnect', (event, ...args) => {
            console.log(`rpc:disconnect recieved`);
            if (event.sender.id === this.remoteCtx.id) {
                electron_1.ipcMain.off('rpc:message', this.onRpcMessage);
                cb();
            }
        });
        this.sender.on('destroyed', () => {
            electron_1.ipcMain.off('rpc:message', this.onRpcMessage);
            cb();
        });
    }
}
class Server extends rpc_1.RpcServer {
    constructor(id = 'rpc.electron.main') {
        super({ id });
        electron_1.ipcMain.on('rpc:hello', (event) => {
            const connection = new IpcConnection(event.sender);
            super.addConnection(connection);
            event.sender.send('rpc:hello');
            connection.onDisconnect(() => {
                super.onDisconnect(connection);
            });
        });
    }
}
exports.Server = Server;
