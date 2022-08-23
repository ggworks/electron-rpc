/// <reference lib="es2021.weakref" />
export declare type EventCB<T> = (data?: T) => void;
export interface IEventEmiiter {
    on<T>(event: string, cb: EventCB<T>): any;
    once<T>(event: string, cb: EventCB<T>): any;
    off<T>(event: string, cb: EventCB<T>): any;
    emit<T>(event: string, data: T): any;
    listenerCount(event: string): number;
}
export interface IRpcClient {
    call<T>(service: string, method: string, args?: any): Promise<T>;
    listen<T>(service: string, event: string, cb: EventCB<T>, once?: boolean): void;
    unlisten<T>(service: string, event: string, cb: EventCB<T>): void;
}
export interface IRpcService<TContext> {
    call<T>(ctx: TContext, method: string, args?: any): Promise<T>;
    listen<T>(ctx: TContext, event: string, cb: EventCB<T>): void;
    unlisten<T>(ctx: TContext, event: string, cb: EventCB<T>): void;
}
export interface IRpcServer<TContext> {
    call<T>(ctx: TContext, service: string, method: string, args?: any): Promise<T>;
    listen<T>(ctx: TContext, service: string, event: string, cb: EventCB<T>): void;
    unlisten<T>(ctx: TContext, service: string, event: string, cb: EventCB<T>): void;
    registerService(name: string, service: IRpcService<TContext>): void;
}
export interface IIpcConnection<TContext> {
    remoteContext: () => TContext;
    send(...args: any[]): void;
    on(listener: (...args: any[]) => void): void;
}
export declare const enum RpcMessageType {
    Promise = 100,
    EventListen = 102,
    EventUnlisten = 103,
    ObjectDeref = 110,
    PromiseSuccess = 201,
    PromiseError = 202,
    PromiseErrorObject = 203,
    EventFire = 204
}
export declare function createRpcService<TContext>(service: unknown): IRpcService<TContext>;
export declare function markDynamicService<T>(data: T): T;
export declare namespace ProxyHelper {
    export type AnyFunction<U extends any[], V> = (...args: U) => V;
    export type Unpacked<T> = T extends Promise<infer U> ? U : T;
    export type PromisifiedFunction<T> = T extends AnyFunction<infer U, infer V> ? (...args: U) => Promise<Unpacked<V>> : never;
    type WithoutEvent<T> = Omit<T, 'on' | 'off' | 'once'>;
    type WithonlyEvent<T> = Omit<T, keyof WithoutEvent<T>>;
    export type Promisified<T> = {
        [K in keyof T]: T[K] extends AnyFunction<infer U, infer V> ? PromisifiedFunction<T[K]> : never;
    };
    export type ProxyService<T> = Promisified<WithoutEvent<T>> & WithonlyEvent<T>;
    export function asProxyService<T>(data: T): ProxyService<T>;
    export interface IProxyServiceOptions {
        properties?: Map<string, unknown>;
    }
    export function createProxyService<T>(caller: IRpcClient, name: string, options?: IProxyServiceOptions): ProxyService<T>;
    export {};
}
export declare class RpcServer<TContext> implements IRpcServer<TContext> {
    private ctx;
    private services;
    private connections;
    private activeRequests;
    private eventHandlers;
    private eventRoutes;
    private dynamicServices;
    constructor(ctx: TContext);
    protected addConnection(connection: IIpcConnection<TContext>): void;
    registerService(name: string, service: IRpcService<TContext>): void;
    call(ctx: TContext, service: string, method: string, args?: any[]): Promise<any>;
    listen(ctx: TContext, service: string, event: string, cb: EventCB<any>): void;
    unlisten(ctx: TContext, service: string, event: string, cb: EventCB<any>): void;
    private onRawMessage;
    private saveDynamicService;
    private onDeref;
    private onPromise;
    private onEventListen;
    private onEventUnlisten;
    private sendResponse;
}
export declare class RpcClient<TContext> implements IRpcClient {
    private connection;
    private _events;
    private requestId;
    private handlers;
    private objectRegistry;
    constructor(connection: IIpcConnection<TContext>, _events: IEventEmiiter);
    call(service: string, method: string, arg?: any[]): Promise<any>;
    listen<T>(service: string, event: string, cb: EventCB<T>, once?: boolean): void;
    unlisten<T>(service: string, event: string, cb: EventCB<T>): void;
    private requestPromise;
    private requestEventListen;
    private requestEventUnlisten;
    private onEventFire;
    private onRawMessage;
}
