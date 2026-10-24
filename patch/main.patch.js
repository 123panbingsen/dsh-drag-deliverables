
//#region dsh-drag-deliverable: native file drag-out
/**
 * Start an operating-system file drag so a delivered file can be dropped on
 * the desktop, a folder, or another application. Electron has no browser-side
 * equivalent (DownloadURL is not implemented), so the renderer asks here after
 * preventing its own dragstart default.
 * @see https://www.electronjs.org/docs/latest/tutorial/native-file-drag-drop
 */
ipcMain.on("dsh-drag-deliverable:start", (event, filePath) => {
	try {
		if (typeof filePath !== "string" || filePath.length === 0 || !isAbsolute(filePath) || !existsSync(filePath)) {
			console.error("[dsh-drag-deliverable] not an existing absolute path", filePath);
			return;
		}
		let icon = nativeImage.createFromPath(join(process.resourcesPath, "icon.png"));
		if (icon.isEmpty()) icon = nativeImage.createEmpty();
		event.sender.startDrag({ file: filePath, icon });
	} catch (error) {
		console.error("[dsh-drag-deliverable] native drag failed", error);
	}
});
//#endregion
