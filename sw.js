/* sw.js */
/* MODIFY IMPORT PATHS TO POINT TO YOUR SCRIPTS, REPLACE IF USING MODULE-TYPE WORKER */
// We're using the npm package xhr-shim, which assigns self.XMLHttpRequestShim
importScripts("./xhr-shim.js");
self.XMLHttpRequest = self.XMLHttpRequestShim;
importScripts("./pyodide.js");
// importScripts("./pyodide.asm.js"); // if loading Pyodide after installation phase, you'll need to import this too

let handleRequest;
let pyodide;
const pyodideReady = loadPyodide({}).then(async (_pyodide) => {
  pyodide = _pyodide;
  let namespace = pyodide.globals.get("dict")();

  await pyodide.loadPackage("packaging");
  await pyodide.loadPackage("micropip");

  await pyodide.runPythonAsync(
    `
    import micropip

    await micropip.install("ssl")
    await micropip.install("httpx")
    await micropip.install('fastapi')

    from fastapi import FastAPI
    from fastapi.responses import HTMLResponse
    import random

    from httpx import AsyncClient

    app = FastAPI()

    def generate_html_response():
        html_content = """
        <html>
            <head>
                <title>Some HTML in here</title>
            </head>
            <body>
                <h1>Look ma! HTML! From FastAPI! In a service worker! ✨</h1>
            </body>
        </html>
        """

        return HTMLResponse(content=html_content, status_code=200)

    @app.get("/", response_class=HTMLResponse)
    async def root():
        return generate_html_response()

    @app.get("/json")
    async def json():
        return {"message": random.choice(["Hello World", "Bonjour le monde", "Hola Mundo"])}

    @app.get("/emoji")
    async def emoji():
        return {"emoji": random.choice(["👋", "👋🏻", "👋🏼", "👋🏽", "👋🏾", "👋🏿"])}

    async def handle_request(request):
        async with AsyncClient(app=app, base_url="http://testserver") as client:
            response = await client.get(request.url)

        return response.text, response.status_code, response.headers.items()
    `,
    { globals: namespace }
  );

  handleRequest = namespace.get("handle_request");

  namespace.destroy();
});

// Code below is for easy iteration during development, you may want to remove or modify in a prod environment:

// Immediately become the active service worker once installed, so we don't have a stale service worker intercepting requests
// You can remove this code and achieve a similar thing by enabling "Update on Reload" in devtools, if supported:
// https://web.dev/service-worker-lifecycle/#update-on-reload
self.addEventListener("install", function () {
  self.skipWaiting();
});

// With this, we won't need to reload the page before the service worker can intercept fetch requests
// https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim#examples
self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      await pyodideReady;

      const [text, statusCode, headers] = await handleRequest(event.request);

      return new Response(text, {
        headers,
        status: statusCode,
      });
    })()
  );
});
