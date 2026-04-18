const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const PORT = Number(process.env.PORT) || 8000;
const ROOT_DIR = __dirname;
const WORDS_PATH = path.join(ROOT_DIR, "data", "words.csv");

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  try {
    if (!request.url) {
      respondWithError(response, 400, "Bad request.");
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (url.pathname === "/api/words") {
      await handleWordsApi(request, response);
      return;
    }

    await serveStaticFile(url.pathname, response);
  } catch (error) {
    respondWithError(response, 500, error instanceof Error ? error.message : "Unexpected server error.");
  }
});

server.listen(PORT, () => {
  console.log(`Memory Game running at http://localhost:${PORT}`);
});

async function handleWordsApi(request, response) {
  if (request.method === "GET") {
    const csvText = await fs.readFile(WORDS_PATH, "utf8");
    response.writeHead(200, { "Content-Type": MIME_TYPES[".csv"] });
    response.end(csvText);
    return;
  }

  if (request.method === "PUT") {
    const body = await readRequestBody(request);
    await fs.writeFile(WORDS_PATH, body, "utf8");
    response.writeHead(204);
    response.end();
    return;
  }

  respondWithError(response, 405, "Method not allowed.");
}

async function serveStaticFile(urlPath, response) {
  const relativePath = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const requestedPath = path.normalize(path.join(ROOT_DIR, relativePath));

  if (!requestedPath.startsWith(ROOT_DIR)) {
    respondWithError(response, 403, "Forbidden.");
    return;
  }

  let filePath = requestedPath;

  try {
    const stats = await fs.stat(filePath);
    if (stats.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    respondWithError(response, 404, "Not found.");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extension] || "application/octet-stream";
  const fileBuffer = await fs.readFile(filePath);
  response.writeHead(200, { "Content-Type": contentType });
  response.end(fileBuffer);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    request.on("error", reject);
  });
}

function respondWithError(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}
