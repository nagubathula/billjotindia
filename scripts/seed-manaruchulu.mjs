// Seed complete, authentic Andhra / Telugu F&B data for Manaruchulu:
// - Outlets (Jubilee Hills & Madhapur, Hyderabad)
// - Kitchen stations & thermal printers
// - 6 categories, 3 customization groups, 26 authentic Andhra products with POS codes
// - Connected Zomato, Swiggy & ONDC channel outlets + payment settings
// - 18 completed orders TODAY + 6 live kitchen queue orders (with KOT tickets)
// - 85 historical orders across the last 30 days with repeat storefront customers
//
// Usage:
//   node --env-file=.env.local scripts/seed-manaruchulu.mjs

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing env. Run: node --env-file=.env.local scripts/seed-manaruchulu.mjs");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const weighted = (pairs) => {
  let r = Math.random() * pairs.reduce((s, [, w]) => s + w, 0);
  for (const [v, w] of pairs) if ((r -= w) <= 0) return v;
  return pairs[0][0];
};

const OPENING_HOURS = {
  mon: [{ open: "11:00", close: "23:00" }],
  tue: [{ open: "11:00", close: "23:00" }],
  wed: [{ open: "11:00", close: "23:00" }],
  thu: [{ open: "11:00", close: "23:00" }],
  fri: [{ open: "11:00", close: "23:30" }],
  sat: [{ open: "11:00", close: "23:30" }],
  sun: [{ open: "11:00", close: "23:30" }],
};

const IMAGE_BY_CODE = {
  // Starters & Vepudu
  GC01: "https://images.unsplash.com/photo-1610057099443-fde8c4d50f91?auto=format&fit=crop&w=800&q=80",
  KV02: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80",
  RV03: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?auto=format&fit=crop&w=800&q=80",
  KP04: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?auto=format&fit=crop&w=800&q=80",
  MB05: "https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80",
  VP06: "https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?auto=format&fit=crop&w=800&q=80",
  // Biryanis & Pulaos
  UB01: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80",
  RP02: "https://images.unsplash.com/photo-1589302168068-964664d93dc0?auto=format&fit=crop&w=800&q=80",
  MB03: "https://images.unsplash.com/photo-1633945274405-b6c8069047b0?auto=format&fit=crop&w=800&q=80",
  MP04: "https://images.unsplash.com/photo-1642821373181-696a54913e93?auto=format&fit=crop&w=800&q=80",
  GP05: "https://images.unsplash.com/photo-1596797038530-2c107229654b?auto=format&fit=crop&w=800&q=80",
  KB06: "https://images.unsplash.com/photo-1512058564366-18510be2db19?auto=format&fit=crop&w=800&q=80",
  // Andhra Curries & Iguru
  GM01: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
  NK02: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?auto=format&fit=crop&w=800&q=80",
  CP03: "https://images.unsplash.com/photo-1544025162-d76694265947?auto=format&fit=crop&w=800&q=80",
  GV04: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80",
  MP05: "https://images.unsplash.com/photo-1516714435131-44d6b64dc6a2?auto=format&fit=crop&w=800&q=80",
  // Thalis & Bhojanam
  VB01: "https://images.unsplash.com/photo-1546833998-877b37c2e5c6?auto=format&fit=crop&w=800&q=80",
  NT02: "https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80",
  // Tiffins & Breads
  PE01: "https://images.unsplash.com/photo-1630383249896-424e482df921?auto=format&fit=crop&w=800&q=80",
  RS02: "https://images.unsplash.com/photo-1505253758473-96b7015fcd40?auto=format&fit=crop&w=800&q=80",
  GA03: "https://images.unsplash.com/photo-1589301760014-d929f3979dbc?auto=format&fit=crop&w=800&q=80",
  // Desserts & Beverages
  QM01: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?auto=format&fit=crop&w=800&q=80",
  JU02: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=800&q=80",
  KP07: "https://images.unsplash.com/photo-1571212515416-fef01fc43637?auto=format&fit=crop&w=800&q=80",
  SM04: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&w=800&q=80",
};

const CAFE_IMAGE_BY_NAME = {
  Espresso: "https://images.unsplash.com/photo-1510591509098-f4fdc6d0ff04?auto=format&fit=crop&w=800&q=80",
  Cappuccino: "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=800&q=80",
  "Caffè Latte": "https://images.unsplash.com/photo-1561882468-9110e03e0f78?auto=format&fit=crop&w=800&q=80",
  "Cold Brew": "https://images.unsplash.com/photo-1517701604599-bb29b565090c?auto=format&fit=crop&w=800&q=80",
  "Filter Kaapi": "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80",
  "Masala Chai": "https://images.unsplash.com/photo-1561336313-0bd5e0b27ec8?auto=format&fit=crop&w=800&q=80",
  "Iced Lemon Tea": "https://images.unsplash.com/photo-1556679343-c7306c1976bc?auto=format&fit=crop&w=800&q=80",
  "Mango Lassi": "https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?auto=format&fit=crop&w=800&q=80",
  "Avocado Toast": "https://images.unsplash.com/photo-1541519227354-08fa5d50c44d?auto=format&fit=crop&w=800&q=80",
  "Masala Omelette": "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=800&q=80",
  "Paneer Bhurji Sandwich": "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=800&q=80",
  "Margherita Pizza": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=800&q=80",
  "Farmhouse Pizza": "https://images.unsplash.com/photo-1513104890138-7c749659a591?auto=format&fit=crop&w=800&q=80",
  "Paneer Tikka Pizza": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?auto=format&fit=crop&w=800&q=80",
  "Pepperoni Pizza": "https://images.unsplash.com/photo-1628840042765-356cda07504e?auto=format&fit=crop&w=800&q=80",
  "Chocolate Truffle Slice": "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=800&q=80",
  "Red Velvet Slice": "https://images.unsplash.com/photo-1586788680434-30d324b2d46f?auto=format&fit=crop&w=800&q=80",
  "New York Cheesecake": "https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=800&q=80",
};

const CATEGORIES = [
  { name: "Starters & Vepudu", emoji: null },
  { name: "Biryanis & Pulaos", emoji: null },
  { name: "Andhra Curries & Iguru", emoji: null },
  { name: "Thalis & Bhojanam", emoji: null },
  { name: "Tiffins & Breads", emoji: null },
  { name: "Desserts & Beverages", emoji: null },
];

const CUSTOMIZATION_GROUPS = [
  {
    display_name: "Spice Level",
    selection_type: "single",
    is_required: true,
    options: [
      { name: "Medium Andhra Spice", price: 0 },
      { name: "Authentic Guntur Fiery", price: 0 },
      { name: "Mild / Less Spicy", price: 0 },
    ],
  },
  {
    display_name: "Portion Size",
    selection_type: "single",
    is_required: true,
    options: [
      { name: "Regular (Serves 1-2)", price: 0 },
      { name: "Family Pack (Serves 3-4)", price: 380 },
    ],
  },
  {
    display_name: "Biryani Accompaniments",
    selection_type: "multi",
    is_required: false,
    options: [
      { name: "Extra Boiled Egg", price: 25 },
      { name: "Ulavacharu Cup", price: 60 },
      { name: "Gongura Pachadi", price: 45 },
      { name: "Double Masala", price: 40 },
      { name: "Extra Mirchi Ka Salan & Raitha", price: 35 },
    ],
  },
];

const PRODUCTS = [
  // Starters & Vepudu
  {
    code: "GC01",
    name: "Guntur Chicken Vepudu",
    category: "Starters & Vepudu",
    price: 310,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Crispy pan-roasted chicken tossed with fiery Guntur dry red chillies, garlic, and curry leaves.",
    station: "Tandoor & Starters",
    groups: ["Spice Level"],
  },
  {
    code: "KV02",
    name: "Kodi Vepudu (Country Chicken Fry)",
    category: "Starters & Vepudu",
    price: 340,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Traditional Godavari-style bone-in chicken fry with freshly pounded pepper and coriander.",
    station: "Tandoor & Starters",
    groups: ["Spice Level"],
  },
  {
    code: "RV03",
    name: "Bhimavaram Royyala Vepudu",
    category: "Starters & Vepudu",
    price: 390,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Coastal tiger prawns slow-roasted in caramelized onion, ginger-garlic, and coastal podi.",
    station: "Tandoor & Starters",
    groups: ["Spice Level"],
  },
  {
    code: "KP04",
    name: "Karivepaku Paneer Vepudu",
    category: "Starters & Vepudu",
    price: 260,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Soft cottage cheese cubes tossed in aromatic fresh curry leaf karam and cashews.",
    station: "Tandoor & Starters",
    groups: ["Spice Level"],
  },
  {
    code: "MB05",
    name: "Stuffed Mirchi Bajji (4 Pcs)",
    category: "Starters & Vepudu",
    price: 160,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Street-style green chilli fritters stuffed with tangy ajwain-tamarind mix, topped with onions & peanuts.",
    station: "Tiffins & Beverages",
  },
  {
    code: "VP06",
    name: "VijayawadaChitti Punugulu",
    category: "Starters & Vepudu",
    price: 140,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Golden crispy fermented dosa-batter dumplings served with peanut & red ginger-chilli chutney.",
    station: "Tiffins & Beverages",
  },

  // Biryanis & Pulaos
  {
    code: "UB01",
    name: "Ulavacharu Chicken Dum Biryani",
    category: "Biryanis & Pulaos",
    price: 360,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Signature long-grain basmati biryani layered with horsegram reduction and succulent chicken.",
    station: "Biryani & Handi",
    groups: ["Spice Level", "Portion Size", "Biryani Accompaniments"],
  },
  {
    code: "RP02",
    name: "Konaseema Raju Gari Kodi Pulao",
    category: "Biryanis & Pulaos",
    price: 350,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Chitti Muthyalu short-grain rice cooked in spicy green chilli & coriander chicken stock.",
    station: "Biryani & Handi",
    groups: ["Spice Level", "Portion Size", "Biryani Accompaniments"],
  },
  {
    code: "MB03",
    name: "Gongura Mutton Dum Biryani",
    category: "Biryanis & Pulaos",
    price: 440,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Tender goat meat braised in tangy red sorrel leaves (gongura) and dum-cooked with saffron rice.",
    station: "Biryani & Handi",
    groups: ["Spice Level", "Portion Size", "Biryani Accompaniments"],
  },
  {
    code: "MP04",
    name: "Bhimavaram Mixed Non-Veg Pulao",
    category: "Biryanis & Pulaos",
    price: 460,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Royal coastal pulao loaded with chicken, mutton, prawns, and fried boiled egg.",
    station: "Biryani & Handi",
    groups: ["Spice Level", "Portion Size", "Biryani Accompaniments"],
  },
  {
    code: "GP05",
    name: "Gutti Vankaya Pulao",
    category: "Biryanis & Pulaos",
    price: 290,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Baby brinjals stuffed with roasted peanut-sesame masala, steamed with aromatic pulao rice.",
    station: "Biryani & Handi",
    groups: ["Spice Level", "Portion Size", "Biryani Accompaniments"],
  },
  {
    code: "KB06",
    name: "Kaju Paneer Ulavacharu Biryani",
    category: "Biryanis & Pulaos",
    price: 310,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Ghee-roasted cashews and marinated paneer layered with rich horsegram-infused biryani rice.",
    station: "Biryani & Handi",
    groups: ["Spice Level", "Portion Size", "Biryani Accompaniments"],
  },

  // Andhra Curries & Iguru
  {
    code: "GM01",
    name: "Gongura Mamsam (Mutton Curry)",
    category: "Andhra Curries & Iguru",
    price: 420,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Slow-simmered bone-in mutton in tangy Andhra sorrel leaf gravy tempered with garlic and dry chillies.",
    station: "Andhra Meals & Curries",
    groups: ["Spice Level"],
  },
  {
    code: "NK02",
    name: "Natu Kodi Pulusu",
    category: "Andhra Curries & Iguru",
    price: 380,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Farm country chicken simmered in a rustic, spicy gravy — pairs best with Ragi Sangati or Garelu.",
    station: "Andhra Meals & Curries",
    groups: ["Spice Level"],
  },
  {
    code: "CP03",
    name: "Nellore Chepala Pulusu",
    category: "Andhra Curries & Iguru",
    price: 360,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Clay-pot style river fish tangy tamarind and fenugreek curry from Nellore.",
    station: "Andhra Meals & Curries",
    groups: ["Spice Level"],
  },
  {
    code: "GV04",
    name: "Gutti Vankaya Kura",
    category: "Andhra Curries & Iguru",
    price: 240,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Heirloom Andhra stuffed brinjal curry in a thick nutty peanut, sesame, and coconut gravy.",
    station: "Andhra Meals & Curries",
    groups: ["Spice Level"],
  },
  {
    code: "MP05",
    name: "Mudda Pappu, Avakaya & Neyyi Rice",
    category: "Andhra Curries & Curries" === "Andhra Curries & Iguru" ? "Andhra Curries & Iguru" : "Andhra Curries & Iguru",
    price: 210,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Soulful steamed sona masoori rice with thick tur dal, house-cured mango pickle, and pure cow ghee.",
    station: "Andhra Meals & Curries",
  },

  // Thalis & Bhojanam
  {
    code: "VB01",
    name: "Special Andhra Veg Bhojanam",
    category: "Thalis & Bhojanam",
    price: 280,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Full banana-leaf meal: Pulihora, Mudda Pappu, Sambar, Rasam, Vepudu, Iguru, Kandi Podi, Avakaya, Curd & Bobbatlu.",
    station: "Andhra Meals & Curries",
  },
  {
    code: "NT02",
    name: "Rajahmundry Non-Veg Bhojanam",
    category: "Thalis & Bhojanam",
    price: 390,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Grand meal with Kodi Vepudu, Gongura Mutton, Natu Kodi Pulusu, Flavoured Rice, White Rice, Rasam, Curd & Sweet.",
    station: "Andhra Meals & Curries",
  },

  // Tiffins & Breads
  {
    code: "PE01",
    name: "MLA Pesarattu with Upma",
    category: "Tiffins & Breads",
    price: 160,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Crisp green moong crepe stuffed with ghee semolina upma, ginger, green chillies, served with Allam Pachadi.",
    station: "Tiffins & Beverages",
  },
  {
    code: "RS02",
    name: "Rayalaseema Ragi Sangati",
    category: "Tiffins & Breads",
    price: 130,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Steamed finger-millet & rice balls drizzled with pure cow ghee.",
    station: "Andhra Meals & Curries",
  },
  {
    code: "GA03",
    name: "Minapa Garelu (3 Pcs) with Kodi Pulusu",
    category: "Tiffins & Breads",
    price: 230,
    gst_rate: 5,
    veg_status: "Non-Veg",
    description: "Crispy black-lentil vadas served with a bowl of spicy Andhra chicken gravy.",
    station: "Tiffins & Beverages",
  },

  // Desserts & Beverages
  {
    code: "QM01",
    name: "Qubani Ka Meetha with Apricot Cream",
    category: "Desserts & Beverages",
    price: 170,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Slow-stewed Hunza apricots topped with chilled malai cream and toasted almond slivers.",
    station: "Tiffins & Beverages",
  },
  {
    code: "JU02",
    name: "Konaseema Bellam Junnu",
    category: "Desserts & Beverages",
    price: 140,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Traditional steamed jaggery custard spiced with black pepper and green cardamom.",
    station: "Tiffins & Beverages",
  },
  {
    code: "KP07",
    name: "Kunda Perugu (Earthen Pot Curd)",
    category: "Desserts & Beverages",
    price: 80,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Thick, creamy artisanal curd set in a terracotta clay pot.",
    station: "Tiffins & Beverages",
  },
  {
    code: "SM04",
    name: "Nannari Sugandha Sharbat / Majjiga",
    category: "Desserts & Beverages",
    price: 90,
    gst_rate: 5,
    veg_status: "Veg",
    description: "Chilled sarsaparilla root cooler or spiced Andhra buttermilk with ginger and cilantro.",
    station: "Tiffins & Beverages",
  },
];

const CUSTOMERS = [
  // First 7 are high-frequency regulars
  { name: "Chaitanya Rao", email: "chaitanya.rao@gmail.com", phone: "+91 98480 22311" },
  { name: "Sravani Reddy", email: "sravani.reddy@gmail.com", phone: "+91 98491 55420" },
  { name: "Vamsi Krishna", email: "vamsi.krishna@outlook.com", phone: "+91 99890 11842" },
  { name: "Harika Chowdary", email: "harika.chowdary@gmail.com", phone: "+91 97012 88390" },
  { name: "Pranav Varma", email: "pranav.varma@gmail.com", phone: "+91 94401 77621" },
  { name: "Lakshmi Narayana", email: "lakshmi.narayana@yahoo.com", phone: "+91 98662 33109" },
  { name: "Keerthi Goud", email: "keerthi.goud@gmail.com", phone: "+91 90001 66452" },
  // Occasional customers
  { name: "Nikhil Naidu", email: "nikhil.naidu@gmail.com", phone: "+91 91770 44210" },
  { name: "Anusha Kamineni", email: "anusha.kamineni@gmail.com", phone: "+91 98850 91234" },
  { name: "Sai Teja", email: "saiteja.hyd@gmail.com", phone: "+91 96182 30911" },
  { name: "Madhavi Latha", email: "madhavi.latha@outlook.com", phone: "+91 94901 22871" },
  { name: "Karthikeya Raju", email: "karthikeya.raju@gmail.com", phone: "+91 99492 81723" },
  { name: "Divya Spandana", email: "divya.spandana@gmail.com", phone: "+91 97045 11298" },
  { name: "Rohit Daggubati", email: "rohit.daggubati@gmail.com", phone: "+91 98482 77310" },
  { name: "Sindhuja Alluri", email: "sindhuja.alluri@yahoo.com", phone: "+91 95501 64321" },
];

const pickCustomer = () => {
  if (Math.random() < 0.65) return CUSTOMERS[rand(0, 6)];
  return CUSTOMERS[rand(7, CUSTOMERS.length - 1)];
};

async function seedManaruchuluRestaurant(restaurant) {
  console.log(`\n══════════════════════════════════════════════════════════════`);
  console.log(`Seeding Manaruchulu (id=${restaurant.id}, slug=${restaurant.slug})`);
  console.log(`══════════════════════════════════════════════════════════════`);

  const rTag = restaurant.id.slice(0, 4).toUpperCase();
  // 1. Ensure Outlets exist (Jubilee Hills flagship + Madhapur branch)
  const outletDefs = [
    {
      slug: `jubilee-hills-${restaurant.id.slice(0, 6)}`,
      name: "Manaruchulu — Jubilee Hills",
      address: "Plot 412, Road No. 36, Jubilee Hills",
      city: "Hyderabad",
      state: "Telangana",
      state_code: "36",
      pincode: "500033",
      phone: "+91 40 2355 8899",
      email: "jubileehills@manaruchulu.in",
      gstin: "36AABCM9281K1Z4",
      fssai_license: "13624011000842",
      timezone: "Asia/Kolkata",
      currency: "INR",
      status: "active",
      opening_hours: OPENING_HOURS,
    },
    {
      slug: `madhapur-${restaurant.id.slice(0, 6)}`,
      name: "Manaruchulu — Madhapur",
      address: "88 Hitech City Main Road, Madhapur",
      city: "Hyderabad",
      state: "Telangana",
      state_code: "36",
      pincode: "500081",
      phone: "+91 40 2311 4455",
      email: "madhapur@manaruchulu.in",
      gstin: "36AABCM9281K2Z3",
      fssai_license: "13624011000843",
      timezone: "Asia/Kolkata",
      currency: "INR",
      status: "active",
      opening_hours: OPENING_HOURS,
    },
  ];

  const { data: existingOutlets } = await admin
    .from("outlets")
    .select("*")
    .eq("restaurant_id", restaurant.id)
    .order("created_at");

  const outlets = [];
  for (let i = 0; i < outletDefs.length; i++) {
    const def = outletDefs[i];
    const match =
      (existingOutlets ?? []).find((o) => o.slug === def.slug) ??
      (i === 0 && existingOutlets?.[0] ? existingOutlets[0] : null);

    if (match) {
      const { data: updated, error } = await admin
        .from("outlets")
        .update({ ...def, slug: match.slug })
        .eq("id", match.id)
        .select("*")
        .single();
      if (error) console.error("Outlet update error:", error.message);
      else outlets.push(updated);
    } else {
      const { data: inserted, error } = await admin
        .from("outlets")
        .insert({ ...def, restaurant_id: restaurant.id })
        .select("*")
        .single();
      if (error) console.error("Outlet insert error:", error.message);
      else outlets.push(inserted);
    }
  }
  console.log(`✓ ${outlets.length} outlets ready: ${outlets.map((o) => o.name).join(", ")}`);

  const primaryOutlet = outlets[0];

  // 2. Seed Menu, Stations, Channels, and Orders on the Primary Outlet (and menu on secondary)
  for (let idx = 0; idx < outlets.length; idx++) {
    const outlet = outlets[idx];
    const isPrimary = idx === 0;

    // Clean existing menu & orders on this outlet so re-runs are clean
    const { data: oldKots } = await admin.from("kot_tickets").select("id").eq("outlet_id", outlet.id);
    if (oldKots?.length) {
      await admin.from("kot_ticket_items").delete().in("kot_ticket_id", oldKots.map((k) => k.id));
    }
    await admin.from("kot_tickets").delete().eq("outlet_id", outlet.id);

    const { data: oldOrders } = await admin.from("orders").select("id").eq("outlet_id", outlet.id);
    if (oldOrders?.length) {
      await admin.from("order_items").delete().in("order_id", oldOrders.map((o) => o.id));
      await admin.from("orders").delete().eq("outlet_id", outlet.id);
    }

    const { data: oldProds } = await admin.from("products").select("id").eq("outlet_id", outlet.id);
    if (oldProds?.length) {
      await admin.from("product_customizations").delete().in("product_id", oldProds.map((p) => p.id));
      await admin.from("channel_item_mappings").delete().eq("outlet_id", outlet.id);
      await admin.from("products").delete().eq("outlet_id", outlet.id);
    }

    const { data: oldGroups } = await admin.from("customization_groups").select("id").eq("outlet_id", outlet.id);
    if (oldGroups?.length) {
      await admin.from("customization_options").delete().in("group_id", oldGroups.map((g) => g.id));
      await admin.from("customization_groups").delete().eq("outlet_id", outlet.id);
    }

    await admin.from("categories").delete().eq("outlet_id", outlet.id);
    await admin.from("kitchen_stations").delete().eq("outlet_id", outlet.id);
    await admin.from("printers").delete().eq("outlet_id", outlet.id);
    await admin.from("channel_outlets").delete().eq("outlet_id", outlet.id);
    await admin.from("payment_settings").delete().eq("outlet_id", outlet.id);

    // 2a. Printers & Kitchen Stations
    const { data: printers } = await admin
      .from("printers")
      .insert([
        {
          outlet_id: outlet.id,
          name: "Counter Receipt Printer",
          purpose: "receipt",
          interface: "network",
          address: "192.168.1.201:9100",
          paper_width: 80,
          status: "active",
        },
        {
          outlet_id: outlet.id,
          name: "Main Kitchen Pass Printer",
          purpose: "kot",
          interface: "network",
          address: "192.168.1.202:9100",
          paper_width: 80,
          status: "active",
        },
      ])
      .select("*");

    const kotPrinterId = printers?.[1]?.id ?? null;

    const stationNames = [
      "Biryani & Handi",
      "Tandoor & Starters",
      "Andhra Meals & Curries",
      "Tiffins & Beverages",
    ];
    const { data: stations } = await admin
      .from("kitchen_stations")
      .insert(
        stationNames.map((name, i) => ({
          outlet_id: outlet.id,
          name,
          printer_id: kotPrinterId,
          sort_order: (i + 1) * 10,
          status: "active",
        })),
      )
      .select("*");

    const stationByName = new Map((stations ?? []).map((s) => [s.name, s.id]));

    // 2b. Categories
    await admin.from("categories").insert(
      CATEGORIES.map((c, i) => ({
        outlet_id: outlet.id,
        name: c.name,
        emoji: c.emoji,
        sort_order: (i + 1) * 10,
        status: "active",
      })),
    );

    // 2c. Customization Groups & Options
    const groupIdByName = new Map();
    const optionsByGroup = new Map();
    for (let i = 0; i < CUSTOMIZATION_GROUPS.length; i++) {
      const g = CUSTOMIZATION_GROUPS[i];
      const { data: grp } = await admin
        .from("customization_groups")
        .insert({
          outlet_id: outlet.id,
          display_name: g.display_name,
          name: slugify(g.display_name),
          selection_type: g.selection_type,
          is_required: g.is_required,
          sort_order: (i + 1) * 10,
          status: "active",
        })
        .select("*")
        .single();
      if (!grp) continue;
      groupIdByName.set(g.display_name, grp.id);

      const { data: opts } = await admin
        .from("customization_options")
        .insert(
          g.options.map((o, oi) => ({
            group_id: grp.id,
            name: o.name,
            price: o.price,
            sort_order: (oi + 1) * 10,
            status: "active",
          })),
        )
        .select("*");
      optionsByGroup.set(g.display_name, { group: grp, options: opts ?? [] });
    }

    // 2d. Products (25 active, 1 sold-out to show realistic catalog health)
    const insertedProducts = [];
    for (let i = 0; i < PRODUCTS.length; i++) {
      const p = PRODUCTS[i];
      const groups = p.groups ?? [];
      const isSoldOut = p.code === "JU02"; // Mark Junnu as sold out / limited
      const { data: prod, error } = await admin
        .from("products")
        .insert({
          outlet_id: outlet.id,
          code: p.code,
          sku: `MN-${p.code}`,
          hsn_code: "996331",
          name: p.name,
          description: p.description,
          category: p.category,
          price: p.price,
          gst_rate: p.gst_rate,
          veg_status: p.veg_status,
          image_url: IMAGE_BY_CODE[p.code] ?? null,
          station_id: stationByName.get(p.station) ?? null,
          status: isSoldOut ? "inactive" : "active",
          has_toppings: false,
          has_addons: groups.length > 0,
          is_kot_required: true,
        })
        .select("*")
        .single();
      if (error || !prod) {
        console.error("Product insert error:", error?.message);
        continue;
      }
      insertedProducts.push(prod);

      const links = groups
        .map((gn, gi) => ({
          product_id: prod.id,
          group_id: groupIdByName.get(gn),
          sort_order: (gi + 1) * 10,
        }))
        .filter((l) => l.group_id);
      if (links.length) {
        await admin.from("product_customizations").insert(links);
      }
    }

    // 2e. Delivery Channels & Payment Settings
    const nowIso = new Date().toISOString();
    await admin.from("channel_outlets").insert([
      {
        outlet_id: outlet.id,
        channel: "zomato",
        external_store_id: `ZOM-HYD-${isPrimary ? "8821" : "8822"}`,
        is_online: true,
        prep_time_minutes: 22,
        last_synced_at: nowIso,
      },
      {
        outlet_id: outlet.id,
        channel: "swiggy",
        external_store_id: `SWG-HYD-${isPrimary ? "4419" : "4420"}`,
        is_online: true,
        prep_time_minutes: 20,
        last_synced_at: nowIso,
      },
      {
        outlet_id: outlet.id,
        channel: "ondc",
        external_store_id: `ONDC-HYD-${isPrimary ? "102" : "103"}`,
        is_online: true,
        prep_time_minutes: 25,
        last_synced_at: nowIso,
      },
    ]);

    await admin.from("payment_settings").insert({
      outlet_id: outlet.id,
      shop_open: true,
      online_enabled: true,
      cod_enabled: true,
      sms_enabled: true,
      show_banners: true,
    });

    // 2f. Floor Plan Tables (pos_tabs)
    await admin.from("pos_tabs").delete().eq("outlet_id", outlet.id);
    const byCode = new Map(insertedProducts.map((p) => [p.code, p]));
    const makeTabLine = (code, qty, note) => {
      const p = byCode.get(code) ?? insertedProducts[0];
      if (!p) return null;
      return {
        configKey: `p${p.id}`,
        product: p,
        qty,
        selectedOptions: [],
        unitPrice: Number(p.price),
        instructions: note || undefined,
      };
    };
    const floorTables = [];
    // Ground Main Hall: 30 tables x 4 seats = 120 seats
    for (let i = 1; i <= 30; i++) {
      floorTables.push(`T-${String(i).padStart(2, "0")} · Ground Main Hall · 4p`);
    }
    // 1st Floor Family AC: 20 tables x 4 seats = 80 seats
    for (let i = 1; i <= 20; i++) {
      floorTables.push(`AC-${String(i).padStart(2, "0")} · 1st Floor Family AC · 4p`);
    }
    // Group & Bhojanam Hall: 10 tables x 6 seats = 60 seats
    for (let i = 1; i <= 10; i++) {
      floorTables.push(`GH-${String(i).padStart(2, "0")} · Group & Bhojanam Hall · 6p`);
    }
    // Banquet & VIP Cabins: 5 tables x 8 seats = 40 seats
    for (let i = 1; i <= 5; i++) {
      floorTables.push(`VIP-${String(i).padStart(2, "0")} · Banquet & VIP Cabins · 8p`);
    }
    // Total: 65 tables = 300 seating capacity
    await admin.from("pos_tabs").insert(
      floorTables.map((name) => {
        let lines = [];
        if (name.startsWith("T-01 ")) {
          lines = [makeTabLine("PE01", 2, "Extra crispy"), makeTabLine("SM04", 2)].filter(Boolean);
        } else if (name.startsWith("T-04 ")) {
          lines = [makeTabLine("VB01", 3), makeTabLine("GC01", 2)].filter(Boolean);
        } else if (name.startsWith("AC-01 ")) {
          lines = [makeTabLine("UB01", 2, "Medium Andhra spice"), makeTabLine("GC01", 1), makeTabLine("QM01", 2)].filter(Boolean);
        } else if (name.startsWith("GH-01 ")) {
          lines = [makeTabLine("VB01", 6, "Group Bhojanam table"), makeTabLine("PR05", 2)].filter(Boolean);
        } else if (name.startsWith("VIP-01 ")) {
          lines = [makeTabLine("MP04", 2), makeTabLine("RV03", 2), makeTabLine("GM01", 1), makeTabLine("RS02", 3)].filter(Boolean);
        }
        return { outlet_id: outlet.id, name, lines };
      }),
    );

    const activeProducts = insertedProducts.filter((p) => p.status === "active");
    // Weight signature items higher so "Top sellers today" highlights iconic dishes
    const heroProducts = activeProducts.filter((p) =>
      ["UB01", "GC01", "RP02", "MB03", "VB01", "PE01", "GV04", "QM01"].includes(p.code),
    );
    const pickProduct = () => (Math.random() < 0.65 && heroProducts.length ? pick(heroProducts) : pick(activeProducts));

    // Helper to build an order + lines
    const buildOrderRecord = ({
      placedAt,
      source,
      status,
      orderType,
      tokenNumber,
      dailyOrderNumber,
      seq,
      instructions,
    }) => {
      const lineCount = rand(2, 4);
      const chosen = new Set();
      const lines = [];
      let total = 0;
      let gst = 0;

      for (let k = 0; k < lineCount; k++) {
        let p = pickProduct();
        let tries = 0;
        while (chosen.has(p.id) && tries++ < 5) p = pickProduct();
        chosen.add(p.id);

        const qty = p.code === "UB01" || p.code === "GC01" ? rand(1, 3) : rand(1, 2);
        const unitPrice = Number(p.price);
        const lineTotal = unitPrice * qty;
        total += lineTotal;
        gst += lineTotal - lineTotal / 1.05;

        const selectedOptions = [];
        if (p.category === "Biryanis & Pulaos" || p.category === "Starters & Vepudu") {
          const spiceGrp = optionsByGroup.get("Spice Level");
          if (spiceGrp && spiceGrp.options.length) {
            const opt = pick(spiceGrp.options);
            selectedOptions.push({
              group_id: spiceGrp.group.id,
              group_name: spiceGrp.group.display_name,
              option_id: opt.id,
              option_name: opt.name,
              price: Number(opt.price),
            });
          }
        }

        const itemNotesPool = [
          null,
          null,
          null,
          "Extra spicy Guntur style",
          "Serve hot with extra onions & lemon",
          "Less oil please",
          "Pack salan and raitha separately",
        ];

        lines.push({
          quantity: qty,
          unit_price: unitPrice,
          total_price: lineTotal,
          instructions: pick(itemNotesPool),
          product_config: {
            product_id: p.id,
            name: p.name,
            base_price: unitPrice,
            gst_rate: 5,
            hsn_code: "996331",
            selected_options: selectedOptions,
          },
          _station_id: p.station_id,
        });
      }

      const isAggregator = source === "zomato" || source === "swiggy" || source === "ondc";
      const packing = orderType === "takeaway" || orderType === "delivery" ? 20 : 0;
      const grandTotal = total + packing;
      const subtotal = Number((total - gst).toFixed(2));
      const halfGst = isAggregator ? 0 : Number((gst / 2).toFixed(2));

      let customerName = "Walk-in";
      let customerEmail = "pos+cash@billjot.local";
      let customerPhone = null;

      if (source === "pos") {
        const tender = weighted([
          ["upi", 55],
          ["cash", 30],
          ["card", 15],
        ]);
        customerEmail = `pos+${tender}@billjot.local`;
        customerName = orderType === "dine-in" ? `Table ${rand(1, 14)}` : pick(["Walk-in", "Counter Guest", "Venkat R.", "Srinivas K."]);
      } else if (source === "web" || source === "kiosk") {
        const cust = pickCustomer();
        customerName = cust.name;
        customerEmail = cust.email;
        customerPhone = cust.phone;
      } else {
        const cust = pickCustomer();
        customerName = cust.name;
        customerEmail = `guest+${source}@billjot.local`;
        customerPhone = cust.phone;
      }

      const uid = `MN-${rTag}-${isPrimary ? "JH" : "MD"}-${String(seq).padStart(4, "0")}`;

      return {
        order: {
          outlet_id: outlet.id,
          unique_order_id: uid,
          source,
          status,
          order_type: orderType,
          customer_name: customerName,
          customer_email: customerEmail,
          customer_phone: customerPhone,
          token_number: tokenNumber,
          daily_order_number: dailyOrderNumber,
          subtotal,
          cgst_amount: halfGst,
          sgst_amount: halfGst,
          igst_amount: 0,
          takeaway_charges: packing,
          discount_amount: 0,
          rounding_amount: 0,
          total_amount: Number(grandTotal.toFixed(2)),
          gst_paid_by_operator: isAggregator,
          commission_amount: isAggregator ? Number((grandTotal * 0.22).toFixed(2)) : 0,
          net_payout: isAggregator ? Number((grandTotal * 0.78).toFixed(2)) : Number(grandTotal.toFixed(2)),
          instructions: instructions ?? null,
          placed_at: placedAt,
          created_at: placedAt,
          updated_at: placedAt,
        },
        lines,
      };
    };

    const allOrdersToInsert = [];
    const linesByUid = new Map();
    let seq = 1000;

    // 3a. Historical Orders (Days 1..28 ago)
    const histCount = isPrimary ? 78 : 36;
    for (let i = 0; i < histCount; i++) {
      const daysAgo = rand(1, 28);
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      // Peak lunch (12-15) and dinner (19-22) weighting
      const hour = Math.random() < 0.48 ? rand(12, 15) : Math.random() < 0.85 ? rand(19, 22) : rand(9, 18);
      d.setHours(hour, rand(0, 59), rand(0, 59), 0);

      const source = weighted([
        ["pos", 48],
        ["web", 24],
        ["zomato", 16],
        ["swiggy", 12],
      ]);
      const status = weighted([
        ["completed", 94],
        ["cancelled", 6],
      ]);
      const orderType =
        source === "zomato" || source === "swiggy"
          ? "delivery"
          : weighted([
              ["dine-in", 55],
              ["takeaway", 30],
              ["delivery", 15],
            ]);

      const built = buildOrderRecord({
        placedAt: d.toISOString(),
        source,
        status,
        orderType,
        tokenNumber: rand(10, 99),
        dailyOrderNumber: (i % 35) + 1,
        seq: ++seq,
        instructions: null,
      });
      allOrdersToInsert.push(built.order);
      linesByUid.set(built.order.unique_order_id, built.lines);
    }

    // 3b. Today's Completed Orders (spread across hours today so Overview & Hourly Pace chart shine!)
    const now = new Date();
    const todayCompletedCount = isPrimary ? 22 : 10;
    const todayHours = [9, 10, 11, 12, 12, 13, 13, 13, 14, 14, 15, 16, 17, 18, 19, 19, 20, 20, 20, 21, 21, 22];

    for (let i = 0; i < todayCompletedCount; i++) {
      const d = new Date(now);
      const h = todayHours[i % todayHours.length];
      d.setHours(h, rand(2, 55), rand(0, 59), 0);
      // Ensure placed_at is within today's IST window
      const source = weighted([
        ["pos", 50],
        ["web", 25],
        ["zomato", 15],
        ["swiggy", 10],
      ]);
      const orderType =
        source === "zomato" || source === "swiggy"
          ? "delivery"
          : weighted([
              ["dine-in", 60],
              ["takeaway", 25],
              ["delivery", 15],
            ]);

      const built = buildOrderRecord({
        placedAt: d.toISOString(),
        source,
        status: "completed",
        orderType,
        tokenNumber: 100 + i + 1,
        dailyOrderNumber: i + 1,
        seq: ++seq,
        instructions: null,
      });
      allOrdersToInsert.push(built.order);
      linesByUid.set(built.order.unique_order_id, built.lines);
    }

    // 3c. Active Live Queue Orders (New / Accepted / Preparing / Ready) right now!
    const liveSpecs = isPrimary
      ? [
          { minsAgo: 2, status: "pending", source: "web", orderType: "delivery", token: 125, note: "Ring bell once, send extra Gongura pickle" },
          { minsAgo: 4, status: "pending", source: "zomato", orderType: "delivery", token: 126, note: "Zomato Gold order — pack cutlery" },
          { minsAgo: 7, status: "confirmed", source: "pos", orderType: "dine-in", token: 123, note: "Table 06 — serve starters first" },
          { minsAgo: 11, status: "preparing", source: "pos", orderType: "dine-in", token: 121, note: "Table 03 — authentic Guntur spice" },
          { minsAgo: 14, status: "preparing", source: "swiggy", orderType: "delivery", token: 122, note: "Rider arriving in 4 mins" },
          { minsAgo: 18, status: "ready", source: "pos", orderType: "takeaway", token: 120, note: "Counter pickup — double bag gravy" },
        ]
      : [
          { minsAgo: 5, status: "preparing", source: "pos", orderType: "dine-in", token: 204, note: "Table 02" },
          { minsAgo: 9, status: "ready", source: "zomato", orderType: "delivery", token: 203, note: "Ready at pass" },
        ];

    for (let i = 0; i < liveSpecs.length; i++) {
      const spec = liveSpecs[i];
      const d = new Date(Date.now() - spec.minsAgo * 60 * 1000);
      const built = buildOrderRecord({
        placedAt: d.toISOString(),
        source: spec.source,
        status: spec.status,
        orderType: spec.orderType,
        tokenNumber: spec.token,
        dailyOrderNumber: todayCompletedCount + i + 1,
        seq: ++seq,
        instructions: spec.note,
      });
      allOrdersToInsert.push(built.order);
      linesByUid.set(built.order.unique_order_id, built.lines);
    }

    // Insert all orders
    const { data: insertedOrders, error: ordErr } = await admin
      .from("orders")
      .insert(allOrdersToInsert)
      .select("id, unique_order_id, status, placed_at, token_number, instructions");

    if (ordErr || !insertedOrders) {
      console.error("Failed inserting orders:", ordErr?.message);
      continue;
    }

    // Insert order_items
    const orderItemsPayload = [];
    const stationMetaByOrderId = new Map();

    for (const ord of insertedOrders) {
      const rawLines = linesByUid.get(ord.unique_order_id) ?? [];
      stationMetaByOrderId.set(ord.id, rawLines.map((l) => l._station_id));
      for (const l of rawLines) {
        const { _station_id, ...cleanLine } = l;
        orderItemsPayload.push({
          order_id: ord.id,
          ...cleanLine,
        });
      }
    }

    const insertedOrderItemsByOrder = new Map();
    for (let i = 0; i < orderItemsPayload.length; i += 200) {
      const chunk = orderItemsPayload.slice(i, i + 200);
      const { data: insItems, error: itErr } = await admin
        .from("order_items")
        .insert(chunk)
        .select("*");
      if (itErr) console.error("Failed inserting order_items:", itErr.message);
      for (const it of insItems ?? []) {
        const list = insertedOrderItemsByOrder.get(it.order_id) ?? [];
        list.push(it);
        insertedOrderItemsByOrder.set(it.order_id, list);
      }
    }

    // 3d. Create KOT Tickets for the active live orders so Kitchen (KDS) is live!
    const liveOrders = insertedOrders.filter((o) =>
      ["pending", "confirmed", "preparing", "ready"].includes(o.status ?? ""),
    );
    let ticketNum = 500;
    for (const lo of liveOrders) {
      const ordItems = insertedOrderItemsByOrder.get(lo.id) ?? [];
      if (!ordItems.length) continue;

      const kotStatus =
        lo.status === "ready"
          ? "ready"
          : lo.status === "preparing" || lo.status === "confirmed"
            ? "acknowledged"
            : "printed";

      const { data: ticket } = await admin
        .from("kot_tickets")
        .insert({
          outlet_id: outlet.id,
          order_id: lo.id,
          station_id: stations?.[0]?.id ?? null,
          printer_id: kotPrinterId,
          ticket_number: ++ticketNum,
          status: kotStatus,
          notes: lo.instructions,
          created_at: lo.placed_at,
          updated_at: lo.placed_at,
          printed_at: lo.placed_at,
          acknowledged_at: kotStatus === "acknowledged" || kotStatus === "ready" ? lo.placed_at : null,
          ready_at: kotStatus === "ready" ? new Date().toISOString() : null,
        })
        .select("*")
        .single();

      if (ticket) {
        await admin.from("kot_ticket_items").insert(
          ordItems.map((oi) => ({
            kot_ticket_id: ticket.id,
            order_item_id: oi.id,
            quantity: oi.quantity,
            notes: oi.instructions,
          })),
        );
      }
    }

    console.log(
      `✓ [${outlet.name}] Seeded ${insertedProducts.length} Andhra items, ${insertedOrders.length} orders (${todayCompletedCount} completed today + ${liveOrders.length} live queue tickets)`,
    );
  }
}

async function main() {
  const ashaId = "061db08b-34f2-480b-a697-6d138d9b5169";
  const satyaId = "f993a3b4-1476-4e71-ac33-d8886d89f949";
  const userIds = [ashaId, satyaId];

  // 1. Ensure single Manaruchulu Brand owned by Asha
  const brandId = "f2404562-b293-4c05-b409-09d6cddbfdaa";
  await admin.from("brands").upsert({
    id: brandId,
    slug: "0a15cdea-22c4-435f-be49-f31e4e60ac03",
    name: "Manaruchulu Brand",
    owner_user_id: ashaId,
    status: "active",
  });

  // 2. Ensure 2 restaurants under Manaruchulu Brand
  const brandRestaurants = [
    {
      id: "bb58b414-7b26-4d41-a2c0-98b270630797",
      slug: "487a0c64-30ac-4251-93f2-05726c5f1c9b",
      name: "Manaruchulu — Jubilee Hills",
      brand_id: brandId,
      owner_user_id: ashaId,
      status: "active",
    },
    {
      id: "2cdf7be1-58fe-41f5-8d80-920722c53f76",
      slug: "769c19c8-f39c-4cd9-b380-92e329216ef1",
      name: "Manaruchulu — Banjara Hills",
      brand_id: brandId,
      owner_user_id: ashaId,
      status: "active",
    },
  ];

  for (const r of brandRestaurants) {
    await admin.from("restaurants").upsert(r);
    for (const uid of userIds) {
      await admin
        .from("user_roles")
        .upsert(
          { user_id: uid, restaurant_id: r.id, role: "admin" },
          { onConflict: "user_id,restaurant_id,role" },
        );
    }
    await seedManaruchuluRestaurant(r);
  }

  // 3. Ensure 1 individual cafe (Billjot Demo Cafe, brand_id = null)
  const cafeId = "a506095e-8ffb-417b-b28c-7cc252dc8f18";
  await admin
    .from("restaurants")
    .update({ brand_id: null, owner_user_id: ashaId, status: "active" })
    .eq("id", cafeId);

  for (const uid of userIds) {
    await admin
      .from("user_roles")
      .upsert(
        { user_id: uid, restaurant_id: cafeId, role: "admin" },
        { onConflict: "user_id,restaurant_id,role" },
      );
  }

  // Ensure floor plan tables exist on Billjot Demo Cafe — MG Road
  const { data: cafeOutlets } = await admin.from("outlets").select("id").eq("restaurant_id", cafeId);
  if (cafeOutlets?.[0]?.id) {
    const cafeOutletId = cafeOutlets[0].id;
    const cafeTables = [
      "Table 01", "Table 02", "Table 03", "Table 04",
      "Table 05", "Table 06", "Patio-01", "Patio-02",
    ].map((name) => ({
      outlet_id: cafeOutletId,
      name,
      order_type: "dine-in",
      lines: [],
      customer_name: "",
      customer_phone: "",
      notes: "Seats 4 · Cafe Floor",
    }));
    await admin.from("pos_tabs").upsert(cafeTables, { onConflict: "outlet_id,name" });

    for (const [name, imgUrl] of Object.entries(CAFE_IMAGE_BY_NAME)) {
      await admin
        .from("products")
        .update({ image_url: imgUrl })
        .eq("outlet_id", cafeOutletId)
        .eq("name", name);
    }
  }

  console.log("\nSeeding complete: 1 Brand (2 Manaruchulu 300-seat restaurants) + 1 Individual Cafe (Billjot Demo Cafe)!");
}

main();
