export const CODE_REQUIREMENTS = `python-telegram-bot==21.10
aiohttp==3.11.11
`;

export const CODE_DATABASE = `"""
Do-Buyer V1 — Database Layer (SQLite)
Embedded SQLite layer with WAL mode concurrency, thread-safe asynchronous dispatch,
viral referral loop automation, and deterministic quota enforcement.
"""

from __future__ import annotations

import asyncio
import datetime
import logging
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("dobuyer.database")

DEFAULT_DB_PATH = os.getenv("DATABASE_PATH", "dobuyer.db")


class Database:
    """
    Production-grade asynchronous database layer for the Do-Buyer V1 marketplace.
    Uses Python's standard library sqlite3 wrapped cleanly with asyncio.to_thread
    to ensure non-blocking operation on async Telegram event loops.
    """

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        self._init_sqlite_engine()

    def _get_connection(self) -> sqlite3.Connection:
        """Create a configured SQLite connection with row factories and pragmas."""
        conn = sqlite3.connect(self.db_path, timeout=15.0)
        conn.row_factory = sqlite3.Row
        # Concurrency & integrity pragmas
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        return conn

    def _init_sqlite_engine(self) -> None:
        """Synchronously initialize tables and performance indexes."""
        with self._get_connection() as conn:
            cursor = conn.cursor()

            # 1. users table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS users (
                    user_id INTEGER PRIMARY KEY,
                    username TEXT,
                    full_name TEXT,
                    free_posts_left INTEGER DEFAULT 3,
                    last_daily_post_date TEXT,
                    referral_code TEXT UNIQUE,
                    referred_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
                    referral_count INTEGER DEFAULT 0,
                    created_at TIMESTAMP NOT NULL
                );
                """
            )

            # 2. seller_preferences table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS seller_preferences (
                    user_id INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
                    categories TEXT DEFAULT '',
                    items TEXT DEFAULT '',
                    keywords TEXT DEFAULT '',
                    updated_at TIMESTAMP NOT NULL
                );
                """
            )

            # 3. requests table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS requests (
                    request_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    buyer_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                    buyer_name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    item TEXT NOT NULL,
                    quantity TEXT NOT NULL,
                    budget TEXT NOT NULL,
                    specifications TEXT NOT NULL,
                    photo_file_id TEXT,
                    status TEXT NOT NULL DEFAULT 'ACTIVE',
                    created_at TIMESTAMP NOT NULL
                );
                """
            )

            # 4. offers table
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS offers (
                    offer_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    request_id INTEGER NOT NULL REFERENCES requests(request_id) ON DELETE CASCADE,
                    seller_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                    seller_name TEXT NOT NULL,
                    seller_username TEXT,
                    price TEXT NOT NULL,
                    match_percentage INTEGER NOT NULL,
                    specs_match TEXT NOT NULL,
                    created_at TIMESTAMP NOT NULL
                );
                """
            )

            # Indexes for low-latency queries under high concurrent loads
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_referral ON users(referral_code);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_requests_active ON requests(status, created_at DESC);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_requests_buyer ON requests(buyer_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_offers_request ON offers(request_id);")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_offers_seller ON offers(seller_id);")

            conn.commit()
            logger.info("SQLite schemas and indexes initialized successfully at %s", self.db_path)

    # -------------------------------------------------------------------------
    # 2. USER & REFERRAL GROWTH ENGINE
    # -------------------------------------------------------------------------

    def _sync_get_or_create_user(
        self,
        user_id: int,
        username: Optional[str],
        full_name: str,
        referrer_code: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], bool, Optional[int]]:
        """
        Atomically get or register user.
        Growth Loop Milestone: Every 5 referrals awards +1 structural post credit to referrer.
        Returns: (user_record_dict, is_new, rewarded_referrer_user_id)
        """
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        referral_code = f"ref_{user_id}"
        rewarded_referrer_id: Optional[int] = None

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
            row = cursor.fetchone()

            if row:
                cursor.execute(
                    """
                    UPDATE users
                    SET username = ?, full_name = ?
                    WHERE user_id = ?
                    """,
                    (username, full_name, user_id),
                )
                conn.commit()
                cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
                return dict(cursor.fetchone()), False, None

            # New User registration
            referred_by: Optional[int] = None
            if referrer_code:
                clean_ref = referrer_code.strip()
                if clean_ref.startswith("ref_"):
                    clean_ref = clean_ref[4:]
                try:
                    candidate_id = int(clean_ref)
                    if candidate_id != user_id:
                        cursor.execute(
                            "SELECT user_id, referral_count, free_posts_left FROM users WHERE user_id = ?",
                            (candidate_id,),
                        )
                        ref_row = cursor.fetchone()
                        if ref_row:
                            referred_by = candidate_id
                            new_count = ref_row["referral_count"] + 1
                            new_free = ref_row["free_posts_left"]

                            if new_count % 5 == 0:
                                new_free += 1
                                rewarded_referrer_id = candidate_id
                                logger.info(
                                    "Referral milestone for user %d: count=%d, free_posts=%d",
                                    candidate_id, new_count, new_free,
                                )

                            cursor.execute(
                                """
                                UPDATE users
                                SET referral_count = ?, free_posts_left = ?
                                WHERE user_id = ?
                                """,
                                (new_count, new_free, candidate_id),
                            )
                except ValueError:
                    logger.warning("Unrecognized referral code format: %s", referrer_code)

            cursor.execute(
                """
                INSERT INTO users (
                    user_id, username, full_name, free_posts_left,
                    last_daily_post_date, referral_code, referred_by,
                    referral_count, created_at
                ) VALUES (?, ?, ?, 3, NULL, ?, ?, 0, ?)
                """,
                (user_id, username, full_name, referral_code, referred_by, now),
            )
            conn.commit()

            cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
            return dict(cursor.fetchone()), True, rewarded_referrer_id

    async def get_or_create_user(
        self,
        user_id: int,
        username: Optional[str],
        full_name: str,
        referrer_code: Optional[str] = None,
    ) -> Tuple[Dict[str, Any], bool, Optional[int]]:
        return await asyncio.to_thread(
            self._sync_get_or_create_user, user_id, username, full_name, referrer_code
        )

    # -------------------------------------------------------------------------
    # 3. QUOTA VALIDATION (NON-DESTRUCTIVE CHECK)
    # -------------------------------------------------------------------------

    def _sync_can_user_post(self, user_id: int) -> Tuple[bool, str, Dict[str, Any]]:
        today_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
            row = cursor.fetchone()
            if not row:
                return False, "User not found. Please type /start.", {}

            user = dict(row)
            if user["free_posts_left"] > 0:
                return True, "Allowed", user

            if user["last_daily_post_date"] != today_str:
                return True, "Allowed", user

            return False, "Daily quota already used", user

    async def can_user_post(self, user_id: int) -> Tuple[bool, str, Dict[str, Any]]:
        return await asyncio.to_thread(self._sync_can_user_post, user_id)

    # -------------------------------------------------------------------------
    # 4. QUOTA CONSUMPTION (ATOMIC DEDUCTION)
    # -------------------------------------------------------------------------

    def _sync_check_and_consume_quota(self, user_id: int) -> Tuple[bool, str, Dict[str, Any]]:
        today_str = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
            row = cursor.fetchone()
            if not row:
                return False, "User not found. Please type /start.", {}

            user = dict(row)
            free_left = user["free_posts_left"]
            last_date = user["last_daily_post_date"]

            if free_left > 0:
                cursor.execute(
                    """
                    UPDATE users
                    SET free_posts_left = free_posts_left - 1,
                        last_daily_post_date = ?
                    WHERE user_id = ?
                    """,
                    (today_str, user_id),
                )
                conn.commit()
                cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
                return True, "structural_credit", dict(cursor.fetchone())

            if last_date != today_str:
                cursor.execute(
                    """
                    UPDATE users
                    SET last_daily_post_date = ?
                    WHERE user_id = ?
                    """,
                    (today_str, user_id),
                )
                conn.commit()
                cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
                return True, "daily_free", dict(cursor.fetchone())

            return False, "Quota exceeded", user

    async def check_and_consume_quota(self, user_id: int) -> Tuple[bool, str, Dict[str, Any]]:
        return await asyncio.to_thread(self._sync_check_and_consume_quota, user_id)

    # -------------------------------------------------------------------------
    # 5. CREATE BUYER REQUEST
    # -------------------------------------------------------------------------

    def _sync_create_request(
        self,
        buyer_id: int,
        category: str,
        item: str,
        quantity: str,
        budget: str,
        specifications: str,
        photo_file_id: Optional[str] = None,
    ) -> int:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT full_name FROM users WHERE user_id = ?", (buyer_id,))
            user_row = cursor.fetchone()
            buyer_name = user_row["full_name"] if user_row else f"User {buyer_id}"

            cursor.execute(
                """
                INSERT INTO requests (
                    buyer_id, buyer_name, category, item, quantity,
                    budget, specifications, photo_file_id, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
                """,
                (
                    buyer_id,
                    buyer_name,
                    category.strip(),
                    item.strip(),
                    quantity.strip(),
                    budget.strip(),
                    specifications.strip(),
                    photo_file_id,
                    now,
                ),
            )
            conn.commit()
            return cursor.lastrowid

    async def create_request(
        self,
        buyer_id: int,
        category: str,
        item: str,
        quantity: str,
        budget: str,
        specifications: str,
        photo_file_id: Optional[str] = None,
    ) -> int:
        return await asyncio.to_thread(
            self._sync_create_request,
            buyer_id,
            category,
            item,
            quantity,
            budget,
            specifications,
            photo_file_id,
        )

    # -------------------------------------------------------------------------
    # 6. GET SINGLE REQUEST
    # -------------------------------------------------------------------------

    def _sync_get_request(self, request_id: int) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT r.*, u.username as buyer_username
                FROM requests r
                LEFT JOIN users u ON r.buyer_id = u.user_id
                WHERE r.request_id = ?
                """,
                (request_id,),
            )
            row = cursor.fetchone()
            return dict(row) if row else None

    async def get_request(self, request_id: int) -> Optional[Dict[str, Any]]:
        return await asyncio.to_thread(self._sync_get_request, request_id)

    # -------------------------------------------------------------------------
    # 7. GET ACTIVE REQUESTS (EXCLUDING CALLER)
    # -------------------------------------------------------------------------

    def _sync_get_active_requests(self, exclude_user_id: int, limit: int = 30) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT r.*, u.username as buyer_username
                FROM requests r
                LEFT JOIN users u ON r.buyer_id = u.user_id
                WHERE r.status = 'ACTIVE' AND r.buyer_id != ?
                ORDER BY r.created_at DESC, r.request_id DESC
                LIMIT ?
                """,
                (exclude_user_id, limit),
            )
            return [dict(r) for r in cursor.fetchall()]

    async def get_active_requests(self, exclude_user_id: int, limit: int = 30) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(self._sync_get_active_requests, exclude_user_id, limit)

    # -------------------------------------------------------------------------
    # 8. CREATE COUNTER-OFFER
    # -------------------------------------------------------------------------

    def _sync_create_offer(
        self,
        request_id: int,
        seller_id: int,
        seller_name: str,
        seller_username: Optional[str],
        price: str,
        match_percentage: int,
        specs_match: str,
    ) -> int:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO offers (
                    request_id, seller_id, seller_name, seller_username,
                    price, match_percentage, specs_match, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    request_id,
                    seller_id,
                    seller_name,
                    seller_username,
                    price.strip(),
                    match_percentage,
                    specs_match.strip(),
                    now,
                ),
            )
            conn.commit()
            return cursor.lastrowid

    async def create_offer(
        self,
        request_id: int,
        seller_id: int,
        seller_name: str,
        seller_username: Optional[str],
        price: str,
        match_percentage: int,
        specs_match: str,
    ) -> int:
        return await asyncio.to_thread(
            self._sync_create_offer,
            request_id,
            seller_id,
            seller_name,
            seller_username,
            price,
            match_percentage,
            specs_match,
        )

    # -------------------------------------------------------------------------
    # 9. GET OFFERS FOR A REQUEST
    # -------------------------------------------------------------------------

    def _sync_get_offers_for_request(self, request_id: int) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM offers
                WHERE request_id = ?
                ORDER BY created_at DESC, offer_id DESC
                """,
                (request_id,),
            )
            return [dict(r) for r in cursor.fetchall()]

    async def get_offers_for_request(self, request_id: int) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(self._sync_get_offers_for_request, request_id)

    # -------------------------------------------------------------------------
    # 10. GET SELLER PREFERENCES (CONVERTED TO LIST ARRAYS)
    # -------------------------------------------------------------------------

    def _sync_get_seller_preferences(self, user_id: int) -> Dict[str, Any]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM seller_preferences WHERE user_id = ?", (user_id,))
            row = cursor.fetchone()
            if not row:
                return {
                    "user_id": user_id,
                    "categories": [],
                    "items": [],
                    "keywords": [],
                    "updated_at": None,
                }

            pref = dict(row)

            def _parse_list(raw_val: Any) -> List[str]:
                if not raw_val:
                    return []
                raw_str = str(raw_val).strip()
                if raw_str.startswith("[") and raw_str.endswith("]"):
                    import json
                    try:
                        parsed = json.loads(raw_str)
                        if isinstance(parsed, list):
                            return [str(x).strip() for x in parsed if str(x).strip()]
                    except Exception:
                        pass
                return [item.strip() for item in raw_str.split(",") if item.strip()]

            return {
                "user_id": pref["user_id"],
                "categories": _parse_list(pref.get("categories", "")),
                "items": _parse_list(pref.get("items", "")),
                "keywords": _parse_list(pref.get("keywords", "")),
                "updated_at": pref.get("updated_at"),
            }

    async def get_seller_preferences(self, user_id: int) -> Dict[str, Any]:
        return await asyncio.to_thread(self._sync_get_seller_preferences, user_id)

    # -------------------------------------------------------------------------
    # 11. SAVE SELLER PREFERENCES (FLATTEN TO COMMA-SEPARATED TEXT)
    # -------------------------------------------------------------------------

    def _sync_save_seller_preferences(
        self,
        user_id: int,
        categories: List[str],
        items: List[str],
        keywords: List[str],
    ) -> None:
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        clean_categories = ", ".join([c.strip() for c in categories if c.strip()])
        clean_items = ", ".join([i.strip() for i in items if i.strip()])
        clean_keywords = ", ".join([k.strip().lower() for k in keywords if k.strip()])

        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO seller_preferences (user_id, categories, items, keywords, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET
                    categories = excluded.categories,
                    items = excluded.items,
                    keywords = excluded.keywords,
                    updated_at = excluded.updated_at
                """,
                (user_id, clean_categories, clean_items, clean_keywords, now),
            )
            conn.commit()

    async def save_seller_preferences(
        self,
        user_id: int,
        categories: List[str],
        items: List[str],
        keywords: List[str],
    ) -> None:
        await asyncio.to_thread(
            self._sync_save_seller_preferences, user_id, categories, items, keywords
        )

    # -------------------------------------------------------------------------
    # 12. GET USER'S OWN REQUESTS WITH OFFER COUNTS
    # -------------------------------------------------------------------------

    def _sync_get_user_requests(self, user_id: int) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT r.*,
                       (SELECT COUNT(*) FROM offers o WHERE o.request_id = r.request_id) as offer_count
                FROM requests r
                WHERE r.buyer_id = ?
                ORDER BY r.created_at DESC, r.request_id DESC
                """,
                (user_id,),
            )
            return [dict(r) for r in cursor.fetchall()]

    async def get_user_requests(self, user_id: int) -> List[Dict[str, Any]]:
        return await asyncio.to_thread(self._sync_get_user_requests, user_id)

    # -------------------------------------------------------------------------
    # 13. GET USER SUMMARY STATS
    # -------------------------------------------------------------------------

    def _sync_get_user_summary_stats(self, user_id: int) -> Dict[str, Any]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE user_id = ?", (user_id,))
            user_row = cursor.fetchone()
            user_dict = dict(user_row) if user_row else {}

            cursor.execute("SELECT COUNT(*) FROM requests WHERE buyer_id = ?", (user_id,))
            requests_count = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM offers WHERE seller_id = ?", (user_id,))
            offers_count = cursor.fetchone()[0]

            return {
                "user": user_dict,
                "requests_count": requests_count,
                "offers_count": offers_count,
            }

    async def get_user_summary_stats(self, user_id: int) -> Dict[str, Any]:
        return await asyncio.to_thread(self._sync_get_user_summary_stats, user_id)
`;

export const CODE_BOT = `"""
Do-Buyer V1 — Telegram Marketplace Bot Engine
Production-grade asynchronous dual-sided marketplace Telegram Bot (python-telegram-bot v21+).
"""

from __future__ import annotations

import html
import logging
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from telegram import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
    Update,
)
from telegram.constants import ParseMode
from telegram.ext import (
    Application,
    ApplicationBuilder,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)

from database import Database

# -----------------------------------------------------------------------------
# LOGGING & CONFIGURATION
# -----------------------------------------------------------------------------
load_dotenv()

logging.basicConfig(
    format="%(asctime)s - [%(name)s] - %(levelname)s - %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("dobuyer.bot")

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
BOT_USERNAME = os.getenv("BOT_USERNAME", "DoBuyerBot").strip().lstrip("@")
PUBLIC_CHANNEL_ID = os.getenv("PUBLIC_CHANNEL_ID", "").strip()
DATABASE_PATH = os.getenv("DATABASE_PATH", "dobuyer.db")

# Initialize database
db = Database(DATABASE_PATH)

# Conversation Handler States for Buyer Flow (/buy)
(
    BUY_CATEGORY,
    BUY_ITEM,
    BUY_QUANTITY,
    BUY_BUDGET,
    BUY_SPECS,
    BUY_PHOTO,
    BUY_CONFIRM,
) = range(7)

# Conversation Handler States for Seller Preferences (/preferences)
(
    PREF_CATEGORIES,
    PREF_ITEMS,
    PREF_KEYWORDS,
) = range(10, 13)

# Conversation Handler States for Offer Submission
(
    OFFER_PRICE,
    OFFER_NOTES,
    OFFER_CONFIRM,
) = range(20, 23)

COMMON_CATEGORIES = [
    ["📱 Electronics & Gadgets", "💻 Computers & Laptops"],
    ["🚗 Vehicles & Auto Parts", "👗 Fashion & Watches"],
    ["🏠 Home, Office & Tools", "💼 Professional Services"],
    ["📦 Wholesale & Other"],
]

MAIN_KEYBOARD = ReplyKeyboardMarkup(
    [
        [KeyboardButton("🛒 Post Buyer Request"), KeyboardButton("💼 Seller Opportunities")],
        [KeyboardButton("⚙️ Seller Preferences"), KeyboardButton("👤 Profile & Referrals")],
        [KeyboardButton("📋 My Requests"), KeyboardButton("❓ Help & FAQ")],
    ],
    resize_keyboard=True,
    is_persistent=True,
)


def get_referral_link(user_id: int) -> str:
    """Generate the canonical Telegram deep-link for user referral invites."""
    return f"https://t.me/{BOT_USERNAME}?start=ref_{user_id}"


def get_request_deeplink(request_id: int) -> str:
    """Generate deep-link to instantly view a request in the bot."""
    return f"https://t.me/{BOT_USERNAME}?start=view_{request_id}"


# -----------------------------------------------------------------------------
# HIGH-EFFICIENCY TEXT MATCHING ENGINE
# -----------------------------------------------------------------------------
def calculate_match_score(
    seller_prefs: Dict[str, Any],
    req_category: str,
    req_item: str,
    req_specs: str,
) -> Tuple[int, Dict[str, Any]]:
    """
    Mathematical Matching Logic:
    - Base context match is 20%: Category intersection.
    - Item match adds 40%: Item name substring/intersection.
    - Case-insensitive keyword intersection scanning adds up to 40%.
    Total = Up to 100%.
    """
    categories: List[str] = [c.lower().strip() for c in seller_prefs.get("categories", [])]
    items: List[str] = [i.lower().strip() for i in seller_prefs.get("items", [])]
    keywords: List[str] = [k.lower().strip() for k in seller_prefs.get("keywords", [])]

    req_cat_lower = req_category.lower()
    req_item_lower = req_item.lower()
    req_specs_lower = req_specs.lower()

    # 1. Base Context Match (20%)
    context_matched = False
    if categories:
        for cat in categories:
            if cat in req_cat_lower or req_cat_lower in cat:
                context_matched = True
                break
    else:
        context_matched = True

    context_score = 20 if context_matched else 0

    # 2. Item Match (40%)
    item_matched = False
    matched_item_name = None
    if items:
        for itm in items:
            if itm in req_item_lower or req_item_lower in itm:
                item_matched = True
                matched_item_name = itm
                break
    else:
        for kw in keywords:
            if kw and kw in req_item_lower:
                item_matched = True
                matched_item_name = kw
                break

    item_score = 40 if item_matched else 0

    # 3. Keyword Intersection Scanning (up to 40%)
    keyword_score = 0
    matched_keywords: List[str] = []
    unmatched_keywords: List[str] = []

    if keywords:
        for kw in keywords:
            if not kw:
                continue
            pattern = r"(?i)\\b" + re.escape(kw) + r"\\b"
            if re.search(pattern, req_specs_lower) or kw in req_specs_lower:
                matched_keywords.append(kw)
            else:
                unmatched_keywords.append(kw)

        if len(keywords) > 0:
            fraction = len(matched_keywords) / len(keywords)
            keyword_score = min(40, round(fraction * 40))
    else:
        keyword_score = 10

    total_score = min(100, context_score + item_score + keyword_score)

    breakdown = {
        "context_score": context_score,
        "item_score": item_score,
        "keyword_score": keyword_score,
        "matched_keywords": matched_keywords,
        "unmatched_keywords": unmatched_keywords,
        "matched_item": matched_item_name,
    }
    return total_score, breakdown


def build_specs_checklist(buyer_specs: str, seller_notes: str, matched_kws: List[str]) -> str:
    """Constructs a clean, human-readable specification checklist."""
    raw_clauses = re.split(r"[,;\\n•\\-]+", buyer_specs)
    clauses = [c.strip() for c in raw_clauses if len(c.strip()) > 1]
    if not clauses:
        clauses = [buyer_specs.strip()]

    checklist_items: List[str] = []
    combined_seller_text = (seller_notes + " " + " ".join(matched_kws)).lower()

    for clause in clauses[:5]:
        c_clean = clause.strip()
        words = [w.lower() for w in re.findall(r"\\w+", c_clean) if len(w) > 2]
        is_hit = False
        for word in words:
            if word in combined_seller_text:
                is_hit = True
                break

        if is_hit or not words:
            checklist_items.append(f"✓ {c_clean}")
        else:
            checklist_items.append(f"ℹ️ {c_clean}")

    return ", ".join(checklist_items)


# -----------------------------------------------------------------------------
# UNIFIED PROFILE & REFERRAL ENGINE (/start)
# -----------------------------------------------------------------------------
async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user or not update.message:
        return

    user = update.effective_user
    args = context.args or []
    param = args[0] if args else ""

    referrer_code = param if param.startswith("ref_") else None
    user_record, is_new, rewarded_ref_id = await db.get_or_create_user(
        user_id=user.id,
        username=user.username,
        full_name=user.full_name,
        referrer_code=referrer_code,
    )

    if rewarded_ref_id:
        try:
            await context.bot.send_message(
                chat_id=rewarded_ref_id,
                text=(
                    "🎉 <b>Referral Milestone Reached!</b>\\n\\n"
                    "5 new users joined using your invite link!\\n"
                    "🎁 <b>+1 Permanent Post Credit</b> has been added to your account."
                ),
                parse_mode=ParseMode.HTML,
            )
        except Exception as e:
            logger.warning("Failed to notify referrer %d: %s", rewarded_ref_id, e)

    if param.startswith("view_"):
        try:
            req_id = int(param.replace("view_", ""))
            await render_request_view(update, context, req_id)
            return
        except ValueError:
            pass

    referral_link = get_referral_link(user.id)
    posts_left = user_record.get("free_posts_left", 3)

    welcome_text = (
        f"👋 <b>Welcome to Do-Buyer V1, {html.escape(user.first_name)}!</b>\\n\\n"
        "⚡ <b>The Dual-Sided Telegram Marketplace</b>\\n"
        "Post buying requests or fulfill buyer orders instantly without switching accounts.\\n\\n"
        f"🎫 <b>Your Structural Post Balance:</b> <code>{posts_left} posts</code>\\n"
        "📅 <i>Plus 1 free post every calendar day!</i>\\n\\n"
        "🔗 <b>Your Personal Referral Link:</b>\\n"
        f"<code>{referral_link}</code>\\n"
        "<i>Share with friends: Every 5 referrals awards +1 structural post credit!</i>\\n\\n"
        "👇 <b>Select an action below to get started:</b>"
    )

    await update.message.reply_text(
        text=welcome_text,
        reply_markup=MAIN_KEYBOARD,
        parse_mode=ParseMode.HTML,
    )


async def render_request_view(update: Update, context: ContextTypes.DEFAULT_TYPE, request_id: int) -> None:
    req = await db.get_request(request_id)
    if not req:
        if update.message:
            await update.message.reply_text("❌ Request not found or has expired.", reply_markup=MAIN_KEYBOARD)
        elif update.callback_query:
            await update.callback_query.answer("Request not found.", show_alert=True)
        return

    user_id = update.effective_user.id if update.effective_user else 0
    is_own_request = req["buyer_id"] == user_id

    card_text = (
        f"📋 <b>BUYER REQUEST #{req['request_id']}</b>\\n"
        f"━━━━━━━━━━━━━━━━━━\\n"
        f"📦 <b>Category:</b> {html.escape(req['category'])}\\n"
        f"🔍 <b>Item:</b> {html.escape(req['item'])}\\n"
        f"🔢 <b>Quantity:</b> {html.escape(req['quantity'])}\\n"
        f"💰 <b>Budget:</b> {html.escape(req['budget'])}\\n\\n"
        f"📝 <b>Specifications:</b>\\n"
        f"<i>{html.escape(req['specifications'])}</i>\\n\\n"
        f"👤 <b>Buyer:</b> {html.escape(req['buyer_name'])}\\n"
        f"📅 <b>Posted:</b> {req['created_at'][:10]}\\n"
    )

    keyboard_buttons = []
    if not is_own_request:
        keyboard_buttons.append([InlineKeyboardButton("📥 Submit Offer", callback_data=f"offer_{req['request_id']}")])
    keyboard_buttons.append([InlineKeyboardButton("💼 Seller Opportunities", callback_data="nav_opportunities")])

    markup = InlineKeyboardMarkup(keyboard_buttons)

    if req.get("photo_file_id"):
        try:
            if update.message:
                await update.message.reply_photo(
                    photo=req["photo_file_id"],
                    caption=card_text,
                    reply_markup=markup,
                    parse_mode=ParseMode.HTML,
                )
                return
            elif update.callback_query:
                await update.callback_query.message.reply_photo(
                    photo=req["photo_file_id"],
                    caption=card_text,
                    reply_markup=markup,
                    parse_mode=ParseMode.HTML,
                )
                await update.callback_query.answer()
                return
        except Exception as e:
            logger.warning("Could not send photo for request %d: %s", request_id, e)

    if update.message:
        await update.message.reply_text(card_text, reply_markup=markup, parse_mode=ParseMode.HTML)
    elif update.callback_query:
        await update.callback_query.message.reply_text(card_text, reply_markup=markup, parse_mode=ParseMode.HTML)
        await update.callback_query.answer()


# -----------------------------------------------------------------------------
# BUYER PIPELINE CONVERSATION HANDLER (/buy)
# -----------------------------------------------------------------------------
async def buy_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not update.effective_user or not update.message:
        return ConversationHandler.END

    user_id = update.effective_user.id
    can_post, reason, user_data = await db.can_user_post(user_id)

    if not can_post:
        ref_link = get_referral_link(user_id)
        blocked_text = (
            "⚠️ <b>Daily Post Quota Reached!</b>\\n\\n"
            "You have used your starting free posts and your 1 free post for today.\\n\\n"
            "🎁 <b>Unlock Instant Posts via the Growth Loop:</b>\\n"
            "Invite friends using your unique referral link:\\n"
            f"<code>{ref_link}</code>\\n\\n"
            "🌟 <i>Every 5 new users who join awards you +1 permanent post credit!</i>"
        )
        await update.message.reply_text(
            text=blocked_text,
            reply_markup=MAIN_KEYBOARD,
            parse_mode=ParseMode.HTML,
        )
        return ConversationHandler.END

    context.user_data["buy_draft"] = {}

    category_keyboard = ReplyKeyboardMarkup(
        COMMON_CATEGORIES + [[KeyboardButton("❌ Cancel")]],
        resize_keyboard=True,
        one_time_keyboard=True,
    )

    await update.message.reply_text(
        "🛒 <b>Create Buyer Request (Step 1/6)</b>\\n\\n"
        "Please select a <b>Category</b> from the keyboard below, or type your own custom category:",
        reply_markup=category_keyboard,
        parse_mode=ParseMode.HTML,
    )
    return BUY_CATEGORY


async def buy_category_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    clean_cat = re.sub(r"^[^\w\s]+", "", text).strip()
    context.user_data["buy_draft"]["category"] = clean_cat or text

    cancel_kb = ReplyKeyboardMarkup([[KeyboardButton("❌ Cancel")]], resize_keyboard=True)
    await update.message.reply_text(
        "🔍 <b>Item Name (Step 2/6)</b>\\n\\n"
        "What specific item or product are you looking to buy?\\n"
        "<i>Example: iPhone 15 Pro Max 256GB, Herman Miller Aeron Chair</i>",
        reply_markup=cancel_kb,
        parse_mode=ParseMode.HTML,
    )
    return BUY_ITEM


async def buy_item_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    context.user_data["buy_draft"]["item"] = text
    cancel_kb = ReplyKeyboardMarkup([[KeyboardButton("❌ Cancel")]], resize_keyboard=True)

    await update.message.reply_text(
        "🔢 <b>Quantity (Step 3/6)</b>\\n\\n"
        "How many units do you need?\\n"
        "<i>Example: 1 unit, 10 pcs, 500 kg</i>",
        reply_markup=cancel_kb,
        parse_mode=ParseMode.HTML,
    )
    return BUY_QUANTITY


async def buy_quantity_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    context.user_data["buy_draft"]["quantity"] = text
    cancel_kb = ReplyKeyboardMarkup([[KeyboardButton("❌ Cancel")]], resize_keyboard=True)

    await update.message.reply_text(
        "💰 <b>Budget Target (Step 4/6)</b>\\n\\n"
        "What is your target budget or maximum price ceiling?\\n"
        "<i>Example: $850, Up to €1,200</i>",
        reply_markup=cancel_kb,
        parse_mode=ParseMode.HTML,
    )
    return BUY_BUDGET


async def buy_budget_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    context.user_data["buy_draft"]["budget"] = text
    cancel_kb = ReplyKeyboardMarkup([[KeyboardButton("❌ Cancel")]], resize_keyboard=True)

    await update.message.reply_text(
        "📝 <b>Specifications & Requirements (Step 5/6)</b>\\n\\n"
        "List all condition, color, specs, or delivery requirements.\\n"
        "<i>Example: Color Natural Titanium, battery > 90%, original box required, EU charger.</i>",
        reply_markup=cancel_kb,
        parse_mode=ParseMode.HTML,
    )
    return BUY_SPECS


async def buy_specs_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    context.user_data["buy_draft"]["specifications"] = text

    skip_kb = ReplyKeyboardMarkup(
        [[KeyboardButton("⏭️ Skip Photo")], [KeyboardButton("❌ Cancel")]],
        resize_keyboard=True,
    )

    await update.message.reply_text(
        "📸 <b>Reference Photo (Step 6/6 - Optional)</b>\\n\\n"
        "Send a photo of the product you are seeking, or click <b>[⏭️ Skip Photo]</b> to continue:",
        reply_markup=skip_kb,
        parse_mode=ParseMode.HTML,
    )
    return BUY_PHOTO


async def buy_photo_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    photo_file_id = None
    if update.message.photo:
        photo_file_id = update.message.photo[-1].file_id
    elif update.message.text and update.message.text.strip() == "❌ Cancel":
        return await cancel_conversation(update, context)

    context.user_data["buy_draft"]["photo_file_id"] = photo_file_id
    draft = context.user_data["buy_draft"]

    summary_text = (
        "🔍 <b>Review Your Buyer Request Summary:</b>\\n"
        "━━━━━━━━━━━━━━━━━━━━\\n"
        f"📦 <b>Category:</b> {html.escape(draft['category'])}\\n"
        f"🔍 <b>Item:</b> {html.escape(draft['item'])}\\n"
        f"🔢 <b>Quantity:</b> {html.escape(draft['quantity'])}\\n"
        f"💰 <b>Budget:</b> {html.escape(draft['budget'])}\\n"
        f"📝 <b>Specs:</b> {html.escape(draft['specifications'])}\\n"
        f"📸 <b>Photo Attached:</b> {'Yes' if photo_file_id else 'No'}\\n\\n"
        "⚠️ <i>Submitting will deduct 1 post credit or use your daily quota.</i>"
    )

    confirm_kb = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("✅ Confirm & Broadcast", callback_data="buy_confirm_yes")],
            [InlineKeyboardButton("❌ Discard", callback_data="buy_confirm_no")],
        ]
    )

    if photo_file_id:
        await update.message.reply_photo(
            photo=photo_file_id,
            caption=summary_text,
            reply_markup=confirm_kb,
            parse_mode=ParseMode.HTML,
        )
    else:
        await update.message.reply_text(
            text=summary_text,
            reply_markup=confirm_kb,
            parse_mode=ParseMode.HTML,
        )

    return BUY_CONFIRM


async def buy_confirmation_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "buy_confirm_no":
        context.user_data.pop("buy_draft", None)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("❌ Request creation cancelled.", reply_markup=MAIN_KEYBOARD)
        return ConversationHandler.END

    user = update.effective_user
    draft = context.user_data.get("buy_draft")
    if not draft:
        await query.message.reply_text("Session expired. Please run /buy again.", reply_markup=MAIN_KEYBOARD)
        return ConversationHandler.END

    allowed, reason, updated_user = await db.check_and_consume_quota(user.id)
    if not allowed:
        ref_link = get_referral_link(user.id)
        await query.message.reply_text(
            "⚠️ <b>Quota Exceeded!</b>\\n\\n"
            "You do not have enough credits to publish this request right now.\\n"
            f"Invite friends to get +1 credit: <code>{ref_link}</code>",
            reply_markup=MAIN_KEYBOARD,
            parse_mode=ParseMode.HTML,
        )
        return ConversationHandler.END

    request_id = await db.create_request(
        buyer_id=user.id,
        category=draft["category"],
        item=draft["item"],
        quantity=draft["quantity"],
        budget=draft["budget"],
        specifications=draft["specifications"],
        photo_file_id=draft.get("photo_file_id"),
    )

    context.user_data.pop("buy_draft", None)
    deeplink = get_request_deeplink(request_id)

    # Broadcast to Public Channel
    if PUBLIC_CHANNEL_ID:
        channel_post = (
            f"📢 <b>NEW BUYER REQUEST #{request_id}</b>\\n"
            f"━━━━━━━━━━━━━━━━━━\\n"
            f"📦 <b>Category:</b> {html.escape(draft['category'])}\\n"
            f"🔍 <b>Looking for:</b> {html.escape(draft['item'])}\\n"
            f"🔢 <b>Quantity:</b> {html.escape(draft['quantity'])}\\n"
            f"💰 <b>Budget:</b> {html.escape(draft['budget'])}\\n"
            f"📝 <b>Specs:</b> {html.escape(draft['specifications'])}\\n\\n"
            "💼 <i>Are you a verified seller? Tap below to quote instantly!</i>"
        )
        channel_btn = InlineKeyboardMarkup(
            [[InlineKeyboardButton("📥 Submit Offer / View in Bot", url=deeplink)]]
        )
        try:
            if draft.get("photo_file_id"):
                await context.bot.send_photo(
                    chat_id=PUBLIC_CHANNEL_ID,
                    photo=draft["photo_file_id"],
                    caption=channel_post,
                    reply_markup=channel_btn,
                    parse_mode=ParseMode.HTML,
                )
            else:
                await context.bot.send_message(
                    chat_id=PUBLIC_CHANNEL_ID,
                    text=channel_post,
                    reply_markup=channel_btn,
                    parse_mode=ParseMode.HTML,
                )
            logger.info("Successfully broadcasted Request #%d to channel %s", request_id, PUBLIC_CHANNEL_ID)
        except Exception as broadcast_err:
            logger.warning("Could not broadcast to channel %s: %s", PUBLIC_CHANNEL_ID, broadcast_err)

    success_text = (
        f"✅ <b>Request #{request_id} Published Successfully!</b>\\n\\n"
        "Your request is now live in the Seller Marketplace and Public Feed.\\n"
        "You will receive immediate Telegram alerts whenever sellers submit offers.\\n\\n"
        f"🔗 <b>Public Deep Link:</b>\\n<code>{deeplink}</code>\\n\\n"
        f"🎫 Remaining structural credits: <b>{updated_user.get('free_posts_left', 0)}</b>"
    )

    await query.message.reply_text(
        text=success_text,
        reply_markup=MAIN_KEYBOARD,
        parse_mode=ParseMode.HTML,
    )
    return ConversationHandler.END


# -----------------------------------------------------------------------------
# SELLER OPPORTUNITIES FEED & MATCH ALGORITHM
# -----------------------------------------------------------------------------
async def seller_opportunities_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user:
        return

    user_id = update.effective_user.id
    seller_prefs = await db.get_seller_preferences(user_id)
    requests = await db.get_active_requests(exclude_user_id=user_id, limit=30)

    target_message = update.message if update.message else (update.callback_query.message if update.callback_query else None)
    if update.callback_query:
        await update.callback_query.answer()

    if not requests:
        empty_text = (
            "💼 <b>Seller Opportunity Feed</b>\\n\\n"
            "There are currently no active buyer requests from other users.\\n"
            "Check back soon or share the marketplace channel to bring in more buyers!"
        )
        if target_message:
            await target_message.reply_text(empty_text, reply_markup=MAIN_KEYBOARD, parse_mode=ParseMode.HTML)
        return

    scored_leads = []
    for r in requests:
        score, breakdown = calculate_match_score(
            seller_prefs=seller_prefs,
            req_category=r["category"],
            req_item=r["item"],
            req_specs=r["specifications"],
        )
        scored_leads.append((score, r, breakdown))

    scored_leads.sort(key=lambda x: x[0], reverse=True)

    has_prefs = bool(seller_prefs.get("categories") or seller_prefs.get("items") or seller_prefs.get("keywords"))
    header_pref_tip = ""
    if not has_prefs:
        header_pref_tip = (
            "💡 <i>Tip: You have not configured your Seller Preferences yet. "
            "Use /preferences to set your target items & keywords for 100% precision alerts!</i>\\n\\n"
        )

    feed_intro = (
        f"💼 <b>Seller Opportunities ({len(scored_leads)} Active Leads)</b>\\n"
        f"{header_pref_tip}"
        "Here are the top active requests ranked by your profile compatibility:"
    )

    if target_message:
        await target_message.reply_text(feed_intro, reply_markup=MAIN_KEYBOARD, parse_mode=ParseMode.HTML)

    for score, r, breakdown in scored_leads[:5]:
        score_emoji = "🟢" if score >= 75 else ("🟡" if score >= 40 else "⚪")
        lead_card = (
            f"{score_emoji} <b>Match Score: {score}%</b>\\n"
            f"━━━━━━━━━━━━━━━━━━\\n"
            f"📦 <b>Category:</b> {html.escape(r['category'])}\\n"
            f"🔍 <b>Item:</b> {html.escape(r['item'])}\\n"
            f"🔢 <b>Quantity:</b> {html.escape(r['quantity'])}\\n"
            f"💰 <b>Budget:</b> {html.escape(r['budget'])}\\n"
            f"📝 <b>Specs:</b> <i>{html.escape(r['specifications'][:140])}...</i>\\n"
            f"👤 Buyer: {html.escape(r['buyer_name'])}\\n"
        )

        lead_markup = InlineKeyboardMarkup(
            [
                [InlineKeyboardButton("📥 Submit Offer", callback_data=f"offer_{r['request_id']}")],
                [InlineKeyboardButton("🔎 View Full Request", callback_data=f"req_view_{r['request_id']}")],
            ]
        )

        if target_message:
            await target_message.reply_text(lead_card, reply_markup=lead_markup, parse_mode=ParseMode.HTML)


# -----------------------------------------------------------------------------
# OFFER ROUTING & TRANSACTION HANDLERS
# -----------------------------------------------------------------------------
async def offer_start_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    match = re.match(r"^offer_(\\d+)$", query.data)
    if not match:
        return ConversationHandler.END

    req_id = int(match.group(1))
    req = await db.get_request(req_id)
    if not req:
        await query.message.reply_text("❌ This request is no longer active.")
        return ConversationHandler.END

    if req["buyer_id"] == update.effective_user.id:
        await query.answer("You cannot submit an offer on your own request!", show_alert=True)
        return ConversationHandler.END

    context.user_data["offer_draft"] = {
        "request_id": req_id,
        "request": req,
    }

    cancel_kb = ReplyKeyboardMarkup([[KeyboardButton("❌ Cancel")]], resize_keyboard=True)

    await query.message.reply_text(
        f"📥 <b>Submit Offer for Request #{req_id}</b>\\n"
        f"<b>Item:</b> {html.escape(req['item'])}\\n"
        f"<b>Buyer's Budget:</b> {html.escape(req['budget'])}\\n\\n"
        "💵 <b>Step 1/2:</b> What is your proposed offer price and terms?\\n"
        "<i>Example: $790 including tracked shipping</i>",
        reply_markup=cancel_kb,
        parse_mode=ParseMode.HTML,
    )
    return OFFER_PRICE


async def offer_price_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    context.user_data["offer_draft"]["price"] = text
    req = context.user_data["offer_draft"]["request"]

    cancel_kb = ReplyKeyboardMarkup([[KeyboardButton("❌ Cancel")]], resize_keyboard=True)

    await update.message.reply_text(
        f"📋 <b>Step 2/2: Specification Fulfillment Notes</b>\\n\\n"
        f"Buyer's requested specifications were:\\n"
        f"<i>\\"{html.escape(req['specifications'])}\\"</i>\\n\\n"
        "Describe your item condition, warranty, and how it satisfies their specs:\\n"
        "<i>Example: 256GB, Space Gray, Like-New condition, includes original box and charger.</i>",
        reply_markup=cancel_kb,
        parse_mode=ParseMode.HTML,
    )
    return OFFER_NOTES


async def offer_notes_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    draft = context.user_data.get("offer_draft", {})
    draft["notes"] = text
    req = draft["request"]
    seller = update.effective_user

    seller_prefs = await db.get_seller_preferences(seller.id)
    score, breakdown = calculate_match_score(
        seller_prefs=seller_prefs,
        req_category=req["category"],
        req_item=req["item"],
        req_specs=req["specifications"],
    )
    draft["match_percentage"] = score

    specs_summary = build_specs_checklist(
        buyer_specs=req["specifications"],
        seller_notes=text,
        matched_kws=breakdown.get("matched_keywords", []),
    )
    draft["specs_match"] = specs_summary

    confirm_text = (
        "🔍 <b>Confirm Offer Submission:</b>\\n"
        "━━━━━━━━━━━━━━━━━━━━\\n"
        f"📦 <b>Item:</b> {html.escape(req['item'])}\\n"
        f"💰 <b>Your Offered Price:</b> {html.escape(draft['price'])}\\n"
        f"🎯 <b>Match Compatibility:</b> {score}%\\n"
        f"📋 <b>Specs Checklist:</b> {html.escape(specs_summary)}\\n"
        f"📝 <b>Seller Notes:</b> <i>{html.escape(draft['notes'])}</i>\\n\\n"
        "Send this offer directly to the buyer's private inbox?"
    )

    confirm_markup = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("✅ Send Offer to Buyer", callback_data="offer_send_confirm")],
            [InlineKeyboardButton("❌ Discard", callback_data="offer_send_cancel")],
        ]
    )

    await update.message.reply_text(confirm_text, reply_markup=confirm_markup, parse_mode=ParseMode.HTML)
    return OFFER_CONFIRM


async def offer_confirm_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()

    if query.data == "offer_send_cancel":
        context.user_data.pop("offer_draft", None)
        await query.edit_message_reply_markup(reply_markup=None)
        await query.message.reply_text("❌ Offer discarded.", reply_markup=MAIN_KEYBOARD)
        return ConversationHandler.END

    seller = update.effective_user
    draft = context.user_data.get("offer_draft")
    if not draft:
        await query.message.reply_text("Session expired.", reply_markup=MAIN_KEYBOARD)
        return ConversationHandler.END

    req = draft["request"]
    request_id = draft["request_id"]

    offer_id = await db.create_offer(
        request_id=request_id,
        seller_id=seller.id,
        seller_name=seller.full_name,
        seller_username=seller.username,
        price=draft["price"],
        match_percentage=draft["match_percentage"],
        specs_match=draft["specs_match"],
    )

    chat_url = f"https://t.me/{seller.username}" if seller.username else f"tg://user?id={seller.id}"
    buyer_alert_text = (
        f"🔔 <b>NEW OFFER RECEIVED FOR REQUEST #{request_id}!</b>\\n"
        f"━━━━━━━━━━━━━━━━━━\\n"
        f"🔍 <b>Item:</b> {html.escape(req['item'])}\\n"
        f"💰 <b>Offered Price:</b> <b>{html.escape(draft['price'])}</b>\\n"
        f"🎯 <b>Seller Match Score:</b> <code>{draft['match_percentage']}%</code>\\n\\n"
        f"📋 <b>Specification Checklist:</b>\\n"
        f"<code>{html.escape(draft['specs_match'])}</code>\\n\\n"
        f"📝 <b>Seller Fulfillment Notes:</b>\\n"
        f"<i>{html.escape(draft['notes'])}</i>\\n\\n"
        f"👤 <b>Seller:</b> {html.escape(seller.full_name)} "
        f"({f'@{seller.username}' if seller.username else 'ID: ' + str(seller.id)})\\n\\n"
        "💬 <i>Tap the button below to open a private direct chat and close the deal!</i>"
    )

    buyer_markup = InlineKeyboardMarkup(
        [
            [InlineKeyboardButton("💬 Open Direct Chat with Seller", url=chat_url)],
            [InlineKeyboardButton("📋 View All Offers for Request", callback_data=f"req_offers_{request_id}")],
        ]
    )

    try:
        await context.bot.send_message(
            chat_id=req["buyer_id"],
            text=buyer_alert_text,
            reply_markup=buyer_markup,
            parse_mode=ParseMode.HTML,
        )
    except Exception as e:
        logger.error("Failed to route offer to buyer %d: %s", req["buyer_id"], e)

    context.user_data.pop("offer_draft", None)

    seller_confirm_msg = (
        f"✅ <b>Offer #{offer_id} Submitted Successfully!</b>\\n\\n"
        "A direct notification has been routed to the buyer's inbox.\\n"
        "The buyer can now click to chat with you directly on Telegram."
    )

    await query.message.reply_text(seller_confirm_msg, reply_markup=MAIN_KEYBOARD, parse_mode=ParseMode.HTML)
    return ConversationHandler.END


# -----------------------------------------------------------------------------
# SELLER PREFERENCES PIPELINE (/preferences)
# -----------------------------------------------------------------------------
async def preferences_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not update.effective_user or not update.message:
        return ConversationHandler.END

    user_id = update.effective_user.id
    current_prefs = await db.get_seller_preferences(user_id)
    context.user_data["pref_draft"] = {}

    cats_str = ", ".join(current_prefs.get("categories", [])) or "None set"

    cancel_kb = ReplyKeyboardMarkup([[KeyboardButton("❌ Cancel")]], resize_keyboard=True)

    await update.message.reply_text(
        "⚙️ <b>Configure Seller Matching Preferences (Step 1/3)</b>\\n\\n"
        f"<b>Current Categories:</b> <code>{html.escape(cats_str)}</code>\\n\\n"
        "Enter your preferred <b>Categories</b> separated by commas\\n"
        "<i>(or send 'all' to monitor all categories):</i>\\n"
        "<i>Example: Electronics, Computers, Audio Hardware</i>",
        reply_markup=cancel_kb,
        parse_mode=ParseMode.HTML,
    )
    return PREF_CATEGORIES


async def pref_categories_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    if text.lower() == "all":
        context.user_data["pref_draft"]["categories"] = []
    else:
        context.user_data["pref_draft"]["categories"] = [c.strip() for c in text.split(",") if c.strip()]

    cancel_kb = ReplyKeyboardMarkup([[KeyboardButton("❌ Cancel")]], resize_keyboard=True)

    await update.message.reply_text(
        "🔍 <b>Target Item Names / Groups (Step 2/3)</b>\\n\\n"
        "Enter the specific item models or product groups you sell (comma separated):\\n"
        "<i>Example: iPhone, MacBook, Sony WH-1000XM5, GPU, Rolex</i>\\n"
        "<i>(or send 'none' to skip):</i>",
        reply_markup=cancel_kb,
        parse_mode=ParseMode.HTML,
    )
    return PREF_ITEMS


async def pref_items_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    if text.lower() in ("none", "skip"):
        context.user_data["pref_draft"]["items"] = []
    else:
        context.user_data["pref_draft"]["items"] = [i.strip() for i in text.split(",") if i.strip()]

    cancel_kb = ReplyKeyboardMarkup([[KeyboardButton("❌ Cancel")]], resize_keyboard=True)

    await update.message.reply_text(
        "🎯 <b>Custom Filter Keywords (Step 3/3)</b>\\n\\n"
        "Enter exact keywords used for precision spec intersection scanning (comma separated):\\n"
        "<i>Example: 256GB, 512GB, M3, Brand New, Unlocked, Refurbished, Warranty</i>\\n"
        "<i>(or send 'none' to skip):</i>",
        reply_markup=cancel_kb,
        parse_mode=ParseMode.HTML,
    )
    return PREF_KEYWORDS


async def pref_keywords_received(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.strip()
    if text == "❌ Cancel":
        return await cancel_conversation(update, context)

    if text.lower() in ("none", "skip"):
        context.user_data["pref_draft"]["keywords"] = []
    else:
        context.user_data["pref_draft"]["keywords"] = [k.strip() for k in text.split(",") if k.strip()]

    user_id = update.effective_user.id
    draft = context.user_data.get("pref_draft", {})

    await db.save_seller_preferences(
        user_id=user_id,
        categories=draft.get("categories", []),
        items=draft.get("items", []),
        keywords=draft.get("keywords", []),
    )

    context.user_data.pop("pref_draft", None)

    summary = (
        "✅ <b>Seller Preferences Saved!</b>\\n\\n"
        f"📦 <b>Categories:</b> {', '.join(draft.get('categories', [])) or 'All Categories'}\\n"
        f"🔍 <b>Items:</b> {', '.join(draft.get('items', [])) or 'All Items'}\\n"
        f"🎯 <b>Keywords:</b> {', '.join(draft.get('keywords', [])) or 'None'}\\n\\n"
        "Your Seller Opportunity Feed will now calculate match scores based on these criteria."
    )

    await update.message.reply_text(summary, reply_markup=MAIN_KEYBOARD, parse_mode=ParseMode.HTML)
    return ConversationHandler.END


# -----------------------------------------------------------------------------
# USER PROFILE, REQUESTS & HELPER VIEWS
# -----------------------------------------------------------------------------
async def profile_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user:
        return

    user_id = update.effective_user.id
    stats = await db.get_user_summary_stats(user_id)
    user_info = stats.get("user", {})

    free_left = user_info.get("free_posts_left", 0)
    referral_count = user_info.get("referral_count", 0)
    ref_link = get_referral_link(user_id)

    next_milestone = ((referral_count // 5) + 1) * 5
    needed = next_milestone - referral_count

    profile_text = (
        f"👤 <b>User Profile: {html.escape(update.effective_user.full_name)}</b>\\n"
        f"━━━━━━━━━━━━━━━━━━\\n"
        f"🆔 <b>Telegram ID:</b> <code>{user_id}</code>\\n"
        f"🎫 <b>Structural Post Balance:</b> <code>{free_left} credits</code>\\n"
        f"📅 <b>Daily Free Post:</b> 1 post/day available\\n"
        f"📦 <b>My Posted Requests:</b> {stats.get('requests_count', 0)}\\n"
        f"📥 <b>My Submitted Offers:</b> {stats.get('offers_count', 0)}\\n\\n"
        f"👥 <b>Growth Loop & Referrals:</b>\\n"
        f"• Total Referrals: <b>{referral_count}</b>\\n"
        f"• Next +1 Bonus Credit in: <b>{needed} more invite{'s' if needed != 1 else ''}</b>\\n\\n"
        f"🔗 <b>Your Personal Invite Link:</b>\\n"
        f"<code>{ref_link}</code>"
    )

    share_markup = InlineKeyboardMarkup(
        [
            [
                InlineKeyboardButton(
                    "🚀 Share Referral Link",
                    url=f"https://t.me/share/url?url={ref_link}&text=Join%20Do-Buyer%20Marketplace%20Bot%20to%20buy%20and%20sell%20anything!",
                )
            ]
        ]
    )

    await update.message.reply_text(profile_text, reply_markup=share_markup, parse_mode=ParseMode.HTML)


async def my_requests_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    if not update.effective_user:
        return

    user_id = update.effective_user.id
    requests = await db.get_user_requests(user_id)

    if not requests:
        await update.message.reply_text(
            "📋 <b>You have not posted any buyer requests yet.</b>\\n\\n"
            "Use /buy or tap <b>'🛒 Post Buyer Request'</b> to create your first listing!",
            reply_markup=MAIN_KEYBOARD,
            parse_mode=ParseMode.HTML,
        )
        return

    text = f"📋 <b>Your Active Requests ({len(requests)} total):</b>\\n\\n"
    for r in requests[:6]:
        text += (
            f"<b>Request #{r['request_id']}: {html.escape(r['item'])}</b>\\n"
            f"• Category: {html.escape(r['category'])}\\n"
            f"• Budget: {html.escape(r['budget'])}\\n"
            f"• Offers Received: <b>{r['offer_count']}</b>\\n"
            f"• Link: {get_request_deeplink(r['request_id'])}\\n\\n"
        )

    await update.message.reply_text(text, reply_markup=MAIN_KEYBOARD, parse_mode=ParseMode.HTML)


async def help_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    help_text = (
        "❓ <b>Do-Buyer V1 — User Guide</b>\\n\\n"
        "<b>1. How does it work?</b>\\n"
        "Every Telegram account can seamlessly buy and sell:\\n"
        "• <b>Buyers:</b> Post what you want with quantity, target budget, and specs.\\n"
        "• <b>Sellers:</b> Receive matching buyer leads with calculated compatibility scores.\\n"
        "• <b>Transactions:</b> When an offer is submitted, buyer & seller connect directly via private Telegram chat.\\n\\n"
        "<b>2. Post Quotas & Referrals:</b>\\n"
        "• Everyone receives 3 free starting posts.\\n"
        "• When depleted, you get 1 free post every calendar day.\\n"
        "• Invite friends with your referral link: Every 5 referrals permanently awards +1 post credit!\\n\\n"
        "<b>3. Seller Match Engine:</b>\\n"
        "Match scores use 20% Category + 40% Item Name + 40% Spec Keywords intersection.\\n\\n"
        "<b>Commands:</b>\\n"
        "/start - Main menu and deep-link registration\\n"
        "/buy - Create a new buyer request\\n"
        "/opportunities - View active buyer leads\\n"
        "/preferences - Configure seller match criteria\\n"
        "/profile - View quotas and referral statistics\\n"
        "/myrequests - View your active posts and offers\\n"
        "/cancel - Safely cancel any active dialog"
    )
    await update.message.reply_text(help_text, reply_markup=MAIN_KEYBOARD, parse_mode=ParseMode.HTML)


async def cancel_conversation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.pop("buy_draft", None)
    context.user_data.pop("pref_draft", None)
    context.user_data.pop("offer_draft", None)

    msg = update.message or (update.callback_query.message if update.callback_query else None)
    if msg:
        await msg.reply_text("❌ Action cancelled.", reply_markup=MAIN_KEYBOARD)
    return ConversationHandler.END


async def generic_callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    data = query.data or ""

    if data == "nav_opportunities":
        await seller_opportunities_handler(update, context)
    elif data.startswith("req_view_"):
        req_id = int(data.replace("req_view_", ""))
        await render_request_view(update, context, req_id)
    elif data.startswith("req_offers_"):
        req_id = int(data.replace("req_offers_", ""))
        offers = await db.get_offers_for_request(req_id)
        if not offers:
            await query.answer("No offers received yet.", show_alert=True)
            return

        text = f"📋 <b>Offers Received for Request #{req_id}:</b>\\n\\n"
        for o in offers:
            uname = f"@{o['seller_username']}" if o.get("seller_username") else "Private User"
            text += (
                f"💰 <b>{html.escape(o['price'])}</b> by {html.escape(o['seller_name'])} ({uname})\\n"
                f"• Match Score: {o['match_percentage']}%\\n"
                f"• Specs: {html.escape(o['specs_match'])}\\n\\n"
            )
        await query.message.reply_text(text, parse_mode=ParseMode.HTML)
        await query.answer()


def build_application() -> Application:
    if not BOT_TOKEN:
        raise ValueError(
            "TELEGRAM_BOT_TOKEN environment variable is missing. "
            "Please configure it in .env or your deployment environment."
        )

    app = ApplicationBuilder().token(BOT_TOKEN).build()

    buy_conv = ConversationHandler(
        entry_points=[
            CommandHandler("buy", buy_start),
            MessageHandler(filters.Regex("^🛒 Post Buyer Request$"), buy_start),
        ],
        states={
            BUY_CATEGORY: [MessageHandler(filters.TEXT & ~filters.COMMAND, buy_category_received)],
            BUY_ITEM: [MessageHandler(filters.TEXT & ~filters.COMMAND, buy_item_received)],
            BUY_QUANTITY: [MessageHandler(filters.TEXT & ~filters.COMMAND, buy_quantity_received)],
            BUY_BUDGET: [MessageHandler(filters.TEXT & ~filters.COMMAND, buy_budget_received)],
            BUY_SPECS: [MessageHandler(filters.TEXT & ~filters.COMMAND, buy_specs_received)],
            BUY_PHOTO: [
                MessageHandler(filters.PHOTO, buy_photo_received),
                MessageHandler(filters.TEXT & ~filters.COMMAND, buy_photo_received),
            ],
            BUY_CONFIRM: [
                CallbackQueryHandler(buy_confirmation_callback, pattern=r"^buy_confirm_"),
            ],
        },
        fallbacks=[
            CommandHandler("cancel", cancel_conversation),
            MessageHandler(filters.Regex("^❌ Cancel$"), cancel_conversation),
        ],
        per_user=True,
    )

    offer_conv = ConversationHandler(
        entry_points=[
            CallbackQueryHandler(offer_start_callback, pattern=r"^offer_\\d+$"),
        ],
        states={
            OFFER_PRICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, offer_price_received)],
            OFFER_NOTES: [MessageHandler(filters.TEXT & ~filters.COMMAND, offer_notes_received)],
            OFFER_CONFIRM: [
                CallbackQueryHandler(offer_confirm_callback, pattern=r"^offer_send_"),
            ],
        },
        fallbacks=[
            CommandHandler("cancel", cancel_conversation),
            MessageHandler(filters.Regex("^❌ Cancel$"), cancel_conversation),
        ],
        per_user=True,
    )

    pref_conv = ConversationHandler(
        entry_points=[
            CommandHandler("preferences", preferences_start),
            MessageHandler(filters.Regex("^⚙️ Seller Preferences$"), preferences_start),
        ],
        states={
            PREF_CATEGORIES: [MessageHandler(filters.TEXT & ~filters.COMMAND, pref_categories_received)],
            PREF_ITEMS: [MessageHandler(filters.TEXT & ~filters.COMMAND, pref_items_received)],
            PREF_KEYWORDS: [MessageHandler(filters.TEXT & ~filters.COMMAND, pref_keywords_received)],
        },
        fallbacks=[
            CommandHandler("cancel", cancel_conversation),
            MessageHandler(filters.Regex("^❌ Cancel$"), cancel_conversation),
        ],
        per_user=True,
    )

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(buy_conv)
    app.add_handler(offer_conv)
    app.add_handler(pref_conv)

    app.add_handler(CommandHandler("opportunities", seller_opportunities_handler))
    app.add_handler(MessageHandler(filters.Regex("^💼 Seller Opportunities$"), seller_opportunities_handler))

    app.add_handler(CommandHandler("profile", profile_handler))
    app.add_handler(MessageHandler(filters.Regex("^👤 Profile & Referrals$"), profile_handler))

    app.add_handler(CommandHandler("myrequests", my_requests_handler))
    app.add_handler(MessageHandler(filters.Regex("^📋 My Requests$"), my_requests_handler))

    app.add_handler(CommandHandler("help", help_handler))
    app.add_handler(MessageHandler(filters.Regex("^❓ Help & FAQ$"), help_handler))
    app.add_handler(CommandHandler("cancel", cancel_conversation))

    app.add_handler(CallbackQueryHandler(generic_callback_handler))

    return app


import asyncio
from aiohttp import web

async def handle_ping(request):
    """A placeholder webpage endpoint to pass Render's platform routing logs."""
    return web.Response(text="Do-Buyer Marketplace Engine is running smoothly!")

async def start_bot_and_server():
    """Initializes and runs the bot and web service within the proper async scope."""
    logger.info("Initializing Do-Buyer V1 Engine...")
    application = build_application()
    
    # 1. Initialize and launch the Telegram update engine components
    await application.initialize()
    await application.start()
    await application.updater.start_polling(drop_pending_updates=True)
    
    # 2. Spin up a lightweight web runner mapping to Render's allocated port environmental variable
    web_app = web.Application()
    web_app.router.add_get('/', handle_ping)
    
    port = int(os.getenv("PORT", "10000"))
    runner = web.AppRunner(web_app)
    await runner.setup()
    site = web.TCPSite(runner, '0.0.0.0', port)
    
    logger.info(f"Dummy web server listening on port {port}. Engine is active!")
    await site.start()
    
    # Keep the execution thread open infinitely while listening for events
    try:
        while True:
            await asyncio.sleep(3600)
    except (KeyboardInterrupt, SystemExit, asyncio.CancelledError):
        logger.info("Stopping system processes cleanly...")
    finally:
        await application.updater.stop()
        await application.stop()
        await application.shutdown()
        await runner.cleanup()

def main() -> None:
    """Main application launcher initializing the master async thread."""
    try:
        asyncio.run(start_bot_and_server())
    except Exception as err:
        logger.critical(f"Bot system runtime crashed with error code: {err}")

if __name__ == "__main__":
    main()
`;

export const CODE_ENV = `# Telegram Bot Token obtained from @BotFather
TELEGRAM_BOT_TOKEN="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"

# Bot username (without @) for deep linking, e.g. "DoBuyerBot"
BOT_USERNAME="DoBuyerBot"

# Public Channel ID or Username for broadcasts (e.g. "@dobuyer_feed" or "-1001234567890")
# The bot must be added as an Administrator in this channel with Post Messages permission.
PUBLIC_CHANNEL_ID="@dobuyer_feed"

# SQLite Database File Path (defaults to "dobuyer.db")
DATABASE_PATH="dobuyer.db"
`;

export const CODE_RENDER = `services:
  - type: worker
    name: dobuyer-bot-worker
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: python bot.py
    autoDeploy: true
    envVars:
      - key: TELEGRAM_BOT_TOKEN
        sync: false
      - key: BOT_USERNAME
        sync: false
      - key: PUBLIC_CHANNEL_ID
        sync: false
      - key: DATABASE_PATH
        value: /var/data/dobuyer.db
    disk:
      name: sqlite-data
      mountPath: /var/data
      sizeGB: 1
`;
