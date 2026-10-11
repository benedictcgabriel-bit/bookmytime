# BookMyTime: Appointment Booking System

A streamlined, formal appointment booking application designed with strict aesthetic restraint and zero clutter:
- **Logo**: Features the custom BookMyTime "B" calendar & clock emblem (`emblem_clean.png` & `logo.jpg`).
- **Cinematic Opening Animation (Four Vertical Splits)**:
  - Fullscreen introductory presentation on Merino Cream (`#F5EEDD`) canvas showcasing the 3D ribbon emblem with integrated calendar, clock, and the unified "BookMyTime" wordmark.
  - The actual, fully functional homepage stays completely stable in the background during the entire animation.
  - The screen splits into four equal vertical slices (each 25% width, 100vh height).
  - Each part slides straight UP one by one with a 1-second gap (`col-1` &rarr; 1s &rarr; `col-2` &rarr; 1s &rarr; `col-3` &rarr; 1s &rarr; `col-4`), progressively unveiling the homepage underneath column by column.
  - Automatic `@media (prefers-reduced-motion: reduce)` bypass and zero intrusive buttons.
  - Runs once per page load and preserves all SPA interactions.
- **Exclusively 3 Palette Colours** for all surfaces, backgrounds, cards, inputs, and borders (no white surfaces):
  - **Merino** (`#F5EEDD`): Cream canvas used for page backgrounds, inputs, and selected details.
  - **Rock Blue** (`#84B3CE`): Mid-tone blue used for the main card containers, navigation badges, and accents.
  - **Venice Blue** (`#16587B`): Deep formal blue used for header, footer, headings, borders, and primary buttons.
  - *(Text only uses high-contrast White `#FFFFFF`, Merino `#F5EEDD`, or Venice Blue `#16587B`)*.
- **Dedicated Page Views**:
  - **Book Appointment**: Streamlined booking flow without distractions.
  - **My Appointments**: Clean list of bookings, filtering (Upcoming vs All), reference codes, and cancellation.
- **Zero Clutter**: Unnecessary text, long paragraphs, and decorative fillers have been removed.

---

## Quick Start Instructions

The application requires Python 3 (standard library only; zero external packages or npm dependencies required).

### 1. Run the Full-Stack Application (SQLite Backend)

```bash
cd /Users/benedictcgabriel/.gemini/antigravity/scratch/appointment-booking-system
python3 server.py
```

Open your browser at:
```
http://127.0.0.1:8080
```

### 2. Standalone Browser Demo (LocalStorage Fallback)

Open `index.html` directly in any web browser (`file:///...`). The application automatically switches to LocalStorage mode with an explicit single-browser demo disclosure badge.

---

## Core Capabilities

1. **Validation**: Full name (min 2 characters, letters/spaces/hyphens/apostrophes), valid email, international phone (7 to 15 digits), and valid dates (Monday to Saturday, closed Sundays).
2. **Scheduling**: 30-minute intervals between 09:00 and 17:00. Automatically disables elapsed hours for today's date.
3. **Atomic Uniqueness**: SQLite transaction locking (`BEGIN IMMEDIATE`) with partial unique indexing (`idx_active_slot ... WHERE status = 'booked'`). Guaranteed race-condition safety under concurrent load.
4. **Cancellation Flow**: Accessible modal confirmation. Cancelling an appointment marks the status as cancelled and instantly releases the slot for others to book.
5. **Phone Masking**: Protects user privacy in the appointments list by masking leading digits (e.g., `***-***-4567`).

---

## Automated Acceptance Test Suite

Run the automated test suite anytime:
```bash
python3 /Users/benedictcgabriel/.gemini/antigravity/scratch/appointment-booking-system/test_suite.py
```
```text
Ran 12 tests in 0.019s — 100% PASSING (0 FAILURES)
```

---

## Deployment Options

### Option 1: Render (Recommended for Full-Stack + Persistent SQLite)
1. Push this repository to GitHub or GitLab.
2. In [Render](https://render.com), click **New +** &rarr; **Blueprint** (or **Web Service**).
3. Connect your repository. Render will automatically detect `render.yaml` or you can configure:
   - **Environment**: Python 3
   - **Build Command**: `echo 'No build step required'`
   - **Start Command**: `python3 server.py`
   - **Disk**: Mount a 1GB persistent disk at `/app/data` with environment variable `DB_PATH=/app/data/appointments.db`.
4. Your application will be live at `https://<your-service-name>.onrender.com`.

### Option 2: Railway / Fly.io / Heroku
- The repository includes a `Procfile` (`web: python3 server.py`) and a `Dockerfile`.
- Simply connect your repository to [Railway](https://railway.app) or run `fly launch`.
- Both detect the container and start the Python web server on port 8080 automatically.

### Option 3: Docker Container (Local / AWS ECS / Google Cloud Run)
Build and run anywhere with Docker:
```bash
docker build -t bookmytime .
docker run -d -p 8080:8080 -v $(pwd)/data:/app/data -e DB_PATH=/app/data/appointments.db bookmytime
```

### Option 4: Static Hosting (Vercel / Netlify / GitHub Pages)
If you only want frontend hosting without running Python:
- The app has built-in dual persistence: it automatically falls back to browser `localStorage` if the backend API is unreachable.
- Simply deploy `index.html`, `style.css`, `script.js`, and the image assets directly to Vercel, Netlify, or GitHub Pages.

### Option 5: Self-Hosted Linux VPS (Ubuntu / Debian)
1. Clone this repository to `/var/www/bookmytime`.
2. Create a systemd service:
```ini
[Unit]
Description=BookMyTime Service
After=network.target

[Service]
User=www-data
WorkingDirectory=/var/www/bookmytime
ExecStart=/usr/bin/python3 server.py
Restart=always
Environment=PORT=8080 HOST=127.0.0.1

[Install]
WantedBy=multi-user.target
```
3. Use Nginx as a reverse proxy with Let's Encrypt SSL.
