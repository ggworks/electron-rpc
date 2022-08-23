# electron-rpc

`electron-rpc` is an module that enables RPC style remote API call for electron.

supports:

- compile-time type check
- auto promisefied API interface
- event listen/unlisten
- dynamic service object creation and lifetime management
- support electron sanbox


## Quick Start

main process
```js
let rpc = new Server();
rpc.registerService("window", new WindowService());
```

renderer process

```js
//setup client
const { Client, ProxyHelper } = require("electron-rpc/renderer");
const EventEmitter = require("eventemitter3");
const _client = new Client(window.ipcRenderer, new EventEmitter());
const rpc = {
  toService: (name) => {
    return ProxyHelper.createProxyService(_client, name);
  },
};

//use service
const windowService = rpc.toService("window");
windowService.maximize();
windowService.on("resize", (rect) => {
    console.log(rect);
});

//dynamic service
const shell = ProxyHelper.asProxyService(await windowService.createMyShell())
shell.openExternal('https://google.com')

```

