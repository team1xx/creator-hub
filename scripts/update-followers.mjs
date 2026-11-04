// Обновляет data.json: запрашивает число подписчиков через Apify.
// Запускается GitHub Actions по расписанию (Node 20+, внешние библиотеки не нужны).
import { readFile, writeFile } from 'node:fs/promises';

const TOKEN = process.env.APIFY_TOKEN;
if (!TOKEN) { console.error('Нет секрета APIFY_TOKEN'); process.exit(1); }

const IG_ACTOR = 'apify~instagram-profile-scraper';
const TT_ACTOR = 'clockworks~tiktok-profile-scraper';

const bloggers = JSON.parse(await readFile(new URL('./bloggers.json', import.meta.url)));
const dataUrl = new URL('../data.json', import.meta.url);
const data = JSON.parse(await readFile(dataUrl));

async function runActor(actor, input) {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${TOKEN}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!r.ok) throw new Error(`${actor}: HTTP ${r.status} ${await r.text()}`);
  return r.json();
}

const low = s => String(s || '').toLowerCase();
const ok = n => Number.isFinite(n) && n > 0;
let updated = 0;

// ---- Instagram ----
try {
  const items = await runActor(IG_ACTOR, { usernames: bloggers.map(b => b.instagram) });
  const byName = new Map(items.map(i => [low(i.username), i.followersCount]));
  for (const b of bloggers) {
    const n = byName.get(low(b.instagram));
    if (ok(n)) { data.bloggers[b.id].ig = n; updated++; }
    else console.warn(`IG: нет данных для ${b.instagram}, оставляю прежнее значение`);
  }
} catch (e) { console.error('Instagram не обновился:', e.message); }

// ---- TikTok ----
try {
  const items = await runActor(TT_ACTOR, {
    profiles: bloggers.map(b => b.tiktok),
    resultsPerPage: 1,
  });
  const byName = new Map();
  for (const i of items) {
    const name = low(i.authorMeta?.name);
    if (name && !byName.has(name)) byName.set(name, i.authorMeta?.fans);
  }
  for (const b of bloggers) {
    const n = byName.get(low(b.tiktok));
    if (ok(n)) { data.bloggers[b.id].tt = n; updated++; }
    else console.warn(`TikTok: нет данных для ${b.tiktok}, оставляю прежнее значение`);
  }
} catch (e) { console.error('TikTok не обновился:', e.message); }

if (updated > 0) data.updated = new Date().toISOString();
await writeFile(dataUrl, JSON.stringify(data, null, 2) + '\n');
console.log(`Обновлено значений: ${updated} из ${bloggers.length * 2}`);
