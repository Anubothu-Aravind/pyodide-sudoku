/// <reference lib="webworker" />
import type { WorkerRequest, WorkerResponse } from './types'

declare const self: DedicatedWorkerGlobalScope

let pyodideInstance: any = null
let isInitializing = false
let initError: Error | null = null
const readyCallbacks: Array<() => void> = []

// In modern Chromium/Brave, globalThis.importScripts exists in module workers but throws DOMException when called.
// Pyodide's internal loader specifically checks `if (err instanceof TypeError) await import(e); else throw err`.
// Wrapping importScripts ensures any DOMException is converted to TypeError so Pyodide seamlessly falls back to native import().
// @ts-ignore
if (typeof self.importScripts === 'function') {
  // @ts-ignore
  const _orig = self.importScripts
  // @ts-ignore
  self.importScripts = (...args: any[]) => {
    try {
      return _orig(...args)
    } catch (err: any) {
      throw new TypeError(err?.message || 'Module scripts do not support importScripts()')
    }
  }
}

async function initPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance
  if (initError) throw initError
  if (isInitializing) {
    return new Promise((resolve) => {
      readyCallbacks.push(() => resolve(pyodideInstance))
    })
  }

  isInitializing = true

  try {
    // Robust baseUrl determination for both Vite dev mode (where worker is at /src/worker/...)
    // and production preview/build on subpaths like GitHub Pages (where worker is at <subpath>/assets/...)
    const workerHref = (typeof import.meta !== 'undefined' && import.meta.url) || self.location.href
    let baseUrl: string
    if (workerHref.includes('/assets/')) {
      baseUrl = new URL('../', workerHref).href
    } else if (workerHref.includes('/src/worker/')) {
      baseUrl = new URL('../../', workerHref).href
    } else {
      baseUrl = new URL(import.meta.env.BASE_URL || './', self.location.origin).href
    }
    const pyodideBaseUrl = new URL('pyodide/', baseUrl).href

    // Dynamically import pyodide.mjs ES module
    const { loadPyodide } = await import(/* @vite-ignore */ `${pyodideBaseUrl}pyodide.mjs`)

    const pyodide = await loadPyodide({
      indexURL: pyodideBaseUrl,
    })

    // Fetch and unpack sudoku.zip
    const sudokuZipUrl = new URL('py/sudoku.zip', baseUrl).href
    const zipResponse = await fetch(sudokuZipUrl)
    if (!zipResponse.ok) {
      throw new Error(`Failed to fetch sudoku.zip from ${sudokuZipUrl}: ${zipResponse.statusText}`)
    }
    const zipBuffer = await zipResponse.arrayBuffer()
    pyodide.unpackArchive(zipBuffer, 'zip')

    // Initialize web_api Python module
    await pyodide.runPythonAsync(`
import sys
import json
import sudoku.web_api as web_api
`)

    pyodideInstance = pyodide
    isInitializing = false

    self.postMessage({ type: 'status', ready: true })

    readyCallbacks.forEach((cb) => cb())
    readyCallbacks.length = 0

    return pyodideInstance
  } catch (err: any) {
    isInitializing = false
    initError = err
    self.postMessage({ type: 'status', ready: false, message: err?.message || String(err) })
    throw err
  }
}

// Automatically start pre-warming Pyodide as soon as worker is instantiated
initPyodide().catch((err) => {
  console.error('Worker failed to initialize Pyodide:', err)
})

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, method, params } = e.data

  try {
    const pyodide = await initPyodide()

    // Pass arguments safely via json to avoid Proxy object leakage
    const jsonParams = JSON.stringify(params || {})
    const methodStr = JSON.stringify(method)

    const pyCode = `
_out = None
try:
    _params = json.loads(${JSON.stringify(jsonParams)})
    _func = getattr(web_api, ${methodStr})
    _res = _func(**_params)
    _out = json.dumps({"ok": True, "result": _res})
except Exception as _e:
    _out = json.dumps({"ok": False, "error": str(_e)})
_out
`
    const pyOutput = await pyodide.runPythonAsync(pyCode)
    const parsed = JSON.parse(pyOutput)

    if (parsed.ok) {
      const response: WorkerResponse = {
        id,
        ok: true,
        result: parsed.result,
      }
      self.postMessage(response)
    } else {
      const response: WorkerResponse = {
        id,
        ok: false,
        error: parsed.error,
      }
      self.postMessage(response)
    }
  } catch (err: any) {
    const response: WorkerResponse = {
      id,
      ok: false,
      error: err?.message || String(err),
    }
    self.postMessage(response)
  }
}
