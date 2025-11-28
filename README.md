# Shekspir Event Workspace

Monorepo-style workspace containing:

- `event-ui/` – React + Vite attendee search console that prints badges through a printer bridge.
- `printer-server/` – Minimal Express service that accepts ZPL over HTTP and forwards it to a networked Zebra-compatible printer.

## Quick start

```bash
# Terminal 1 – UI
cd event-ui
npm install
cp .env.example .env  # edit with Supabase + printer service URL
npm run dev

# Terminal 2 – Printer server
cd printer-server
npm install
cp .env.example .env  # edit printer host/port + server port
npm run dev
```

Point the UI’s printer URL (either via `.env` or the on-page form) to the printer server instance, e.g. `http://localhost:3002/print`.
