import { IRpcClient } from './rpc';
export declare type AnyFunction<U extends any[], V> = (...args: U) => V;
export declare type Unpacked<T> = T extends Promise<infer U> ? U : T;
export declare type PromisifiedFunction<T> = T extends AnyFunction<infer U, infer V> ? (...args: U) => Promise<Unpacked<V>> : never;
declare type WithoutEvent<T> = Omit<T, 'on' | 'off' | 'once'>;
declare type WithonlyEvent<T> = Omit<T, keyof WithoutEvent<T>>;
export declare type Promisified<T> = {
    [K in keyof T]: T[K] extends AnyFunction<infer U, infer V> ? PromisifiedFunction<T[K]> : never;
};
export declare type ProxyService<T> = Promisified<WithoutEvent<T>> & WithonlyEvent<T>;
export declare function createProxyService<T>(caller: IRpcClient, name: string): ProxyService<T>;
export {};
