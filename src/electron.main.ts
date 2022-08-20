import { IIpcConnection, RpcServer } from './rpc'
import { ipcMain, IpcMainEvent, WebContents } from 'electron'

export interface IpcContext {
  id: string | number
}

const createContext = (id: number): IpcContext => {
  return { id }
}

class IpcConnection implements IIpcConnection<IpcContext> {
  private remoteCtx: IpcContext
  constructor(private sender: WebContents) {
    this.remoteCtx = createContext(sender.id)
  }

  remoteContext(): IpcContext {
    return this.remoteCtx
  }

  send(...args: any[]): void {
    this.sender.send('rpc:message', ...args)
  }

  on(listener: (...args: any[]) => void): void {
    ipcMain.on('rpc:message', (event: IpcMainEvent, ...args: any[]) => {
      listener(...args)
    })
  }
}

export class Server extends RpcServer<IpcContext> {
  constructor() {
    super({ id: 'main' })
    ipcMain.on('rpc:hello', (event: IpcMainEvent, ...args: any[]) => {
      this.onClientHello(event.sender)
      event.sender.send('rpc:hello')
    })
  }

  private onClientHello(sender: WebContents) {
    super.addConnection(new IpcConnection(sender))
  }
}
