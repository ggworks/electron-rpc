export type EventCB<T> = (data?: T) => void

export interface IEventEmiiter {
  on<T>(event:string, cb: EventCB<T>): any
  once<T>(event:string, cb: EventCB<T>): any
  off<T>(event:string, cb: EventCB<T>): any
  emit<T>(event:string, data: T): any
  listenerCount(event:string): number
}


export interface IRpcClient {
  call<T>(service: string, method: string, args?: any): Promise<T>
  listen<T>(service: string, event: string, cb: EventCB<T>, once?: boolean): void 
  unlisten<T>(service: string, event: string, cb: EventCB<T>): void 
}


export interface IRpcService<TContext> {
  call<T>(ctx: TContext, method: string, args?: any): Promise<T>
  listen<T>(ctx: TContext, event: string, cb: EventCB<T>): void 
  unlisten<T>(ctx: TContext, event: string, cb: EventCB<T>): void
}

export interface IRpcServer<TContext> {
  call<T>(ctx: TContext, service: string, method: string, args?: any): Promise<T>
  listen<T>(ctx: TContext,service: string, event: string, cb: EventCB<T>): void 
  unlisten<T>(ctx: TContext, service: string, event: string, cb: EventCB<T>): void 
  registerService(name: string, service: IRpcService<TContext>) : void
}

export interface IIpcConnection<TContext> {
  remoteContext: () => TContext
  send(...args: any[]): void
  on(listener: (...args: any[]) => void): void
}

export const enum RpcMessageType {
  Promise = 100,
  EventListen = 102,
  EventUnlisten = 103,

  PromiseSuccess = 201,
  PromiseError = 202,
  PromiseErrorObject = 203,
	EventFire = 204
}

function isPromise(obj: any) {
  return !!obj && (typeof obj === "object" || typeof obj === "function") && typeof obj.then === "function";
}


class RpcService<TContext> implements IRpcService<TContext>{
  constructor(private service: unknown){
  }

  call<T>(_: TContext, method: string, args?: any): Promise<T> {
		const handler = this.service as { [key: string]: unknown };

    const target = handler[method]
      if (typeof target === 'function') {
        return target.apply(handler, args)
      } else {
        throw new Error(`method not found: ${method}`)
      }
  }
  
  listen(_: TContext, event: string, cb: EventCB<any>): void {
		this.call(_, "on", [event, cb])
  }

  unlisten(_: TContext, event: string, cb: EventCB<any>): void {
    this.call(_, "off", [event, cb])
  }
}

export function createRpcService<TContext>(service: unknown): IRpcService<TContext> {
  return new RpcService(service)
}

export class RpcServer<TContext> implements IRpcServer<TContext> {
  private services = new Map<string, IRpcService<TContext>>()
  private connections = new Set<IIpcConnection<TContext>>()

  private activeRequests = new Map<IIpcConnection<TContext>, Set<number>>()
  private eventHandlers = new Map<string, Map<IIpcConnection<TContext>, EventCB<any>>>()
  private eventRoutes = new Map<string, IIpcConnection<TContext>[]>()

  constructor(private ctx: TContext) {}

  protected addConnection(connection: IIpcConnection<TContext>) {
    this.connections.add(connection)
    connection.on((...arg: any[]) => {
      const [rpcType, id, ...args] = arg
      this.onRawMessage(connection, rpcType, id, args)
    })
    this.activeRequests.set(connection, new Set<number>)
  }

  public registerService(name: string, service: IRpcService<TContext>){
    this.services.set(name, service)
  }

  public call(ctx: TContext, service: string, method: string, args?: any[]): Promise<any> {
    const handler = this.services.get(service)
    if (handler) {
      let res = handler.call(ctx, method, args)
      if (!isPromise(res)) {
        res = Promise.resolve(res)
      }
      return res
    } else {
      throw new Error(`service not found: ${service}`)
    }
  }

  public listen(ctx: TContext,service: string, event: string, cb: EventCB<any>): void {
    const handler = this.services.get(service)
    if (handler) {
      handler.listen(ctx, event, cb)
    } else {
      throw new Error(`service not found: ${service}`)
    }
  }

  public unlisten(ctx: TContext, service: string, event: string, cb: EventCB<any>): void {
    const handler = this.services.get(service)
    if (handler) {
      handler.unlisten(ctx, event, cb)
    } else {
      throw new Error(`service not found: ${service}`)
    }
  }

  private onRawMessage(connection: IIpcConnection<TContext>, rpcType: number, id: number, arg: any[]): void {
    const type = rpcType as RpcMessageType
    switch (type) {
      case RpcMessageType.Promise:
        {
          const [service, method, args] = arg
          return this.onPromise(connection, id, service, method, args)
        }
      case RpcMessageType.EventListen:
        {
          const [service, event, args] = arg
          return this.onEventListen(connection, id, service, event, args)
        }
      case RpcMessageType.EventUnlisten:
        {
          const [service, event, args] = arg
          return this.onEventUnlisten(connection, id, service, event, args)
        }
    }
  }

  private onPromise(
    connection: IIpcConnection<TContext>,
    id: number,
    service: string,
    method: string,
    args?: any[]
  ): void {
    let promise: Promise<any>
    this.activeRequests.get(connection)?.add(id)
    try {
      promise = this.call(connection.remoteContext(), service, method, args)
    } catch (err) {
      promise = Promise.reject(err)
    }

    promise.then(
      (data) => {
        this.sendResponse(connection, RpcMessageType.PromiseSuccess, id, data)
        this.activeRequests.get(connection)?.delete(id)
      },
      (err) => {
        if (err instanceof Error) {
          this.sendResponse(connection, RpcMessageType.PromiseError, id, {
            message: err.message,
            name: err.name,
            stack: err.stack ? (err.stack.split ? err.stack.split('\n') : err.stack) : undefined,
          })
        } else {
          this.sendResponse(connection, RpcMessageType.PromiseErrorObject, id, err)
        }
        this.activeRequests.get(connection)?.delete(id)
      }
    )
  }

  private onEventListen(
    connection: IIpcConnection<TContext>,
    id: number,
    service: string,
    event: string,
    args?: any[]
  ): void{
    const eventKey = `${service}.${event}`
    const connections = this.eventRoutes.get(eventKey) || [];
    if (!connections.includes(connection)){
      connections.push(connection)
      this.eventRoutes.set(eventKey, connections)
    }

    if (!this.eventHandlers.has(eventKey)){
      const connectionHandlers = new Map<IIpcConnection<TContext>, EventCB<any>>()
      
      const handler = (data: any) => {
          this.sendResponse(connection, RpcMessageType.EventFire, eventKey, [service, event, data])
      }
      connectionHandlers.set(connection, handler)
      this.eventHandlers.set(eventKey, connectionHandlers)
      this.listen(connection.remoteContext(), service, event, handler)
    }
    return
  }

  private onEventUnlisten(
    connection: IIpcConnection<TContext>,
    id: number,
    service: string,
    event: string,
    args?: any[]
  ): void {
    const eventKey = `${service}.${event}`
    const connectionHandlers = this.eventHandlers.get(eventKey)
    if (connectionHandlers) {
      const handler = connectionHandlers.get(connection)
      if (handler){
        this.unlisten(connection.remoteContext(), service, event, handler)
        connectionHandlers.delete(connection)
      }
    }

    const connections = this.eventRoutes.get(eventKey);
    if (connections){
      connections.splice(connections.indexOf(connection), 1)
      this.eventRoutes.set(eventKey, connections)
      if (!connections.length) {
        this.eventRoutes.delete(eventKey)
        this.eventHandlers.delete(eventKey)
      }
    }
  }

  private sendResponse(connection: IIpcConnection<TContext>, type: RpcMessageType, id: number | string, data: any) {
    connection.send(type, id, data)
  }
}

export class RpcClient<TContext> implements IRpcClient {
  private requestId = 1
  private handlers = new Map<number, (...args: any[]) => void>()
  constructor(private connection: IIpcConnection<TContext>, private _events: IEventEmiiter) {
    this.connection.on((...arg: any[]) => {
      const [rpcType, id, ...args] = arg
      this.onRawMessage(rpcType, id, ...args)
    })
  }

  public call(service: string, method: string, arg?: any[]) {
    return this.requestPromise(service, method, arg)
  }

  public listen<T>(service: string, event: string, cb: EventCB<T>, once?: boolean): void {
    const eventKey = `${service}.${event}`
    if (once) {
      this._events.once(eventKey, cb);
    }
    else {
      this._events.on(eventKey, cb);
    }
    const isFirstOne = this._events.listenerCount(eventKey) === 1
    if (isFirstOne) {
      this.requestEventListen(service, event)
    }
  }

  public  unlisten<T>(service: string, event: string, cb: EventCB<T>): void{
    const eventKey = `${service}.${event}`
    this._events.off(eventKey, cb);
    const isLastOne = this._events.listenerCount(eventKey) === 0
    if (isLastOne) {
      this.requestEventUnlisten(service, event)
    }
  } 

  private requestPromise(service: string, method: string, arg?: any[]): Promise<any> {
    const id = this.requestId++
    const rpcType = RpcMessageType.Promise

    const promise = new Promise((resolve, reject) => {
      this.connection.send(rpcType, id, service, method, arg)

      const handler = (type: RpcMessageType, id: number, data: any) => {
        switch (type) {
          case RpcMessageType.PromiseSuccess:
            this.handlers.delete(id)
            resolve(data)
            break
          case RpcMessageType.PromiseError:
            this.handlers.delete(id)
            const error = new Error(data.message)
            error.stack = data.stack
            error.name = data.name
            reject(data)
            break
          case RpcMessageType.PromiseErrorObject:
            this.handlers.delete(id)
            reject(data)
            break
        }
      }

      this.handlers.set(id, handler)
    })

    return promise
  }

  private requestEventListen(service: string, event: string, arg?:any) {
    const id = this.requestId++
    const rpcType = RpcMessageType.EventListen
    this.connection.send(rpcType, id, service, event, arg)
  }

  private requestEventUnlisten(service: string, event: string, arg?:any) {
    const id = this.requestId++
    const rpcType = RpcMessageType.EventUnlisten
    this.connection.send(rpcType, id, service, event, arg)
  }


  private onEventFire(service: string, event: string, data: any) {
    this._events.emit(`${service}.${event}`, data);
  }

  private onRawMessage(rpcType: number, id: number|string, ...arg: any[]): void {
    const type = rpcType as RpcMessageType
    switch (type) {
      case RpcMessageType.PromiseSuccess:
      case RpcMessageType.PromiseError:
      case RpcMessageType.PromiseErrorObject:
        {
          const [data] = arg
          const handler = this.handlers.get(id as number)
          handler?.(type, id, data)
          break
        }
        
        case RpcMessageType.EventFire:
          {
            const [service, event, data] = arg[0];
            this.onEventFire(service, event, data)
            break;
          }
    }
  }
}
