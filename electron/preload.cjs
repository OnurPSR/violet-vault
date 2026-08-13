const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("violet", {
  appInfo: () => ipcRenderer.invoke("app:info"),
  getState: () => ipcRenderer.invoke("state:get"),
  saveState: (state) => ipcRenderer.invoke("state:save", state),
  chooseVault: () => ipcRenderer.invoke("vault:choose"),
  restoreVault: (vaultPath) => ipcRenderer.invoke("vault:restore", vaultPath),
  readNote: (vaultPath, notePath) => ipcRenderer.invoke("vault:read-note", { vaultPath, notePath }),
  readVaultAsset: (vaultPath, assetPath) => ipcRenderer.invoke("vault:read-asset", { vaultPath, assetPath }),
  watchVault: (vaultPath) => ipcRenderer.invoke("vault:watch", vaultPath),
  unwatchVault: () => ipcRenderer.invoke("vault:unwatch"),
  onVaultChange: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("vault:changed", listener);
    return () => ipcRenderer.removeListener("vault:changed", listener);
  },
  chooseImages: () => ipcRenderer.invoke("images:choose"),
  pathForFile: (file) => webUtils.getPathForFile(file),
  checkCli: () => ipcRenderer.invoke("cli:status"),
  runAgent: (request) => ipcRenderer.invoke("agent:run", request),
  stopAgent: () => ipcRenderer.invoke("agent:stop"),
  onAgentStream: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("agent:stream", listener);
    return () => ipcRenderer.removeListener("agent:stream", listener);
  },
  startCodexTerminal: (request, dimensions, clientSessionId) => ipcRenderer.invoke("agent:terminal-start", { request, dimensions, clientSessionId }),
  sendTerminalInput: (sessionId, data) => ipcRenderer.send("agent:terminal-input", { sessionId, data }),
  resizeTerminal: (sessionId, cols, rows) => ipcRenderer.send("agent:terminal-resize", { sessionId, cols, rows }),
  interruptTerminal: (sessionId) => ipcRenderer.invoke("agent:terminal-interrupt", sessionId),
  closeTerminal: (sessionId) => ipcRenderer.invoke("agent:terminal-close", sessionId),
  onTerminalData: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("agent:terminal-data", listener);
    return () => ipcRenderer.removeListener("agent:terminal-data", listener);
  },
  onTerminalExit: (callback) => {
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("agent:terminal-exit", listener);
    return () => ipcRenderer.removeListener("agent:terminal-exit", listener);
  },
});
