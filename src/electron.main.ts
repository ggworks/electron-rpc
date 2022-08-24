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
  private listener?: (...args: any[]) => void
  onRpcMessage: (event: IpcMainEvent, ...args: any[]) => void
  constructor(private sender: WebContents) {
    this.remoteCtx = createContext(sender.id)

    this.onRpcMessage = (event: IpcMainEvent, ...args: any[]) => {
      if (this.listener) {
        if (event.sender.id === this.remoteCtx.id) {
          this.listener(...args)
        }
      }
    }
  }

  remoteContext(): IpcContext {
    return this.remoteCtx
  }

  send(...args: any[]): void {
    this.sender.send('rpc:message', ...args)
  }

  on(listener: (...args: any[]) => void): void {
    this.listener = listener
    ipcMain.on('rpc:message', this.onRpcMessage)
  }

  disconnect(): void {
    this.sender.send('rpc:disconnect')
  }

  onDisconnect(cb: () => void): void {
    ipcMain.on('rpc:disconnect', (event: IpcMainEvent, ...args: any[]) => {
      console.log(`rpc:disconnect recieved`)
      if (event.sender.id === this.remoteCtx.id) {
        ipcMain.off('rpc:message', this.onRpcMessage)
        cb()
      }
    })

    this.sender.on('destroyed', () => {
      ipcMain.off('rpc:message', this.onRpcMessage)
      cb()
    })
  }
}

export class Server extends RpcServer<IpcContext> {
  constructor(id = 'rpc.electron.main') {
    super({ id })
    ipcMain.on('rpc:hello', (event: IpcMainEvent) => {
      const connection = new IpcConnection(event.sender)
      super.addConnection(connection)
      event.sender.send('rpc:hello')

      connection.onDisconnect(() => {
        super.onDisconnect(connection)
      })
    })
  }
}
