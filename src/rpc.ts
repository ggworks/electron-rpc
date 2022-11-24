/* eslint-disable @typescript-eslint/no-namespace */
///<reference lib="es2021.weakref" />
export type EventCB = (...data: any) => void

export interface IEventEmiiter {
  on(event: string, cb: EventCB): any
  once(event: string, cb: EventCB): any
  off(event: string, cb: EventCB): any
  emit(event: string, ...data: any): any
  listenerCount(event: string): number
}

export interface IRpcClient {
  call<T>(service: string, method: string, args?: any): Promise<T>
  listen(service: string, event: string, cb: EventCB, once?: boolean): void
  unlisten(service: string, event: string, cb: EventCB): void
}

export interface IRpcService<TContext> {
  call<T>(ctx: TContext, method: string, args?: any): Promise<T>
  listen(ctx: TContext, event: string, cb: EventCB): void
  unlisten(ctx: TContext, event: string, cb: EventCB): void
}

export interface IRpcServer<TContext> {
  call<T>(ctx: TContext, service: string, method: string, args?: any): Promise<T>
  listen(ctx: TContext, service: string, event: string, cb: EventCB): void
  unlisten(ctx: TContext, service: string, event: string, cb: EventCB): void
  registerService(name: string, service: IRpcService<TContext>): void
}

export interface IIpcConnection<TContext> {
  remoteContext: () => TContext
  send(...args: any[]): void
  on(listener: (...args: any[]) => void): void
  disconnect(): void
}

export const enum RpcMessageType {
  Promise = 100,
  EventListen = 102,
  EventUnlisten = 103,
  ObjectDeref = 110,

  PromiseSuccess = 201,
  PromiseError = 202,
  PromiseErrorObject = 203,
  EventFire = 204,
}

interface IPromiseSuccessResult {
  data: any
  rpc?: {
    dynamicId: number
  }
}

interface IPromiseErrorResult {
  name: string
  message: string
  stack?: string
}

function isPromise(obj: any) {
  return !!obj && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.then === 'function'
}

class RpcService<TContext> implements IRpcService<TContext> {
  constructor(private service: unknown) {}

  call<T>(_: TContext, method: string, args?: any): Promise<T> {
    const handler = this.service as { [key: string]: unknown }

    const target = handler[method]
    if (typeof target === 'function') {
      return target.apply(handler, args)
    } else {
      throw new Error(`method not found: ${method}`)
    }
  }

  listen(_: TContext, event: string, cb: EventCB): void {
    this.call(_, 'on', [event, cb])
  }

  unlisten(_: TContext, event: string, cb: EventCB): void {
    this.call(_, 'off', [event, cb])
  }
}

export function createRpcService<TContext>(service: unknown): IRpcService<TContext> {
  return new RpcService(service)
}

class DynamicServices {
  private nextId = 0
  private storage: Record<number, { object: any; connections: Set<any> }> = {}
  private ids = new WeakMap<object, number>()
  private connectionIds = new Map<any, Set<number>>()

  private services = new Map<string, any>()

  public add(data: object, connection: any) {
    const { id, name } = this.save(data)
    this.storage[id].connections.add(connection)
    let idsOnConnection = this.connectionIds.get(connection)
    if (!idsOnConnection) {
      idsOnConnection = new Set()
      this.connectionIds.set(connection, idsOnConnection)
    }
    idsOnConnection.add(id)
    return { id, name }
  }

  public registerService(name: string, service: any) {
    this.services.set(name, service)
  }

  public get(name: string) {
    return this.services.get(name)
  }

  public deref(id: number, connection: any) {
    const pointer = this.storage[id]
    if (pointer) {
      pointer.connections.delete(connection)
      if (pointer.connections.size === 0) {
        this.ids.delete(pointer.object)
        delete this.storage[id]
        const name = `__rpc_dyn__${id}`
        this.services.delete(name)

        console.log(`DynamicServices delete ${id}`)
      }
    }
  }

  public removeConnection(connection: any) {
    const ids = this.connectionIds.get(connection)
    if (ids) {
      ids.forEach((id) => {
        this.deref(id, connection)
      })
      this.connectionIds.delete(connection)
    }
  }

  private save(data: object) {
    let id = this.ids.get(data)

    if (!id) {
      id = ++this.nextId
      this.storage[id] = { object: data, connections: new Set() }
      this.ids.set(data, id)
    }

    const name = `__rpc_dyn__${id}`
    return { id, name }
  }
}

export function markDynamicService<T>(data: T) {
  ;(data as any).__rpc_dyn__ = true
  return data
}

class ObjectRegistry<T> {
  private objectCache = new Map<T, WeakRef<object>>()
  private finalizationRegistry: FinalizationRegistry<T>

  constructor(cb: (id: T) => void) {
    this.finalizationRegistry = new FinalizationRegistry((id: T) => {
      const ref = this.objectCache.get(id)
      if (ref !== undefined && ref.deref() === undefined) {
        this.objectCache.delete(id)
        console.log(`ObjectRegistry ${id}`)
        cb(id)
      }
    })
  }

  add(id: T, object: object) {
    const wr = new WeakRef(object)
    this.objectCache.set(id, wr)
    this.finalizationRegistry.register(object, id)
    console.log(`finalizationRegistry add ${id}`)
  }

  get(id: T) {
    const ref = this.objectCache.get(id)
    if (ref !== undefined) {
      const deref = ref.deref()
      if (deref !== undefined) return deref
    }
  }
}

export namespace ProxyHelper {
  export type AnyFunction<U extends any[], V> = (...args: U) => V

  export type Unpacked<T> = T extends Promise<infer U> ? U : T

  export type PromisifiedFunction<T> = T extends AnyFunction<infer U, infer V>
    ? (...args: U) => Promise<Unpacked<V>>
    : never

  type WithoutEvent<T> = Omit<T, 'on' | 'off' | 'once'>
  type WithonlyEvent<T> = Omit<T, keyof WithoutEvent<T>>

  export type Promisified<T> = {
    [K in keyof T]: T[K] extends AnyFunction<infer U, infer V> ? PromisifiedFunction<T[K]> : never
  }

  export type ProxyService<T> = Promisified<WithoutEvent<T>> & WithonlyEvent<T>

  export function asProxyService<T>(data: T) {
    return data as unknown as ProxyService<T>
  }

  export interface IProxyServiceOptions {
    properties?: Map<string, unknown>
  }

  export function createProxyService<T>(
    caller: IRpcClient,
    name: string,
    options?: IProxyServiceOptions
  ): ProxyService<T> {
    return new Proxy(
      {},
      {
        get(target, propKey) {
          if (typeof propKey === 'string') {
            if (options?.properties?.has(propKey)) {
              return options.properties.get(propKey)
            }

            //prevent resolve as thenable
            if (propKey === 'then') {
              return undefined
            }

            if (propKey === 'on') {
              return (event: string, cb: () => void) => {
                return caller.listen(name, event, cb)
              }
            }
            if (propKey === 'once') {
              return (event: string, cb: () => void) => {
                return caller.listen(name, event, cb, true)
              }
            }
            if (propKey === 'off') {
              return (event: string, cb: () => void) => {
                return caller.unlisten(name, event, cb)
              }
            }
            return (...args: any[]) => {
              return caller.call(name, propKey, args)
            }
          }
        },
      }
    ) as ProxyService<T>
  }
}

export class RpcServer<TContext> implements IRpcServer<TContext> {
  private services = new Map<string, IRpcService<TContext>>()
  private connections = new Set<IIpcConnection<TContext>>()

  private activeRequests = new Map<IIpcConnection<TContext>, Set<number>>()
  private eventHandlers = new Map<string, Map<IIpcConnection<TContext>, EventCB>>()
  private eventRoutes = new Map<string, IIpcConnection<TContext>[]>()
  private connectionEvents = new Map<IIpcConnection<TContext>, Set<string>>()

  private dynamicServices = new DynamicServices()

  constructor(private ctx: TContext) {}

  protected addConnection(connection: IIpcConnection<TContext>) {
    this.connections.add(connection)
    connection.on((...arg: any[]) => {
      const [rpcType, id, ...args] = arg
      this.onRawMessage(connection, rpcType, id, args)
    })
    this.activeRequests.set(connection, new Set())
    this.connectionEvents.set(connection, new Set())
  }

  protected onDisconnect(connection: IIpcConnection<TContext>) {
    console.log(`onDisconnect`)
    this.connections.delete(connection)
    this.activeRequests.delete(connection)
    this.dynamicServices.removeConnection(connection)
    const eventKeys = this.connectionEvents.get(connection)
    if (eventKeys) {
      eventKeys.forEach((eventKey) => {
        const [service, event] = eventKey.split('.')
        try {
          this.onEventUnlisten(connection, service, event)
        } catch (error) {}
      })
    }
    this.connectionEvents.delete(connection)
  }

  public registerService(name: string, service: IRpcService<TContext>) {
    this.services.set(name, service)
  }

  private getService(service: string) {
    return service.startsWith('__rpc_') ? this.dynamicServices.get(service) : this.services.get(service)
  }

  public call(ctx: TContext, service: string, method: string, args?: any[]): Promise<any> {
    const handler = this.getService(service)
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

  public listen(ctx: TContext, service: string, event: string, cb: EventCB): void {
    const handler = this.getService(service)
    if (handler) {
      handler.listen(ctx, event, cb)
    } else {
      throw new Error(`service not found: ${service}`)
    }
  }

  public unlisten(ctx: TContext, service: string, event: string, cb: EventCB): void {
    const handler = this.getService(service)
    if (handler) {
      handler.unlisten(ctx, event, cb)
    } else {
      throw new Error(`service not found: ${service}`)
    }
  }

  private onRawMessage(connection: IIpcConnection<TContext>, rpcType: number, id: number, arg: any[]): void {
    const type = rpcType as RpcMessageType
    switch (type) {
      case RpcMessageType.Promise: {
        const [service, method, args] = arg
        return this.onPromise(connection, id, service, method, args)
      }
      case RpcMessageType.EventListen: {
        const [service, event, args] = arg
        return this.onEventListen(connection, id, service, event, args)
      }
      case RpcMessageType.EventUnlisten: {
        const [service, event, args] = arg
        return this.onEventUnlisten(connection, service, event, args)
      }

      case RpcMessageType.ObjectDeref: {
        const [_rpc, _deref, objectId] = arg
        return this.onDeref(connection, objectId)
      }
    }
  }

  private saveDynamicService(data: any, connection: IIpcConnection<TContext>) {
    const { id, name } = this.dynamicServices.add(data, connection)
    if (!this.dynamicServices.get(name)) {
      if ('call' in data && typeof data['call'] === 'function') {
        this.dynamicServices.registerService(name, data)
      } else {
        this.dynamicServices.registerService(name, markDynamicService(createRpcService(data)))
      }
    }

    return { id, name }
  }

  private onDeref(connection: IIpcConnection<TContext>, objectId: number) {
    this.dynamicServices.deref(objectId, connection)
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
        if (this.activeRequests.has(connection)) {
          if (data && data.__rpc_dyn__) {
            const dynamicService = this.saveDynamicService(data, connection)
            this.sendResponse(connection, RpcMessageType.PromiseSuccess, id, {
              data: dynamicService,
              rpc: { dynamicId: dynamicService.id },
            })
          } else {
            this.sendResponse(connection, RpcMessageType.PromiseSuccess, id, {
              data,
            })
          }
          this.activeRequests.get(connection)?.delete(id)
        }
      },
      (err) => {
        if (err instanceof Error) {
          if (this.activeRequests.has(connection)) {
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
      }
    )
  }

  private onEventListen(
    connection: IIpcConnection<TContext>,
    id: number,
    service: string,
    event: string,
    args?: any[]
  ): void {
    const eventKey = `${service}.${event}`
    this.connectionEvents.get(connection)?.add(eventKey)
    const connections = this.eventRoutes.get(eventKey) || []
    if (!connections.includes(connection)) {
      connections.push(connection)
      this.eventRoutes.set(eventKey, connections)
    }

    if (!this.eventHandlers.has(eventKey)) {
      const connectionHandlers = new Map<IIpcConnection<TContext>, EventCB>()

      const handler = (...data: any[]) => {
        if (this.connections.has(connection)) {
          this.sendResponse(connection, RpcMessageType.EventFire, eventKey, [service, event, data])
        }
      }
      connectionHandlers.set(connection, handler)
      this.eventHandlers.set(eventKey, connectionHandlers)
      this.listen(connection.remoteContext(), service, event, handler)
    } else {
      const connectionHandlers = this.eventHandlers.get(eventKey)
      const handler = (...data: any[]) => {
        if (this.connections.has(connection)) {
          this.sendResponse(connection, RpcMessageType.EventFire, eventKey, [service, event, data])
        }
      }
      connectionHandlers!.set(connection, handler)
      this.eventHandlers.set(eventKey, connectionHandlers!)
      this.listen(connection.remoteContext(), service, event, handler)
    }
    return
  }

  private onEventUnlisten(connection: IIpcConnection<TContext>, service: string, event: string, args?: any[]): void {
    const eventKey = `${service}.${event}`
    const connectionHandlers = this.eventHandlers.get(eventKey)
    if (connectionHandlers) {
      const handler = connectionHandlers.get(connection)
      if (handler) {
        this.unlisten(connection.remoteContext(), service, event, handler)
        connectionHandlers.delete(connection)
      }
    }

    const connections = this.eventRoutes.get(eventKey)
    if (connections) {
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
  private requestId = 0
  private handlers = new Map<number, (...args: any[]) => void>()
  private objectRegistry: ObjectRegistry<number>

  constructor(protected connection: IIpcConnection<TContext>, private _events: IEventEmiiter) {
    this.connection.on((...arg: any[]) => {
      const [rpcType, id, ...args] = arg
      this.onRawMessage(rpcType, id, ...args)
    })

    this.objectRegistry = new ObjectRegistry((id) => {
      this.connection.send(RpcMessageType.ObjectDeref, ++this.requestId, 'rpc', 'deref', id)
    })
  }

  public call(service: string, method: string, arg?: any[]) {
    return this.requestPromise(service, method, arg)
  }

  public listen<T>(service: string, event: string, cb: EventCB, once?: boolean): void {
    const eventKey = `${service}.${event}`
    if (once) {
      this._events.once(eventKey, cb)
    } else {
      this._events.on(eventKey, cb)
    }
    const isFirstOne = this._events.listenerCount(eventKey) === 1
    if (isFirstOne) {
      this.requestEventListen(service, event)
    }
  }

  public unlisten<T>(service: string, event: string, cb: EventCB): void {
    const eventKey = `${service}.${event}`
    this._events.off(eventKey, cb)
    const isLastOne = this._events.listenerCount(eventKey) === 0
    if (isLastOne) {
      this.requestEventUnlisten(service, event)
    }
  }

  private requestPromise(service: string, method: string, arg?: any[]): Promise<any> {
    const id = ++this.requestId
    const rpcType = RpcMessageType.Promise

    const promise = new Promise((resolve, reject) => {
      this.connection.send(rpcType, id, service, method, arg)

      const handler = (
        type: RpcMessageType,
        id: number,
        rawResponse: IPromiseSuccessResult | IPromiseErrorResult | unknown
      ) => {
        switch (type) {
          case RpcMessageType.PromiseSuccess:
            {
              this.handlers.delete(id)
              const response = rawResponse as IPromiseSuccessResult
              if (response.rpc) {
                const { name } = response.data
                const { dynamicId } = response.rpc
                const properties = new Map<string, unknown>()
                properties.set('__rpc__', {
                  dynamicId: dynamicId,
                  name: name,
                })
                let proxyService = this.objectRegistry.get(dynamicId)
                if (!proxyService) {
                  proxyService = ProxyHelper.createProxyService(this, name, {
                    properties,
                  })
                  this.objectRegistry.add(dynamicId, proxyService)
                }
                resolve(proxyService)
              } else {
                resolve(response.data)
              }
            }

            break
          case RpcMessageType.PromiseError:
            {
              this.handlers.delete(id)
              const response = rawResponse as IPromiseErrorResult
              const error = new Error(response.message)
              error.stack = response.stack
              error.name = response.name
              reject(response)
            }
            break
          case RpcMessageType.PromiseErrorObject:
            {
              this.handlers.delete(id)
              reject(rawResponse as any)
            }

            break
        }
      }

      this.handlers.set(id, handler)
    })

    return promise
  }

  private requestEventListen(service: string, event: string, arg?: any) {
    const id = this.requestId++
    const rpcType = RpcMessageType.EventListen
    this.connection.send(rpcType, id, service, event, arg)
  }

  private requestEventUnlisten(service: string, event: string, arg?: any) {
    const id = this.requestId++
    const rpcType = RpcMessageType.EventUnlisten
    this.connection.send(rpcType, id, service, event, arg)
  }

  private onEventFire(service: string, event: string, data: any[]) {
    this._events.emit(`${service}.${event}`, ...data)
  }

  private onRawMessage(rpcType: number, id: number | string, ...arg: any[]): void {
    const type = rpcType as RpcMessageType
    switch (type) {
      case RpcMessageType.PromiseSuccess:
      case RpcMessageType.PromiseError:
      case RpcMessageType.PromiseErrorObject: {
        const [data] = arg
        const handler = this.handlers.get(id as number)
        handler?.(type, id, data)
        break
      }

      case RpcMessageType.EventFire: {
        const [service, event, data] = arg[0]
        this.onEventFire(service, event, data)
        break
      }
    }
  }
}
