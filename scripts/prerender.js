#!/usr/bin/env node
// Build-time prerender: fetches the live catalog from Convex's public
// GET /api/state endpoint (no auth, same one the browser already calls)
// and generates one static HTML page per product/category, so search
// engines and social-media unfurlers see real content without running
// the SPA's JS. Anything not generated here still renders client-side
// exactly as before -- this is purely additive.
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CONVEX_SITE = 'https://shiny-bass-730.eu-west-1.convex.site';
const SITE_ORIGIN = 'https://www.hydrolux.bg';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

function assertFile(file, label) {
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
    throw new Error(`Prerender aborted: ${label} is missing or empty (${file})`);
  }
}

function assertNonEmptyDir(dir, label) {
  if (!fs.existsSync(dir) || fs.readdirSync(dir).length === 0) {
    throw new Error(`Prerender aborted: ${label} is missing or empty after copy (${dir})`);
  }
}

function decompressField(field) {
  if (field && typeof field === 'object' && field.__compressed) {
    const json = zlib.gunzipSync(Buffer.from(field.data, 'base64')).toString('utf-8');
    return JSON.parse(json);
  }
  return field || [];
}

function resolveImageUrl(img) {
  if (!img) return '';
  if (img.startsWith('http')) return img;
  if (img.startsWith('/api/file')) return CONVEX_SITE + img;
  return `${SITE_ORIGIN}/${img.replace(/^\//, '')}`;
}

async function fetchCatalogState() {
  const res = await fetch(`${CONVEX_SITE}/api/state`);
  if (!res.ok) {
    throw new Error(`Prerender aborted: GET /api/state returned ${res.status}`);
  }
  const { state } = await res.json();
  const products = decompressField(state.products);
  const categories = decompressField(state.categories);
  return { products, categories };
}

// ---- <head> meta/canonical/OG/JSON-LD patching --------------------------

function patchHead(html, { title, description, canonicalPath, ogImage, schemaObj }) {
  const canonicalUrl = canonicalPath ? `${SITE_ORIGIN}/${canonicalPath}` : `${SITE_ORIGIN}/`;
  let out = html;
  out = out.replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(title)}</title>`);
  out = out.replace(
    /(<meta name="description" id="meta-description" content=")[^"]*(")/,
    (_, a, b) => `${a}${escapeHtml(description)}${b}`
  );
  out = out.replace(
    /(<meta property="og:title" id="og-title" content=")[^"]*(")/,
    (_, a, b) => `${a}${escapeHtml(title)}${b}`
  );
  out = out.replace(
    /(<meta property="og:description" id="og-description" content=")[^"]*(")/,
    (_, a, b) => `${a}${escapeHtml(description)}${b}`
  );
  out = out.replace(
    /(<meta property="og:image" id="og-image" content=")[^"]*(")/,
    (_, a, b) => `${a}${escapeHtml(ogImage)}${b}`
  );
  out = out.replace(
    /(<meta property="og:url" id="og-url" content=")[^"]*(")/,
    (_, a, b) => `${a}${escapeHtml(canonicalUrl)}${b}`
  );
  out = out.replace(
    /(<link rel="canonical" id="canonical-link" href=")[^"]*(")/,
    (_, a, b) => `${a}${escapeHtml(canonicalUrl)}${b}`
  );
  out = out.replace(
    /(<script type="application\/ld\+json" id="schema-jsonld">)[\s\S]*?(<\/script>)/,
    (_, a, b) => `${a}${JSON.stringify(schemaObj)}${b}`
  );
  return out;
}

// Makes the given #<viewId> section visible (display:block via .active)
// and hides the default home view, so the raw HTML -- before any JS runs
// -- already shows the right content to crawlers/unfurlers.
function activateView(html, viewId) {
  let out = html.replace(
    'id="home-view" class="spa-view active"',
    'id="home-view" class="spa-view"'
  );
  const re = new RegExp(`id="${viewId}" class="spa-view([^"]*)"`);
  out = out.replace(re, (_, rest) => `id="${viewId}" class="spa-view active${rest}"`);
  return out;
}

// ---- Product page ---------------------------------------------------------

function buildProductSchema(product) {
  const prices = (product.variants || []).map(v => Number(v.priceEur)).filter(p => !isNaN(p));
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    image: (product.images || []).map(resolveImageUrl).filter(Boolean),
    description: product.description || '',
    sku: product.code || product.id
  };
  if (product.brand) {
    schema.brand = { '@type': 'Brand', name: product.brand };
  }
  if (prices.length > 0) {
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const availability = product.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';
    const unitCode = product.unit === 'м' ? 'MTR' : 'C62';
    if (prices.length > 1) {
      schema.offers = {
        '@type': 'AggregateOffer',
        priceCurrency: 'EUR',
        lowPrice: minPrice.toFixed(2),
        highPrice: maxPrice.toFixed(2),
        offerCount: product.variants.length,
        availability
      };
    } else {
      schema.offers = {
        '@type': 'Offer',
        price: minPrice.toFixed(2),
        priceCurrency: 'EUR',
        availability,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: minPrice.toFixed(2),
          priceCurrency: 'EUR',
          referenceQuantity: { '@type': 'QuantitativeValue', value: '1', unitCode }
        }
      };
    }
  }
  return schema;
}

function buildProductHtml(baseHtml, product) {
  const title = `${product.name} - ${product.brand || 'Хидролукс'} | Хидролукс Груп Монтана`;
  const plainDesc = (product.description || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const description = plainDesc.length > 155 ? `${plainDesc.slice(0, 152)}...` : plainDesc;
  const mainImage = resolveImageUrl((product.images || [])[0]) || `${SITE_ORIGIN}/assets/logo.webp`;

  let html = patchHead(baseHtml, {
    title,
    description,
    canonicalPath: `product/${product.id}`,
    ogImage: mainImage,
    schemaObj: buildProductSchema(product)
  });
  html = activateView(html, 'product-detail-view');

  html = html.replace(
    /<h2 id="prod-title">[^<]*<\/h2>/,
    () => `<h2 id="prod-title">${escapeHtml(product.name)}</h2>`
  );
  html = html.replace(
    /(<strong id="prod-sku">)[^<]*(<\/strong>)/,
    (_, a, b) => `${a}${escapeHtml(product.code || '')}${b}`
  );
  html = html.replace(
    /(<span class="text-accent font-bold text-uppercase" id="prod-brand">)[^<]*(<\/span>)/,
    (_, a, b) => `${a}${escapeHtml(product.brand || '')}${b}`
  );

  let descHtml = product.description || '';
  const isHtml = /<p|<div|<br|<li|<span/i.test(descHtml);
  if (!isHtml) {
    descHtml = escapeHtml(descHtml).replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
  }
  html = html.replace(
    /<div id="prod-desc-text" class="text-muted font-small">[\s\S]*?<\/div>/,
    () => `<div id="prod-desc-text" class="text-muted font-small">${descHtml}</div>`
  );
  html = html.replace(
    '<img src="" id="prod-main-image" width="500" height="500" alt="Product Image">',
    () => `<img src="${escapeHtml(mainImage)}" id="prod-main-image" width="500" height="500" alt="${escapeHtml(product.name)}">`
  );

  return html;
}

// ---- Category page ---------------------------------------------------------

function buildCategorySchema(category, products) {
  const items = products
    .filter(p => (p.categories || (p.category ? [p.category] : [])).includes(category.id))
    .slice(0, 50)
    .map((p, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `${SITE_ORIGIN}/product/${p.id}`,
      name: p.name
    }));
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: category.name,
    itemListElement: items
  };
}

function buildCategoryHtml(baseHtml, category, products) {
  const title = `${category.name} | Маркучи, Хидравлика & Пневматика | Хидролукс Груп`;
  const description = `Разгледайте ${category.name} от Хидролукс Груп - производство, доставка и техническа консултация в Монтана и цяла България.`;

  let html = patchHead(baseHtml, {
    title,
    description,
    canonicalPath: `catalog/${category.id}`,
    ogImage: `${SITE_ORIGIN}/assets/logo.webp`,
    schemaObj: buildCategorySchema(category, products)
  });
  html = activateView(html, 'catalog-view');
  return html;
}

// ---- robots.txt / sitemap.xml -----------------------------------------

function buildRobotsTxt() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /checkout',
    'Disallow: /wishlist',
    '',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    ''
  ].join('\n');
}

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildSitemapXml(products, categories) {
  const otherPaths = ['catalog', 'services', 'about', 'contacts', 'builder'];
  const urls = [
    `${SITE_ORIGIN}/`,
    ...otherPaths.map(p => `${SITE_ORIGIN}/${p}`),
    ...categories.filter(c => c && c.id).map(c => `${SITE_ORIGIN}/catalog/${c.id}`),
    ...products.filter(p => p && p.id).map(p => `${SITE_ORIGIN}/product/${p.id}`)
  ];
  const entries = urls.map(u => `  <url><loc>${xmlEscape(u)}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}

// ---- Main -------------------------------------------------------------

async function main() {
  console.log('Prerender: starting build...');

  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copyRecursive(path.join(ROOT, 'index.html'), path.join(DIST, 'index.html'));
  copyRecursive(path.join(ROOT, 'thank-you.html'), path.join(DIST, 'thank-you.html'));
  copyRecursive(path.join(ROOT, 'assets'), path.join(DIST, 'assets'));
  copyRecursive(path.join(ROOT, 'js'), path.join(DIST, 'js'));

  assertFile(path.join(DIST, 'index.html'), 'index.html');
  assertFile(path.join(DIST, 'thank-you.html'), 'thank-you.html');
  assertNonEmptyDir(path.join(DIST, 'assets'), 'assets/');
  assertNonEmptyDir(path.join(DIST, 'js'), 'js/');

  const baseHtml = fs.readFileSync(path.join(DIST, 'index.html'), 'utf-8');

  console.log('Prerender: fetching live catalog from Convex...');
  const { products, categories } = await fetchCatalogState();
  if (!products.length || !categories.length) {
    throw new Error(
      `Prerender aborted: fetched ${products.length} products / ${categories.length} categories -- refusing to build with empty catalog data.`
    );
  }
  console.log(`Prerender: got ${products.length} products, ${categories.length} categories.`);

  let productCount = 0;
  for (const product of products) {
    if (!product || !product.id) continue;
    const html = buildProductHtml(baseHtml, product);
    const outDir = path.join(DIST, 'product', product.id);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    productCount++;
  }
  console.log(`Prerender: generated ${productCount} product pages.`);
  if (productCount === 0) {
    throw new Error('Prerender aborted: generated 0 product pages.');
  }

  let categoryCount = 0;
  for (const category of categories) {
    if (!category || !category.id) continue;
    const html = buildCategoryHtml(baseHtml, category, products);
    const outDir = path.join(DIST, 'catalog', category.id);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), html);
    categoryCount++;
  }
  console.log(`Prerender: generated ${categoryCount} category pages.`);
  if (categoryCount === 0) {
    throw new Error('Prerender aborted: generated 0 category pages.');
  }

  fs.writeFileSync(path.join(DIST, 'robots.txt'), buildRobotsTxt());
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), buildSitemapXml(products, categories));
  console.log('Prerender: wrote robots.txt and sitemap.xml.');

  console.log('Prerender: build complete.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
