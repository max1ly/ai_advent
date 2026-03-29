# Deploying AI Chat on Ubuntu (LAN)

Deploy the AI chat app on a Linux laptop so it's accessible from other devices on your local network.

## Prerequisites

- Ubuntu 22.04+ (or any modern Linux distro)
- NVIDIA GPU with drivers installed
- Git
- Internet connection (for initial setup)

## Step 1: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Log out and back in for group changes to take effect
# Then verify:
docker --version
```

## Step 2: Install NVIDIA Container Toolkit

```bash
# Add NVIDIA repository
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
  sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker to use NVIDIA runtime
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# Verify GPU is visible to Docker
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi
```

You should see your GPU listed. If not, check that NVIDIA drivers are installed: `nvidia-smi`

## Step 3: Clone and Configure

```bash
# Clone the repository
git clone <your-repo-url> ai-chat
cd ai-chat

# Create environment file from template
cp .env.production.example .env

# Edit .env and add your API keys (optional — Ollama works without them)
nano .env
```

## Step 4: Build and Start

```bash
# Build and start all services (first run takes 3-5 minutes)
docker compose -f docker-compose.prod.yml up -d --build

# Watch the logs
docker compose -f docker-compose.prod.yml logs -f
```

## Step 5: Pull Ollama Models

```bash
# Pull the chat model (~2GB)
docker compose -f docker-compose.prod.yml exec ollama ollama pull llama3.2:3b

# Pull the embedding model for RAG (~274MB)
docker compose -f docker-compose.prod.yml exec ollama ollama pull nomic-embed-text
```

## Step 6: Find Your IP and Connect

```bash
# Find the laptop's LAN IP address
ip addr show | grep "inet " | grep -v 127.0.0.1
# Look for something like: inet 192.168.1.XXX/24
```

From your MacBook, open a browser and go to:
```
http://<linux-ip>:3030
```

## Managing the Service

```bash
# Stop all services
docker compose -f docker-compose.prod.yml down

# Start services (without rebuild)
docker compose -f docker-compose.prod.yml up -d

# Rebuild after code changes
docker compose -f docker-compose.prod.yml up -d --build

# View logs
docker compose -f docker-compose.prod.yml logs -f app      # app only
docker compose -f docker-compose.prod.yml logs -f ollama    # ollama only

# Check GPU usage
docker compose -f docker-compose.prod.yml exec ollama nvidia-smi

# Pull a different/additional Ollama model
docker compose -f docker-compose.prod.yml exec ollama ollama pull <model-name>
```

## Troubleshooting

### "GPU not found" or Ollama runs on CPU

```bash
# Check NVIDIA drivers are installed
nvidia-smi

# Check nvidia-container-toolkit is configured
docker run --rm --gpus all nvidia/cuda:12.0-base nvidia-smi

# If the above fails, reconfigure:
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### Can't connect from MacBook

```bash
# Check the app is running
docker compose -f docker-compose.prod.yml ps

# Check the port is open
curl http://localhost:3030

# Check firewall (Ubuntu)
sudo ufw status
# If active, allow port 3030:
sudo ufw allow 3030/tcp
```

### Ollama connection errors in the app

```bash
# Check Ollama is running
docker compose -f docker-compose.prod.yml exec ollama ollama list

# Check the app can reach Ollama (should return "Ollama is running")
docker compose -f docker-compose.prod.yml exec app curl http://ollama:11434
```

### Rebuild from scratch

```bash
# Remove everything and start fresh
docker compose -f docker-compose.prod.yml down -v
docker compose -f docker-compose.prod.yml up -d --build
# Then re-pull Ollama models (Step 5)
```

## Data Persistence

- **Chat history + settings**: stored in `./data/chat.db` (SQLite)
- **RAG vector index**: stored in `./data/lancedb/`
- **Ollama models**: stored in Docker volume `ollama_data`

All data survives container restarts. To reset chat data, delete the `data/` directory. To reset Ollama models, use `docker compose down -v`.
