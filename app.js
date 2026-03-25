const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');

// Standalone mode: Next.js outputs a self-contained server
const next = require(path.join(__dirname, '.next', 'standalone', 'node_modules', 'next', 'dist', 'server', 'next.js')).default || require('next');

const dev = false;
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT, 10) || 3000;

const app = next({ dev, hostname, port, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  }).listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
