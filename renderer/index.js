const { Client } = require("../dist/electron.renderer");
const { asProxyService, createProxyService } = require("../dist/proxy");
const ProxyHelper = {
  asProxyService,
  createProxyService,
};
const {
  createRpcService,
  RpcServer,
  RpcClient,
  RpcMessageType,
} = require("../dist/rpc");

module.exports = {
  Client,
  createRpcService,
  RpcServer,
  RpcClient,
  RpcMessageType,
  ProxyHelper,
};
