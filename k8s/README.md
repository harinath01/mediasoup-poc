# k3s deployment

The image contains both parts: the React client is built during image build and
served by the Node/mediasoup server. One `app` container in one Pod runs the
entire current application.

## Before applying

1. In `base/kustomization.yaml`, replace `CHANGE_ME` with the k3s node's public IP.
2. Create an A record for `liveproctoring.tpsentinel.com` pointing to that IP.
3. Point DNS at the k3s node and allow TCP 80/443 and UDP `40000-40100` through node and cloud firewalls.

Enable TLS in the ingress before using camera/microphone outside localhost; browsers require a secure context. The UDP range is bounded by `MEDIASOUP_RTC_MIN_PORT` and `MEDIASOUP_RTC_MAX_PORT`.

## Build and load on a single-node cluster

```bash
docker build -t mediasoup-poc:latest .
docker save mediasoup-poc:latest | sudo k3s ctr images import -
kubectl apply -k k8s/base
kubectl -n liveproctoring rollout status deployment/mediasoup-poc
```

For multiple nodes, push the image to a registry each node can reach, then set `newName` and `newTag` in `base/kustomization.yaml`.

## Verify

```bash
kubectl -n liveproctoring get pods,svc,ingress
kubectl -n liveproctoring logs deployment/mediasoup-poc -f
```

The Deployment intentionally remains at one replica. Rooms and signalling are currently held in process memory, so scaling the app before adding shared state and sticky routing could split a room's participants across Pods.

## Local k3d smoke test

`k3d` runs k3s nodes in Docker, making it suitable for checking the image,
Kubernetes resources, Service, and Traefik routing before using the server.

```bash
docker build -t mediasoup-poc:local .
k3d cluster create liveproctoring-local -p "8080:80@loadbalancer"
export KUBECONFIG="$(k3d kubeconfig write liveproctoring-local)"
k3d image import mediasoup-poc:local -c liveproctoring-local
kubectl apply -k k8s/overlays/local
kubectl -n liveproctoring rollout status deployment/mediasoup-poc
curl --fail --resolve liveproctoring.localhost:8080:127.0.0.1 \
  http://liveproctoring.localhost:8080/api/metrics
```

Open `http://liveproctoring.localhost:8080` to check the client page. This
local smoke test does not prove external WebRTC media connectivity: k3d runs
k3s inside Docker and the Pod's host network is the Docker node, not your
physical machine. Verify browser audio/video after deployment on the k3s server
with its public IP and UDP firewall range in place.

Delete the local cluster when finished:

```bash
k3d cluster delete liveproctoring-local
```
