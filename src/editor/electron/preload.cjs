const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  onFileOpened: (callback) =>
    ipcRenderer.on("file-opened", (_event, content, fileDir) => callback(content, fileDir)),
  getSetting: (key, defaultValue) => ipcRenderer.invoke("settings:get", key, defaultValue),
  setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
});
