# Shekspir Event Console

React + Vite front-end for searching attendees, printing 80x50 ZPL badges, and logging arrivals in Supabase.

## Features

- Dropdown to select the active event (`events` table)
- Search form that filters the `attendee` table by id, first/last name, phone, email, or company
- Printer configuration UI for the printer service URL and printer IP (defaults from `.env`)
- Badge printing button that sends ZPL (name row 1, company row 2) with `^PQ` copies support
- Attendance logging into `attended_event` after printing, storing the attendee snapshot for auditing

## Getting Started

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure Supabase**

   Create a `.env` file based on the variables below and restart `npm run dev` after editing:

   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   # Optional printer defaults
   VITE_PRINTER_SERVICE_URL=http://localhost:3002/print
   VITE_PRINTER_IP=192.168.55.222
   ```

3. **Start Vite**
   ```bash
   npm run dev
   ```

## Expected Supabase Tables

- `events`: `{ id: int8, name: text, date: date, created_at timestamptz }`
- `attendee`: `{ id: uuid, first_name text, last_name text, email text, phone text, company text }`
- `attended_event`: `{ id: int8, attended_event int8 (FK -> events.id), attendee uuid (FK -> attendee.id), created_at timestamptz default now() }`

If your schema deviates, tweak the selects/mutations in `src/App.tsx`.

## Printer Notes

Expose any bridge/microservice that can receive raw ZPL via HTTP—enter its full URL (e.g. `http://localhost:3002/print`) in the printer panel. The label is configured for 80×50 mm media (≈640×400 dots at 203 dpi); tweak `buildBadgeZpl` in `src/utils/zpl.ts` if you use a different printer density.
