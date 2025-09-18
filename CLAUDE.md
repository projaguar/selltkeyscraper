# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Electron application built with React and TypeScript for SellTKey scraping functionality. The application provides a user interface for authentication and data collection services.

## Commands

### Development
- `bun run dev` - Start development server with hot reload
- `bun run start` - Start production preview

### Build & Distribution
- `bun run build` - Build the application (includes typecheck)
- `bun run build:win` - Build for Windows x64
- `bun run build:mac` - Build for macOS
- `bun run build:linux` - Build for Linux
- `bun run build:unpack` - Build without packaging

### Code Quality
- `bun run typecheck` - Run TypeScript type checking for both node and web
- `bun run typecheck:node` - Type check main process code
- `bun run typecheck:web` - Type check renderer process code
- `bun run lint` - Run ESLint with caching
- `bun run format` - Format code with Prettier

## Architecture

### Electron Structure
The application follows standard Electron architecture with three main processes:

- **Main Process** (`src/main/`): Node.js environment handling application lifecycle, IPC, and system operations
- **Renderer Process** (`src/renderer/`): React-based UI running in Chromium
- **Preload Script** (`src/preload/`): Security bridge between main and renderer processes

### Key Services (Main Process)
Located in `src/main/services/`:

- **browserService**: Manages Puppeteer browser instances and Naver login automation
- **collectionService**: Handles data collection operations and progress tracking
- **sourcingService**: Manages sourcing-related functionality

### Frontend Architecture (Renderer Process)
- **React 19** with TypeScript and Tailwind CSS
- **AuthContext** (`src/renderer/src/contexts/AuthContext.tsx`): Global authentication state management
- **UI Components** (`src/renderer/src/components/ui/`): Reusable UI components using Radix UI primitives
- **Main Components**: `LoginForm`, `MainPage` for core application flow

### IPC Communication
The main process exposes several IPC handlers for:
- User authentication (`login`, credential management)
- Collection operations (`start-collection`, `stop-collection`, `get-collection-progress`)
- Naver integration (`check-naver-login-status`, `open-naver-login-page`)
- Keyword management (`fetch-keywords`)

### Dependencies
- **Puppeteer**: Web scraping and browser automation
- **Axios**: HTTP client for API communications
- **React Hook Form + Zod**: Form handling and validation
- **Radix UI**: Accessible UI primitives
- **Tailwind CSS**: Styling framework

## Development Notes

- Uses Bun as package manager and runtime
- Electron Vite for build tooling and development server
- Path aliases: `@renderer` and `@` point to `src/renderer/src`
- Credentials are stored locally in `userData/credentials.json`
- Authentication state persists in localStorage as `selltkey_auth`