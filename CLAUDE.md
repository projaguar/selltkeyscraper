# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Electron application built with React and TypeScript for SellTKey scraping functionality. The application provides a user interface for authentication and data collection services, with automated web scraping capabilities using Puppeteer.

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

- **browserService**: Singleton service managing Puppeteer browser instances with Chrome path detection for Windows, Naver login automation, and page lifecycle management
- **collectionService**: Handles data collection operations and progress tracking
- **sourcingService**: Manages sourcing operations including keyword search, shopping tab navigation, and data extraction from Naver Shopping

### Frontend Architecture (Renderer Process)

- **React 19** with TypeScript and Tailwind CSS
- **AuthContext** (`src/renderer/src/contexts/AuthContext.tsx`): Global authentication state management
- **UI Components** (`src/renderer/src/components/ui/`): Reusable UI components using Radix UI primitives
- **Main Components**: `LoginForm`, `MainPage`, `KeywordHelper` for core application flow

### IPC Communication

The main process (`src/main/index.ts`) exposes IPC handlers for:

- User authentication (`login`, `get-saved-credentials`, `save-credentials`, `clear-credentials`)
- Collection operations (`start-collection`, `stop-collection`, `get-collection-progress`)
- Sourcing operations (`start-sourcing`, `stop-sourcing`, `get-sourcing-progress`)
- Naver integration (`check-naver-login-status`, `open-naver-login-page`)
- Keyword management (`fetch-keywords`)

### BrowserService Architecture

The BrowserService uses singleton pattern and provides:

- Automatic Chrome detection on Windows with registry fallback
- Browser initialization with anti-detection measures
- Page management with tab reuse and lifecycle handling
- Naver login status detection with multiple validation methods
- Natural interaction simulation to avoid bot detection

### SourcingService Architecture

The SourcingService implements:

- Multi-keyword processing with natural interaction patterns
- Shopping tab navigation with fallback selectors
- API-based data collection from Naver Shopping
- Restriction page detection and handling
- Progress tracking and error recovery

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
- Services use singleton pattern for shared state management
- Browser automation includes anti-detection measures and natural interaction simulation

## Sourcing Business Flow

The sourcing process follows a specific workflow for keyword-based data collection from Naver Shopping:

### Phase 1: First Keyword Processing

1. **Login & Navigate**: Logged-in Puppeteer browser navigates to Naver main page
2. **Search**: Naturally input first keyword and click search button
3. **Shopping Tab**: Click shopping tab from search results page
4. **New Tab**: Switch to newly opened price comparison page
5. **Data Collection**: Fetch and collect data via API calls

### Phase 2: Remaining Keywords Processing (Loop)

For each remaining keyword (2nd to last):

1. **Search in Shopping Tab**: Input keyword directly in price comparison page search box
2. **Execute Search**: Click search button or press Enter
3. **Data Collection**: Fetch and collect data from results page
4. **Repeat**: Continue until all keywords are processed

### Current Implementation Details

- **First keyword**: Uses full navigation flow (main → search → shopping tab → new tab)
- **Subsequent keywords**: Direct search within shopping tab to maintain session
- **Data Collection**: API-based collection from `search.shopping.naver.com/api/search/all`
- **Error Handling**: Individual keyword failures don't stop the entire process
- **Natural Simulation**: Includes delays and natural interaction patterns to avoid detection

### Known Issues & Improvement Areas

1. **Search Input Selectors**: Inconsistent selectors between main and shopping pages
2. **Tab Management**: Different handling for first vs. remaining keywords
3. **Error Recovery**: Limited error handling and recovery mechanisms
4. **Progress Tracking**: Basic progress reporting without detailed status
5. **Wait Times**: Fixed delays instead of adaptive waiting
