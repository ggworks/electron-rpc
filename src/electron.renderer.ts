import { IEventEmiiter, IIpcConnection, RpcClient } from './rpc'

export interface IpcContext {
  id: string | number
}

const createContext = (id: string): IpcContext => {
  return { id }
}

export interface IpcRenderer {
  send: (channel: string, data?: any) => void
  on: (channel: string, listener: (ctx: any, ...args: any[]) => void) => void
}

class IpcConnection implements IIpcConnection<IpcContext> {
  private remoteCtx: IpcContext
  constructor(private ipcRenderer: IpcRenderer, remoteId: string) {
    this.remoteCtx = createContext(remoteId)
  }

  remoteContext(): IpcContext {
    return this.remoteCtx
  }

  send(...args: any[]): void {
    this.ipcRenderer.send('rpc:message', ...args)
  }

  on(listener: (...args: any[]) => void): void {
    this.ipcRenderer.on('rpc:message', (event: unknown, ...args: any[]) => {
      listener(...args)
    })
  }
}

export class Client extends RpcClient<IpcContext> {
  constructor(ipcRenderer: IpcRenderer, events: IEventEmiiter) {
    super(new IpcConnection(ipcRenderer, 'rpc:main'), events)
    ipcRenderer.send('rpc:hello')
    ipcRenderer.on('rpc:hello', () => {
      console.log(`Client get rpc:hello`)
    })
  }
}
