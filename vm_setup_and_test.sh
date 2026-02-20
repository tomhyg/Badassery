#!/bin/bash
# Script d'installation et test sur VM

# Configuration
SCRIPT_URL="https://raw.githubusercontent.com/temp/test_vm_enrichment.py"  # Placeholder

echo "=== VM Test Setup ==="
echo "Date: $(date)"
echo "Hostname: $(hostname)"

# Installer les dépendances
echo "Installing dependencies..."
apt-get update
apt-get install -y python3 python3-pip

# Installer les packages Python
pip3 install requests yt-dlp

echo "Python version: $(python3 --version)"
echo "yt-dlp version: $(yt-dlp --version)"

echo "=== Setup Complete ==="
