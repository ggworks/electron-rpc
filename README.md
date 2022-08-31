# electron-rpc

`electron-rpc` is an module that enables RPC style remote API call for electron.

features:
- pure TypeScript code
- compile-time type check with TypeScript interface
- auto Promisify TypeScript interface, with events on/off method overloading support
- event listen/unlisten
- dynamic service object creation, and lifetime management by GC (FinalizationRegistry)
- support electron sanbox, no nodeintegration required


## Quick Start

main process
```js
let rpc = new Server();
rpc.registerService("window", new WindowService());
```

renderer process

```typescript
//setup client with few lines of code
import { Client, ProxyHelper } from "electron-rpc/renderer";
import EventEmitter from "eventemitter3";
const _client = new Client(window.ipcRenderer, new EventEmitter());
const rpc = {
  toService: (name) => {
    return ProxyHelper.createProxyService(_client, name);
  },
};

//use service
const windowService = rpc.toService<IWindow>("window");
windowService.maximize();
windowService.on("resize", (rect) => {
    console.log(rect);
});
const bounds = await windowService.getBounds();
console.log(bounds);

//dynamic service
const shell = ProxyHelper.asProxyService(await windowService.createMyShell())
shell.openExternal('https://google.com')

```

