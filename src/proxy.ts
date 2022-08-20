import { IRpcClient } from './rpc'

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

export function createProxyService<T>(caller: IRpcClient, name: string): ProxyService<T> {
  return new Proxy(
    {},
    {
      get(target, propKey) {
        if (typeof propKey === 'string') {
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
