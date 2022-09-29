"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcClient = exports.RpcServer = exports.ProxyHelper = exports.markDynamicService = exports.createRpcService = void 0;
function isPromise(obj) {
    return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function';
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
        this.call(_, 'on', [event, cb]);
    }
    unlisten(_, event, cb) {
        this.call(_, 'off', [event, cb]);
    }
}
function createRpcService(service) {
    return new RpcService(service);
}
exports.createRpcService = createRpcService;
class DynamicServices {
    constructor() {
        this.nextId = 0;
        this.storage = {};
        this.ids = new WeakMap();
        this.connectionIds = new Map();
        this.services = new Map();
    }
    add(data, connection) {
        const { id, name } = this.save(data);
        this.storage[id].connections.add(connection);
        let idsOnConnection = this.connectionIds.get(connection);
        if (!idsOnConnection) {
            idsOnConnection = new Set();
            this.connectionIds.set(connection, idsOnConnection);
        }
        idsOnConnection.add(id);
        return { id, name };
    }
    registerService(name, service) {
        this.services.set(name, service);
    }
    get(name) {
        return this.services.get(name);
    }
    deref(id, connection) {
        const pointer = this.storage[id];
        if (pointer) {
            pointer.connections.delete(connection);
            if (pointer.connections.size === 0) {
                this.ids.delete(pointer.object);
                delete this.storage[id];
                const name = `__rpc_dyn__${id}`;
                this.services.delete(name);
                console.log(`DynamicServices delete ${id}`);
            }
        }
    }
    removeConnection(connection) {
        const ids = this.connectionIds.get(connection);
        if (ids) {
            ids.forEach((id) => {
                this.deref(id, connection);
            });
            this.connectionIds.delete(connection);
        }
    }
    save(data) {
        let id = this.ids.get(data);
        if (!id) {
            id = ++this.nextId;
            this.storage[id] = { object: data, connections: new Set() };
            this.ids.set(data, id);
        }
        const name = `__rpc_dyn__${id}`;
        return { id, name };
    }
}
function markDynamicService(data) {
    ;
    data.__rpc_dyn__ = true;
    return data;
}
exports.markDynamicService = markDynamicService;
class ObjectRegistry {
    constructor(cb) {
        this.objectCache = new Map();
        this.finalizationRegistry = new FinalizationRegistry((id) => {
            const ref = this.objectCache.get(id);
            if (ref !== undefined && ref.deref() === undefined) {
                this.objectCache.delete(id);
                console.log(`ObjectRegistry ${id}`);
                cb(id);
            }
        });
    }
    add(id, object) {
        const wr = new WeakRef(object);
        this.objectCache.set(id, wr);
        this.finalizationRegistry.register(object, id);
        console.log(`finalizationRegistry add ${id}`);
    }
    get(id) {
        const ref = this.objectCache.get(id);
        if (ref !== undefined) {
            const deref = ref.deref();
            if (deref !== undefined)
                return deref;
        }
    }
}
var ProxyHelper;
(function (ProxyHelper) {
    function asProxyService(data) {
        return data;
    }
    ProxyHelper.asProxyService = asProxyService;
    function createProxyService(caller, name, options) {
        return new Proxy({}, {
            get(target, propKey) {
                var _a;
                if (typeof propKey === 'string') {
                    if ((_a = options === null || options === void 0 ? void 0 : options.properties) === null || _a === void 0 ? void 0 : _a.has(propKey)) {
                        return options.properties.get(propKey);
                    }
                    //prevent resolve as thenable
                    if (propKey === 'then') {
                        return undefined;
                    }
                    if (propKey === 'on') {
                        return (event, cb) => {
                            return caller.listen(name, event, cb);
                        };
                    }
                    if (propKey === 'once') {
                        return (event, cb) => {
                            return caller.listen(name, event, cb, true);
                        };
                    }
                    if (propKey === 'off') {
                        return (event, cb) => {
                            return caller.unlisten(name, event, cb);
                        };
                    }
                    return (...args) => {
                        return caller.call(name, propKey, args);
                    };
                }
            },
        });
    }
    ProxyHelper.createProxyService = createProxyService;
})(ProxyHelper = exports.ProxyHelper || (exports.ProxyHelper = {}));
class RpcServer {
    constructor(ctx) {
        this.ctx = ctx;
        this.services = new Map();
        this.connections = new Set();
        this.activeRequests = new Map();
        this.eventHandlers = new Map();
        this.eventRoutes = new Map();
        this.connectionEvents = new Map();
        this.dynamicServices = new DynamicServices();
    }
    addConnection(connection) {
        this.connections.add(connection);
        connection.on((...arg) => {
            const [rpcType, id, ...args] = arg;
            this.onRawMessage(connection, rpcType, id, args);
        });
        this.activeRequests.set(connection, new Set());
        this.connectionEvents.set(connection, new Set());
    }
    onDisconnect(connection) {
        console.log(`onDisconnect`);
        this.connections.delete(connection);
        this.activeRequests.delete(connection);
        this.dynamicServices.removeConnection(connection);
        const eventKeys = this.connectionEvents.get(connection);
        if (eventKeys) {
            eventKeys.forEach((eventKey) => {
                const [service, event] = eventKey.split('.');
                try {
                    this.onEventUnlisten(connection, service, event);
                }
                catch (error) { }
            });
        }
        this.connectionEvents.delete(connection);
    }
    registerService(name, service) {
        this.services.set(name, service);
    }
    getService(service) {
        return service.startsWith('__rpc_') ? this.dynamicServices.get(service) : this.services.get(service);
    }
    call(ctx, service, method, args) {
        const handler = this.getService(service);
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
        const handler = this.getService(service);
        if (handler) {
            handler.listen(ctx, event, cb);
        }
        else {
            throw new Error(`service not found: ${service}`);
        }
    }
    unlisten(ctx, service, event, cb) {
        const handler = this.getService(service);
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
            case 100 /* RpcMessageType.Promise */: {
                const [service, method, args] = arg;
                return this.onPromise(connection, id, service, method, args);
            }
            case 102 /* RpcMessageType.EventListen */: {
                const [service, event, args] = arg;
                return this.onEventListen(connection, id, service, event, args);
            }
            case 103 /* RpcMessageType.EventUnlisten */: {
                const [service, event, args] = arg;
                return this.onEventUnlisten(connection, service, event, args);
            }
            case 110 /* RpcMessageType.ObjectDeref */: {
                const [_rpc, _deref, objectId] = arg;
                return this.onDeref(connection, objectId);
            }
        }
    }
    saveDynamicService(data, connection) {
        const { id, name } = this.dynamicServices.add(data, connection);
        if (!this.dynamicServices.get(name)) {
            if ('call' in data && typeof data['call'] === 'function') {
                this.dynamicServices.registerService(name, data);
            }
            else {
                this.dynamicServices.registerService(name, markDynamicService(createRpcService(data)));
            }
        }
        return { id, name };
    }
    onDeref(connection, objectId) {
        this.dynamicServices.deref(objectId, connection);
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
            if (this.activeRequests.has(connection)) {
                if (data && data.__rpc_dyn__) {
                    const dynamicService = this.saveDynamicService(data, connection);
                    this.sendResponse(connection, 201 /* RpcMessageType.PromiseSuccess */, id, {
                        data: dynamicService,
                        rpc: { dynamicId: dynamicService.id },
                    });
                }
                else {
                    this.sendResponse(connection, 201 /* RpcMessageType.PromiseSuccess */, id, { data });
                }
                (_a = this.activeRequests.get(connection)) === null || _a === void 0 ? void 0 : _a.delete(id);
            }
        }, (err) => {
            var _a;
            if (err instanceof Error) {
                if (this.activeRequests.has(connection)) {
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
            }
        });
    }
    onEventListen(connection, id, service, event, args) {
        var _a;
        const eventKey = `${service}.${event}`;
        (_a = this.connectionEvents.get(connection)) === null || _a === void 0 ? void 0 : _a.add(eventKey);
        const connections = this.eventRoutes.get(eventKey) || [];
        if (!connections.includes(connection)) {
            connections.push(connection);
            this.eventRoutes.set(eventKey, connections);
        }
        if (!this.eventHandlers.has(eventKey)) {
            const connectionHandlers = new Map();
            const handler = (data) => {
                if (this.connections.has(connection)) {
                    this.sendResponse(connection, 204 /* RpcMessageType.EventFire */, eventKey, [service, event, data]);
                }
            };
            connectionHandlers.set(connection, handler);
            this.eventHandlers.set(eventKey, connectionHandlers);
            this.listen(connection.remoteContext(), service, event, handler);
        }
        else {
            const connectionHandlers = this.eventHandlers.get(eventKey);
            const handler = (data) => {
                this.sendResponse(connection, 204 /* RpcMessageType.EventFire */, eventKey, [service, event, data]);
            };
            connectionHandlers.set(connection, handler);
            this.eventHandlers.set(eventKey, connectionHandlers);
        }
        return;
    }
    onEventUnlisten(connection, service, event, args) {
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
        this.requestId = 0;
        this.handlers = new Map();
        this.connection.on((...arg) => {
            const [rpcType, id, ...args] = arg;
            this.onRawMessage(rpcType, id, ...args);
        });
        this.objectRegistry = new ObjectRegistry((id) => {
            this.connection.send(110 /* RpcMessageType.ObjectDeref */, ++this.requestId, 'rpc', 'deref', id);
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
        const id = ++this.requestId;
        const rpcType = 100 /* RpcMessageType.Promise */;
        const promise = new Promise((resolve, reject) => {
            this.connection.send(rpcType, id, service, method, arg);
            const handler = (type, id, rawResponse) => {
                switch (type) {
                    case 201 /* RpcMessageType.PromiseSuccess */:
                        {
                            this.handlers.delete(id);
                            const response = rawResponse;
                            if (response.rpc) {
                                const { name } = response.data;
                                const { dynamicId } = response.rpc;
                                const properties = new Map();
                                properties.set('__rpc__', {
                                    dynamicId: dynamicId,
                                    name: name,
                                });
                                let proxyService = this.objectRegistry.get(dynamicId);
                                if (!proxyService) {
                                    proxyService = ProxyHelper.createProxyService(this, name, { properties });
                                    this.objectRegistry.add(dynamicId, proxyService);
                                }
                                resolve(proxyService);
                            }
                            else {
                                resolve(response.data);
                            }
                        }
                        break;
                    case 202 /* RpcMessageType.PromiseError */:
                        {
                            this.handlers.delete(id);
                            const response = rawResponse;
                            const error = new Error(response.message);
                            error.stack = response.stack;
                            error.name = response.name;
                            reject(response);
                        }
                        break;
                    case 203 /* RpcMessageType.PromiseErrorObject */:
                        {
                            this.handlers.delete(id);
                            reject(rawResponse);
                        }
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
            case 203 /* RpcMessageType.PromiseErrorObject */: {
                const [data] = arg;
                const handler = this.handlers.get(id);
                handler === null || handler === void 0 ? void 0 : handler(type, id, data);
                break;
            }
            case 204 /* RpcMessageType.EventFire */: {
                const [service, event, data] = arg[0];
                this.onEventFire(service, event, data);
                break;
            }
        }
    }
}
exports.RpcClient = RpcClient;
