const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("violet", {
  appInfo: () => ipcRenderer.invoke("app:info"),
  getState: () => ipcRenderer.invoke("state:get"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
  chooseVault: () => ipcRenderer.invoke("vault:choose"),
  restoreVault: (vaultPath) => ipcRenderer.invoke("vault:restore", vaultPath),
  readNote: (vaultPath, notePath) => ipcRenderer.invoke("vault:read-note", { vaultPath, notePath }),
  chooseImages: () => ipcRenderer.invoke("images:choose"),
  pathForFile: (file) => webUtils.getPathForFile(file),
  checkCli: () => ipcRenderer.invoke("cli:status"),
  runAgent: (request) => ipcRenderer.invoke("agent:run", request),
  stopAgent: () => ipcRenderer.invoke("agent:stop"),
});
