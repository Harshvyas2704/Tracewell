import type { Row, TableDef } from "../../engine";

const ADJECTIVES = [
  "Amber", "Arctic", "Bold", "Bright", "Classic", "Compact", "Copper", "Coral", "Crimson",
  "Deluxe", "Ember", "Forest", "Golden", "Indigo", "Ivory", "Jade", "Lunar", "Midnight",
  "Onyx", "Pearl", "Rustic", "Sage", "Silver", "Solar", "Velvet",
];

// Eight nouns per category, in category order.
const CATEGORIES = ["kitchen", "office", "outdoor", "audio", "lighting"];
const NOUNS = [
  "Kettle", "Toaster", "Blender", "Skillet", "Teapot", "Grater", "Whisk", "Mug",
  "Notebook", "Stapler", "Desk Mat", "Pen Set", "Organizer", "Planner", "Monitor Stand", "Bookend",
  "Tent", "Lantern", "Backpack", "Hammock", "Thermos", "Compass", "Camp Stove", "Trail Mat",
  "Headphones", "Speaker", "Turntable", "Microphone", "Earbuds", "Soundbar", "Amplifier", "Radio",
  "Desk Lamp", "Floor Lamp", "Night Light", "Pendant", "Spotlight", "Light Strip", "Sconce", "Candle",
];

// 1,000 products with unique names, built from a formula so the data is the
// same on every load. Product 42 is "Lunar Toaster".
function buildProducts(): Row[] {
  const rows: Row[] = [];
  for (let i = 0; i < ADJECTIVES.length * NOUNS.length; i++) {
    const noun = Math.floor(i / ADJECTIVES.length);
    rows.push({
      id: i + 1,
      name: `${ADJECTIVES[i % ADJECTIVES.length]} ${NOUNS[noun]}`,
      price: 5 + ((i * 37) % 196) + 0.99,
      stock: (i * 13) % 120,
      category: CATEGORIES[Math.floor(noun / 8)] ?? "kitchen",
    });
  }
  return rows;
}

export const world: TableDef[] = [
  {
    name: "products",
    columns: [
      { name: "id", type: "integer", nullable: false },
      { name: "name", type: "text", nullable: false },
      { name: "price", type: "numeric", nullable: false },
      { name: "stock", type: "integer", nullable: false },
      { name: "category", type: "text", nullable: false },
    ],
    primaryKey: "id",
    unique: ["name"],
    rows: buildProducts(),
  },
  {
    name: "users",
    columns: [
      { name: "id", type: "integer", nullable: false },
      { name: "email", type: "text", nullable: false },
      { name: "role", type: "text", nullable: false },
    ],
    primaryKey: "id",
    unique: ["email"],
    rows: [
      { id: 1, email: "admin@example.com", role: "admin" },
      { id: 2, email: "sam@example.com", role: "user" },
      { id: 3, email: "riya@example.com", role: "user" },
    ],
  },
];
