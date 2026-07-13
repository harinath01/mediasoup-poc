locals {
  common_labels = {
    project = var.project_name
    role    = "mediasoup"
    managed = "terraform"
  }
}

resource "hcloud_ssh_key" "admin" {
  name       = var.ssh_key_name
  public_key = file(pathexpand(var.ssh_public_key_path))
  labels     = local.common_labels
}

resource "hcloud_server" "mediasoup" {
  name        = "${var.project_name}-mediasoup-1"
  server_type = var.server_type
  image       = var.image
  location    = var.location
  ssh_keys    = [hcloud_ssh_key.admin.id]
  labels = merge(local.common_labels, {
    "k3s-node-role" = "server"
  })

  # k3s includes Traefik by default. The app, monitoring stack, and later k6
  # TestRuns are deliberately deployed separately through Kubernetes manifests.
  user_data = <<-CLOUD_INIT
    #cloud-config
    package_update: true
    packages:
      - curl
    runcmd:
      - curl -sfL https://get.k3s.io | sh -s - server --write-kubeconfig-mode 0644
  CLOUD_INIT
}
