import { IEventEmiiter, RpcClient } from './rpc';
export interface IpcContext {
    id: string | number;
}
export interface IpcRenderer {
    send: (channel: string, data?: any) => void;
    on: (channel: string, listener: (ctx: any, ...args: any[]) => void) => void;
}
export declare class Client extends RpcClient<IpcContext> {
    private ipcRenderer;
    constructor(ipcRenderer: IpcRenderer, events: IEventEmiiter);
    disconnect(): void;
}
