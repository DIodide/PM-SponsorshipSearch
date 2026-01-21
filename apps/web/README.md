# ⚠️ DEPRECATED — apps/web

> **This application has been deprecated in favor of `apps/teamsbrowser`.**

---

## Migration Notice

The Next.js-based search frontend has been replaced with a Vite + React application that offers:

- ✅ Faster development builds
- ✅ Simplified architecture
- ✅ Better integration with Convex
- ✅ Semantic similarity scoring
- ✅ Campaign generation features

## New Application

Please use **`apps/teamsbrowser`** for all UI development:

```bash
cd apps/teamsbrowser
npm install
npm run dev
```

The new app is available at: http://localhost:5173

## What Happened to This Code?

The original Next.js app used:
- Server-Sent Events (SSE) for streaming search
- AI-based team discovery via Tavily
- Traditional keyword-based search

The new `teamsbrowser` app uses:
- Embedding-based semantic similarity
- Precomputed team vectors
- Paginated results with prefetching
- AI campaign generation

## Legacy Documentation

The original README is preserved below for reference.

---

# Legacy: Next.js Search Frontend (Deprecated)

Original Next.js 15 + React 19 frontend with SSE streaming search.

This code is no longer maintained. See `apps/teamsbrowser` for the current UI.
