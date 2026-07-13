# Prometheus and Grafana

This directory installs `kube-prometheus-stack`, which includes Prometheus,
Grafana, Alertmanager, and Kubernetes metrics. The application exposes
Prometheus metrics at `/metrics`; the chart's ServiceMonitor scrapes it every
15 seconds. `mediasoup-dashboard.yaml` is auto-imported by Grafana.

## Install on the k3s server

Set a strong Grafana password in `values.yaml`, then run:

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --values k8s/monitoring/values.yaml
kubectl apply -f k8s/monitoring/mediasoup-dashboard.yaml
```

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

For initial Grafana access, avoid exposing it publicly. Port-forward it:

```bash
kubectl -n monitoring port-forward service/kube-prometheus-stack-grafana 3000:80
```

Open `http://127.0.0.1:3000`, log in as `admin`, and use the password from
`values.yaml`. The **Mediasoup Overview** dashboard appears automatically.
