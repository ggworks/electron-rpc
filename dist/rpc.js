"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcClient = exports.RpcServer = exports.createRpcService = void 0;
function isPromise(obj) {
    return !!obj && (typeof obj === "object" || typeof obj === "function") && typeof obj.then === "function";
}
class RpcService {
    constructor(service) {
        this.service = service;
    }
    call(_, method, args) {
        const handler = this.service;
        const target = handler[method];
        if (typeof target === 'function') {
            return target.apply(handler, args);
        }
        else {
            throw new Error(`method not found: ${method}`);
        }
    }
    listen(_, event, cb) {
        this.call(_, "on", [event, cb]);
    }
    unlisten(_, event, cb) {
        this.call(_, "off", [event, cb]);
    }
}
function createRpcService(service) {
    return new RpcService(service);
}
exports.createRpcService = createRpcService;
class RpcServer {
    constructor(ctx) {
        this.ctx = ctx;
        this.services = new Map();
        this.connections = new Set();
        this.activeRequests = new Map();
        this.eventHandlers = new Map();
        this.eventRoutes = new Map();
    }
    addConnection(connection) {
        this.connections.add(connection);
        connection.on((...arg) => {
            const [rpcType, id, ...args] = arg;
            this.onRawMessage(connection, rpcType, id, args);
        });
        this.activeRequests.set(connection, new Set);
    }
    registerService(name, service) {
        this.services.set(name, service);
    }
    call(ctx, service, method, args) {
        const handler = this.services.get(service);
        if (handler) {
            let res = handler.call(ctx, method, args);
            if (!isPromise(res)) {
                res = Promise.resolve(res);
            }
            return res;
        }
        else {
            throw new Error(`service not found: ${service}`);
        }
    }
    listen(ctx, service, event, cb) {
        const handler = this.services.get(service);
        if (handler) {
            handler.listen(ctx, event, cb);
        }
        else {
            throw new Error(`service not found: ${service}`);
        }
    }
    unlisten(ctx, service, event, cb) {
        const handler = this.services.get(service);
        if (handler) {
            handler.unlisten(ctx, event, cb);
        }
        else {
            throw new Error(`service not found: ${service}`);
        }
    }
    onRawMessage(connection, rpcType, id, arg) {
        const type = rpcType;
        switch (type) {
            case 100 /* RpcMessageType.Promise */:
                {
                    const [service, method, args] = arg;
                    return this.onPromise(connection, id, service, method, args);
                }
            case 102 /* RpcMessageType.EventListen */:
                {
                    const [service, event, args] = arg;
                    return this.onEventListen(connection, id, service, event, args);
                }
            case 103 /* RpcMessageType.EventUnlisten */:
                {
                    const [service, event, args] = arg;
                    return this.onEventUnlisten(connection, id, service, event, args);
                }
        }
    }
    onPromise(connection, id, service, method, args) {
        var _a;
        let promise;
        (_a = this.activeRequests.get(connection)) === null || _a === void 0 ? void 0 : _a.add(id);
        try {
            promise = this.call(connection.remoteContext(), service, method, args);
        }
        catch (err) {
            promise = Promise.reject(err);
        }
        promise.then((data) => {
            var _a;
            this.sendResponse(connection, 201 /* RpcMessageType.PromiseSuccess */, id, data);
            (_a = this.activeRequests.get(connection)) === null || _a === void 0 ? void 0 : _a.delete(id);
        }, (err) => {
            var _a;
            if (err instanceof Error) {
                this.sendResponse(connection, 202 /* RpcMessageType.PromiseError */, id, {
                    message: err.message,
                    name: err.name,
                    stack: err.stack ? (err.stack.split ? err.stack.split('\n') : err.stack) : undefined,
                });
            }
            else {
                this.sendResponse(connection, 203 /* RpcMessageType.PromiseErrorObject */, id, err);
            }
            (_a = this.activeRequests.get(connection)) === null || _a === void 0 ? void 0 : _a.delete(id);
        });
    }
    onEventListen(connection, id, service, event, args) {
        const eventKey = `${service}.${event}`;
        const connections = this.eventRoutes.get(eventKey) || [];
        if (!connections.includes(connection)) {
            connections.push(connection);
            this.eventRoutes.set(eventKey, connections);
        }
        if (!this.eventHandlers.has(eventKey)) {
            const connectionHandlers = new Map();
            const handler = (data) => {
                this.sendResponse(connection, 204 /* RpcMessageType.EventFire */, eventKey, [service, event, data]);
            };
            connectionHandlers.set(connection, handler);
            this.eventHandlers.set(eventKey, connectionHandlers);
            this.listen(connection.remoteContext(), service, event, handler);
        }
        return;
    }
    onEventUnlisten(connection, id, service, event, args) {
        const eventKey = `${service}.${event}`;
        const connectionHandlers = this.eventHandlers.get(eventKey);
        if (connectionHandlers) {
            const handler = connectionHandlers.get(connection);
            if (handler) {
                this.unlisten(connection.remoteContext(), service, event, handler);
                connectionHandlers.delete(connection);
            }
        }
        const connections = this.eventRoutes.get(eventKey);
        if (connections) {
            connections.splice(connections.indexOf(connection), 1);
            this.eventRoutes.set(eventKey, connections);
            if (!connections.length) {
                this.eventRoutes.delete(eventKey);
                this.eventHandlers.delete(eventKey);
            }
        }
    }
    sendResponse(connection, type, id, data) {
        connection.send(type, id, data);
    }
}
exports.RpcServer = RpcServer;
class RpcClient {
    constructor(connection, _events) {
        this.connection = connection;
        this._events = _events;
        this.requestId = 1;
        this.handlers = new Map();
        this.connection.on((...arg) => {
            const [rpcType, id, ...args] = arg;
            this.onRawMessage(rpcType, id, ...args);
        });
    }
    call(service, method, arg) {
        return this.requestPromise(service, method, arg);
    }
    listen(service, event, cb, once) {
        const eventKey = `${service}.${event}`;
        if (once) {
            this._events.once(eventKey, cb);
        }
        else {
            this._events.on(eventKey, cb);
        }
        const isFirstOne = this._events.listenerCount(eventKey) === 1;
        if (isFirstOne) {
            this.requestEventListen(service, event);
        }
    }
    unlisten(service, event, cb) {
        const eventKey = `${service}.${event}`;
        this._events.off(eventKey, cb);
        const isLastOne = this._events.listenerCount(eventKey) === 0;
        if (isLastOne) {
            this.requestEventUnlisten(service, event);
        }
    }
    requestPromise(service, method, arg) {
        const id = this.requestId++;
        const rpcType = 100 /* RpcMessageType.Promise */;
        const promise = new Promise((resolve, reject) => {
            this.connection.send(rpcType, id, service, method, arg);
            const handler = (type, id, data) => {
                switch (type) {
                    case 201 /* RpcMessageType.PromiseSuccess */:
                        this.handlers.delete(id);
                        resolve(data);
                        break;
                    case 202 /* RpcMessageType.PromiseError */:
                        this.handlers.delete(id);
                        const error = new Error(data.message);
                        error.stack = data.stack;
                        error.name = data.name;
                        reject(data);
                        break;
                    case 203 /* RpcMessageType.PromiseErrorObject */:
                        this.handlers.delete(id);
                        reject(data);
                        break;
                }
            };
            this.handlers.set(id, handler);
        });
        return promise;
    }
    requestEventListen(service, event, arg) {
        const id = this.requestId++;
        const rpcType = 102 /* RpcMessageType.EventListen */;
        this.connection.send(rpcType, id, service, event, arg);
    }
    requestEventUnlisten(service, event, arg) {
        const id = this.requestId++;
        const rpcType = 103 /* RpcMessageType.EventUnlisten */;
        this.connection.send(rpcType, id, service, event, arg);
    }
    onEventFire(service, event, data) {
        this._events.emit(`${service}.${event}`, data);
    }
    onRawMessage(rpcType, id, ...arg) {
        const type = rpcType;
        switch (type) {
            case 201 /* RpcMessageType.PromiseSuccess */:
            case 202 /* RpcMessageType.PromiseError */:
            case 203 /* RpcMessageType.PromiseErrorObject */:
                {
                    const [data] = arg;
                    const handler = this.handlers.get(id);
                    handler === null || handler === void 0 ? void 0 : handler(type, id, data);
                    break;
                }
            case 204 /* RpcMessageType.EventFire */:
                {
                    const [service, event, data] = arg[0];
                    this.onEventFire(service, event, data);
                    break;
                }
        }
    }
}
exports.RpcClient = RpcClient;
