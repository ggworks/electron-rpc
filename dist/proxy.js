"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createProxyService = void 0;
function createProxyService(caller, name) {
    return new Proxy({}, {
        get(target, propKey) {
            if (typeof propKey === 'string') {
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
exports.createProxyService = createProxyService;
