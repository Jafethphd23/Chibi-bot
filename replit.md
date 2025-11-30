# Twitch Chat Translator

## Overview

A real-time Twitch chat translation application that connects to any Twitch channel and provides live translation of chat messages. The application features a dual-pane interface showing original messages alongside their translations, powered by LibreTranslate for translation services and the TMI.js library for Twitch chat integration.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React with TypeScript, using Vite as the build tool and development server.

**UI Component Library**: Shadcn/ui components built on Radix UI primitives, providing accessible and customizable UI elements.

**Styling Approach**: Tailwind CSS with a custom Twitch-inspired dark theme:
- Primary: #9146FF (Twitch purple)
- Secondary: #772CE8 (dark purple)
- Background: #0E0E10 (Twitch dark)
- Text: #EFEFF1 (light grey)
- Accent: #00F5FF (cyan)
- Success: #00FA54 (green)

**State Management**: 
- React hooks for local component state
- Custom WebSocket hook (`useWebSocket`) for real-time chat communication
- Message deduplication by ID for proper original/translated pairing

**Key Components**:
- `ConnectionHeader`: Channel input, language selector, connection status
- `ChatPanel`: Scrollable message display with auto-scroll
- `ChatMessage`: Individual message bubbles with username, timestamp, translation
- `EmptyState`: Instructions when not connected

### Backend Architecture

**Server Framework**: Express.js running on Node.js with TypeScript.

**Real-time Communication**: WebSocket server using the `ws` library at `/ws` path:
- Channel connection/disconnection commands
- Target language selection
- Streaming chat messages with translations
- Connection status updates

**Twitch Integration**: TMI.js for anonymous read-only Twitch IRC chat connection

**Translation Service**: LibreTranslate API (https://libretranslate.com/translate)
- Automatic language detection using "auto" source
- Supports 20+ languages
- Rate limiting to prevent API abuse
- Caching for repeated messages

### Data Flow

1. Client connects via WebSocket and sends channel/language preferences
2. Server creates a TMI.js client instance per connection
3. Twitch messages are received from IRC
4. Messages are translated via LibreTranslate API with caching
5. Full messages (with translation) are forwarded to client
6. Frontend displays in two synchronized columns

### External Dependencies

**Twitch Integration**: 
- TMI.js library for connecting to Twitch IRC chat
- Anonymous read-only connection (no authentication required)

**Translation Service**:
- LibreTranslate API for message translation
- Free public endpoint with rate limiting
- Supports language detection and translation in single request

### Supported Languages

English, Spanish, French, German, Italian, Portuguese, Russian, Japanese, Korean, Chinese, Arabic, Hindi, Thai, Vietnamese, Dutch, Polish, Turkish, Swedish, Danish, Norwegian
