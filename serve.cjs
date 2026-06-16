const ROOT = require("path").resolve(__dirname);
const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  html: "text/html",
  js: "application/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  webp: "image/webp",
  png: "image/png",
  ico: "image/x-icon",
};

http.createServer((req, res) => {
  let urlPath = req.url.split("?")[0];
  let filePath = path.resolve(ROOT, "." + decodeURIComponent(urlPath));

  // Directory traversal guard
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  // Default to index.html
  if (filePath === ROOT || urlPath === "/") {
    filePath = path.join(ROOT, "index.html");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found: " + filePath);
      return;
    }
    const ext = filePath.split(".").pop().toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "text/plain",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}).listen(3000, () => {
  console.log("Ready: http://localhost:3000");
});
