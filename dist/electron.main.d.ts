import { RpcServer } from './rpc';
export interface IpcContext {
    id: string | number;
}
export declare class Server extends RpcServer<IpcContext> {
    constructor(id?: string);
}
