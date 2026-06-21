const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CONVEX_URL = "https://shiny-bass-730.eu-west-1.convex.site";
const STATE_FILE = path.join(__dirname, "convex_state.json");

function compressString(str) {
  const buffer = Buffer.from(str, 'utf-8');
  const compressed = zlib.gzipSync(buffer);
  return compressed.toString('base64');
}

async function run() {
  console.log("Reading convex_state.json...");
  if (!fs.existsSync(STATE_FILE)) {
    console.error("Error: convex_state.json not found!");
    process.exit(1);
  }

  const rawData = fs.readFileSync(STATE_FILE, 'utf-8');
  const state = JSON.parse(rawData);

  console.log(`Loaded ${state.products.length} products and ${state.categories.length} categories.`);

  console.log("Compressing catalog data for Convex database storage...");
  const compressedProducts = {
    __compressed: true,
    data: compressString(JSON.stringify(state.products))
  };

  const compressedCategories = {
    __compressed: true,
    data: compressString(JSON.stringify(state.categories))
  };

  const payload = {
    products: compressedProducts,
    categories: compressedCategories,
    builderOptions: state.builderOptions,
    tableTemplates: state.tableTemplates,
    deletedProductIds: [],
    deletedCategoryIds: []
  };

  console.log(`Sending data payload to new Convex project at ${CONVEX_URL}/api/state ...`);

  try {
    const response = await fetch(`${CONVEX_URL}/api/state`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    const result = await response.json();
    console.log("Migration Successful! Result:", result);
  } catch (err) {
    console.error("Migration Failed:", err.message);
    process.exit(1);
  }
}

run();
