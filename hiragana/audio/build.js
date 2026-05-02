// One-time audio asset builder.
// For each of the 104 hiragana syllables, prefer a CC-licensed Wikimedia
// Commons clip; fall back to macOS `say -v Kyoko` for syllables Commons
// doesn't cover. Outputs <romaji>.m4a + sources.json + credits.md.
//
// Run: node hiragana/audio/build.js
// Prereqs: macOS (for `say`), `afinfo`, and ffmpeg in PATH.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, unlink, mkdir, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const exec = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));

// Mirror of ROWS in hiragana/app.js. Keep in sync if the inventory changes.
const SYLLABLES = [
  ["あ","a"],["い","i"],["う","u"],["え","e"],["お","o"],
  ["か","ka"],["き","ki"],["く","ku"],["け","ke"],["こ","ko"],
  ["さ","sa"],["し","shi"],["す","su"],["せ","se"],["そ","so"],
  ["た","ta"],["ち","chi"],["つ","tsu"],["て","te"],["と","to"],
  ["な","na"],["に","ni"],["ぬ","nu"],["ね","ne"],["の","no"],
  ["は","ha"],["ひ","hi"],["ふ","fu"],["へ","he"],["ほ","ho"],
  ["ま","ma"],["み","mi"],["む","mu"],["め","me"],["も","mo"],
  ["や","ya"],["ゆ","yu"],["よ","yo"],
  ["ら","ra"],["り","ri"],["る","ru"],["れ","re"],["ろ","ro"],
  ["わ","wa"],["を","wo"],["ん","n"],
  ["が","ga"],["ぎ","gi"],["ぐ","gu"],["げ","ge"],["ご","go"],
  ["ざ","za"],["じ","ji"],["ず","zu"],["ぜ","ze"],["ぞ","zo"],
  ["だ","da"],["ぢ","di"],["づ","du"],["で","de"],["ど","do"],
  ["ば","ba"],["び","bi"],["ぶ","bu"],["べ","be"],["ぼ","bo"],
  ["ぱ","pa"],["ぴ","pi"],["ぷ","pu"],["ぺ","pe"],["ぽ","po"],
  ["きゃ","kya"],["きゅ","kyu"],["きょ","kyo"],
  ["しゃ","sha"],["しゅ","shu"],["しょ","sho"],
  ["ちゃ","cha"],["ちゅ","chu"],["ちょ","cho"],
  ["にゃ","nya"],["にゅ","nyu"],["にょ","nyo"],
  ["ひゃ","hya"],["ひゅ","hyu"],["ひょ","hyo"],
  ["みゃ","mya"],["みゅ","myu"],["みょ","myo"],
  ["りゃ","rya"],["りゅ","ryu"],["りょ","ryo"],
  ["ぎゃ","gya"],["ぎゅ","gyu"],["ぎょ","gyo"],
  ["じゃ","ja"],["じゅ","ju"],["じょ","jo"],
  ["びゃ","bya"],["びゅ","byu"],["びょ","byo"],
  ["ぴゃ","pya"],["ぴゅ","pyu"],["ぴょ","pyo"],
];

// ぢ/づ are phonetically identical to じ/ず in modern Japanese; reuse the same Commons clip.
const ROMAJI_ALIAS = { di: "ji", du: "zu" };

const OUT_DIR = __dirname;
const TMP_DIR = join(OUT_DIR, ".tmp");

const cap = (s) => s[0].toUpperCase() + s.slice(1);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Wikimedia rate-limits API/upload requests. Identify ourselves and back off on 429.
const UA = "PatLaFon-hiragana-audio-builder/1.0 (https://github.com/Pat-Lafon/Pat-LaFon.github.io)";

async function fetchWithRetry(url, { attempts = 5, baseDelay = 1000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status !== 429) return res;
    const retryAfter = Number(res.headers.get("retry-after")) || 0;
    const delay = retryAfter > 0 ? retryAfter * 1000 : baseDelay * Math.pow(2, i);
    await sleep(delay);
  }
  throw new Error("rate-limited after retries");
}

async function probeWikimedia(filename) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodeURIComponent(filename)}&prop=imageinfo&iiprop=url|user|extmetadata&format=json`;
  const res = await fetchWithRetry(url);
  const data = await res.json();
  const page = Object.values(data.query.pages)[0];
  const info = page.imageinfo?.[0];
  if (!info?.url) return null;
  const meta = info.extmetadata || {};
  return {
    url: info.url,
    user: info.user || meta.Artist?.value || "unknown",
    license: meta.LicenseShortName?.value || "unknown",
  };
}

async function downloadAndConvert(url, outPath) {
  const tmpOga = join(TMP_DIR, "src.oga");
  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(tmpOga, buf);
  await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", tmpOga, "-codec:a", "aac", "-b:a", "64k", outPath]);
  await unlink(tmpOga).catch(() => {});
}

async function ttsGenerate(kana, romaji, outPath) {
  const tmpAiff = join(TMP_DIR, `${romaji}.aiff`);
  // Single vowels and ん clip too short in isolation. Pad with chōonpu;
  // for ん we additionally boost volume since Kyoko refuses to lengthen it.
  const isShortVowel = ["a", "i", "u", "e", "o"].includes(romaji);
  const isMoraicN = romaji === "n";
  const utterance = (isShortVowel || isMoraicN) ? `${kana}ー` : kana;
  await exec("say", ["-v", "Kyoko", "-o", tmpAiff, utterance]);
  const filter = isMoraicN ? "volume=3.0,apad=pad_dur=0.1" : "apad=pad_dur=0.05";
  await exec("ffmpeg", ["-y", "-loglevel", "error", "-i", tmpAiff, "-af", filter, "-codec:a", "aac", "-b:a", "64k", outPath]);
  await unlink(tmpAiff).catch(() => {});
}

async function main() {
  if (!existsSync(TMP_DIR)) await mkdir(TMP_DIR, { recursive: true });

  const sources = {};
  const credits = [];
  const aliasTargets = new Set();

  console.log(`Building audio for ${SYLLABLES.length} syllables...\n`);

  for (const [kana, romaji] of SYLLABLES) {
    const outFile = `${romaji}.m4a`;
    const outPath = join(OUT_DIR, outFile);

    // Aliased romaji — copy the canonical clip's source info, defer file copy
    if (ROMAJI_ALIAS[romaji]) {
      const target = ROMAJI_ALIAS[romaji];
      sources[romaji] = { kana, file: `${target}.m4a`, alias: target };
      aliasTargets.add(target);
      console.log(`  ALIAS  ${romaji} → ${target}`);
      continue;
    }

    // Try Wikimedia first
    const filename = `Ja-${cap(romaji)}.oga`;
    let wikimedia = null;
    try { wikimedia = await probeWikimedia(filename); } catch { /* network hiccup, fall through */ }

    if (wikimedia) {
      try {
        await downloadAndConvert(wikimedia.url, outPath);
        sources[romaji] = { kana, file: outFile, source: "wikimedia", url: wikimedia.url };
        credits.push({ romaji, kana, user: wikimedia.user, license: wikimedia.license, url: wikimedia.url });
        console.log(`  WIKI   ${romaji.padEnd(4)} ← ${filename} (${wikimedia.user}, ${wikimedia.license})`);
        continue;
      } catch (err) {
        console.log(`  WIKI failed for ${romaji}: ${err.message} — falling back to TTS`);
      }
    }

    // Fall back to local TTS
    await ttsGenerate(kana, romaji, outPath);
    sources[romaji] = { kana, file: outFile, source: "tts-kyoko" };
    console.log(`  TTS    ${romaji.padEnd(4)} ← Kyoko`);

    // Be polite to Commons: small gap between probes/downloads
    await sleep(250);
  }

  // Materialize alias files as actual copies so the runtime doesn't need lookup logic
  for (const [aliasRomaji, target] of Object.entries(ROMAJI_ALIAS)) {
    const targetPath = join(OUT_DIR, `${target}.m4a`);
    if (!existsSync(targetPath)) throw new Error(`alias target ${target}.m4a missing`);
    await copyFile(targetPath, join(OUT_DIR, `${aliasRomaji}.m4a`));
  }
  // Touch up sources.json: aliases point at their own file now
  for (const r of Object.keys(ROMAJI_ALIAS)) {
    sources[r].file = `${r}.m4a`;
  }

  await writeFile(join(OUT_DIR, "sources.json"), JSON.stringify(sources, null, 2) + "\n");

  // Markdown attribution for Wikimedia clips
  const lines = ["# Audio credits\n"];
  if (credits.length) {
    lines.push("Audio clips for the following kana are sourced from Wikimedia Commons under their respective licenses. Each clip retains its original license; attribution below.\n");
    lines.push("| Kana | Romaji | Contributor | License | Source |");
    lines.push("|------|--------|-------------|---------|--------|");
    for (const c of credits) {
      lines.push(`| ${c.kana} | ${c.romaji} | ${c.user} | ${c.license} | [link](${c.url}) |`);
    }
    lines.push("");
  }
  const ttsCount = Object.values(sources).filter(s => s.source === "tts-kyoko").length;
  if (ttsCount) lines.push(`\n${ttsCount} clips generated locally with macOS \`say -v Kyoko\` (no attribution required).`);
  await writeFile(join(OUT_DIR, "credits.md"), lines.join("\n") + "\n");

  // Cleanup tmp dir
  try { await unlink(join(TMP_DIR, "src.oga")); } catch { /* ignore */ }

  const wikiCount = credits.length;
  const aliasCount = Object.keys(ROMAJI_ALIAS).length;
  console.log(`\nDone. ${wikiCount} Wikimedia, ${ttsCount} TTS, ${aliasCount} aliases.`);
  console.log(`Wrote ${SYLLABLES.length} entries to sources.json, ${wikiCount} credits to credits.md.`);
}

main().catch(err => { console.error(err); process.exit(1); });
