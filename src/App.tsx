import React, { useState, useMemo } from 'react';
import {
  Send,
  MessageSquare,
  Bot,
  User,
  ShoppingBag,
  Briefcase,
  Sliders,
  CheckCircle2,
  Copy,
  Check,
  Download,
  Database as DatabaseIcon,
  Code2,
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  Radio,
  Share2,
  ArrowRight,
  Sparkles,
  Terminal,
  HelpCircle,
  FileCode,
  Layers,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import {
  CODE_BOT,
  CODE_DATABASE,
  CODE_REQUIREMENTS,
  CODE_ENV,
  CODE_RENDER,
} from './codeSnippets';

// --- TYPES ---
interface UserRecord {
  user_id: number;
  username: string;
  full_name: string;
  free_posts_left: number;
  last_daily_post_date: string | null;
  referral_code: string;
  referred_by: number | null;
  referral_count: number;
}

interface SellerPref {
  user_id: number;
  categories: string[];
  items: string[];
  keywords: string[];
}

interface BuyerRequest {
  request_id: number;
  buyer_id: number;
  buyer_name: string;
  category: string;
  item: string;
  quantity: string;
  budget: string;
  specifications: string;
  photo_file_id?: string;
  status: 'ACTIVE' | 'CLOSED';
  created_at: string;
}

interface OfferRecord {
  offer_id: number;
  request_id: number;
  seller_id: number;
  seller_name: string;
  seller_username: string;
  price: string;
  match_percentage: number;
  specs_match: string;
  created_at: string;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text?: string;
  photoUrl?: string;
  replyMarkup?: {
    inline?: { text: string; action: string; url?: string }[][];
    replyKeyboard?: string[][];
  };
  timestamp: string;
}

// Initial Simulated Seed Data
const INITIAL_USERS: UserRecord[] = [
  {
    user_id: 1001,
    username: 'alex_buyer',
    full_name: 'Alex Rivera',
    free_posts_left: 3,
    last_daily_post_date: null,
    referral_code: 'ref_1001',
    referred_by: null,
    referral_count: 3,
  },
  {
    user_id: 2002,
    username: 'elena_tech',
    full_name: 'Elena Rostova',
    free_posts_left: 2,
    last_daily_post_date: '2026-09-27',
    referral_code: 'ref_2002',
    referred_by: null,
    referral_count: 8,
  },
  {
    user_id: 3003,
    username: 'marcus_supply',
    full_name: 'Marcus Chen',
    free_posts_left: 5,
    last_daily_post_date: '2026-09-28',
    referral_code: 'ref_3003',
    referred_by: null,
    referral_count: 12,
  },
];

const INITIAL_PREFS: Record<number, SellerPref> = {
  2002: {
    user_id: 2002,
    categories: ['Electronics', 'Computers & Laptops', 'Gadgets'],
    items: ['iPhone', 'MacBook', 'iPad', 'AirPods Pro'],
    keywords: ['256gb', '512gb', 'm3', 'like-new', 'unlocked', 'warranty', 'space black'],
  },
  3003: {
    user_id: 3003,
    categories: ['Vehicles & Auto Parts', 'Tools', 'Electronics'],
    items: ['Brembo Brakes', 'DJI Drone', 'Sony Camera', 'iPhone'],
    keywords: ['new', 'box', 'original', 'carbon', 'sealed'],
  },
};

const INITIAL_REQUESTS: BuyerRequest[] = [
  {
    request_id: 101,
    buyer_id: 1001,
    buyer_name: 'Alex Rivera',
    category: 'Electronics',
    item: 'iPhone 15 Pro 256GB',
    quantity: '1 unit',
    budget: '$850 - $900',
    specifications: 'Color Natural Titanium or Space Black. Battery health > 90%, unlocked, like-new condition, original box preferred.',
    status: 'ACTIVE',
    created_at: '2026-09-28 10:15 UTC',
  },
  {
    request_id: 102,
    buyer_id: 1001,
    buyer_name: 'Alex Rivera',
    category: 'Computers & Laptops',
    item: 'MacBook Pro 14" M3 Pro 512GB',
    quantity: '2 units',
    budget: '$1,650 each',
    specifications: '18GB RAM, 512GB SSD, Space Black, clean cycle count under 50, includes 70W USB-C charger, US keyboard.',
    status: 'ACTIVE',
    created_at: '2026-09-28 11:30 UTC',
  },
];

const INITIAL_OFFERS: OfferRecord[] = [
  {
    offer_id: 501,
    request_id: 101,
    seller_id: 2002,
    seller_name: 'Elena Rostova',
    seller_username: 'elena_tech',
    price: '$870 tracked express shipping included',
    match_percentage: 95,
    specs_match: '✓ 256GB, ✓ Unlocked, ✓ Like-New, ℹ️ Original Box',
    created_at: '2026-09-28 11:45 UTC',
  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'code' | 'schema' | 'matching' | 'deployment'>('simulator');
  const [selectedUser, setSelectedUser] = useState<UserRecord>(INITIAL_USERS[0]);
  const [users, setUsers] = useState<UserRecord[]>(INITIAL_USERS);
  const [sellerPrefs, setSellerPrefs] = useState<Record<number, SellerPref>>(INITIAL_PREFS);
  const [requests, setRequests] = useState<BuyerRequest[]>(INITIAL_REQUESTS);
  const [offers, setOffers] = useState<OfferRecord[]>(INITIAL_OFFERS);

  // Chat Simulator State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'm1',
      sender: 'bot',
      text: `👋 <b>Welcome to Do-Buyer V1, ${INITIAL_USERS[0].full_name}!</b>\n\n⚡ <b>The Dual-Sided Telegram Marketplace</b>\nPost buying requests or fulfill buyer orders instantly without switching accounts.\n\n🎫 <b>Your Structural Post Balance:</b> <code>3 posts</code>\n📅 <i>Plus 1 free post every calendar day!</i>\n\n🔗 <b>Your Personal Referral Link:</b>\n<code>https://t.me/DoBuyerBot?start=ref_${INITIAL_USERS[0].user_id}</code>\n<i>Share with friends: Every 5 referrals awards +1 structural post credit!</i>`,
      replyMarkup: {
        replyKeyboard: [
          ['🛒 Post Buyer Request', '💼 Seller Opportunities'],
          ['⚙️ Seller Preferences', '👤 Profile & Referrals'],
          ['📋 My Requests', '❓ Help & FAQ'],
        ],
      },
      timestamp: '12:00 PM',
    },
  ]);

  const [inputMessage, setInputMessage] = useState('');
  const [activeBuyStep, setActiveBuyStep] = useState<number | null>(null);
  const [buyDraft, setBuyDraft] = useState<Partial<BuyerRequest>>({});
  const [activeOfferReqId, setActiveOfferReqId] = useState<number | null>(null);
  const [offerPrice, setOfferPrice] = useState('');
  const [offerNotes, setOfferNotes] = useState('');

  // Code Viewer State
  const [selectedCodeFile, setSelectedCodeFile] = useState<'bot' | 'db' | 'req' | 'env' | 'render'>('bot');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Match Sandbox Interactive Inputs
  const [sandboxCat, setSandboxCat] = useState('Electronics');
  const [sandboxItem, setSandboxItem] = useState('MacBook Pro M3 Max');
  const [sandboxSpecs, setSandboxSpecs] = useState('36GB RAM, 1TB SSD, Space Black, like-new condition, warranty active');
  const [sandboxPrefCats, setSandboxPrefCats] = useState('Electronics, Computers & Laptops');
  const [sandboxPrefItems, setSandboxPrefItems] = useState('MacBook, iPhone, Studio Display');
  const [sandboxPrefKws, setSandboxPrefKws] = useState('1tb, 36gb, space black, like-new, warranty, box');

  // Handle Copy to Clipboard
  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Download File Helper
  const handleDownload = (filename: string, content: string) => {
    const element = document.createElement('a');
    const file = new Blob([content], { type: 'text/plain;charset=utf-8' });
    element.href = URL.createObjectURL(file);
    element.download = filename;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Calculation Math implementation exactly per specs
  const calculateMatch = (
    prefs: { categories: string[]; items: string[]; keywords: string[] },
    reqCategory: string,
    reqItem: string,
    reqSpecs: string
  ) => {
    const reqCatLower = reqCategory.toLowerCase();
    const reqItemLower = reqItem.toLowerCase();
    const reqSpecsLower = reqSpecs.toLowerCase();

    // 1. Base Context Match (20%)
    let contextMatched = false;
    if (prefs.categories.length > 0) {
      contextMatched = prefs.categories.some(
        c => c.trim().toLowerCase() && (reqCatLower.includes(c.toLowerCase()) || c.toLowerCase().includes(reqCatLower))
      );
    } else {
      contextMatched = true; // Open baseline
    }
    const contextScore = contextMatched ? 20 : 0;

    // 2. Item Match (40%)
    let itemMatched = false;
    let matchedItem = '';
    if (prefs.items.length > 0) {
      for (const itm of prefs.items) {
        if (itm.trim() && (reqItemLower.includes(itm.toLowerCase()) || itm.toLowerCase().includes(reqItemLower))) {
          itemMatched = true;
          matchedItem = itm;
          break;
        }
      }
    }
    const itemScore = itemMatched ? 40 : 0;

    // 3. Keyword Intersection Scanning (up to 40%)
    let keywordScore = 0;
    const matchedKws: string[] = [];
    const unmatchedKws: string[] = [];
    if (prefs.keywords.length > 0) {
      prefs.keywords.forEach(kw => {
        const cleanKw = kw.trim().toLowerCase();
        if (!cleanKw) return;
        if (reqSpecsLower.includes(cleanKw)) {
          matchedKws.push(cleanKw);
        } else {
          unmatchedKws.push(cleanKw);
        }
      });
      const ratio = matchedKws.length / prefs.keywords.length;
      keywordScore = Math.min(40, Math.round(ratio * 40));
    } else {
      keywordScore = 10;
    }

    const total = Math.min(100, contextScore + itemScore + keywordScore);
    return {
      total,
      contextScore,
      itemScore,
      keywordScore,
      matchedKws,
      unmatchedKws,
      matchedItem,
    };
  };

  // Generate specification checklist
  const generateSpecChecklist = (specs: string, sellerNotes: string, matchedKws: string[]) => {
    const clauses = specs.split(/[,;\n•-]+/).map(s => s.trim()).filter(s => s.length > 1);
    const combined = (sellerNotes + ' ' + matchedKws.join(' ')).toLowerCase();
    return clauses.slice(0, 5).map(clause => {
      const words = clause.toLowerCase().split(/\W+/).filter(w => w.length > 2);
      const isHit = words.some(w => combined.includes(w));
      return isHit ? `✓ ${clause}` : `ℹ️ ${clause}`;
    }).join(', ');
  };

  // Switch Simulated User
  const handleSwitchUser = (user: UserRecord) => {
    setSelectedUser(user);
    setActiveBuyStep(null);
    setActiveOfferReqId(null);
    setChatMessages([
      {
        id: `sw_${Date.now()}`,
        sender: 'bot',
        text: `🔄 Switched active account to <b>${user.full_name}</b> (@${user.username})\n\n🎫 Structural Post Credits: <code>${user.free_posts_left}</code>\n👥 Referrals: <code>${user.referral_count}</code>\n🔗 Referral Link: <code>https://t.me/DoBuyerBot?start=${user.referral_code}</code>`,
        replyMarkup: {
          replyKeyboard: [
            ['🛒 Post Buyer Request', '💼 Seller Opportunities'],
            ['⚙️ Seller Preferences', '👤 Profile & Referrals'],
            ['📋 My Requests', '❓ Help & FAQ'],
          ],
        },
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Send message in simulated Telegram client
  const handleSendMessage = (textToSend?: string) => {
    const text = (textToSend || inputMessage).trim();
    if (!text) return;
    setInputMessage('');

    // Append user message
    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setChatMessages(prev => [...prev, userMsg]);

    setTimeout(() => {
      processBotLogic(text);
    }, 400);
  };

  // Central Bot Logic Processor for Simulator
  const processBotLogic = (text: string) => {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Handle Buyer Pipeline Steps
    if (activeBuyStep !== null) {
      if (text.toLowerCase() === '❌ cancel') {
        setActiveBuyStep(null);
        setBuyDraft({});
        setChatMessages(prev => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: 'bot',
            text: '❌ Buyer request creation cancelled.',
            replyMarkup: {
              replyKeyboard: [
                ['🛒 Post Buyer Request', '💼 Seller Opportunities'],
                ['⚙️ Seller Preferences', '👤 Profile & Referrals'],
                ['📋 My Requests', '❓ Help & FAQ'],
              ],
            },
            timestamp: nowTime,
          },
        ]);
        return;
      }

      if (activeBuyStep === 1) {
        setBuyDraft(d => ({ ...d, category: text.replace(/^[^\w\s]+/, '').trim() || text }));
        setActiveBuyStep(2);
        setChatMessages(prev => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: 'bot',
            text: '🔍 <b>Item Name (Step 2/6)</b>\n\nWhat specific item or model are you looking to buy?\n<i>Example: iPhone 15 Pro Max 256GB, Sony WH-1000XM5</i>',
            replyMarkup: { replyKeyboard: [['❌ Cancel']] },
            timestamp: nowTime,
          },
        ]);
        return;
      }

      if (activeBuyStep === 2) {
        setBuyDraft(d => ({ ...d, item: text }));
        setActiveBuyStep(3);
        setChatMessages(prev => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: 'bot',
            text: '🔢 <b>Quantity (Step 3/6)</b>\n\nHow many units do you need?\n<i>Example: 1 unit, 10 pcs, 50 sets</i>',
            replyMarkup: { replyKeyboard: [['❌ Cancel']] },
            timestamp: nowTime,
          },
        ]);
        return;
      }

      if (activeBuyStep === 3) {
        setBuyDraft(d => ({ ...d, quantity: text }));
        setActiveBuyStep(4);
        setChatMessages(prev => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: 'bot',
            text: '💰 <b>Budget Target (Step 4/6)</b>\n\nWhat is your target budget ceiling?\n<i>Example: $850, €1,200</i>',
            replyMarkup: { replyKeyboard: [['❌ Cancel']] },
            timestamp: nowTime,
          },
        ]);
        return;
      }

      if (activeBuyStep === 4) {
        setBuyDraft(d => ({ ...d, budget: text }));
        setActiveBuyStep(5);
        setChatMessages(prev => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: 'bot',
            text: '📝 <b>Specifications & Requirements (Step 5/6)</b>\n\nList all specs, condition, color, and package requirements:\n<i>Example: 256GB, Natural Titanium, battery > 90%, original box required</i>',
            replyMarkup: { replyKeyboard: [['❌ Cancel']] },
            timestamp: nowTime,
          },
        ]);
        return;
      }

      if (activeBuyStep === 5) {
        const fullDraft = { ...buyDraft, specifications: text };
        setBuyDraft(fullDraft);
        setActiveBuyStep(6);

        setChatMessages(prev => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: 'bot',
            text: `🔍 <b>Review Your Buyer Request Summary:</b>\n━━━━━━━━━━━━━━━━━━━━\n📦 <b>Category:</b> ${fullDraft.category}\n🔍 <b>Item:</b> ${fullDraft.item}\n🔢 <b>Quantity:</b> ${fullDraft.quantity}\n💰 <b>Budget:</b> ${fullDraft.budget}\n📝 <b>Specs:</b> ${fullDraft.specifications}\n\n⚠️ <i>Submitting will deduct 1 post credit or consume your daily quota.</i>`,
            replyMarkup: {
              inline: [
                [
                  { text: '✅ Confirm & Broadcast', action: 'buy_confirm' },
                  { text: '❌ Discard', action: 'buy_cancel' },
                ],
              ],
            },
            timestamp: nowTime,
          },
        ]);
        return;
      }
    }

    // Main Menu commands
    if (text === '🛒 Post Buyer Request' || text === '/buy') {
      const todayStr = '2026-09-28';
      const hasStructural = selectedUser.free_posts_left > 0;
      const hasDaily = selectedUser.last_daily_post_date !== todayStr;

      if (!hasStructural && !hasDaily) {
        // Quota blocked
        setChatMessages(prev => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: 'bot',
            text: `⚠️ <b>Daily Post Quota Reached!</b>\n\nYou have used your starting free posts and your 1 free post for today.\n\n🎁 <b>Unlock Instant Posts via the Growth Loop:</b>\nInvite friends using your unique referral link:\n<code>https://t.me/DoBuyerBot?start=${selectedUser.referral_code}</code>\n\n🌟 <i>Every 5 new users who join awards you +1 permanent post credit!</i>\nAlternatively, your daily quota refreshes at midnight.`,
            replyMarkup: {
              inline: [
                [
                  { text: '🚀 Test Referral Invite (+1 User)', action: 'sim_add_referral' },
                ],
              ],
            },
            timestamp: nowTime,
          },
        ]);
        return;
      }

      setActiveBuyStep(1);
      setBuyDraft({});
      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: '🛒 <b>Create Buyer Request (Step 1/6)</b>\n\nPlease select a <b>Category</b> from the options below or type your own:',
          replyMarkup: {
            replyKeyboard: [
              ['📱 Electronics', '💻 Computers & Laptops'],
              ['🚗 Vehicles & Auto Parts', '👗 Fashion & Watches'],
              ['❌ Cancel'],
            ],
          },
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (text === '💼 Seller Opportunities' || text === '/opportunities') {
      const activeLeads = requests.filter(r => r.buyer_id !== selectedUser.user_id && r.status === 'ACTIVE');
      const prefs = sellerPrefs[selectedUser.user_id] || { categories: [], items: [], keywords: [] };

      if (activeLeads.length === 0) {
        setChatMessages(prev => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: 'bot',
            text: '💼 <b>Seller Opportunity Feed</b>\n\nThere are currently no active buyer requests from other users.\nSwitch user to Alex and post a request to test this!',
            timestamp: nowTime,
          },
        ]);
        return;
      }

      const scored = activeLeads.map(lead => {
        const math = calculateMatch(prefs, lead.category, lead.item, lead.specifications);
        return { lead, math };
      }).sort((a, b) => b.math.total - a.math.total);

      const topCard = scored[0];
      const emoji = topCard.math.total >= 75 ? '🟢' : topCard.math.total >= 40 ? '🟡' : '⚪';

      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: `💼 <b>Seller Opportunity Feed (${scored.length} Active Leads)</b>\n\n${emoji} <b>Match Score: ${topCard.math.total}%</b>\n━━━━━━━━━━━━━━━━━━\n📦 <b>Category:</b> ${topCard.lead.category}\n🔍 <b>Item:</b> ${topCard.lead.item}\n🔢 <b>Quantity:</b> ${topCard.lead.quantity}\n💰 <b>Budget:</b> ${topCard.lead.budget}\n📝 <b>Specs:</b> <i>${topCard.lead.specifications}</i>\n👤 <b>Buyer:</b> ${topCard.lead.buyer_name}\n\n<i>Calculation: 20% Context (${topCard.math.contextScore}%) + 40% Item (${topCard.math.itemScore}%) + Keywords (${topCard.math.keywordScore}%)</i>`,
          replyMarkup: {
            inline: [
              [{ text: '📥 Submit Offer', action: `offer_req_${topCard.lead.request_id}` }],
            ],
          },
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (text === '👤 Profile & Referrals' || text === '/profile') {
      const nextMilestone = (Math.floor(selectedUser.referral_count / 5) + 1) * 5;
      const needed = nextMilestone - selectedUser.referral_count;
      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: `👤 <b>User Profile: ${selectedUser.full_name}</b>\n━━━━━━━━━━━━━━━━━━\n🆔 <b>Telegram ID:</b> <code>${selectedUser.user_id}</code>\n🎫 <b>Structural Post Balance:</b> <code>${selectedUser.free_posts_left} credits</code>\n📅 <b>Daily Free Post:</b> 1 post/day available\n\n👥 <b>Growth Loop & Referrals:</b>\n• Total Referrals: <b>${selectedUser.referral_count}</b>\n• Next +1 Bonus Credit in: <b>${needed} more invites</b>\n\n🔗 <b>Your Personal Invite Link:</b>\n<code>https://t.me/DoBuyerBot?start=${selectedUser.referral_code}</code>`,
          replyMarkup: {
            inline: [
              [{ text: '🚀 Simulate 1 New Referral (+1 count)', action: 'sim_add_referral' }],
            ],
          },
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (text === '⚙️ Seller Preferences' || text === '/preferences') {
      const prefs = sellerPrefs[selectedUser.user_id] || { categories: [], items: [], keywords: [] };
      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: `⚙️ <b>Seller Matching Profile</b>\n━━━━━━━━━━━━━━━━━━\n📦 <b>Categories:</b> ${prefs.categories.join(', ') || 'All'}\n🔍 <b>Target Items:</b> ${prefs.items.join(', ') || 'None'}\n🎯 <b>Keywords:</b> ${prefs.keywords.join(', ') || 'None'}\n\n<i>These settings drive the 20% Context + 40% Item + 40% Spec Keywords matching algorithm.</i>`,
          replyMarkup: {
            inline: [
              [{ text: '⚡ Load High-Tech Reseller Preset', action: 'preset_hightech' }],
              [{ text: '⚡ Load Auto / Tools Preset', action: 'preset_auto' }],
            ],
          },
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (text === '📋 My Requests' || text === '/myrequests') {
      const myReqs = requests.filter(r => r.buyer_id === selectedUser.user_id);
      if (myReqs.length === 0) {
        setChatMessages(prev => [
          ...prev,
          {
            id: `b_${Date.now()}`,
            sender: 'bot',
            text: '📋 <b>You have not posted any buyer requests yet.</b>\nTap "🛒 Post Buyer Request" to create one!',
            timestamp: nowTime,
          },
        ]);
        return;
      }
      const listText = myReqs.map(r => {
        const reqOffers = offers.filter(o => o.request_id === r.request_id);
        return `<b>Request #${r.request_id}: ${r.item}</b>\n• Budget: ${r.budget}\n• Offers Received: <b>${reqOffers.length}</b>`;
      }).join('\n\n');

      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: `📋 <b>Your Active Requests:</b>\n\n${listText}`,
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (text === '❓ Help & FAQ' || text === '/help') {
      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: '❓ <b>Do-Buyer V1 — User Guide</b>\n\n• <b>Single-Profile Engine:</b> You can buy and sell instantly.\n• <b>Quota System:</b> 3 structural credits + 1 daily post.\n• <b>Viral Growth:</b> Every 5 friends you invite grants +1 post credit forever.\n• <b>Match Algorithm:</b> 20% Category + 40% Item + 40% Specs Keywords.',
          timestamp: nowTime,
        },
      ]);
      return;
    }

    // Default Fallback
    setChatMessages(prev => [
      ...prev,
      {
        id: `b_${Date.now()}`,
        sender: 'bot',
        text: `🤖 Command received: "<code>${text}</code>". Tap an option from the menu keyboard below:`,
        replyMarkup: {
          replyKeyboard: [
            ['🛒 Post Buyer Request', '💼 Seller Opportunities'],
            ['⚙️ Seller Preferences', '👤 Profile & Referrals'],
            ['📋 My Requests', '❓ Help & FAQ'],
          ],
        },
        timestamp: nowTime,
      },
    ]);
  };

  // Handle Inline Action Clicks in Simulated Bot
  const handleInlineAction = (action: string) => {
    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (action === 'buy_cancel') {
      setActiveBuyStep(null);
      setBuyDraft({});
      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: '❌ Buyer request discarded.',
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (action === 'buy_confirm') {
      // Consume quota
      const updatedUsers = users.map(u => {
        if (u.user_id === selectedUser.user_id) {
          const newFree = u.free_posts_left > 0 ? u.free_posts_left - 1 : u.free_posts_left;
          return {
            ...u,
            free_posts_left: newFree,
            last_daily_post_date: '2026-09-28',
          };
        }
        return u;
      });
      setUsers(updatedUsers);
      setSelectedUser(updatedUsers.find(u => u.user_id === selectedUser.user_id)!);

      const newId = requests.length + 101;
      const newReq: BuyerRequest = {
        request_id: newId,
        buyer_id: selectedUser.user_id,
        buyer_name: selectedUser.full_name,
        category: buyDraft.category || 'General',
        item: buyDraft.item || 'Custom Item',
        quantity: buyDraft.quantity || '1 unit',
        budget: buyDraft.budget || 'Market Price',
        specifications: buyDraft.specifications || 'Standard condition',
        status: 'ACTIVE',
        created_at: '2026-09-28 ' + nowTime,
      };

      setRequests(prev => [newReq, ...prev]);
      setActiveBuyStep(null);
      setBuyDraft({});

      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: `✅ <b>Request #${newId} Published Successfully!</b>\n\nYour request is now live in the Seller Marketplace and broadcasted to <b>@dobuyer_feed</b> channel with a deep-linked offer button!\n\n🔗 <b>Deep Link:</b>\n<code>https://t.me/DoBuyerBot?start=view_${newId}</code>`,
          replyMarkup: {
            replyKeyboard: [
              ['🛒 Post Buyer Request', '💼 Seller Opportunities'],
              ['⚙️ Seller Preferences', '👤 Profile & Referrals'],
              ['📋 My Requests', '❓ Help & FAQ'],
            ],
          },
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (action.startsWith('offer_req_')) {
      const reqId = parseInt(action.replace('offer_req_', ''), 10);
      setActiveOfferReqId(reqId);
      const req = requests.find(r => r.request_id === reqId);
      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: `📥 <b>Submit Offer for Request #${reqId} (${req?.item})</b>\n\nFill in the offer dialog below to submit your price and specification fulfillment notes:`,
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (action === 'sim_add_referral') {
      const updatedUsers = users.map(u => {
        if (u.user_id === selectedUser.user_id) {
          const newCount = u.referral_count + 1;
          const awarded = newCount % 5 === 0;
          return {
            ...u,
            referral_count: newCount,
            free_posts_left: awarded ? u.free_posts_left + 1 : u.free_posts_left,
          };
        }
        return u;
      });
      setUsers(updatedUsers);
      const newSel = updatedUsers.find(u => u.user_id === selectedUser.user_id)!;
      setSelectedUser(newSel);

      const isAwarded = newSel.referral_count % 5 === 0;
      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: isAwarded
            ? `🎉 <b>REFERRAL MILESTONE REACHED!</b>\n\nYou hit <b>${newSel.referral_count} referrals</b>!\n🎁 <b>+1 Permanent Post Credit</b> awarded to your balance!\nNew Balance: <code>${newSel.free_posts_left} credits</code>`
            : `👥 New user registered via your link! Total referrals: <b>${newSel.referral_count}</b>. (Next bonus credit at ${(Math.floor(newSel.referral_count / 5) + 1) * 5})`,
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (action === 'preset_hightech') {
      const newPrefs: SellerPref = {
        user_id: selectedUser.user_id,
        categories: ['Electronics', 'Computers & Laptops'],
        items: ['MacBook', 'iPhone', 'iPad', 'Sony'],
        keywords: ['256gb', '512gb', 'm3', 'like-new', 'unlocked', 'box'],
      };
      setSellerPrefs(p => ({ ...p, [selectedUser.user_id]: newPrefs }));
      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: '✅ High-Tech Reseller profile preset loaded into SQLite database! Tap "💼 Seller Opportunities" to view matching scores.',
          timestamp: nowTime,
        },
      ]);
      return;
    }

    if (action === 'preset_auto') {
      const newPrefs: SellerPref = {
        user_id: selectedUser.user_id,
        categories: ['Vehicles & Auto Parts', 'Tools'],
        items: ['Brembo', 'Brakes', 'Exhaust', 'Turbo'],
        keywords: ['new', 'original', 'oem', 'carbon', 'warranty'],
      };
      setSellerPrefs(p => ({ ...p, [selectedUser.user_id]: newPrefs }));
      setChatMessages(prev => [
        ...prev,
        {
          id: `b_${Date.now()}`,
          sender: 'bot',
          text: '✅ Auto Parts & Tools profile preset loaded into SQLite database!',
          timestamp: nowTime,
        },
      ]);
      return;
    }
  };

  // Submit Offer Execution from modal/drawer
  const handleFinalSubmitOffer = () => {
    if (!activeOfferReqId || !offerPrice.trim()) return;
    const req = requests.find(r => r.request_id === activeOfferReqId);
    if (!req) return;

    const prefs = sellerPrefs[selectedUser.user_id] || { categories: [], items: [], keywords: [] };
    const math = calculateMatch(prefs, req.category, req.item, req.specifications);
    const specsSummary = generateSpecChecklist(req.specifications, offerNotes, math.matchedKws);

    const newOffer: OfferRecord = {
      offer_id: offers.length + 501,
      request_id: activeOfferReqId,
      seller_id: selectedUser.user_id,
      seller_name: selectedUser.full_name,
      seller_username: selectedUser.username,
      price: offerPrice,
      match_percentage: math.total,
      specs_match: specsSummary,
      created_at: new Date().toISOString(),
    };

    setOffers(prev => [newOffer, ...prev]);

    const nowTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChatMessages(prev => [
      ...prev,
      {
        id: `b_${Date.now()}`,
        sender: 'bot',
        text: `✅ <b>Offer #${newOffer.offer_id} Submitted Successfully!</b>\n\n💰 <b>Price:</b> ${newOffer.price}\n🎯 <b>Match Score:</b> ${newOffer.match_percentage}%\n📋 <b>Spec Checklist:</b> <code>${newOffer.specs_match}</code>\n\nDirect notification has been routed straight to buyer <b>${req.buyer_name}</b>'s inbox with a 1-click button to chat with you directly on Telegram!`,
        timestamp: nowTime,
      },
    ]);

    setActiveOfferReqId(null);
    setOfferPrice('');
    setOfferNotes('');
  };

  // Sandbox Live Output
  const sandboxResult = useMemo(() => {
    const prefs = {
      categories: sandboxPrefCats.split(',').map(s => s.trim()).filter(Boolean),
      items: sandboxPrefItems.split(',').map(s => s.trim()).filter(Boolean),
      keywords: sandboxPrefKws.split(',').map(s => s.trim()).filter(Boolean),
    };
    const math = calculateMatch(prefs, sandboxCat, sandboxItem, sandboxSpecs);
    const checklist = generateSpecChecklist(sandboxSpecs, 'Space Black 1TB with warranty', math.matchedKws);
    return { math, checklist, prefs };
  }, [sandboxCat, sandboxItem, sandboxSpecs, sandboxPrefCats, sandboxPrefItems, sandboxPrefKws]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans selection:bg-neutral-800">
      {/* Top Bar Contract: Brand title - Clean nav links - 1-2 primary actions */}
      <header className="h-14 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
            <Radio className="w-4 h-4" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-semibold tracking-tight text-white text-base">Do-Buyer V1</span>
            <span className="text-xs text-neutral-400 hidden sm:inline">· Telegram Marketplace Bot Engine</span>
          </div>
        </div>

        {/* Center Nav tabs */}
        <nav className="flex items-center gap-1 bg-neutral-950/60 p-1 rounded-lg border border-neutral-800 text-xs">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              activeTab === 'simulator'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Live Simulator
          </button>
          <button
            onClick={() => setActiveTab('matching')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              activeTab === 'matching'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Match Math (20/40/40)
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              activeTab === 'schema'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            SQLite Schema & DB
          </button>
          <button
            onClick={() => setActiveTab('code')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              activeTab === 'code'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Source Code (bot.py)
          </button>
          <button
            onClick={() => setActiveTab('deployment')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
              activeTab === 'deployment'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Render Deploy
          </button>
        </nav>

        {/* Right Primary Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleCopy(CODE_BOT, 'top_bot')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-md border border-neutral-700 transition-colors"
          >
            {copiedKey === 'top_bot' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copy bot.py</span>
          </button>
          <button
            onClick={() => handleDownload('bot.py', CODE_BOT)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md shadow-sm transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Download</span>
          </button>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {/* TAB 1: LIVE SIMULATOR */}
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left 4 Cols: Account Persona Switcher & Quotas */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
                  <div>
                    <h2 className="text-sm font-semibold text-white">Active Telegram Profile</h2>
                    <p className="text-xs text-neutral-400">Single-account dual role switcher</p>
                  </div>
                  <span className="text-xs text-sky-400 bg-sky-950/60 border border-sky-800/40 px-2 py-0.5 rounded">
                    Dual Buyer/Seller
                  </span>
                </div>

                {/* Profile Selector */}
                <div className="space-y-2">
                  {users.map(u => {
                    const isSelected = u.user_id === selectedUser.user_id;
                    return (
                      <button
                        key={u.user_id}
                        onClick={() => handleSwitchUser(u)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          isSelected
                            ? 'bg-neutral-800/90 border-sky-500/50 shadow-sm'
                            : 'bg-neutral-950/50 border-neutral-800/80 hover:bg-neutral-800/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm text-white">{u.full_name}</span>
                          <span className="text-xs font-mono text-neutral-400">@{u.username}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400">
                          <span>
                            Balance: <strong className="text-white font-mono">{u.free_posts_left} posts</strong>
                          </span>
                          <span>·</span>
                          <span>
                            Referrals: <strong className="text-sky-400 font-mono">{u.referral_count}</strong>
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Quota & Referral Progress Card */}
                <div className="bg-neutral-950 border border-neutral-800/80 rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-neutral-300">
                    <span className="font-medium">Post Quota Status</span>
                    <span className="font-mono text-emerald-400">
                      {selectedUser.free_posts_left > 0 ? `${selectedUser.free_posts_left} structural left` : 'Daily 1/day active'}
                    </span>
                  </div>
                  <div className="w-full bg-neutral-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-sky-500 h-full transition-all"
                      style={{ width: `${Math.min(100, (selectedUser.referral_count % 5) * 20)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-neutral-400 text-[11px]">
                    <span>Growth Loop: {selectedUser.referral_count % 5}/5 to next +1 credit</span>
                    <span>Total invited: {selectedUser.referral_count}</span>
                  </div>

                  <div className="pt-2 border-t border-neutral-800 flex gap-2">
                    <button
                      onClick={() => handleInlineAction('sim_add_referral')}
                      className="flex-1 py-1.5 px-2 bg-sky-950/80 hover:bg-sky-900 border border-sky-800/60 rounded text-sky-300 font-medium text-center transition-colors"
                    >
                      +1 Referral Test
                    </button>
                    <button
                      onClick={() => {
                        const updated = users.map(u =>
                          u.user_id === selectedUser.user_id ? { ...u, free_posts_left: 3, last_daily_post_date: null } : u
                        );
                        setUsers(updated);
                        setSelectedUser(updated.find(u => u.user_id === selectedUser.user_id)!);
                      }}
                      className="py-1.5 px-2 bg-neutral-800 hover:bg-neutral-700 rounded text-neutral-300 text-center transition-colors"
                    >
                      Reset Quota
                    </button>
                  </div>
                </div>

                {/* Public Channel Broadcast Monitor */}
                <div className="border border-neutral-800 rounded-lg p-3 bg-neutral-950 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-neutral-300 flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-sky-400 animate-pulse" />
                      Public Broadcast Feed
                    </span>
                    <span className="font-mono text-neutral-400">@dobuyer_feed</span>
                  </div>
                  <p className="text-[11px] text-neutral-400">
                    Live broadcasts sent to Telegram channel on buyer order confirmation:
                  </p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {requests.map(r => (
                      <div key={r.request_id} className="p-2 rounded bg-neutral-900 border border-neutral-800/80 text-[11px] space-y-1">
                        <div className="flex justify-between items-baseline font-medium text-neutral-200">
                          <span>#{r.request_id} · {r.item}</span>
                          <span className="font-mono text-emerald-400">{r.budget}</span>
                        </div>
                        <div className="text-neutral-400 truncate">{r.specifications}</div>
                        <div className="text-[10px] text-sky-400 flex items-center gap-1">
                          <span>Deep-link:</span>
                          <code className="text-neutral-300">/start view_{r.request_id}</code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Middle 5 Cols: Telegram Chat Interface */}
            <div className="lg:col-span-5 bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden flex flex-col h-[680px] shadow-lg">
              {/* Telegram Chat Header */}
              <div className="p-3 bg-neutral-950 border-b border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-sky-600 to-blue-500 flex items-center justify-center text-white font-bold text-sm shadow">
                    🤖
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-white flex items-center gap-1.5">
                      Do-Buyer V1 Bot
                      <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                    </div>
                    <div className="text-[11px] text-neutral-400">bot · asynchronous marketplace engine</div>
                  </div>
                </div>
                <button
                  onClick={() => handleSendMessage('/start')}
                  className="px-2.5 py-1 text-xs rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 border border-neutral-700 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>/start</span>
                </button>
              </div>

              {/* Chat Message Scrollport */}
              <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-[#0d1117]">
                {chatMessages.map(msg => {
                  const isBot = msg.sender === 'bot';
                  return (
                    <div key={msg.id} className={`flex flex-col ${isBot ? 'items-start' : 'items-end'}`}>
                      <div
                        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs shadow-sm ${
                          isBot
                            ? 'bg-neutral-800/90 text-neutral-100 border border-neutral-700/60 rounded-tl-sm'
                            : 'bg-sky-600 text-white rounded-tr-sm'
                        }`}
                      >
                        <div
                          className="whitespace-pre-wrap leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: msg.text || '' }}
                        />

                        {/* Inline Keyboard Simulation */}
                        {msg.replyMarkup?.inline && (
                          <div className="mt-2.5 pt-2 border-t border-neutral-700/50 space-y-1.5">
                            {msg.replyMarkup.inline.map((row, rIdx) => (
                              <div key={rIdx} className="flex gap-1.5">
                                {row.map((btn, bIdx) => (
                                  <button
                                    key={bIdx}
                                    onClick={() => handleInlineAction(btn.action)}
                                    className="flex-1 py-1.5 px-2 bg-neutral-700 hover:bg-neutral-600 active:bg-neutral-500 rounded text-center text-xs text-sky-200 font-medium transition-colors border border-neutral-600/60"
                                  >
                                    {btn.text}
                                  </button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}

                        <div className={`mt-1 text-[10px] text-right ${isBot ? 'text-neutral-400' : 'text-sky-200'}`}>
                          {msg.timestamp}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bot Reply Keyboard (Simulated bottom actions) */}
              <div className="p-2 bg-neutral-950 border-t border-neutral-800">
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  <button
                    onClick={() => handleSendMessage('🛒 Post Buyer Request')}
                    className="py-1.5 px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 border border-neutral-700 text-center transition-colors"
                  >
                    🛒 Post Buyer Request
                  </button>
                  <button
                    onClick={() => handleSendMessage('💼 Seller Opportunities')}
                    className="py-1.5 px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 border border-neutral-700 text-center transition-colors"
                  >
                    💼 Seller Opportunities
                  </button>
                  <button
                    onClick={() => handleSendMessage('⚙️ Seller Preferences')}
                    className="py-1.5 px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 border border-neutral-700 text-center transition-colors"
                  >
                    ⚙️ Seller Preferences
                  </button>
                  <button
                    onClick={() => handleSendMessage('👤 Profile & Referrals')}
                    className="py-1.5 px-2 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 border border-neutral-700 text-center transition-colors"
                  >
                    👤 Profile & Referrals
                  </button>
                </div>

                {/* Text input field */}
                <form
                  onSubmit={e => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputMessage}
                    onChange={e => setInputMessage(e.target.value)}
                    placeholder="Send a command or text (e.g. /buy, /help)..."
                    className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="submit"
                    className="p-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition-colors"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            </div>

            {/* Right 3 Cols: Direct Buyer Inbox & Live Offer Inspector */}
            <div className="lg:col-span-3 space-y-4">
              {/* Active Offer Submission Drawer (if open) */}
              {activeOfferReqId && (
                <div className="bg-neutral-900 border-2 border-sky-500/80 rounded-xl p-4 space-y-3 shadow-xl">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-sky-400">📥 Submit Seller Offer</span>
                    <button
                      onClick={() => setActiveOfferReqId(null)}
                      className="text-neutral-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="text-xs text-neutral-300">
                    Request #{activeOfferReqId}: {requests.find(r => r.request_id === activeOfferReqId)?.item}
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-neutral-400 block">Offer Price & Terms:</label>
                    <input
                      type="text"
                      value={offerPrice}
                      onChange={e => setOfferPrice(e.target.value)}
                      placeholder="e.g. $880 with free delivery"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded p-1.5 text-xs text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[11px] text-neutral-400 block">Fulfillment / Spec Notes:</label>
                    <textarea
                      rows={2}
                      value={offerNotes}
                      onChange={e => setOfferNotes(e.target.value)}
                      placeholder="e.g. 256GB Space Black, battery 94%, box included"
                      className="w-full bg-neutral-950 border border-neutral-700 rounded p-1.5 text-xs text-white"
                    />
                  </div>
                  <button
                    onClick={handleFinalSubmitOffer}
                    disabled={!offerPrice.trim()}
                    className="w-full py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium rounded text-xs transition-colors"
                  >
                    Send Private Offer to Buyer
                  </button>
                </div>
              )}

              {/* Direct Buyer Inbox simulation */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 space-y-3">
                <div className="border-b border-neutral-800 pb-2">
                  <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    Buyer's Direct Inbox
                  </h3>
                  <p className="text-[11px] text-neutral-400">
                    Private transaction alerts delivered straight to buyer
                  </p>
                </div>

                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                  {offers.map(off => {
                    const req = requests.find(r => r.request_id === off.request_id);
                    return (
                      <div key={off.offer_id} className="p-3 bg-neutral-950 border border-neutral-800 rounded-lg space-y-2 text-xs">
                        <div className="flex justify-between items-start">
                          <span className="font-semibold text-emerald-400 font-mono">{off.price}</span>
                          <span className="text-[11px] font-mono text-sky-400 bg-sky-950 px-1.5 py-0.5 rounded border border-sky-800/40">
                            {off.match_percentage}% Match
                          </span>
                        </div>
                        <div className="text-neutral-300 font-medium">
                          Item: {req?.item || `Request #${off.request_id}`}
                        </div>
                        <div className="text-[11px] text-neutral-400 font-mono bg-neutral-900 p-1.5 rounded">
                          {off.specs_match}
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          Seller: <span className="text-neutral-200">{off.seller_name}</span> (@{off.seller_username})
                        </div>
                        <a
                          href={`https://t.me/${off.seller_username}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 flex items-center justify-center gap-1.5 w-full py-1.5 bg-neutral-800 hover:bg-neutral-700 text-sky-300 rounded font-medium text-[11px] border border-neutral-700 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Chat with Seller (t.me/{off.seller_username})</span>
                        </a>
                      </div>
                    );
                  })}

                  {offers.length === 0 && (
                    <div className="text-center py-6 text-neutral-500 text-xs">
                      No offers received yet. Use "💼 Seller Opportunities" to submit an offer!
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: MATCHING ALGORITHM SANDBOX */}
        {activeTab === 'matching' && (
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <h2 className="text-base font-semibold text-white mb-1">
                Mathematical Matching Engine Sandbox (20% + 40% + 40%)
              </h2>
              <p className="text-xs text-neutral-400 max-w-3xl leading-relaxed">
                As required by the specification, Do-Buyer V1 calculates compatibility using three deterministic components:
                <strong className="text-neutral-200"> 20% Base Context</strong> (Category match),
                <strong className="text-neutral-200"> 40% Item Name Match</strong>, and
                <strong className="text-neutral-200"> up to 40% Keyword Intersection</strong> scanning case-insensitively across specifications text.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Input: Seller Profile */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
                  <Briefcase className="w-4 h-4 text-sky-400" />
                  <h3 className="text-sm font-semibold text-white">Seller Profile Configurations</h3>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-400 font-medium">Configured Categories (comma separated):</label>
                  <input
                    type="text"
                    value={sandboxPrefCats}
                    onChange={e => setSandboxPrefCats(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-400 font-medium">Configured Items (comma separated):</label>
                  <input
                    type="text"
                    value={sandboxPrefItems}
                    onChange={e => setSandboxPrefItems(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-400 font-medium">Filter Keywords Array (comma separated):</label>
                  <input
                    type="text"
                    value={sandboxPrefKws}
                    onChange={e => setSandboxPrefKws(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500 font-mono"
                  />
                </div>
              </div>

              {/* Input: Buyer Request */}
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2 border-b border-neutral-800 pb-3">
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Incoming Buyer Request</h3>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-400 font-medium">Request Category:</label>
                  <input
                    type="text"
                    value={sandboxCat}
                    onChange={e => setSandboxCat(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-400 font-medium">Request Item Name:</label>
                  <input
                    type="text"
                    value={sandboxItem}
                    onChange={e => setSandboxItem(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-neutral-400 font-medium">Buyer Specifications Text:</label>
                  <textarea
                    rows={3}
                    value={sandboxSpecs}
                    onChange={e => setSandboxSpecs(e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* Live Calculation Output Card */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800 pb-4">
                <div>
                  <h3 className="text-sm font-semibold text-white">Live Calculation Breakdown</h3>
                  <p className="text-xs text-neutral-400">Total compatibility score evaluated in real-time</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-neutral-400">Calculated Score:</span>
                  <div className="text-2xl font-bold font-mono text-emerald-400">
                    {sandboxResult.math.total}%
                  </div>
                </div>
              </div>

              {/* Progress bars for each tier */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400">1. Context Match (Max 20%)</span>
                    <span className="font-mono font-bold text-white">{sandboxResult.math.contextScore}%</span>
                  </div>
                  <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-sky-500 h-full transition-all"
                      style={{ width: `${(sandboxResult.math.contextScore / 20) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Category intersection check ({sandboxCat})
                  </p>
                </div>

                <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400">2. Item Match (Max 40%)</span>
                    <span className="font-mono font-bold text-white">{sandboxResult.math.itemScore}%</span>
                  </div>
                  <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full transition-all"
                      style={{ width: `${(sandboxResult.math.itemScore / 40) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Item model substring intersection check
                  </p>
                </div>

                <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-neutral-400">3. Keywords Scan (Max 40%)</span>
                    <span className="font-mono font-bold text-white">{sandboxResult.math.keywordScore}%</span>
                  </div>
                  <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-purple-500 h-full transition-all"
                      style={{ width: `${(sandboxResult.math.keywordScore / 40) * 100}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    {sandboxResult.math.matchedKws.length}/{sandboxResult.prefs.keywords.length} keywords hit
                  </p>
                </div>
              </div>

              {/* Specification Checklist Generated */}
              <div className="p-4 bg-neutral-950 border border-neutral-800 rounded-lg space-y-2">
                <span className="text-xs font-semibold text-neutral-300">
                  Generated Specification Checklist for Buyer Inbox:
                </span>
                <div className="font-mono text-xs text-sky-300 bg-neutral-900 p-3 rounded border border-neutral-800">
                  {sandboxResult.checklist}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SQLITE SCHEMA & LIVE DATABASE INSPECTOR */}
        {activeTab === 'schema' && (
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h2 className="text-base font-semibold text-white">Embedded SQLite Optimization Layer</h2>
                <p className="text-xs text-neutral-400">
                  WAL Mode (<code className="text-neutral-300">PRAGMA journal_mode = WAL</code>) · Foreign Keys Enabled · Async Threadpool Offloading
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setUsers(INITIAL_USERS);
                    setRequests(INITIAL_REQUESTS);
                    setOffers(INITIAL_OFFERS);
                  }}
                  className="px-3 py-1.5 text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded border border-neutral-700 transition-colors"
                >
                  Reset Sample Data
                </button>
              </div>
            </div>

            {/* Table 1: users */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DatabaseIcon className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-mono font-semibold text-white">TABLE: users</span>
                </div>
                <span className="text-xs text-neutral-400 font-mono">{users.length} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-950 text-neutral-400 font-mono border-b border-neutral-800">
                    <tr>
                      <th className="py-2.5 px-4">user_id</th>
                      <th className="py-2.5 px-4">username</th>
                      <th className="py-2.5 px-4">full_name</th>
                      <th className="py-2.5 px-4">free_posts_left</th>
                      <th className="py-2.5 px-4">last_daily_post_date</th>
                      <th className="py-2.5 px-4">referral_code</th>
                      <th className="py-2.5 px-4">referral_count</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 font-mono text-neutral-200">
                    {users.map(u => (
                      <tr key={u.user_id} className="hover:bg-neutral-800/30">
                        <td className="py-2.5 px-4 text-sky-400">{u.user_id}</td>
                        <td className="py-2.5 px-4">@{u.username}</td>
                        <td className="py-2.5 px-4 font-sans text-neutral-100">{u.full_name}</td>
                        <td className="py-2.5 px-4 text-emerald-400">{u.free_posts_left}</td>
                        <td className="py-2.5 px-4 text-neutral-400">{u.last_daily_post_date || 'NULL'}</td>
                        <td className="py-2.5 px-4 text-yellow-400">{u.referral_code}</td>
                        <td className="py-2.5 px-4 text-purple-400">{u.referral_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: requests */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DatabaseIcon className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-mono font-semibold text-white">TABLE: requests</span>
                </div>
                <span className="text-xs text-neutral-400 font-mono">{requests.length} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-950 text-neutral-400 font-mono border-b border-neutral-800">
                    <tr>
                      <th className="py-2.5 px-4">request_id</th>
                      <th className="py-2.5 px-4">buyer_id</th>
                      <th className="py-2.5 px-4">category</th>
                      <th className="py-2.5 px-4">item</th>
                      <th className="py-2.5 px-4">budget</th>
                      <th className="py-2.5 px-4">specifications</th>
                      <th className="py-2.5 px-4">status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 font-mono text-neutral-200">
                    {requests.map(r => (
                      <tr key={r.request_id} className="hover:bg-neutral-800/30">
                        <td className="py-2.5 px-4 text-emerald-400">#{r.request_id}</td>
                        <td className="py-2.5 px-4 text-sky-400">{r.buyer_id}</td>
                        <td className="py-2.5 px-4 font-sans">{r.category}</td>
                        <td className="py-2.5 px-4 font-sans font-medium text-white">{r.item}</td>
                        <td className="py-2.5 px-4 text-emerald-300">{r.budget}</td>
                        <td className="py-2.5 px-4 font-sans max-w-xs truncate text-neutral-300">{r.specifications}</td>
                        <td className="py-2.5 px-4 text-sky-400">{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 3: offers */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-neutral-800 bg-neutral-950/60 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <DatabaseIcon className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs font-mono font-semibold text-white">TABLE: offers</span>
                </div>
                <span className="text-xs text-neutral-400 font-mono">{offers.length} rows</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-950 text-neutral-400 font-mono border-b border-neutral-800">
                    <tr>
                      <th className="py-2.5 px-4">offer_id</th>
                      <th className="py-2.5 px-4">request_id</th>
                      <th className="py-2.5 px-4">seller_name</th>
                      <th className="py-2.5 px-4">price</th>
                      <th className="py-2.5 px-4">match_%</th>
                      <th className="py-2.5 px-4">specs_match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60 font-mono text-neutral-200">
                    {offers.map(o => (
                      <tr key={o.offer_id} className="hover:bg-neutral-800/30">
                        <td className="py-2.5 px-4 text-yellow-400">#{o.offer_id}</td>
                        <td className="py-2.5 px-4 text-emerald-400">#{o.request_id}</td>
                        <td className="py-2.5 px-4 font-sans">{o.seller_name} (@{o.seller_username})</td>
                        <td className="py-2.5 px-4 font-sans text-emerald-300 font-semibold">{o.price}</td>
                        <td className="py-2.5 px-4 text-sky-400">{o.match_percentage}%</td>
                        <td className="py-2.5 px-4 text-neutral-300 font-sans">{o.specs_match}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PRODUCTION SOURCE CODE EXPLORER */}
        {activeTab === 'code' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 pb-3">
              {/* File Selector buttons */}
              <div className="flex items-center gap-1.5 overflow-x-auto">
                <button
                  onClick={() => setSelectedCodeFile('bot')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                    selectedCodeFile === 'bot'
                      ? 'bg-sky-950 text-sky-300 border border-sky-800'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5" />
                  <span>bot.py</span>
                </button>
                <button
                  onClick={() => setSelectedCodeFile('db')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                    selectedCodeFile === 'db'
                      ? 'bg-sky-950 text-sky-300 border border-sky-800'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  <DatabaseIcon className="w-3.5 h-3.5" />
                  <span>database.py</span>
                </button>
                <button
                  onClick={() => setSelectedCodeFile('req')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                    selectedCodeFile === 'req'
                      ? 'bg-sky-950 text-sky-300 border border-sky-800'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>requirements.txt</span>
                </button>
                <button
                  onClick={() => setSelectedCodeFile('env')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                    selectedCodeFile === 'env'
                      ? 'bg-sky-950 text-sky-300 border border-sky-800'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  <span>.env.example</span>
                </button>
                <button
                  onClick={() => setSelectedCodeFile('render')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-colors flex items-center gap-1.5 ${
                    selectedCodeFile === 'render'
                      ? 'bg-sky-950 text-sky-300 border border-sky-800'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white border border-neutral-800'
                  }`}
                >
                  <span>render.yaml</span>
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const content =
                      selectedCodeFile === 'bot'
                        ? CODE_BOT
                        : selectedCodeFile === 'db'
                        ? CODE_DATABASE
                        : selectedCodeFile === 'req'
                        ? CODE_REQUIREMENTS
                        : selectedCodeFile === 'env'
                        ? CODE_ENV
                        : CODE_RENDER;
                    handleCopy(content, selectedCodeFile);
                  }}
                  className="px-3 py-1.5 rounded text-xs bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 flex items-center gap-1.5"
                >
                  {copiedKey === selectedCodeFile ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copy Code</span>
                </button>

                <button
                  onClick={() => {
                    const fname =
                      selectedCodeFile === 'bot'
                        ? 'bot.py'
                        : selectedCodeFile === 'db'
                        ? 'database.py'
                        : selectedCodeFile === 'req'
                        ? 'requirements.txt'
                        : selectedCodeFile === 'env'
                        ? '.env.example'
                        : 'render.yaml';
                    const content =
                      selectedCodeFile === 'bot'
                        ? CODE_BOT
                        : selectedCodeFile === 'db'
                        ? CODE_DATABASE
                        : selectedCodeFile === 'req'
                        ? CODE_REQUIREMENTS
                        : selectedCodeFile === 'env'
                        ? CODE_ENV
                        : CODE_RENDER;
                    handleDownload(fname, content);
                  }}
                  className="px-3 py-1.5 rounded text-xs bg-sky-600 hover:bg-sky-500 text-white flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </button>
              </div>
            </div>

            {/* Code Display Area */}
            <div className="bg-[#0b0f19] border border-neutral-800 rounded-xl overflow-hidden">
              <div className="p-3 bg-neutral-950 border-b border-neutral-800 flex justify-between items-center text-xs font-mono text-neutral-400">
                <span>
                  {selectedCodeFile === 'bot' && 'bot.py — Python Telegram Bot v21+ Core Engine'}
                  {selectedCodeFile === 'db' && 'database.py — Thread-safe SQLite Relational Layer'}
                  {selectedCodeFile === 'req' && 'requirements.txt — Zero-dependency Minimal Footprint'}
                  {selectedCodeFile === 'env' && '.env.example — Production Environment Configuration'}
                  {selectedCodeFile === 'render' && 'render.yaml — Free Render.com Background Worker Config'}
                </span>
                <span className="text-neutral-500">Python 3.10+ / SQLite 3</span>
              </div>
              <pre className="p-5 font-mono text-xs text-neutral-200 overflow-x-auto leading-relaxed max-h-[650px] overflow-y-auto selection:bg-neutral-800">
                <code>
                  {selectedCodeFile === 'bot' && CODE_BOT}
                  {selectedCodeFile === 'db' && CODE_DATABASE}
                  {selectedCodeFile === 'req' && CODE_REQUIREMENTS}
                  {selectedCodeFile === 'env' && CODE_ENV}
                  {selectedCodeFile === 'render' && CODE_RENDER}
                </code>
              </pre>
            </div>
          </div>
        )}

        {/* TAB 5: DEPLOYMENT GUIDE */}
        {activeTab === 'deployment' && (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white">How to Deploy Do-Buyer V1 to Render (Free Tier)</h2>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Because Do-Buyer V1 uses standard library <code className="text-neutral-200">sqlite3</code> with asynchronous thread dispatches and zero C-binding bloat, it runs smoothly on free background workers with 512MB RAM without restarts.
              </p>

              <div className="space-y-4 pt-2">
                {/* Step 1 */}
                <div className="border border-neutral-800 bg-neutral-950 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs">1</span>
                    Create Your Telegram Bot & Channel
                  </div>
                  <ol className="text-xs text-neutral-300 list-decimal list-inside space-y-1.5 pl-2 leading-relaxed">
                    <li>Open Telegram and message <b>@BotFather</b>. Send <code>/newbot</code> and follow prompts to obtain your <b>API Token</b>.</li>
                    <li>Create a public Telegram channel (e.g., <code>@dobuyer_feed</code>) for buyer requests.</li>
                    <li>Add your bot as an <b>Administrator</b> in this channel with <i>"Post Messages"</i> permission.</li>
                  </ol>
                </div>

                {/* Step 2 */}
                <div className="border border-neutral-800 bg-neutral-950 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs">2</span>
                    Upload Code to GitHub
                  </div>
                  <p className="text-xs text-neutral-400">
                    Push <code>bot.py</code>, <code>database.py</code>, <code>requirements.txt</code>, and <code>render.yaml</code> to a private or public GitHub repository.
                  </p>
                </div>

                {/* Step 3 */}
                <div className="border border-neutral-800 bg-neutral-950 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs">3</span>
                    Deploy as Background Worker on Render
                  </div>
                  <div className="text-xs text-neutral-300 space-y-2">
                    <p>In Render.com dashboard:</p>
                    <ul className="list-disc list-inside space-y-1 pl-2 text-neutral-400">
                      <li>Click <b>New +</b> ➔ <b>Background Worker</b>.</li>
                      <li>Select your GitHub repository.</li>
                      <li><b>Runtime:</b> Python 3</li>
                      <li><b>Build Command:</b> <code>pip install -r requirements.txt</code></li>
                      <li><b>Start Command:</b> <code>python bot.py</code></li>
                    </ul>
                    <div className="p-3 bg-neutral-900 border border-neutral-800 rounded font-mono text-[11px] text-neutral-300 space-y-1">
                      <div>Environment Variables to set in Render:</div>
                      <div className="text-sky-400">TELEGRAM_BOT_TOKEN = "your_botfather_token"</div>
                      <div className="text-sky-400">BOT_USERNAME = "YourBotUsername"</div>
                      <div className="text-sky-400">PUBLIC_CHANNEL_ID = "@dobuyer_feed"</div>
                    </div>
                  </div>
                </div>

                {/* Step 4 */}
                <div className="border border-neutral-800 bg-neutral-950 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs">4</span>
                    Launch & Verify
                  </div>
                  <p className="text-xs text-neutral-300">
                    Render will start the background process, verify WAL mode on SQLite, and begin polling Telegram updates immediately.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="h-12 border-t border-neutral-800 bg-neutral-950 px-6 flex items-center justify-between text-xs text-neutral-500">
        <div>Do-Buyer V1 · Dual-Sided Telegram Marketplace Engine</div>
        <div className="flex items-center gap-4">
          <span>PTB v21+</span>
          <span>SQLite WAL</span>
          <span>Asynchronous Dispatch</span>
        </div>
      </footer>
    </div>
  );
}
