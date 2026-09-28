"""
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
                # Existing user: update current name & handle
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
                # Support "ref_12345" or "12345"
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

                            # Growth Loop Quota Rule: Every 5 referrals awards +1 post credit
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
        """
        Evaluate if a user has available quota.
        - free_posts_left > 0: Allowed (structural balance)
        - free_posts_left == 0: Check if last_daily_post_date matches today's UTC date.
        """
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
        """
        Atomically deduct 1 from free_posts_left or consume daily post.
        """
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

            # Scenario 1: Structural balance available
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

            # Scenario 2: Structural credits depleted, check calendar day quota
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

            # Scenario 3: Quota exceeded
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
        """
        Insert request data along with fetching the buyer's full name to populate buyer_name.
        Returns the generated request_id.
        """
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Fetch buyer's full name
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
        """Fetch a single request dictionary, linking buyer info."""
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
        """Fetch all requests not posted by the requesting user, sorted descending by created_at."""
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
        """Insert a counter-offer into the system. Return generated offer_id."""
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
        """Retrieve all sent counter-offers for a specific request ID."""
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
        """
        Fetch seller preferences.
        Crucial conversion: splits stored comma-separated strings back into clean
        list arrays (e.g., categories = ["Electronics", "Computers"]) so
        calculate_match_score receives an array.
        """
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
                # Split comma-separated strings and clean each element
                raw_str = str(raw_val).strip()
                # Handle possible JSON array format if previously stored as JSON
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
        """Flatten arrays into comma-separated text blocks and save using INSERT OR REPLACE."""
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
        """Fetch user's own requests along with a subquery count of received offers."""
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
        """Aggregate statistics for profile: user data, requests count, and offers count."""
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
