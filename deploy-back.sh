#!/bin/bash

# 📦 Config
BACK_PATH="./"
VPS_TARGET="yeti-vps"
VPS_PATH="/home/ubuntu/activscanio-api"
IMAGE_NAME="activscanio-api"
TAR_NAME="${IMAGE_NAME}.tar"

# 🛠 Build + Save
export DOCKER_DEFAULT_PLATFORM=linux/amd64
docker build -t ${IMAGE_NAME}:latest "$BACK_PATH" || exit 1
docker save ${IMAGE_NAME}:latest -o "$TAR_NAME" || exit 1

# 🚀 Send to VPS
scp "$TAR_NAME" ${VPS_TARGET}:"${VPS_PATH}/" || exit 1

echo "✅ API built and transferred to VPS at ${VPS_PATH}/${TAR_NAME}"
