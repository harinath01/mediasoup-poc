# Mediasoup Examination Monitoring POC

This project is a proof of concept for remotely monitoring online examination sessions with [mediasoup](https://mediasoup.org/). Students share their camera, screen, and microphone, while staff monitor the room from a paginated 20-tile video grid and can focus on one student at higher quality with audio.

## Project architecture

One room represents one examination session.

- Students publish camera video, screen video, and microphone audio streams.
- Staff monitor students in a 20-tile grid. Grid video uses the lower simulcast layer and audio is not consumed by default, reducing bandwidth and processing cost.
- Staff can focus on one student to consume that student's higher-resolution video layer and microphone audio.
- Each room is designed to run on a single mediasoup worker. A worker uses one CPU core, leaving the remaining cores available for signaling, chat, monitoring, and other application services.
- HTTP endpoints handle room and media signaling, while Socket.IO provides room presence, chat, and live producer updates.

```text
Student browsers                     Staff browser
camera + screen + microphone         20-tile grid + focused view
          |                                      |
          +------------- WebRTC ----------------+
                             |
                    mediasoup room/worker
                             |
                 Express API + Socket.IO
             signaling, presence, chat, metrics
```

## Project structure

| Path | Description |
| --- | --- |
| `client/` | React and Vite client with student and staff experiences, mediasoup-client integration, room chat, and monitoring UI. |
| `server/` | Express, Socket.IO, and mediasoup server containing signaling routes, room state, worker management, chat, and metrics. |
| `Dockerfile` | Multi-stage production image that builds both applications and serves them from one container. |
| `k8s/` | Kubernetes resources and deployment documentation. |
| `deploy/` | Scripts for cluster bootstrap, deployment, TLS, monitoring, and test setup. |
| `terraform/` | Infrastructure provisioning configuration. |
| `load_testing/` | k6 browser and mediasoup session load tests. |
| `docs/` | Capacity, monitoring, and infrastructure documentation. |

## Prerequisites

For local development, install:

- Node.js 22
- pnpm 10
- A browser with camera, microphone, and screen-sharing support

Docker is the only prerequisite when running the containerized application.

## Run locally

Install and start the server:

```bash
cd server
pnpm install --frozen-lockfile
pnpm start
```

In a second terminal, install and start the client:

```bash
cd client
pnpm install --frozen-lockfile
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). The Vite development server proxies API and WebSocket requests to the server at `http://localhost:3001`.

To try an examination session:

1. Open the student page, enter a name and room ID, and grant the requested media permissions.
2. Open the staff page in another browser window, refresh the room list, and join the same room.

The `pnpm start` command detects the machine's local IP address on Linux or macOS and uses it as the mediasoup announced IP. This allows other devices on the same network to establish WebRTC media connections without additional configuration. The server uses UDP ports `40000-40999` for WebRTC media, so allow that range through the host firewall when testing from another device.

To override the detected address, set `MEDIASOUP_LISTEN_IP` before starting the server:

```bash
MEDIASOUP_LISTEN_IP=192.0.2.10 pnpm start
```

## Run with Docker

Build the image from the repository root:

```bash
docker build -t mediasoup-poc .
```

Run the application:

```bash
docker run --rm \
  --name mediasoup-poc \
  -p 3001:3001 \
  -p 40000-40999:40000-40999/udp \
  -e MEDIASOUP_LISTEN_IP=127.0.0.1 \
  mediasoup-poc
```

Open [http://localhost:3001](http://localhost:3001). The production server serves the built React client, API, and Socket.IO connection from the same port.

For access from another machine, replace `127.0.0.1` with the Docker host's reachable LAN or public IP. Make sure TCP port `3001` and UDP ports `40000-40999` are allowed by the host firewall and any cloud firewall or security group.

The container accepts these optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Address used by the HTTP server. |
| `PORT` | `3001` | HTTP, API, and Socket.IO port. |
| `MEDIASOUP_LISTEN_IP` | `127.0.0.1` | IP address announced to WebRTC peers. |
| `MEDIASOUP_RTC_MIN_PORT` | `40000` | First UDP port available to mediasoup. |
| `MEDIASOUP_RTC_MAX_PORT` | `40999` | Last UDP port available to mediasoup. |

## Production build without Docker

Build both applications:

```bash
pnpm --dir client install --frozen-lockfile
pnpm --dir server install --frozen-lockfile
pnpm --dir client build
pnpm --dir server build
pnpm --dir server start:prod
```

The application is then available at [http://localhost:3001](http://localhost:3001).
