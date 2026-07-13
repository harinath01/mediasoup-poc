variable "project_name" {
  description = "Prefix applied to all Hetzner resources created for this POC."
  type        = string
  default     = "liveproctoring-poc"
}

variable "location" {
  description = "Hetzner Cloud location for the mediasoup server, for example fsn1 or ash-dc1."
  type        = string
  default     = "fsn1"
}

variable "server_type" {
  description = "Hetzner server type for the persistent k3s/mediasoup node."
  type        = string
  default     = "cpx41"
}

variable "image" {
  description = "Operating-system image for the server."
  type        = string
  default     = "ubuntu-24.04"
}

variable "ssh_public_key_path" {
  description = "Path to the SSH public key that can log in as root on the new server."
  type        = string
}

variable "ssh_key_name" {
  description = "A unique, descriptive name for the uploaded Hetzner SSH key."
  type        = string
  default     = "liveproctoring-poc-admin"
}

variable "k6_runner_count" {
  description = "Number of temporary k3s agent servers dedicated to k6 browser runners. Set to 0 when no test is running."
  type        = number
  default     = 0

  validation {
    condition     = var.k6_runner_count >= 0 && floor(var.k6_runner_count) == var.k6_runner_count
    error_message = "k6_runner_count must be a non-negative whole number."
  }
}

variable "k6_runner_server_type" {
  description = "Hetzner server type used for each temporary k6 browser runner."
  type        = string
  default     = "cpx41"
}
