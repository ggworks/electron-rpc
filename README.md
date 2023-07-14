# electron-rpc

`electron-rpc` is an module that enables RPC style remote API call for electron.

Inspired by vscode's RPC module, try to make a convenient, easy to use but yet powerful RPC library.

features:

- developer friendly design for TypeScript, no IDL needed
- **use remote service just like a local object, no boilerplate or glue code needed**
- **strong type, compile-time type check with TypeScript interface**
- **auto Promisify TypeScript interface, with events on/off method overloading support**
- event listen/unlisten
- **dynamic service object creation, and lifetime management by GC (FinalizationRegistry)**
- support electron sanbox, no nodeintegration required

## Quick Start

let's say if you have these services

```ts
interface IShell {
  openExternal(url: string): Promise<void>;
}

interface IApp {
  getPath(name: PathNames): string;
  createMyShell(): IShell;
}

interface IWindow {
  maximize(): void;
  getBounds(): Electron.Rectangle;
  on(event: "resize", cb: (data: Electron.Rectangle) => void): void;
  once(event: "resize", cb: (data: Electron.Rectangle) => void): void;
  off(eventName: string, listener: (arg?: any) => void): void;
}
```

main process, implement your service

```ts
// a normal class that's a service
class Shell implements IShell {
  public openExternal(url: string) {
    return shell.openExternal(url);
  }
}

class AppService implements IApp {
  getPath(name: PathNames): string {
    return app.getPath(name);
  }
  //return a dynamic service
  createMyShell() {
    const shell = new Shell();
    return markDynamicService(shell);
  }
}

//a service that need to known the context of caller
class WindowService implements IRpcService<IpcContext> {
  call(ctx: IpcContext, method: string, args?: any): any {
    const browser = this.getBrowser(ctx);
    switch (method) {
      case "maximize":
        return browser.maximize();
      case "getBounds":
        return browser.getBounds();
        throw new Error(`${method} not found`)
    }
  }
  listen(ctx: IpcContext, event: string, cb: EventCB<any>): void {
    ...
  }

}
```

in main process, register your service

```js
import { createRpcService, Server } from "electron-rpc/main";

const rpc = new Server();
rpc.registerService("window", new WindowService());
rpc.registerService("shell", createRpcService(new Shell()));
rpc.registerService("app", createRpcService(new AppService()));
```

in renderer process, simple setup the client

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
```

you are ready to go, use your remote service like native object
```ts
//use service
const windowService = rpc.toService<IWindow>("window");
windowService.maximize();
windowService.on("resize", (rect:) => {
  console.log(rect);
});
const bounds = await windowService.getBounds();
console.log(bounds);

//get dynamic service
const app = rpc.toService<IApp>('app')
const shell = ProxyHelper.asProxyService(await app.createMyShell())
shell.openExternal('https://google.com')
```

the service object you get has TypeScript interface, so you can enjoy intellisense code completion and typecheck!

## About how the Promised interface is generated

in the above example, the interface of windowService is ike this
```ts
interface PromisifiedIWindow = {
  maximize(): Promise<void>;
  getBounds(): Promise<Electron.Rectangle>;
  on(event: "resize", cb: (data: Electron.Rectangle) => void): void;
  once(event: "resize", cb: (data: Electron.Rectangle) => void): void;
  off(eventName: string, listener: (arg?: any) => void): void;
}
```
but is generated automatically, and it event support on/off method overloading!

checkout this document about details: https://github.com/hiitiger/electron-demos/tree/master/ipc-async-interface-proxy

### Note
We can implement our own IIpcConnection, so this can support other JavaScript environment like nodejs, browser/CEF(websocket with backend) and etc.
