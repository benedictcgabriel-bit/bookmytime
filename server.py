#!/usr/bin/env python3
"""
BookEase - Appointment Booking System Backend Server
Implements REST API endpoints with atomic SQLite booking reservations,
server-side validation, duplicate prevention, cancellation, and static file serving.
"""

import http.server
import json
import os
import re
import sqlite3
import sys
import uuid
from datetime import datetime, date, time
from urllib.parse import urlparse, parse_qs

PORT = int(os.environ.get("PORT", 8080))
HOST = os.environ.get("HOST", "0.0.0.0")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("DB_PATH", os.path.join(BASE_DIR, "appointments.db"))
if os.path.dirname(DB_PATH):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)

# Central Schedule Configuration
SCHEDULE_CONFIG = {
    "businessDays": [1, 2, 3, 4, 5, 6],  # 1=Mon, 2=Tue, ..., 6=Sat (Sunday=0/7 closed)
    "businessDaysNames": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    "openTime": "09:00",
    "closeTime": "17:00",
    "slotDurationMinutes": 30,
    "timeZone": "Local Business Time",
}

def get_allowed_slots():
    """Generate all valid slot start times based on schedule config."""
    open_h, open_m = map(int, SCHEDULE_CONFIG["openTime"].split(":"))
    close_h, close_m = map(int, SCHEDULE_CONFIG["closeTime"].split(":"))
    
    slots = []
    curr_min = open_h * 60 + open_m
    end_min = close_h * 60 + close_m
    step = SCHEDULE_CONFIG["slotDurationMinutes"]
    
    while curr_min + step <= end_min:
        h = curr_min // 60
        m = curr_min % 60
        slots.append(f"{h:02d}:{m:02d}")
        curr_min += step
    return slots

ALLOWED_SLOTS = get_allowed_slots()

def init_db(db_path=DB_PATH):
    """Initialize SQLite database with atomic uniqueness constraint."""
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA busy_timeout = 5000;")
    with conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                reference TEXT UNIQUE NOT NULL,
                fullName TEXT NOT NULL,
                email TEXT NOT NULL,
                phone TEXT NOT NULL,
                date TEXT NOT NULL,
                startTime TEXT NOT NULL,
                appointmentType TEXT,
                notes TEXT,
                status TEXT NOT NULL CHECK(status IN ('booked', 'cancelled')),
                createdAt TEXT NOT NULL,
                cancelledAt TEXT
            );
        """)
        try:
            conn.execute("ALTER TABLE appointments ADD COLUMN appointmentType TEXT;")
        except sqlite3.OperationalError:
            pass

        # Crucial database-enforced partial unique index:
        # At most one active ('booked') appointment can occupy the same slot (date, startTime).
        # Cancelled bookings do NOT block the slot and release it immediately!
        conn.execute("""
            CREATE UNIQUE INDEX IF NOT EXISTS idx_active_slot 
            ON appointments(date, startTime) 
            WHERE status = 'booked';
        """)
    conn.close()

def validate_booking_payload(data):
    """Server-side validation matching client rules."""
    errors = {}
    
    # Full Name
    raw_name = data.get("fullName", "")
    full_name = raw_name.strip() if isinstance(raw_name, str) else ""
    if not full_name or len(re.sub(r"\s+", "", full_name)) < 2:
        errors["fullName"] = "Full name is required and must contain at least 2 non-whitespace characters."
    elif not re.match(r"^[A-Za-z\s'\-]+$", full_name):
        errors["fullName"] = "Full name may only contain letters, spaces, hyphens, and apostrophes."
        
    # Email
    raw_email = data.get("email", "")
    email = raw_email.strip() if isinstance(raw_email, str) else ""
    email_regex = r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$"
    if not email or not re.match(email_regex, email):
        errors["email"] = "A valid email address is required (e.g., name@example.com)."
        
    # Phone
    raw_phone = data.get("phone", "")
    phone = raw_phone.strip() if isinstance(raw_phone, str) else ""
    digits = re.sub(r"\D", "", phone)
    if not phone or len(digits) < 7 or len(digits) > 15:
        errors["phone"] = "Phone number must contain between 7 and 15 digits."
    elif not re.match(r"^\+?[\d\s\-\(\)\.]{7,25}$", phone):
        errors["phone"] = "Phone number contains invalid characters."

    # Date
    raw_date = data.get("date", "")
    date_str = raw_date.strip() if isinstance(raw_date, str) else ""
    parsed_date = None
    try:
        parsed_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        errors["date"] = "Valid date in YYYY-MM-DD format is required."
        
    today = date.today()
    if parsed_date:
        if parsed_date < today:
            errors["date"] = "Past dates cannot be selected. Please choose today or a future date."
        else:
            # Check business day: Python weekday(): 0=Mon, 5=Sat, 6=Sun
            # Config uses 1=Mon..6=Sat, 0 or 7 = Sun
            py_weekday = parsed_date.weekday() # 0=Mon, 5=Sat, 6=Sun
            config_day = py_weekday + 1 # 1=Mon..6=Sat, 7=Sun
            if config_day not in SCHEDULE_CONFIG["businessDays"]:
                errors["date"] = "We are closed on Sundays. Please select Monday through Saturday."

    # Time slot
    raw_time = data.get("startTime", "")
    start_time = raw_time.strip() if isinstance(raw_time, str) else ""
    if not start_time or start_time not in ALLOWED_SLOTS:
        errors["startTime"] = f"Please select an approved time slot between {SCHEDULE_CONFIG['openTime']} and {SCHEDULE_CONFIG['closeTime']}."
    elif parsed_date and parsed_date == today:
        # Check if slot time has already passed today
        now = datetime.now()
        slot_h, slot_m = map(int, start_time.split(":"))
        slot_dt = datetime.combine(today, time(slot_h, slot_m))
        if slot_dt <= now:
            errors["startTime"] = "This time slot has already passed for today. Please select a future time slot."

    # Notes (optional)
    raw_notes = data.get("notes", "")
    notes = raw_notes.strip() if isinstance(raw_notes, str) else ""
    if len(notes) > 300:
        errors["notes"] = "Notes cannot exceed 300 characters."

    # Appointment Type (optional fallback to General)
    raw_type = data.get("appointmentType", "")
    appointment_type = raw_type.strip() if isinstance(raw_type, str) else "General"

    return errors, {
        "fullName": full_name,
        "email": email,
        "phone": phone,
        "date": date_str,
        "startTime": start_time,
        "appointmentType": appointment_type or "General",
        "notes": notes
    }

def generate_reference():
    """Generate a clean human-readable booking reference code e.g. BK-2026-7842."""
    short_code = uuid.uuid4().hex[:6].upper()
    year = datetime.now().year
    return f"BK-{year}-{short_code}"


class BookingRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Handles API requests and static assets."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, format, *args):
        # Clean logging
        sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))

    def send_json(self, status_code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/config":
            self.send_json(200, {
                "config": SCHEDULE_CONFIG,
                "allowedSlots": ALLOWED_SLOTS,
                "serverTime": datetime.now().isoformat(),
                "persistence": "sqlite"
            })
            return

        if path == "/api/appointments":
            params = parse_qs(parsed.query)
            date_filter = params.get("date", [None])[0]
            
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            if date_filter:
                cursor.execute(
                    "SELECT * FROM appointments WHERE date = ? ORDER BY startTime ASC", 
                    (date_filter,)
                )
            else:
                cursor.execute(
                    "SELECT * FROM appointments ORDER BY date ASC, startTime ASC"
                )
                
            rows = cursor.fetchall()
            appointments = [dict(row) for row in rows]
            conn.close()
            
            self.send_json(200, {"appointments": appointments})
            return

        # Fallback to static files
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # Handle Create Booking
        if path == "/api/appointments":
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length > 100000:
                self.send_json(413, {"error": "Payload too large"})
                return

            body = self.rfile.read(content_length).decode("utf-8")
            try:
                payload = json.loads(body)
            except json.JSONDecodeError:
                self.send_json(400, {"error": "Invalid JSON"})
                return

            errors, cleaned = validate_booking_payload(payload)
            if errors:
                self.send_json(422, {"error": "Validation failed", "fieldErrors": errors})
                return

            new_id = str(uuid.uuid4())
            reference = generate_reference()
            now_iso = datetime.now().isoformat()

            conn = sqlite3.connect(DB_PATH, timeout=10.0)
            conn.row_factory = sqlite3.Row
            
            try:
                # Use immediate transaction for atomic reservation
                cursor = conn.cursor()
                cursor.execute("BEGIN IMMEDIATE")

                # Double check availability under the lock
                cursor.execute(
                    "SELECT id FROM appointments WHERE date = ? AND startTime = ? AND status = 'booked'",
                    (cleaned["date"], cleaned["startTime"])
                )
                existing = cursor.fetchone()
                if existing:
                    conn.rollback()
                    conn.close()
                    self.send_json(409, {
                        "error": "slot_conflict",
                        "message": "This slot was just booked by another user. Please choose another time."
                    })
                    return

                cursor.execute("""
                    INSERT INTO appointments (
                        id, reference, fullName, email, phone, date, startTime, appointmentType, notes, status, createdAt, cancelledAt
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?, NULL)
                """, (
                    new_id,
                    reference,
                    cleaned["fullName"],
                    cleaned["email"],
                    cleaned["phone"],
                    cleaned["date"],
                    cleaned["startTime"],
                    cleaned.get("appointmentType", "General"),
                    cleaned["notes"],
                    now_iso
                ))
                conn.commit()

                # Fetch created appointment
                cursor.execute("SELECT * FROM appointments WHERE id = ?", (new_id,))
                created = dict(cursor.fetchone())
                conn.close()

                self.send_json(201, {
                    "message": "Appointment booked successfully!",
                    "appointment": created
                })
                return

            except sqlite3.IntegrityError:
                conn.rollback()
                conn.close()
                self.send_json(409, {
                    "error": "slot_conflict",
                    "message": "This slot was just booked by another user. Please choose another time."
                })
                return
            except Exception as e:
                conn.rollback()
                conn.close()
                self.send_json(500, {"error": "Internal server error", "detail": str(e)})
                return

        # Handle Cancel Booking: /api/appointments/<id>/cancel
        cancel_match = re.match(r"^/api/appointments/([^/]+)/cancel$", path)
        if cancel_match:
            appt_id = cancel_match.group(1)
            now_iso = datetime.now().isoformat()
            
            conn = sqlite3.connect(DB_PATH, timeout=10.0)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            try:
                cursor.execute("BEGIN IMMEDIATE")
                cursor.execute("SELECT * FROM appointments WHERE id = ?", (appt_id,))
                appt = cursor.fetchone()
                
                if not appt:
                    conn.rollback()
                    conn.close()
                    self.send_json(404, {
                        "error": "not_found",
                        "message": "Appointment not found."
                    })
                    return
                
                if appt["status"] == "cancelled":
                    conn.rollback()
                    conn.close()
                    self.send_json(400, {
                        "error": "already_cancelled",
                        "message": "This appointment has already been cancelled."
                    })
                    return

                cursor.execute(
                    "UPDATE appointments SET status = 'cancelled', cancelledAt = ? WHERE id = ?",
                    (now_iso, appt_id)
                )
                conn.commit()
                
                cursor.execute("SELECT * FROM appointments WHERE id = ?", (appt_id,))
                updated = dict(cursor.fetchone())
                conn.close()

                self.send_json(200, {
                    "message": "Appointment cancelled successfully. The slot is now available again.",
                    "appointment": updated
                })
                return

            except Exception as e:
                conn.rollback()
                conn.close()
                self.send_json(500, {"error": "Failed to cancel appointment", "detail": str(e)})
                return

        self.send_json(404, {"error": "Endpoint not found"})


def run_server(host=HOST, port=PORT):
    init_db()
    server_address = (host, port)
    httpd = http.server.ThreadingHTTPServer(server_address, BookingRequestHandler)
    print(f"==================================================")
    print(f" BookMyTime Appointment Booking Server Running!")
    print(f" URL: http://{host}:{port}")
    print(f" Database: {DB_PATH}")
    print(f" Schedule: Mon-Sat, {SCHEDULE_CONFIG['openTime']}-{SCHEDULE_CONFIG['closeTime']}, {SCHEDULE_CONFIG['slotDurationMinutes']}m slots")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == "__main__":
    run_server()
