const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");
const OpenAI = require("openai");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3210);
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const ARTWORK_DIR = path.join(DATA_DIR, "artwork");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const DB_PATH = path.join(DATA_DIR, "neon-gopher-studio.db");

for (const dir of [DATA_DIR, ARTWORK_DIR, BACKUP_DIR]) fs.mkdirSync(dir, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ng_id TEXT UNIQUE NOT NULL,
    product_title TEXT DEFAULT '',
    primary_collection TEXT DEFAULT '',
    artwork_type TEXT DEFAULT '',
    rooms TEXT DEFAULT '[]',
    colors TEXT DEFAULT '[]',
    moods TEXT DEFAULT '[]',
    styles TEXT DEFAULT '[]',
    subjects TEXT DEFAULT '[]',
    season TEXT DEFAULT '',
    holiday TEXT DEFAULT '',
    gift_recipients TEXT DEFAULT '[]',
    short_description TEXT DEFAULT '',
    long_description TEXT DEFAULT '',
    highlights TEXT DEFAULT '[]',
    seo_title TEXT DEFAULT '',
    meta_description TEXT DEFAULT '',
    url_handle TEXT DEFAULT '',
    image_alt_text TEXT DEFAULT '',
    shopify_tags TEXT DEFAULT '[]',
    confidence INTEGER DEFAULT 0,
    original_filename TEXT DEFAULT '',
    artwork_location TEXT DEFAULT '',
    format TEXT DEFAULT '',
    sell_as TEXT DEFAULT '',
    source_type TEXT DEFAULT '',
    rights_status TEXT DEFAULT '',
    status TEXT DEFAULT 'Draft',
    shopify_product_id TEXT DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

app.use(express.json({ limit: "40mb" }));
app.use(express.static(path.join(ROOT, "public")));
app.use("/artwork", express.static(ARTWORK_DIR));

function cleanJson(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The AI response did not contain valid JSON.");
  return JSON.parse(candidate.slice(start, end + 1));
}

function nextNgId() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'next_ng_number'").get();
  let number = row ? Number(row.value) : 1;
  if (!Number.isFinite(number) || number < 1) number = 1;
  return `NG-${String(number).padStart(6, "0")}`;
}

function reserveNgId() {
  const id = nextNgId();
  const current = Number(id.slice(3));
  db.prepare(`INSERT INTO settings(key,value) VALUES('next_ng_number',?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(current + 1));
  return id;
}

function jsonValue(value) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}

function parseProduct(row) {
  if (!row) return null;
  const fields = ["rooms", "colors", "moods", "styles", "subjects", "gift_recipients", "highlights", "shopify_tags"];
  const out = { ...row };
  for (const field of fields) {
    try { out[field] = JSON.parse(out[field] || "[]"); } catch { out[field] = []; }
  }
  out.artwork_url = out.artwork_location ? `/artwork/${encodeURIComponent(path.basename(out.artwork_location))}` : "";
  return out;
}

function saveImage(dataUrl, ngId, originalFilename) {
  const match = String(dataUrl || "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("The uploaded artwork is not a valid image.");
  const mime = match[1].toLowerCase();
  const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };
  const originalExt = path.extname(originalFilename || "").toLowerCase();
  const ext = extensions[mime] || (originalExt.match(/^\.[a-z0-9]+$/) ? originalExt : ".png");
  const filename = `${ngId}${ext}`;
  const fullPath = path.join(ARTWORK_DIR, filename);
  fs.writeFileSync(fullPath, Buffer.from(match[2], "base64"));
  return fullPath;
}

function upsertProduct(data, meta) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO products (
      ng_id, product_title, primary_collection, artwork_type, rooms, colors, moods, styles, subjects,
      season, holiday, gift_recipients, short_description, long_description, highlights, seo_title,
      meta_description, url_handle, image_alt_text, shopify_tags, confidence, original_filename,
      artwork_location, format, sell_as, source_type, rights_status, status, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(ng_id) DO UPDATE SET
      product_title=excluded.product_title, primary_collection=excluded.primary_collection,
      artwork_type=excluded.artwork_type, rooms=excluded.rooms, colors=excluded.colors,
      moods=excluded.moods, styles=excluded.styles, subjects=excluded.subjects, season=excluded.season,
      holiday=excluded.holiday, gift_recipients=excluded.gift_recipients,
      short_description=excluded.short_description, long_description=excluded.long_description,
      highlights=excluded.highlights, seo_title=excluded.seo_title, meta_description=excluded.meta_description,
      url_handle=excluded.url_handle, image_alt_text=excluded.image_alt_text,
      shopify_tags=excluded.shopify_tags, confidence=excluded.confidence,
      original_filename=excluded.original_filename, artwork_location=excluded.artwork_location,
      format=excluded.format, sell_as=excluded.sell_as, source_type=excluded.source_type,
      rights_status=excluded.rights_status, status=excluded.status, updated_at=excluded.updated_at
  `).run(
    data.ng_id, data.product_title || "", data.primary_collection || "", data.artwork_type || "",
    jsonValue(data.rooms), jsonValue(data.colors), jsonValue(data.moods), jsonValue(data.styles), jsonValue(data.subjects),
    data.season || "", data.holiday || "", jsonValue(data.gift_recipients), data.short_description || "",
    data.long_description || "", jsonValue(data.highlights), data.seo_title || "", data.meta_description || "",
    data.url_handle || "", data.image_alt_text || "", jsonValue(data.shopify_tags), Number(data.confidence || 0),
    meta.originalFilename || "", meta.artworkLocation || "", meta.format || "", meta.sellAs || "",
    meta.sourceType || "", meta.rightsStatus || "", meta.status || "Draft", now, now
  );
  return parseProduct(db.prepare("SELECT * FROM products WHERE ng_id = ?").get(data.ng_id));
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY), model: MODEL, version: "1.3.0" });
});

app.get("/api/next-id", (req, res) => res.json({ ngId: nextNgId() }));

app.get("/api/products", (req, res) => {
  const search = String(req.query.search || "").trim();
  let rows;
  if (search) {
    const term = `%${search}%`;
    rows = db.prepare(`SELECT * FROM products WHERE ng_id LIKE ? OR product_title LIKE ? OR primary_collection LIKE ? OR shopify_tags LIKE ? ORDER BY id DESC LIMIT 250`).all(term, term, term, term);
  } else {
    rows = db.prepare("SELECT * FROM products ORDER BY id DESC LIMIT 250").all();
  }
  res.json({ products: rows.map(parseProduct) });
});

app.get("/api/products/:ngId", (req, res) => {
  const product = parseProduct(db.prepare("SELECT * FROM products WHERE ng_id = ?").get(req.params.ngId));
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json({ product });
});

app.put("/api/products/:ngId", (req, res) => {
  try {
    const existing = parseProduct(db.prepare("SELECT * FROM products WHERE ng_id = ?").get(req.params.ngId));
    if (!existing) return res.status(404).json({ error: "Product not found." });
    const merged = { ...existing, ...req.body, ng_id: req.params.ngId };
    const product = upsertProduct(merged, {
      originalFilename: existing.original_filename,
      artworkLocation: existing.artwork_location,
      format: req.body.format ?? existing.format,
      sellAs: req.body.sell_as ?? existing.sell_as,
      sourceType: req.body.source_type ?? existing.source_type,
      rightsStatus: req.body.rights_status ?? existing.rights_status,
      status: req.body.status ?? existing.status
    });
    res.json({ product });
  } catch (error) {
    res.status(500).json({ error: error.message || "Save failed." });
  }
});

app.post("/api/products", (req, res) => {
  try {
    const ngId = reserveNgId();
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO products (ng_id, status, created_at, updated_at)
      VALUES (?, 'Draft', ?, ?)
    `).run(ngId, now, now);
    const product = parseProduct(db.prepare("SELECT * FROM products WHERE ng_id = ?").get(ngId));
    res.status(201).json({ product });
  } catch (error) {
    res.status(500).json({ error: error.message || "Could not create product." });
  }
});

app.post("/api/generate", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) return res.status(400).json({ error: "OPENAI_API_KEY is missing. Add it to the .env file and restart the app." });

    const { ngId: requestedNgId, artworkName, format, sellAs, sourceType, rightsStatus, imageDataUrl, originalFilename } = req.body || {};
    if (!artworkName || !format || !sellAs || !imageDataUrl) return res.status(400).json({ error: "Artwork name, format, sell-as choice, and image are required." });

    let ngId = String(requestedNgId || "").trim();
    if (ngId) {
      const existing = db.prepare("SELECT ng_id FROM products WHERE ng_id = ?").get(ngId);
      if (!existing) return res.status(404).json({ error: "The selected draft no longer exists." });
    } else {
      ngId = reserveNgId();
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const prompt = `
You are the product-publishing engine for Neon Gopher, a wall-art and collectible-art brand.
Analyze the attached artwork and create a polished ecommerce listing.

Fixed input:
- NG ID: ${ngId}
- Working artwork name: ${artworkName}
- Format: ${format}
- Sell as: ${sellAs}
- Source type: ${sourceType || "Public Domain"}
- Rights status: ${rightsStatus || "Licensed for Commercial Use"}

Rules:
- Be accurate about what is visibly present.
- Do not identify a real artist, person, character, brand, location, or trademark unless explicitly supplied and certain.
- Do not invent licensing, historical, geographic, or trademark claims.
- Write for ecommerce shoppers.
- Product title should be clear and attractive, not stuffed with keywords.
- SEO title: maximum 60 characters.
- Meta description: approximately 140–155 characters.
- Image alt text: concise and descriptive.
- Tags must be useful for Shopify search and collections.
- Long description should be 2–4 short paragraphs.
- URL handle must be lowercase with hyphens only.
- Return JSON only. No markdown.

Return exactly this structure:
{
  "ng_id": "${ngId}",
  "product_title": "",
  "primary_collection": "",
  "artwork_type": "",
  "rooms": ["", "", ""],
  "colors": ["", "", ""],
  "moods": ["", "", ""],
  "styles": ["", ""],
  "subjects": ["", ""],
  "season": "",
  "holiday": "",
  "gift_recipients": ["", ""],
  "short_description": "",
  "long_description": "",
  "highlights": ["", "", ""],
  "seo_title": "",
  "meta_description": "",
  "url_handle": "",
  "image_alt_text": "",
  "shopify_tags": ["", "", "", "", "", "", "", "", "", ""],
  "confidence": 0
}`.trim();

    const response = await client.responses.create({
      model: MODEL,
      input: [{ role: "user", content: [
        { type: "input_text", text: prompt },
        { type: "input_image", image_url: imageDataUrl, detail: "high" }
      ] }]
    });


const data = cleanJson(response.output_text);
    data.ng_id = ngId;
    const artworkLocation = saveImage(imageDataUrl, ngId, originalFilename);
    const product = upsertProduct(data, { originalFilename, artworkLocation, format, sellAs, sourceType, rightsStatus, status: "Draft" });
    res.json({ data: product, model: MODEL });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error?.message || "Generation failed." });
  }
});

app.post("/api/backup", (req, res) => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const target = path.join(BACKUP_DIR, `neon-gopher-studio-${stamp}.db`);
    db.exec("PRAGMA wal_checkpoint(FULL)");
    fs.copyFileSync(DB_PATH, target);
    res.json({ ok: true, filename: path.basename(target) });
  } catch (error) {
    res.status(500).json({ error: error.message || "Backup failed." });
  }
});

app.get("*", (req, res) => res.sendFile(path.join(ROOT, "public", "index.html")));

app.listen(PORT, () => {
  console.log(`Neon Gopher Studio v1.3.0 is running at http://localhost:${PORT}`);
});
