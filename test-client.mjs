/**
 * Executes the shipped client bundle against a small React/DOM stub to prove
 * that the save handle renders, is never hidden, and that its click path
 * reaches this bundle's Host route.
 *
 * Run: node test-client.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------- React stub
const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: { ...(props ?? {}), children: children.length === 0 ? undefined : children }
  }),
  useRef: null,
  useState: null,
  useEffect: null
};

let stateSlots = [];
let stateCursor = 0;
let effectQueue = [];
let allRefs = [];

React.useRef = (initial) => {
  const index = stateCursor++;
  if (!(index in stateSlots) || !stateSlots[index].isRef) stateSlots[index] = { isRef: true, ref: { current: initial } };
  const ref = stateSlots[index].ref;
  allRefs.push(ref);
  return ref;
};
React.useState = (initial) => {
  const index = stateCursor++;
  if (!(index in stateSlots) || stateSlots[index].isRef) stateSlots[index] = { isRef: false, value: typeof initial === "function" ? initial() : initial };
  const slot = stateSlots[index];
  return [slot.value, (next) => {
    slot.value = typeof next === "function" ? next(slot.value) : next;
  }];
};
React.useEffect = (callback) => {
  effectQueue.push(callback);
};

function resetHooks() {
  stateSlots = [];
  stateCursor = 0;
  effectQueue = [];
  allRefs = [];
}

/** Start one render pass, the way React re-runs a component body. */
function beginPass() {
  stateCursor = 0;
  effectQueue = [];
  allRefs = [];
}

// ------------------------------------------------------------------ DOM stub
const listeners = new Map();
const attrs = new Map();
const cardNode = {
  path: "C:\\work\\report.pdf",
  querySelector(selector) {
    assert.equal(selector, "button[title]", "card path comes from the preview button");
    return { getAttribute: (name) => (name === "title" ? this.path : null) };
  },
  setAttribute: (name, value) => attrs.set(name, value),
  removeAttribute: (name) => attrs.delete(name),
  addEventListener: (type, listener) => listeners.set(type, listener),
  removeEventListener: (type) => listeners.delete(type)
};
const handleNode = {
  closest: (selector) => {
    assert.equal(selector, "[data-presented-file]");
    return cardNode;
  }
};
let handleRefSeen = null;

const alerts = [];
const requests = [];
globalThis.window = {
  dshDragDeliverable: undefined,
  alert: (message) => alerts.push(message),
  setTimeout: () => 0,
  clearTimeout: () => {},
  localStorage: { getItem: () => null, setItem: () => {} }
};
globalThis.document = { baseURI: "http://127.0.0.1:62803/" };
globalThis.fetch = async (url, init) => {
  requests.push({ url, init });
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, path: "C:\\Users\\Administrator\\Desktop\\report.pdf", name: "report.pdf" })
  };
};

// ------------------------------------------------------- bundle registration
let registered = null;
globalThis.window.__ModuleLoader__ = {
  load({ id, factory }) {
    registered = { id, exports: factory((name) => {
      assert.equal(name, "react");
      return React;
    }) };
  }
};

new Function(readFileSync(join(here, "client.js"), "utf8"))();
assert.ok(registered, "client bundle registered");
assert.equal(registered.id, "dsh-drag-deliverables");

const plugin = registered.exports;
assert.deepEqual([...plugin.inject].sort(), ["locale", "slots", "uiWorkspace"]);
assert.equal(typeof plugin.apply, "function");
console.log("PASS manifest: inject =", plugin.inject.join(", "));

// ------------------------------------------------------------- apply wiring
let dictionaries = null;
let registration = null;
const fakeCtx = {
  effect(factory) {
    const cleanup = factory();
    return () => {
      if (typeof cleanup === "function") cleanup();
    };
  },
  locale: {
    register(namespace, dicts) {
      dictionaries = { namespace, dicts };
      return () => {};
    }
  },
  slots: {
    inject: (key, callback) => {
      assert.equal(key, "deliverables.file.actions");
      callback();
      return () => {};
    },
    register(options, component) {
      registration = { options, component };
      return () => {};
    }
  },
  uiWorkspace: {
    pickDirectory: async () => "C:\\Users\\Administrator\\Desktop"
  }
};

plugin.apply(fakeCtx);
assert.ok(registration, "slot registered");
assert.equal(registration.options.id, "drag-deliverable");
assert.equal(registration.options.name, "deliverables.file.actions");
assert.equal(registration.options.order, 1);
assert.equal(registration.options.locale, "drag-deliverables");
assert.ok(dictionaries, "locale registered");
assert.equal(dictionaries.namespace, "drag-deliverables");
assert.ok(dictionaries.dicts.zh["handle.title"] && dictionaries.dicts.en["handle.title"]);
console.log("PASS apply: slot + locale wired");

// --------------------------------------------------------- render the handle
const translate = (props, key) => {
  const table = dictionaries.dicts.zh;
  const template = table[key];
  assert.ok(template, `missing zh dictionary key ${key}`);
  return template;
};

function renderHandle(actionUrl = "/api/present.open?index=0") {
  resetHooks();
  // Mount pass: React runs the body, commits, then runs effects.
  beginPass();
  const outer = registration.component({ actionUrl, t: (key) => translate(null, key) });
  const element = outer.type(outer.props);

  handleRefSeen = allRefs[0];
  if (handleRefSeen !== null && handleRefSeen !== undefined) handleRefSeen.current = handleNode;

  const cleanups = [];
  const queue = [...effectQueue];
  while (queue.length > 0) {
    const callback = queue.shift();
    const cleanup = callback();
    if (typeof cleanup === "function") cleanups.push(cleanup);
  }

  // Re-render pass: the ready state the effect set is what the user sees.
  beginPass();
  const rerendered = outer.type(outer.props);
  return { element: rerendered, cleanups };
}

const { element, cleanups } = renderHandle();
assert.equal(element.type, "button", "handle is a button");
assert.equal(element.props["data-drag-deliverable"], true);
assert.equal(element.props.disabled, false, "handle must be enabled, never hidden");
assert.equal(element.props["data-phase"], "idle");
assert.equal(element.props.onClick instanceof Function, true, "click handler exists");
assert.equal(element.props.title, dictionaries.dicts.zh["handle.title"], "no native bridge -> save title");
console.log("PASS render: enabled save button, title =", element.props.title);

// Card is draggable and its dragstart routes to native drag only with a bridge.
assert.equal(attrs.get("draggable"), "true", "card marked draggable");
assert.ok(listeners.has("dragstart"), "card dragstart listener installed");
let prevented = false;
listeners.get("dragstart")({ target: {}, preventDefault: () => { prevented = true; } });
assert.equal(prevented, false, "unpatched shell must not preventDefault the browser drag");

// ------------------------------------------------------------ click saves it
assert.equal(requests.length, 0, "nothing requested yet");
await element.props.onClick();
assert.equal(alerts.length, 0, "no error alert on success");

const saveRequest = requests.find((request) => request.url === "/api/drag-deliverables.save");
assert.ok(saveRequest, "click must POST to the Host save route");
assert.equal(saveRequest.init.method, "POST");
assert.equal(saveRequest.init.credentials, "same-origin");
const body = JSON.parse(saveRequest.init.body);
assert.deepEqual(body, {
  path: "C:\\work\\report.pdf",
  directory: "C:\\Users\\Administrator\\Desktop"
});
console.log("PASS click: POST", saveRequest.url, JSON.stringify(body));

// Re-render reflects the saved phase without throwing.
const saved = renderHandle();
assert.equal(saved.element.props["data-drag-deliverable"], true);
assert.equal(typeof saved.element.props.title, "string");

// --------------------------------------------------- cleanup releases the DOM
for (const cleanup of [...cleanups, ...saved.cleanups]) cleanup();
assert.equal(attrs.has("draggable"), false, "card attribute removed on cleanup");
assert.equal(listeners.has("dragstart"), false, "card listener removed on cleanup");
console.log("PASS cleanup: card attribute + listener released");

// ------------------------------------------ patched shell takes over the drag
globalThis.window.dshDragDeliverable = { native: true, start: (path) => { started.push(path); } };
var started = [];
const patched = renderHandle();
let preventedNow = false;
patched.element.props.onDragStart({ preventDefault: () => { preventedNow = true; } });
assert.equal(preventedNow, true, "patched shell prevents the browser default");
assert.deepEqual(started, ["C:\\work\\report.pdf"], "native drag receives the source path");
console.log("PASS patched shell: native startDrag called with", started[0]);

console.log("\nALL CHECKS PASSED");
