import { appendFileSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join } from "node:path";
import { homedir, tmpdir } from "node:os";

/** Diagnostic trail for activation and every save request. */
const LOG = join(tmpdir(), "dsh-save-deliverables.log");

function trace(...parts) {
	try {
		appendFileSync(LOG, `${new Date().toISOString()} ${parts.join(" ")}\n`);
	} catch {}
}

/**
 * Resolve the folder the renderer asked for. Only the literal `desktop`
 * alias or an existing absolute directory is accepted.
 */
function resolveTargetDirectory(directory) {
	if (typeof directory !== "string" || directory.length === 0) return undefined;
	if (directory === "desktop") return join(homedir(), "Desktop");
	if (!isAbsolute(directory) || !existsSync(directory)) return undefined;
	let info;
	try {
		info = statSync(directory);
	} catch {
		return undefined;
	}
	return info.isDirectory() ? directory : undefined;
}

/**
 * Pick a non-colliding destination name: `report.pdf`, then `report (2).pdf`.
 */
function uniqueTarget(directory, name) {
	const stem = name.slice(0, name.length - extname(name).length) || name;
	const extension = extname(name);
	let candidate = join(directory, name);
	for (let index = 2; existsSync(candidate) && index < 1000; index += 1) {
		candidate = join(directory, `${stem} (${index})${extension}`);
	}
	return candidate;
}

function failure(status, message) {
	return new Response(JSON.stringify({ ok: false, error: message }), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}

/**
 * Copy one delivered workspace file into a folder the user chose.
 * @param request - authenticated POST carrying `{ path, directory }`.
 */
async function handleSave(request) {
	let body;
	try {
		body = await request.json();
	} catch {
		return failure(400, "invalid JSON body");
	}
	const source = body?.path;
	const directory = resolveTargetDirectory(body?.directory);
	if (typeof source !== "string" || !isAbsolute(source)) return failure(400, "absolute source path required");
	if (directory === undefined) return failure(400, "unusable target directory");
	const name = basename(source);
	const target = uniqueTarget(directory, name);
	trace("save", source, "->", target);
	try {
		mkdirSync(dirname(target), { recursive: true });
		copyFileSync(source, target);
	} catch (error) {
		trace("save-failed", source, String(error));
		return failure(500, String(error?.message ?? error));
	}
	trace("saved", target);
	return new Response(JSON.stringify({ ok: true, path: target, name: basename(target) }), {
		status: 200,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}

/** Authenticated route that copies a delivered file into a chosen folder. */
export const inject = ["connection"];

export function apply(ctx) {
	trace("apply: host half active");
	ctx.effect(
		() =>
			ctx.connection.fetch.register({
				path: "/api/drag-deliverables.save",
				methods: ["POST"],
				requestBody: "buffered",
				fetch: (request) => handleSave(request),
			}),
		"drag-deliverables: save route",
	);
}
