# Prometheus and Grafana

This directory installs `kube-prometheus-stack`, which includes Prometheus,
Grafana, Alertmanager, and Kubernetes metrics. The application exposes
Prometheus metrics at `/metrics`; the chart's ServiceMonitor scrapes it every
15 seconds. `mediasoup-dashboard.yaml` is auto-imported by Grafana.

## Install on the k3s server

Set a strong Grafana password in `values.yaml`, then run the automated setup
script from the repository root:

```bash
deploy/setup-monitoring.sh
```

For a complete new-server setup, prefer `deploy/setup-poc.sh`; it prompts for
the password and passes it to this script without writing it to the repository.

Build and deploy the application image containing the `/metrics` endpoint
before expecting metrics:

```bash
kubectl apply -k k8s/base
kubectl -n liveproctoring rollout restart deployment/mediasoup-poc
```

## Verify

```bash
kubectl -n monitoring get pods
kubectl -n monitoring get servicemonitor
kubectl -n liveproctoring port-forward service/mediasoup-poc 3001:80
curl http://127.0.0.1:3001/metrics
```

For this POC, the setup script creates a NodePort Service. Once the Grafana Pod
is ready, open:

```text
http://<terraform-server-ip>:30300
```

Log in as `admin`, and use the password from `values.yaml`. The **Mediasoup
Overview** dashboard appears automatically. This endpoint is plain HTTP; use a
Grafana DNS name and TLS rather than a public NodePort outside this POC.
