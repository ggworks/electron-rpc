const { Client, createProxyService } = require("../../renderer");
const EventEmitter = require("eventemitter3");

const _client = new Client(window.ipcRenderer, new EventEmitter());

const rpc = {
  toService: (name) => {
    return createProxyService(_client, name);
  },
};

const writeResult = (res) => {
  const elem = document.getElementById("result");
  elem.innerText = JSON.stringify(res, null, 2);
};

const clickHandler = {
  maximize: () => {
    const window = rpc.toService("window");
    window.maximize();
  },
  restore: () => {
    const window = rpc.toService("window");
    window.restore();
  },

  test: async () => {
    const window = rpc.toService("window");
    window.once("blur", () => {
      writeResult("blur");
    });

    let num = 0;
    const onFocus = () => {
      num += 1;
      writeResult(`focus ${num}`);
      if (num >= 4) {
        window.off("focus", onFocus);
      }
    };
    window.on("focus", onFocus);

    window.on("resize", (rect) => {
      writeResult(rect);
    });
  },
};

["maximize", "restore", "test"].forEach((v) => {
  const btn = document.getElementById(v);
  btn.addEventListener("click", () => {
    const handler = clickHandler[v];
    if (handler) handler();
  });
});
