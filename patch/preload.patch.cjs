
//#region dsh-drag-deliverable: native drag bridge
electron.contextBridge.exposeInMainWorld("dshDragDeliverable", {
	native: true,
	start: (filePath) => {
		if (typeof filePath === "string" && filePath.length > 0) electron.ipcRenderer.send("dsh-drag-deliverable:start", filePath);
	}
});
//#endregion
