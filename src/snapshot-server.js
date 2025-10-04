#!/usr/bin/env node
/**
 * Minimal HTTP server that captures a single frame from an RTSP stream
 * using ffmpeg and returns it either as base64-encoded JSON or as binary.
 */
const http = require('http');
const { spawn } = require('child_process');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8080);
const RTSP_URL = process.env.RTSP_URL;
const FFMPEG_BIN = process.env.FFMPEG_BIN || 'ffmpeg';
const DEFAULT_TIMEOUT_MS = 10_000;

if (!RTSP_URL) {
  console.error('Environment variable RTSP_URL must be set.');
  process.exit(1);
}

function captureFrame({ timeoutMs = DEFAULT_TIMEOUT_MS, imageCodec = 'mjpeg' } = {}) {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      '-rtsp_transport', 'tcp',
      '-y',
      '-i', RTSP_URL,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', imageCodec,
      'pipe:1',
    ];

    const child = spawn(FFMPEG_BIN, ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Timeout after ${timeoutMs} ms`));
    }, timeoutMs);

    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(Buffer.concat(stdoutChunks));
      } else {
        const stderr = Buffer.concat(stderrChunks).toString('utf8');
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Only GET is supported' }));
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname !== '/' && url.pathname !== '/snapshot') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const responseType = url.searchParams.get('response') || 'base64';
  const codec = url.searchParams.get('codec') || 'mjpeg';
  const timeout = Number(url.searchParams.get('timeout_ms') || DEFAULT_TIMEOUT_MS);

  try {
    const imageBuffer = await captureFrame({ timeoutMs: timeout, imageCodec: codec });

    if (responseType === 'binary') {
      res.writeHead(200, {
        'Content-Type': codec === 'png' ? 'image/png' : 'image/jpeg',
        'Content-Length': imageBuffer.length,
        'Cache-Control': 'no-store',
      });
      res.end(imageBuffer);
      return;
    }

    const base64 = imageBuffer.toString('base64');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({
      format: codec === 'png' ? 'png' : 'jpeg',
      size: imageBuffer.length,
      data: base64,
    }));
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Snapshot server listening on port ${PORT}`);
});
