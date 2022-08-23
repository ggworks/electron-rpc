const { Server } = require("../dist/electron.main");
const { createRpcService, RpcServer, RpcClient, RpcMessageType, markDynamicService  } = require("../dist/rpc");
module.exports = {
  Server,
  createRpcService,
  RpcServer,
  RpcClient,
  RpcMessageType,
  markDynamicService
};
