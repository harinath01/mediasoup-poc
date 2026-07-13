# k3s deployment

The image contains both parts: the React client is built during image build and
served by the Node/mediasoup server. One `app` container in one Pod runs the
entire current application.

## Before applying

1. Create an A record for `liveproctoring.tpsentinel.com` pointing to the k3s node's public IP.
2. Allow TCP 80/443 and UDP `40000-40999` through node and cloud firewalls.
3. When the server was created with this repository's Terraform configuration,
   use `deploy/apply-k3s.sh`. It reads Terraform's public IP output and sets
   `MEDIASOUP_LISTEN_IP` automatically.

Enable TLS in the ingress before using camera/microphone outside localhost; browsers require a secure context. The UDP range is bounded by `MEDIASOUP_RTC_MIN_PORT` and `MEDIASOUP_RTC_MAX_PORT`.

## TLS certificate

For the Terraform-created server, run this once after the GoDaddy A record
resolves to the server IP:

```bash
deploy/setup-tls.sh
```

It installs cert-manager from its official manifest, registers the Let's Encrypt account for
`support@testpress.in`, requests the certificate, and configures Traefik to use
it for `liveproctoring.tpsentinel.com`. HTTP port 80 must remain publicly
reachable so Let's Encrypt can complete its validation.

## Build and load on a single-node cluster

```bash
docker build -t mediasoup-poc:latest .
docker save mediasoup-poc:latest | sudo k3s ctr images import -
kubectl apply -k k8s/base
kubectl -n liveproctoring rollout status deployment/mediasoup-poc
```

## Terraform-created server deployment

After configuring `KUBECONFIG` for the new k3s server, deploy with:

```bash
deploy/apply-k3s.sh
```

The script reads `terraform output -raw mediasoup_public_ipv4`, updates the
application ConfigMap, builds the local image, imports it into the single k3s
server, and restarts the Pod. This ensures mediasoup announces the same public
address that Terraform created and GoDaddy points to.

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
