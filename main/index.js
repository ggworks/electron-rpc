const { Server } = require("../dist/electron.main");
const { createRpcService, RpcServer, RpcClient, RpcMessageType } = require("../dist/rpc");
module.exports = {
  Server,
  createRpcService,
  RpcServer,
  RpcClient,
  RpcMessageType,
};
