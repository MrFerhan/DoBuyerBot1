# Do-Buyer V1 — Telegram Marketplace Bot Engine

A dual-sided marketplace Telegram Bot built on `python-telegram-bot` v21+, embedded SQLite (WAL mode), high-efficiency text matching filters, and viral referral loops.

---

## 🚀 Key Features

1. **Single-Account Profile Architecture:**
   - Every Telegram user acts as both a **Buyer** and a **Seller** seamlessly.
   - Zero mode switching required.

2. **Growth Loop & Post Quota Automation:**
   - Default initial balance: **3 structural free posts**.
   - Calendar daily quota: **1 free post per calendar day** after depletion.
   - **Growth Loop:** Deep-linked referral tracking (`/start ref_<user_id>`). Every 5 verified new registrations awards the referrer +1 permanent post credit.

3. **Multi-Step Buyer Pipeline (`/buy`):**
   - Category Selection ➔ Item Name ➔ Quantity ➔ Target Budget ➔ Specifications ➔ Optional Photo ➔ Review ➔ Broadcast.
   - Atomic database quota deduction.
   - Automated formatted broadcast to Public Telegram Channel with deep-linked callback button.

4. **High-Efficiency Seller Matching Engine (`/opportunities`):**
   - Mathematical matching score:
     - **20% Context Match:** Category intersection.
     - **40% Item Match:** Item name intersection.
     - **40% Keyword Match:** Case-insensitive array keyword intersection scanning across specifications text.
     - Total compatibility: 0% to 100%.

5. **Private Transaction Routing & Spec Checklist:**
   - Seller submits offer price and fulfillment notes.
   - Bot automatically compiles specification checklist (e.g. `✓ 256GB, ✓ Used, ℹ️ Preferred Color`).
   - Private alert dispatched immediately into buyer's direct inbox.
   - Buyer gets direct 1-click button (`tg://user?id=...` or `https://t.me/...`) to open private chat with seller.

---

## 🛠️ Setup & Local Run

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your variables:
```ini
TELEGRAM_BOT_TOKEN="your_bot_token_from_botfather"
BOT_USERNAME="DoBuyerBot"
PUBLIC_CHANNEL_ID="@dobuyer_feed"
DATABASE_PATH="dobuyer.db"
```

### 3. Run the Bot
```bash
python bot.py
```

---

## 🌐 Free Deployment to Render (Background Worker)

1. Push this repository to GitHub.
2. In Render Dashboard, click **New** ➔ **Background Worker**.
3. Set:
   - **Environment:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `python bot.py`
4. Add your Environment Variables in the Render settings (`TELEGRAM_BOT_TOKEN`, `BOT_USERNAME`, `PUBLIC_CHANNEL_ID`).
5. Deploy!
