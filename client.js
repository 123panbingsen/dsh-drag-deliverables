window.__ModuleLoader__.load({
	id: "dsh-drag-deliverables",
	factory: (require) => {
		const React = require("react");
		const h = React.createElement;

		/** Locale namespace owned by this plugin. */
		const NS = "drag-deliverables";

		const zh = {
			"handle.title": "保存副本到文件夹…",
			"handle.aria": "把这份交付文件保存到文件夹",
			"handle.saving": "正在保存…",
			"handle.saved": "已保存：{name}",
			"handle.dragTitle": "按住可拖到桌面或文件夹",
			"handle.saveError": "保存失败：{reason}"
		};
		const en = {
			"handle.title": "Save a copy to a folder…",
			"handle.aria": "Save this delivered file to a folder",
			"handle.saving": "Saving…",
			"handle.saved": "Saved: {name}",
			"handle.dragTitle": "Press and drag to the desktop or a folder",
			"handle.saveError": "Could not save: {reason}"
		};

		const MIME = {
			pdf: "application/pdf",
			doc: "application/msword",
			docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			ppt: "application/vnd.ms-powerpoint",
			pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
			xls: "application/vnd.ms-excel",
			xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			csv: "text/csv",
			txt: "text/plain",
			md: "text/markdown",
			json: "application/json",
			html: "text/html",
			zip: "application/zip",
			png: "image/png",
			jpg: "image/jpeg",
			jpeg: "image/jpeg",
			webp: "image/webp",
			gif: "image/gif",
			svg: "image/svg+xml",
			mp4: "video/mp4",
			mp3: "audio/mpeg"
		};

		/** Route served by this bundle's Host half. */
		const SAVE_ROUTE = "/api/drag-deliverables.save";

		function basename(path) {
			const parts = String(path).split(/[\\/]+/u);
			return parts[parts.length - 1] || "file";
		}

		function extensionOf(name) {
			const index = name.lastIndexOf(".");
			return index <= 0 ? "" : name.slice(index + 1).toLowerCase();
		}

		function mimeOf(name) {
			return MIME[extensionOf(name)] || "application/octet-stream";
		}

		function isAbsoluteHostPath(path) {
			return /^[a-zA-Z]:[\\/]/u.test(path) || /^\\\\[^\\]/u.test(path);
		}

		/**
		* Absolute source path of one delivered-file card. The card's hidden
		* preview button carries the resolved workspace path in its `title`.
		* @param card - the owning `[data-presented-file]` element.
		* @returns the absolute path, or null when the card exposes none.
		*/
		function pathOfCard(card) {
			if (!card) return null;
			const source = card.querySelector("button[title]");
			const raw = source === null || source === void 0 ? void 0 : source.getAttribute("title");
			const path = typeof raw === "string" ? raw.trim() : "";
			return isAbsoluteHostPath(path) ? path : null;
		}

		/** Optional native drag bridge exposed only by a patched Desktop shell. */
		function nativeBridge() {
			const bridge = window.dshDragDeliverable;
			return bridge !== null && bridge !== void 0 && typeof bridge.start === "function" ? bridge : null;
		}

		/**
		* Start the platform-native file drag. Returns whether the shell took over;
		* without a bridge the caller keeps the plain browser behaviour.
		*/
		function startNativeDrag(event, path, name) {
			const bridge = nativeBridge();
			if (bridge === null || path === null) return false;
			event.preventDefault();
			try {
				bridge.start(path);
			} catch (_error) {}
			return true;
		}

		/** Ask this bundle's Host half to copy one file into `directory`. */
		async function saveToDirectory(source, directory) {
			const response = await fetch(SAVE_ROUTE, {
				method: "POST",
				credentials: "same-origin",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ path: source, directory })
			});
			const payload = await response.json().catch(() => null);
			if (!response.ok || payload === null || payload.ok !== true) {
				throw new Error(payload === null || payload === void 0 ? void 0 : payload.error || `HTTP ${response.status}`);
			}
			return payload.path;
		}

		function translate(props, key, fallback) {
			const t = props === null || props === void 0 ? void 0 : props.t;
			if (typeof t !== "function") return fallback;
			try {
				const value = t(key);
				return typeof value === "string" && value.length > 0 && value !== key ? value : fallback;
			} catch (_error) {
				return fallback;
			}
		}

		function format(template, replacements) {
			return template.replace(/\{(\w+)\}/gu, (match, name) => {
				return Object.hasOwn(replacements, name) ? String(replacements[name]) : match;
			});
		}

		const SAVE_ICON = h(
			"svg",
			{
				viewBox: "0 0 24 24",
				width: 15,
				height: 15,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 1.8,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": true,
				style: { flex: "none", display: "block" }
			},
			h("path", { d: "M12 3v10" }),
			h("path", { d: "m8 9 4 4 4-4" }),
			h("path", { d: "M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" })
		);

		/**
		* Save handle rendered beside the native open control of one delivered
		* file card. A click opens the Host folder picker and copies the file
		* there; a drag exports the file when the shell supports native drags.
		* @param props - slot props plus this plugin's `pickFolder`.
		* @returns the handle button.
		*/
		function DragDeliverableAction(props) {
			const handleRef = React.useRef(null);
			const pathRef = React.useRef(null);
			const [ready, setReady] = React.useState(false);
			const [hover, setHover] = React.useState(false);
			const [phase, setPhase] = React.useState("idle");
			const [note, setNote] = React.useState("");

			React.useEffect(() => {
				const handle = handleRef.current;
				if (handle === null) return;
				const card = handle.closest("[data-presented-file]");
				const path = pathOfCard(card);
				if (path === null) {
					pathRef.current = null;
					setReady(false);
					return;
				}
				pathRef.current = path;
				setReady(true);
				// Only a patched shell can start a real file drag; otherwise the
				// browser drag payload would silently do nothing in the Desktop app.
				const onDragStart = (event) => {
					if (event.target === handle) return;
					startNativeDrag(event, pathRef.current, basename(pathRef.current));
				};
				card.setAttribute("draggable", "true");
				card.addEventListener("dragstart", onDragStart);
				return () => {
					card.removeEventListener("dragstart", onDragStart);
					card.removeAttribute("draggable");
				};
			}, [props.actionUrl]);

			React.useEffect(() => {
				if (phase !== "saved") return undefined;
				const timer = window.setTimeout(() => {
					setPhase("idle");
					setNote("");
				}, 2600);
				return () => window.clearTimeout(timer);
			}, [phase]);

			const save = async (directory) => {
				const source = pathRef.current;
				if (source === null || phase === "saving") return;
				setPhase("saving");
				try {
					const saved = await saveToDirectory(source, directory);
					setPhase("saved");
					setNote(basename(saved));
				} catch (error) {
					setPhase("idle");
					setNote("");
					window.alert(format(translate(props, "handle.saveError", zh["handle.saveError"]), {
						reason: String((error === null || error === void 0 ? void 0 : error.message) ?? error)
					}));
				}
			};

			const onClick = async () => {
				if (pathRef.current === null || phase === "saving") return;
				let picked = null;
				try {
					picked = await props.pickFolder();
				} catch (_error) {
					picked = null;
				}
				if (typeof picked !== "string" || picked.length === 0) return;
				await save(picked);
			};

			const onHandleDragStart = (event) => {
				const path = pathRef.current;
				if (path === null) return;
				startNativeDrag(event, path, basename(path));
			};

			const busy = phase === "saving";
			const canDrag = nativeBridge() !== null;
			const title =
				phase === "saved"
					? format(translate(props, "handle.saved", zh["handle.saved"]), { name: note })
					: busy
						? translate(props, "handle.saving", zh["handle.saving"])
						: canDrag
							? translate(props, "handle.dragTitle", zh["handle.dragTitle"])
							: translate(props, "handle.title", zh["handle.title"]);

			return h(
				"button",
				{
					ref: handleRef,
					type: "button",
					"data-drag-deliverable": true,
					draggable: (ready && canDrag) || undefined,
					title,
					"aria-label": translate(props, "handle.aria", zh["handle.aria"]),
					"data-phase": phase,
					disabled: !ready || busy,
					onDragStart: onHandleDragStart,
					onClick,
					onPointerEnter: () => setHover(true),
					onPointerLeave: () => setHover(false),
					style: {
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 26,
						height: 26,
						marginRight: 2,
						padding: 0,
						border: 0,
						borderRadius: "var(--dsw-radius-sm, 6px)",
						background: hover && ready ? "var(--dsw-alias-interactive-bg-hover, rgba(0,0,0,.06))" : "transparent",
						color: ready ? (phase === "saved" ? "var(--dsw-alias-state-success-primary, #1a7f37)" : "var(--dsw-alias-label-secondary, #6b6b6b)") : "var(--dsw-alias-label-quaternary, #b5b5b5)",
						cursor: ready && !busy ? "pointer" : "default",
						opacity: busy ? 0.55 : 1,
						flex: "none",
						pointerEvents: "auto"
					}
				},
				SAVE_ICON
			);
		}

		return {
			inject: ["slots", "locale", "uiWorkspace"],
			apply(ctx) {
				/** Ask the Desktop shell for a folder; falls back to the Host picker. */
				const pickFolder = async () => {
					const desktop = globalThis.__DSH_DIRECTORY_PICKER__;
					if (desktop !== undefined && typeof desktop.pick === "function") return await desktop.pick();
					return ctx.uiWorkspace.pickDirectory();
				};
				ctx.effect(() => ctx.locale.register(NS, { zh, en }), "drag-deliverables: dictionaries");
				ctx.slots.inject("deliverables.file.actions", () => {
					return ctx.slots.register(
						{
							name: "deliverables.file.actions",
							id: "drag-deliverable",
							order: 1,
							locale: NS
						},
						(props) => h(DragDeliverableAction, { ...props, pickFolder })
					);
				});
			}
		};
	}
});
