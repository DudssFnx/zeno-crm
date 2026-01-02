# InboxFlow - WhatsApp CRM

## Overview
Multi-account WhatsApp CRM system (similar to Chatwoot/CWMKT) with multi-company and multi-user support. Features include a 3-column inbox interface, tags/labels for funnel stages, webhooks for event notifications, and JWT authentication.

## Tech Stack
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Shadcn/UI
- **Backend**: Express.js, TypeScript, JWT authentication
- **Database**: PostgreSQL with Drizzle ORM
- **State Management**: TanStack Query (React Query)
- **Routing**: Wouter

## Project Structure

```
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── inbox/           # Inbox components (conversation list, chat, contact details)
│   │   │   └── ui/              # Shadcn UI components
│   │   ├── lib/
│   │   │   ├── auth.tsx         # Auth context and hooks
│   │   │   └── theme.tsx        # Theme provider
│   │   └── pages/
│   │       ├── dashboard.tsx    # Main inbox layout
│   │       ├── login.tsx        # Login/Register page
│   │       └── settings/        # Settings pages (users, accounts, tags, webhooks)
├── server/
│   ├── auth.ts                  # JWT authentication
│   ├── db.ts                    # Database connection
│   ├── routes.ts                # API routes
│   ├── storage.ts               # Database storage layer
│   ├── whatsapp-gateway.ts      # Mock WhatsApp gateway (fallback)
│   ├── whatsapp-puppeteer.ts    # Real WhatsApp Web connection via Puppeteer
│   └── webhook-dispatcher.ts    # Webhook event dispatcher
└── shared/
    └── schema.ts                # Database schema and types
```

## Database Schema

### Tables
- **companies** - Multi-tenant company accounts
- **users** - Users with roles (admin/agent)
- **whatsapp_accounts** - WhatsApp connection accounts
- **contacts** - Customer contacts
- **tags** - Labels for categorizing contacts
- **contact_tags** - Junction table for contact-tag relationships
- **conversations** - Chat conversations
- **messages** - Individual messages (incoming, outgoing, internal notes)
- **webhook_configs** - Webhook configuration
- **automation_logs** - Webhook execution logs

## Key Features

### Authentication
- JWT-based authentication (not Replit Auth)
- Admin and Agent roles
- Company-based multi-tenancy

### Inbox (3-Column Layout)
- **Left**: Conversation list with filters (status, account, assignee)
- **Center**: Chat window with message history
- **Right**: Contact details panel with tags and notes

### WhatsApp Accounts
- Connect multiple WhatsApp numbers
- **Real WhatsApp Web connection via Puppeteer** (browser automation)
- QR code capture and display for phone scanning
- Session persistence across restarts
- Socket.IO for real-time status updates
- Multi-tenant security with JWT-authenticated sockets
- Status tracking (connected, disconnected, pending_qr, connecting)

### Tags
- Color-coded labels for funnel stages
- Apply multiple tags to contacts

### Macros
- Automated actions system (CWRMKT-style)
- Admin/Master can create/edit, all users can execute
- Action types:
  - **ADD_TAG** - Add tag to contact
  - **REMOVE_TAG** - Remove tag from contact
  - **SET_STATUS** - Change conversation status (open/pending/resolved)
  - **ASSIGN_AGENT** - Assign conversation to agent
  - **SEND_MESSAGE** - Send automated message with template variables
- Template variables: `{{nome}}`, `{{telefone}}`, `{{primeiro_nome}}`, `{{empresa}}`, `{{tags}}`, `{{atendente}}`
- Settings page at `/settings/macros`
- Execute via macro button in chat window

### Webhooks
- Event notifications for:
  - message.incoming
  - contact.tag.changed
  - conversation.status.changed
- HMAC-SHA256 signature support

## API Endpoints

### Auth
- `POST /api/auth/register` - Create company and admin user
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user

### Users (Admin only)
- `GET /api/users` - List users
- `POST /api/users` - Create user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### WhatsApp Accounts
- `GET/POST /api/whatsapp-accounts` - CRUD
- `POST /api/whatsapp-accounts/:id/start-session` - Start connection
- `GET /api/whatsapp-accounts/:id/qr` - Get QR code
- `POST /api/whatsapp-accounts/:id/disconnect` - Disconnect

### Conversations
- `GET /api/conversations` - List with filters
- `GET /api/conversations/:id` - Get details
- `POST /api/conversations/:id/assign` - Assign agent
- `POST /api/conversations/:id/status` - Update status
- `GET /api/conversations/:id/messages` - Get messages
- `POST /api/conversations/:id/messages` - Send message
- `POST /api/conversations/:id/internal-notes` - Add internal note

### Tags
- `GET/POST /api/tags` - CRUD
- `PUT/DELETE /api/tags/:id` - Update/Delete
- `POST /api/contacts/:id/tags` - Add tag to contact
- `DELETE /api/contacts/:id/tags/:tagId` - Remove tag

### Webhooks
- `GET/POST /api/webhooks` - CRUD
- `PUT/DELETE /api/webhooks/:id` - Update/Delete

### Macros
- `GET /api/macros` - List macros
- `POST /api/macros` - Create macro (admin only)
- `PUT /api/macros/:id` - Update macro (admin only)
- `DELETE /api/macros/:id` - Delete macro (admin only)
- `POST /api/macros/execute` - Execute macro (all users)

### Dev Tools
- `POST /api/dev/simulate-incoming-message` - Simulate incoming message

## Development

### Run
```bash
npm run dev
```

### Database
```bash
npm run db:push    # Push schema changes
```

## Design
- Font: Inter
- Theme: Light/Dark mode support
- Colors: WhatsApp-inspired green primary (#25D366)
- Layout: Chatwoot-inspired 3-column inbox
