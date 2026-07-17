#!/bin/bash
set -e

echo "=== Stok Yönetimi Deploy ==="

cd /var/www/stok-yonetimi

echo "1. Bağımlılıklar yükleniyor..."
npm install --legacy-peer-deps

echo "2. Backend build..."
npx nx build backend

echo "3. Frontend build..."
npx nx build frontend --configuration=production

echo "4. Backend yeniden başlatılıyor..."
pm2 restart stok-backend --update-env || pm2 start dist/backend/main.js --name stok-backend

pm2 save

echo "=== Deploy tamamlandı! ==="
