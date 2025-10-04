# Capture frame from RTSP and use it in n8n

This repository contains a tiny Node.js HTTP service that relies on `ffmpeg` to grab a single frame from an RTSP stream. The service is designed to be run alongside n8n so that you can trigger snapshot capture from a workflow using the HTTP Request node (or any other trigger you prefer).

## Prerequisites

- Node.js 18 or newer
- `ffmpeg` available on the machine where n8n runs
- An RTSP URL exposed by your camera (e.g. `rtsp://user:pass@ip-address:554/stream`)

## Installation

```bash
# Clone the repository and move inside it
npm install
```

No additional dependencies are required because the service uses Node's built-in modules and shelling out to `ffmpeg`.

## Configuration

The service reads configuration from environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `RTSP_URL` | **Required.** Full RTSP URL to your camera stream. | — |
| `PORT` | HTTP port for the snapshot server. | `8080` |
| `FFMPEG_BIN` | Path to the `ffmpeg` binary if it is not in `PATH`. | `ffmpeg` |

You can set them inline when starting the service or using an `.env` manager of your choice.

## Usage

Start the server:

```bash
RTSP_URL="rtsp://user:pass@camera/stream" npm start
```

Once the server is running, you can request snapshots:

- `GET /snapshot` (or `GET /`) returns JSON with a base64-encoded image.
- `GET /snapshot?response=binary` streams the raw image with the correct content-type header.
- Optional query parameters:
  - `codec=png` (default is `mjpeg` → JPEG output).
  - `timeout_ms=15000` to change the capture timeout (default 10 seconds).

### Example cURL

```bash
curl "http://localhost:8080/snapshot" \
  | jq -r '.data' \
  | base64 --decode \
  > snapshot.jpg
```

```bash
curl -o snapshot.jpg "http://localhost:8080/snapshot?response=binary"
```

## Integrating with n8n

1. **Create a new workflow** and add a trigger (Cron, Webhook, or Manual trigger).
2. **Add an HTTP Request node** configured as follows:
   - Method: `GET`
   - URL: `http://localhost:8080/snapshot?response=binary`
   - Response: set `Response Format` to `File` so the binary payload is passed along.
3. Optionally follow with a **Move Binary Data** or **Function** node to convert the binary to base64 or store it.
4. Continue your workflow (send to Telegram/Email, store in S3, run OpenCV processing, etc.).

For periodic snapshots, combine the Cron trigger with the HTTP Request node. For event-driven snapshots, use a Webhook trigger or any other node that leads to the HTTP Request node.

## Running as a background service

For long-running usage on the same host as n8n, consider using `pm2`, `systemd`, or Docker to keep the service alive. A simple systemd unit could look like:

```ini
[Unit]
Description=RTSP snapshot service for n8n
After=network.target

[Service]
Environment=RTSP_URL=rtsp://user:pass@camera/stream
WorkingDirectory=/opt/n8n-rtsp-snapshot
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Adjust the paths and environment variables as needed for your setup.

## Troubleshooting

- If you see timeouts, check network connectivity to the camera and try increasing `timeout_ms`.
- Use `FFMPEG_BIN` if `ffmpeg` is installed in a non-standard location.
- Review logs printed by the service to diagnose `ffmpeg` errors (wrong URL, authentication issues, unsupported codec, etc.).

## License

MIT
