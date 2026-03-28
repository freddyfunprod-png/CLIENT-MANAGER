"""
SQLite database initialization and helpers.
"""
import aiosqlite
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "data" / "unified.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS leads (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    search_query    TEXT,
    city            TEXT,
    country         TEXT,
    name            TEXT,
    category        TEXT,
    rating          REAL,
    num_reviews     INTEGER,
    phone           TEXT,
    website_raw     TEXT,
    website_detected INTEGER DEFAULT 0,
    link_googlemaps TEXT UNIQUE,
    instagram       TEXT,
    followers       INTEGER,
    scraped_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    converted       INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS clients (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    phone           TEXT,
    category        TEXT,
    city            TEXT,
    country         TEXT,
    rating          REAL,
    link_googlemaps TEXT,
    website         TEXT,
    instagram       TEXT,
    landing_url     TEXT,
    status          TEXT DEFAULT 'prospect',
    notes           TEXT,
    assigned_to     TEXT,
    lead_id         INTEGER REFERENCES leads(id),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS daily_plan (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    date        TEXT NOT NULL,
    completed   INTEGER DEFAULT 0,
    UNIQUE(client_id, date)
);

CREATE TABLE IF NOT EXISTS checklists (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id    INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    step         TEXT NOT NULL,
    completed    INTEGER DEFAULT 0,
    completed_by TEXT,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(client_id, step)
);

CREATE TABLE IF NOT EXISTS goals (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT UNIQUE NOT NULL,
    prospects   INTEGER DEFAULT 0,
    contacted   INTEGER DEFAULT 0,
    proposals   INTEGER DEFAULT 0,
    closures    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS vendors (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT UNIQUE NOT NULL,
    color     TEXT NOT NULL DEFAULT '#6B7280',
    initial   TEXT NOT NULL,
    whatsapp  TEXT
);

CREATE TABLE IF NOT EXISTS scraper_categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT UNIQUE NOT NULL,
    label       TEXT NOT NULL,
    source_type TEXT DEFAULT 'maps'
);

CREATE TABLE IF NOT EXISTS scraper_settings (
    id                INTEGER PRIMARY KEY,
    website_filter    TEXT DEFAULT 'no_website',
    min_reviews       INTEGER DEFAULT 20,
    max_reviews       INTEGER DEFAULT 0,
    min_rating        REAL DEFAULT 4.0,
    max_results       INTEGER DEFAULT 50,
    active_categories TEXT DEFAULT '[]',
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS message_templates (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    pipeline_stage TEXT NOT NULL DEFAULT 'any',
    body           TEXT NOT NULL,
    ai_style       TEXT DEFAULT 'directo',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whatsapp_log (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id  INTEGER,
    phone    TEXT,
    message  TEXT,
    sent_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
"""

CHECKLIST_STEPS = [
    "Primer contacto realizado",
    "Interesado / Respondió",
    "Landing page lista",
    "Demo enviada",
    "Propuesta enviada",
    "Negociación",
    "Cerrado ✓",
]


async def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(SCHEMA)
        # Migrations: add new columns to existing DBs without breaking them
        for migration in [
            "ALTER TABLE checklists ADD COLUMN completed_by TEXT",
            "ALTER TABLE clients ADD COLUMN assigned_to TEXT",
            "ALTER TABLE vendors ADD COLUMN whatsapp TEXT",
            "ALTER TABLE scraper_categories ADD COLUMN source_type TEXT DEFAULT 'maps'",
            "ALTER TABLE leads ADD COLUMN instagram TEXT",
            "ALTER TABLE leads ADD COLUMN followers INTEGER",
            "ALTER TABLE message_templates ADD COLUMN pipeline_stage TEXT NOT NULL DEFAULT 'any'",
        ]:
            try:
                await db.execute(migration)
            except Exception:
                pass  # column already exists — safe to ignore
        # Seed default vendors if table is empty
        cur = await db.execute("SELECT COUNT(*) FROM vendors")
        row = await cur.fetchone()
        if row[0] == 0:
            await db.executemany(
                "INSERT OR IGNORE INTO vendors (name, color, initial) VALUES (?, ?, ?)",
                [
                    ("Diego",  "#3B82F6", "D"),
                    ("Freddy", "#8B5CF6", "F"),
                    ("João",   "#10B981", "J"),
                ],
            )
        # Seed default categories from config if table is empty
        cur = await db.execute("SELECT COUNT(*) FROM scraper_categories")
        row = await cur.fetchone()
        if row[0] == 0:
            from config import CATEGORY_SEARCH_TERMS
            await db.executemany(
                "INSERT OR IGNORE INTO scraper_categories (key, label) VALUES (?, ?)",
                list(CATEGORY_SEARCH_TERMS.items()),
            )
        # Seed Instagram-type categories (always, using INSERT OR IGNORE)
        instagram_cats = [
            ("musicos", "músico", "instagram"),
            ("fotografos_ig", "fotógrafo", "instagram"),
            ("djs", "DJ", "instagram"),
            ("artistas", "artista", "instagram"),
        ]
        for key, label, stype in instagram_cats:
            await db.execute(
                "INSERT OR IGNORE INTO scraper_categories (key, label, source_type) VALUES (?, ?, ?)",
                (key, label, stype)
            )
        # Seed default scraper_settings row if missing
        cur = await db.execute("SELECT COUNT(*) FROM scraper_settings")
        row = await cur.fetchone()
        if row[0] == 0:
            await db.execute(
                """INSERT INTO scraper_settings
                   (id, website_filter, min_reviews, max_reviews, min_rating, max_results, active_categories)
                   VALUES (1, 'no_website', 20, 0, 4.0, 50, '[]')"""
            )
        # Seed default message templates if table is empty
        cur = await db.execute("SELECT COUNT(*) FROM message_templates")
        row = await cur.fetchone()
        if row[0] == 0:
            await db.executemany(
                """INSERT INTO message_templates (name, pipeline_stage, body) VALUES (?, ?, ?)""",
                [
                    (
                        "Primer contacto",
                        "prospect",
                        "Hola {client_name}! Vi que tienen su negocio en {city} y quería presentarme. "
                        "Soy Freddy, ayudo a negocios como {business_name} a tener una presencia profesional en internet. "
                        "¿Tienen unos minutos para conversar?"
                    ),
                    (
                        "Seguimiento propuesta",
                        "proposal",
                        "Hola {client_name}! Te escribo para dar seguimiento a la propuesta que te envié. "
                        "¿Tuviste oportunidad de revisarla? Quedo a tu disposición para resolver cualquier duda."
                    ),
                    (
                        "Reactivación lead frío",
                        "any",
                        "Hola {client_name}! Hace un tiempo hablamos sobre mejorar la presencia online de {business_name} en {city}. "
                        "Tengo algunas ideas nuevas que podrían interesarte. ¿Seguimos en contacto?"
                    ),
                ],
            )
        await db.commit()


def row_to_dict(row, cursor) -> dict:
    """Convert aiosqlite Row to dict using cursor description."""
    if row is None:
        return None
    cols = [d[0] for d in cursor.description]
    return dict(zip(cols, row))


def rows_to_list(rows, cursor) -> list[dict]:
    cols = [d[0] for d in cursor.description]
    return [dict(zip(cols, row)) for row in rows]
