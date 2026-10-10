import { createServer } from "node:http";
import { watch } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const contentTypes = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2"
};
const privateFolders = new Set(["node_modules", "tests", "e2e", "scripts", "docs", "archivo", "reports", "test-results", "playwright-report"]);
const refreshScript = `<script>(()=>{const events=new EventSource("/__preview/events");events.addEventListener("reload",()=>location.reload());})();</script>`;

function allowedPath(path) {
  return !path.split(/[\\/]/).some(part => part.startsWith(".") || privateFolders.has(part))
    && Object.hasOwn(contentTypes, extname(path).toLowerCase());
}

export async function createPreviewServer(directory, { port = 5502 } = {}) {
  const root = await realpath(directory);
  const clients = new Set();
  let changeTimer;
  const server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405).end();
      return;
    }
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname === "/__preview/events") {
      response.writeHead(200, { "Content-Type": "text/event-stream", Connection: "keep-alive" });
      response.write("event: ready\ndata: ready\n\n");
      clients.add(response);
      request.on("close", () => clients.delete(response));
      return;
    }
    try {
      const path = decodeURIComponent(url.pathname).replace(/^[/\\]+/, "") || "index.html";
      if (!allowedPath(path)) { response.writeHead(404).end(); return; }
      const filename = await realpath(resolve(root, path));
      const scoped = relative(root, filename);
      if (scoped.startsWith(`..${sep}`) || scoped === ".." || isAbsolute(scoped)
        || !allowedPath(scoped) || !(await stat(filename)).isFile()) {
        response.writeHead(404).end();
        return;
      }
      const data = await readFile(filename);
      const extension = extname(filename).toLowerCase();
      response.writeHead(200, { "Content-Type": contentTypes[extension] });
      response.end(request.method === "HEAD" ? undefined : extension === ".html"
        ? data.toString().replace(/<\/body>/i, `${refreshScript}</body>`) : data);
    } catch (error) {
      if (["ENOENT", "ENOTDIR"].includes(error.code) || error instanceof URIError) {
        response.writeHead(404).end();
      } else {
        console.error("No se pudo servir la vista previa:", error.message);
        response.writeHead(500).end("No se pudo cargar el archivo. Revisa la terminal.");
      }
    }
  });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", accept);
  });
  const watcher = watch(root, { recursive: true }, (_, filename) => {
    if (!filename || !allowedPath(filename)) return;
    clearTimeout(changeTimer);
    changeTimer = setTimeout(() => {
      for (const client of clients) client.write("event: reload\ndata: changed\n\n");
    }, 500);
  });
  watcher.on("error", error => console.error("La recarga automatica dejo de vigilar archivos:", error.message));
  return {
    port: server.address().port,
    close: async () => {
      clearTimeout(changeTimer);
      watcher.close();
      for (const client of clients) client.end();
      server.closeIdleConnections();
      await new Promise((accept, reject) => server.close(error => error ? reject(error) : accept()));
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const preview = await createPreviewServer(process.cwd());
  console.log(`Vista previa local con recarga automatica: http://127.0.0.1:${preview.port}`);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => { await preview.close(); process.exit(0); });
  }
}
