"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Client = void 0;
const rpc_1 = require("./rpc");
const createContext = (id) => {
    return { id };
};
class IpcConnection {
    constructor(ipcRenderer, remoteId) {
        this.ipcRenderer = ipcRenderer;
        this.remoteCtx = createContext(remoteId);
    }
    remoteContext() {
        return this.remoteCtx;
    }
    send(...args) {
        this.ipcRenderer.send('rpc:message', ...args);
    }
    on(listener) {
        this.ipcRenderer.on('rpc:message', (event, ...args) => {
            listener(...args);
        });
    }
}
class Client extends rpc_1.RpcClient {
    constructor(ipcRenderer, events) {
        super(new IpcConnection(ipcRenderer, 'rpc:main'), events);
        ipcRenderer.send('rpc:hello');
        ipcRenderer.on('rpc:hello', () => {
            console.log(`Client get rpc:hello`);
        });
    }
}
exports.Client = Client;
