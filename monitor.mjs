import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const env = await readEnv(resolve(root, ".env"));
const searchUrl = env.SEARCH_URL;
const keywords = (env.ROLE_KEYWORDS ?? "")
  .split(",")
  .map((word) => word.trim().toLowerCase())
  .filter(Boolean);
const statePath = resolve(root, "data", "seen-jobs.json");
const initializeOnly = process.argv.includes("--initialize");
const testTelegram = process.argv.includes("--test-telegram");
const alertCurrent = process.argv.includes("--alert-current");

if (!searchUrl || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !keywords.length) {
  fail("Missing required settings. Copy .env.example to .env and fill in every value.");
}

if (testTelegram) {
  await sendTelegram(env, "✅ Google Careers monitor is connected. New matching roles will be sent to this chat.");
  console.log("Telegram test message sent.");
  process.exit(0);
}

const jobs = (await fetchJobs(searchUrl)).filter((job) =>
  keywords.some((keyword) => job.title.toLowerCase().includes(keyword)),
);
const previous = await readState(statePath);
const currentIds = new Set(jobs.map((job) => job.id));

if (initializeOnly || !previous) {
  await saveState(statePath, currentIds);
  console.log(`Baseline saved: ${jobs.length} matching job(s). No alerts sent.`);
  process.exit(0);
}

if (alertCurrent) {
  for (const job of jobs) await sendTelegram(env, formatAlert(job));
  await saveState(statePath, currentIds);
  console.log(`Sent ${jobs.length} current matching role(s).`);
  process.exit(0);
}

const newJobs = jobs.filter((job) => !previous.has(job.id));
for (const job of newJobs) await sendTelegram(env, formatAlert(job));
await saveState(statePath, currentIds);
console.log(newJobs.length ? `Sent ${newJobs.length} alert(s).` : "No new matching jobs.");

async function fetchJobs(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Google-Careers-Role-Monitor/1.0 (personal job alert)" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) fail(`Google Careers returned HTTP ${response.status}.`);
  const html = await response.text();
  // Cards contain nested <li> elements for their share menus, so stop at the next card,
  // rather than the first closing </li>.
  const cards = [...html.matchAll(/<li class="lLd3Je" ssk='([^']+)'>([\s\S]*?)(?=<li class="lLd3Je"|$)/g)];
  if (!cards.length) fail("Could not find job cards; Google Careers may have changed its page layout.");
  return cards.map(([, id, card]) => {
    const title = decode(htmlText(card.match(/<h3 class="QJPWVe">([\s\S]*?)<\/h3>/)?.[1] ?? ""));
    const location = decode(htmlText(card.match(/<span class="r0wTof[^>]*>([\s\S]*?)<\/span>/)?.[1] ?? ""));
    const href = card.match(/href="([^"]+)/)?.[1]?.replaceAll("&amp;", "&") ?? "";
    if (!title || !href) fail("A job card was missing its title or link.");
    return { id, title, location, url: new URL(href, "https://www.google.com/about/careers/applications/").href };
  });
}

function formatAlert(job) {
  return [
    "🚨 New Google Careers match",
    job.title,
    job.location && `📍 ${job.location}`,
    job.url,
    "\nForward this link to your Google contact now.",
  ].filter(Boolean).join("\n");
}

async function sendTelegram(env, text) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
  });
  if (!response.ok) fail(`Telegram rejected the alert (HTTP ${response.status}). Check the bot token and chat ID.`);
}

async function readEnv(path) {
  let text;
  try { text = await readFile(path, "utf8"); } catch { return {}; }
  return Object.fromEntries(text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    return match && !line.trimStart().startsWith("#") ? [[match[1], match[2]]] : [];
  }));
}

async function readState(path) {
  try { return new Set(JSON.parse(await readFile(path, "utf8")).jobIds); } catch { return null; }
}

async function saveState(path, ids) {
  await mkdir(resolve(root, "data"), { recursive: true });
  await writeFile(path, `${JSON.stringify({ jobIds: [...ids], updatedAt: new Date().toISOString() }, null, 2)}\n`);
}

function htmlText(value) { return value.replace(/<[^>]+>/g, "").trim(); }
function decode(value) { return value.replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", '"'); }
function fail(message) { console.error(`Error: ${message}`); process.exit(1); }
