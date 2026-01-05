# WhatsApp Gateway - Railway Setup Guide

## Overview

This is a standalone WhatsApp Gateway service designed to run on Railway. It handles all WhatsApp/Baileys operations and communicates with the main Replit application via REST API and webhooks.

## Architecture

```
┌─────────────────────┐       REST API          ┌─────────────────────┐
│                     │ ───────────────────────→│                     │
│   Replit (Main)     │                         │  Railway Gateway    │
│   - Frontend        │ ←───────────────────────│  - Baileys          │
│   - Backend API     │       Webhooks          │  - Session Storage  │
│   - PostgreSQL      │                         │                     │
└─────────────────────┘                         └─────────────────────┘
```

## Railway Setup Steps

### 1. Create Railway Project

1. Go to [Railway](https://railway.app)
2. Create a new project
3. Choose "Deploy from GitHub repo" or "Empty Project"

### 2. Configure Service

**If using GitHub:**
- Point to your repo's `whatsapp-gateway` directory
- Set the root directory to `whatsapp-gateway`

**If using Empty Project:**
- Add a new service from the `whatsapp-gateway` folder
- Or use Railway CLI to deploy

### 3. Add Persistent Volume

**Critical:** WhatsApp sessions must persist across deployments.

1. Go to your service settings
2. Add a Volume
3. Mount path: `/app/whatsapp-sessions`
4. Size: 1GB is sufficient

### 4. Configure Environment Variables

Add these environment variables in Railway:

| Variable | Description | Example |
|----------|-------------|---------|
| `PORT` | Server port (Railway sets this automatically) | `3000` |
| `GATEWAY_SECRET` | Shared secret for authentication | `your-super-secret-key-32chars` |
| `REPLIT_WEBHOOK_URL` | Your Replit app's webhook endpoint | `https://your-app.replit.app/api/gateway-webhook` |

### 5. Deploy

Railway will automatically:
1. Detect the Dockerfile
2. Build the image
3. Start the container

## Replit Configuration

After Railway deployment, configure your Replit app:

### Environment Variables (Secrets in Replit)

| Variable | Description | Example |
|----------|-------------|---------|
| `WHATSAPP_GATEWAY_URL` | Railway service URL | `https://your-gateway.up.railway.app` |
| `GATEWAY_SECRET` | Same secret as Railway | `your-super-secret-key-32chars` |

### How It Works

When `WHATSAPP_GATEWAY_URL` is set:
- The app uses `gateway-client.ts` for WhatsApp operations
- Local Puppeteer/Baileys code is bypassed
- All WhatsApp commands go to Railway

When `WHATSAPP_GATEWAY_URL` is NOT set:
- The app uses local Puppeteer/Baileys
- Works for development in Replit

## API Endpoints

### Health Check
```
GET /health
```

### Connect WhatsApp Account
```
POST /connect
Authorization: Bearer <GATEWAY_SECRET>
Content-Type: application/json

{
  "accountId": "uuid-of-account",
  "phoneNumber": "5511999999999"
}
```

### Disconnect Account
```
POST /disconnect
Authorization: Bearer <GATEWAY_SECRET>
Content-Type: application/json

{
  "accountId": "uuid-of-account"
}
```

### Send Message
```
POST /send
Authorization: Bearer <GATEWAY_SECRET>
Content-Type: application/json

{
  "accountId": "uuid-of-account",
  "phoneNumber": "5511888888888",
  "message": "Hello from ZENO CRM!"
}
```

### Get Account Status
```
GET /status/:accountId
Authorization: Bearer <GATEWAY_SECRET>
```

### Get QR Code
```
GET /qr/:accountId
Authorization: Bearer <GATEWAY_SECRET>
```

## Webhook Events

The gateway sends these events to Replit:

### message.created
```json
{
  "type": "message.created",
  "accountId": "uuid",
  "timestamp": "ISO-8601",
  "data": {
    "phoneNumber": "5511999999999",
    "contactName": "John Doe",
    "content": "Hello!",
    "direction": "incoming",
    "messageId": "wamid.xxx",
    "avatarUrl": "https://...",
    "mediaInfo": {
      "mediaType": "image",
      "fileName": "photo.jpg",
      "mimetype": "image/jpeg",
      "fileSize": 12345
    }
  }
}
```

### status.changed
```json
{
  "type": "status.changed",
  "accountId": "uuid",
  "timestamp": "ISO-8601",
  "data": {
    "status": "connected",
    "connectionStatus": "open"
  }
}
```

### qr.updated
```json
{
  "type": "qr.updated",
  "accountId": "uuid",
  "timestamp": "ISO-8601",
  "data": {
    "qrCode": "data:image/png;base64,..."
  }
}
```

## Security

- All requests are authenticated via `Authorization: Bearer <GATEWAY_SECRET>`
- Webhooks are signed with HMAC-SHA256
- Timestamp validation (5-minute window) prevents replay attacks

### Webhook Signature

Header: `x-gateway-signature`

Computed as:
```
HMAC-SHA256(timestamp + '.' + JSON.stringify(body), GATEWAY_SECRET)
```

## Troubleshooting

### QR Code Not Appearing
- Check Railway logs for Baileys errors
- Ensure volume is mounted correctly
- Verify GATEWAY_SECRET matches on both sides

### Messages Not Arriving in Replit
- Check REPLIT_WEBHOOK_URL is correct
- Verify Replit app is deployed and accessible
- Check Railway logs for webhook delivery failures

### Session Lost on Redeploy
- Ensure volume is configured
- Mount path must be `/app/whatsapp-sessions`
- Volume size must be sufficient

## Local Development

For local testing without Railway:

```bash
cd whatsapp-gateway
npm install
npm run dev
```

This starts the gateway on `localhost:3001` with hot reload.

## Production Checklist

- [ ] Railway project created
- [ ] Volume mounted at `/app/whatsapp-sessions`
- [ ] `GATEWAY_SECRET` configured (same on both sides)
- [ ] `REPLIT_WEBHOOK_URL` points to production Replit app
- [ ] `WHATSAPP_GATEWAY_URL` configured in Replit secrets
- [ ] Health check passing (`/health` returns 200)
- [ ] Webhook delivery tested
