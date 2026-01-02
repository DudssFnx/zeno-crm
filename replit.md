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
- **users** - Users with roles (admin/agent), displayName, prefixMode
- **whatsapp_accounts** - WhatsApp connection accounts
- **contacts** - Customer contacts with avatar support and multiple attributes (array, max 3)
- **contact_attributes** - Custom attribute definitions with colors (CLIENTE, FORNECEDOR, LEAD, VIP, etc.)
- **tags** - Labels for categorizing contacts
- **contact_tags** - Junction table for contact-tag relationships
- **conversations** - Chat conversations with stageId for Kanban
- **messages** - Individual messages with media support (mediaType, mediaUrl, fileName, mimetype, fileSize)
- **stages** - Kanban stages for funnel management
- **webhook_configs** - Webhook configuration
- **automation_logs** - Webhook execution logs
- **macros** - Automated actions configuration
- **macro_executions** - Log of macro executions

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

### Fluxos Conversacionais (Chat Flows)
- Sistema de auto-atendimento estilo Typebot
- Menus numerados para roteamento de clientes ("Digite 1 para Vendas, 2 para Suporte")
- Settings page at `/settings/chat-flows`
- Tipos de passos:
  - **message** - Enviar mensagem de texto
  - **menu** - Menu de opções numeradas
  - **input** - Capturar dados do cliente (nome, email, etc.)
  - **action** - Executar ações (atribuir agente, adicionar tag, definir status, encerrar fluxo)
- Gatilhos:
  - **triggerOnFirstMessage** - Iniciar na primeira mensagem da conversa
  - **triggerKeywords** - Iniciar quando mensagem contém palavras-chave
- Template variables: `{{nome}}`, `{{primeiro_nome}}`, `{{telefone}}`
- Sessões rastreiam o progresso do cliente no fluxo
- Tabelas: chat_flows, chat_flow_steps, chat_flow_sessions

### Media Handling
- Upload/download media files (images, audio, video, documents)
- Max file size: 25MB
- Media types supported:
  - **image**: Display thumbnail, click to view full-size
  - **audio**: HTML5 audio player
  - **video**: HTML5 video player
  - **document/PDF**: File icon with download link
- Media stored in /uploads/<companyId>/
- Background queue for media downloads (non-blocking)

### Operator Name Configuration
- User settings page at `/settings/profile`
- Display name configuration (Nome de Exibição)
- Prefix mode options:
  - **prefix**: `[Operator Name]: message`
  - **firstLine**: `Operator Name:\nmessage`
  - **none**: No operator identification

### Kanban Board
- Visual pipeline management at `/kanban`
- Drag & drop conversations between stages
- Stage settings at `/settings/stages`
- Color-coded stages
- Reorderable stages

### Emoji Picker
- Built-in emoji picker in message input (emoji-picker-react)
- Click smile icon to open picker
- Insert emoji at cursor position
- Dark/light theme auto-detection
- Portuguese search placeholder ("Buscar emoji...")

### Audio Recording
- Built-in audio recording in chat composer
- Uses browser's MediaRecorder API (webm/mp4 support)
- Visual recording indicator with pulsing red dot
- Timer display in MM:SS format
- Automatic upload to /api/upload on stop
- Graceful error handling for permissions/hardware

### Responsive Design
- Mobile (≤768px): Single-column view with navigation
- Tablet (769-1024px): Dual-column with overlay contact details
- Desktop (>1024px): Full 3-column layout
- Touch-friendly controls (44px minimum targets)
- Custom hooks: useIsMobile, useIsTablet, useBreakpoint

### Operator Role Permissions
Operators have LIMITED permissions:
- **CAN**: View conversations, send messages, use macros, create contacts, edit contact notes, self-assign
- **CANNOT**: Delete conversations/contacts/messages, edit contact names, manage tags, access user/webhook/WhatsApp settings
- Backend guards via notOperatorMiddleware (returns 403)
- UI restrictions hide unavailable controls

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

### Stages (Kanban)
- `GET /api/stages` - List stages for company
- `POST /api/stages` - Create stage
- `PUT /api/stages/:id` - Update stage
- `DELETE /api/stages/:id` - Delete stage
- `PUT /api/stages/reorder` - Reorder stages
- `PATCH /api/conversations/:id/stage` - Update conversation stage

### User Settings
- `GET /api/users/me/settings` - Get user settings
- `PUT /api/users/me/settings` - Update displayName and prefixMode

### Media Upload
- `POST /api/upload` - Upload media file (multipart/form-data, max 25MB)

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
