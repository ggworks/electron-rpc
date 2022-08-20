# electron-rpc

`electron-rpc` is an module that enables RPC style remote API call for electron.

supports:

- compile-time type check
- auto promisefied API interface
- event listen/unlisten


## Quick Start

main process
```js
let rpc = new Server();
rpc.registerService("window", new WindowService());
rpc.registerService("app", createRpcService(new MyShell()));
```

renderer process

```js
//setup client
const { Client, createProxyService } = require("electron-rpc/renderer");
const EventEmitter = require("eventemitter3");
const _client = new Client(window.ipcRenderer, new EventEmitter());
const rpc = {
  toService: (name) => {
    return createProxyService(_client, name);
  },
};

//use service
const windowService = rpc.toService("window");
windowService.maximize();
windowService.on("resize", (rect) => {
    console.log(rect);
});

```

