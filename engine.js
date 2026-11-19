// Core engine: segmentation, heteronym default picking, tone sandhi,
// pinyin/zhuyin rendering. Shared between Node tests and the browser page.
(function (root) {
  const INITIALS = ["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l",
    "g", "k", "h", "j", "q", "x", "r", "z", "c", "s", "y", "w"];

  const INITIAL_ZHUYIN = {
    b: "ㄅ", p: "ㄆ", m: "ㄇ", f: "ㄈ", d: "ㄉ", t: "ㄊ", n: "ㄋ", l: "ㄌ",
    g: "ㄍ", k: "ㄎ", h: "ㄏ", j: "ㄐ", q: "ㄑ", x: "ㄒ",
    zh: "ㄓ", ch: "ㄔ", sh: "ㄕ", r: "ㄖ", z: "ㄗ", c: "ㄘ", s: "ㄙ",
  };

  const FINAL_ZHUYIN = {
    "": "", a: "ㄚ", o: "ㄛ", e: "ㄜ", ê: "ㄝ",
    ai: "ㄞ", ei: "ㄟ", ao: "ㄠ", ou: "ㄡ",
    an: "ㄢ", en: "ㄣ", ang: "ㄤ", eng: "ㄥ", ong: "ㄨㄥ", er: "ㄦ",
    i: "ㄧ", ia: "ㄧㄚ", ie: "ㄧㄝ", iao: "ㄧㄠ", iu: "ㄧㄡ",
    ian: "ㄧㄢ", in: "ㄧㄣ", iang: "ㄧㄤ", ing: "ㄧㄥ", iong: "ㄩㄥ",
    u: "ㄨ", ua: "ㄨㄚ", uo: "ㄨㄛ", uai: "ㄨㄞ", ui: "ㄨㄟ",
    uan: "ㄨㄢ", un: "ㄨㄣ", uang: "ㄨㄤ", ueng: "ㄨㄥ",
    v: "ㄩ", ve: "ㄩㄝ", van: "ㄩㄢ", vn: "ㄩㄣ",
  };

  const STANDALONE_FINAL = {
    yi: "i", ya: "ia", ye: "ie", yao: "iao", you: "iu",
    yan: "ian", yin: "in", yang: "iang", ying: "ing", yong: "iong",
    wu: "u", wa: "ua", wo: "uo", wai: "uai", wei: "ui",
    wan: "uan", wen: "un", wang: "uang", weng: "ueng",
    yu: "v", yue: "ve", yuan: "van", yun: "vn",
  };

  const TONE_MARKS = {
    a: "āáǎàa", o: "ōóǒòo", e: "ēéěèe",
    i: "īíǐìi", u: "ūúǔùu", "ü": "ǖǘǚǜü",
  };
  const ZHUYIN_TONE = { 1: "", 2: "ˊ", 3: "ˇ", 4: "ˋ", 5: "˙" };

  function splitInitial(syll) {
    for (const ini of INITIALS) {
      if (syll.startsWith(ini)) return [ini, syll.slice(ini.length)];
    }
    return ["", syll];
  }

  function toUnderlyingFinal(initial, final) {
    if (initial === "y" || initial === "w") {
      const key = initial + final;
      if (key in STANDALONE_FINAL) return ["", STANDALONE_FINAL[key]];
      return ["", final];
    }
    if ((initial === "j" || initial === "q" || initial === "x") && final.startsWith("v")) {
      return [initial, final];
    }
    if ((initial === "j" || initial === "q" || initial === "x") && final.startsWith("u")) {
      return [initial, "v" + final.slice(1)];
    }
    if (["zh", "ch", "sh", "r", "z", "c", "s"].includes(initial) && final === "i") {
      return [initial, ""];
    }
    return [initial, final];
  }

  function parseTone(raw) {
    const m = /^([a-zA-Z:]+)([0-5])$/.exec((raw || "").trim());
    if (!m) return null;
    return { body: m[1].toLowerCase(), tone: parseInt(m[2], 10) || 5 };
  }

  function toZhuyin(raw) {
    const p = parseTone(raw);
    if (!p) return raw;
    const body = p.body.replace(/u:/g, "v");
    let [initial, final] = splitInitial(body);
    [initial, final] = toUnderlyingFinal(initial, final);
    const iniZ = INITIAL_ZHUYIN[initial] || "";
    const finZ = FINAL_ZHUYIN[final];
    if (finZ === undefined) return "?" + raw;
    if (p.tone === 5) return "˙" + iniZ + finZ;
    return iniZ + finZ + ZHUYIN_TONE[p.tone];
  }

  function placeToneMark(spelled, tone) {
    if (tone === 5 || !spelled) return spelled;
    const priority = ["a", "o", "e"];
    for (const v of priority) {
      const idx = spelled.indexOf(v);
      if (idx !== -1) return spelled.slice(0, idx) + TONE_MARKS[v][tone - 1] + spelled.slice(idx + 1);
    }
    for (let i = spelled.length - 1; i >= 0; i--) {
      const ch = spelled[i];
      if (ch === "i" || ch === "u" || ch === "ü") {
        return spelled.slice(0, i) + TONE_MARKS[ch][tone - 1] + spelled.slice(i + 1);
      }
    }
    return spelled;
  }

  function toToneMarkPinyin(raw) {
    const p = parseTone(raw);
    if (!p) return raw;
    const spelled = p.body.replace(/u:/g, "ü");
    return placeToneMark(spelled, p.tone);
  }

  function toneOf(raw) {
    const p = parseTone(raw);
    return p ? p.tone : null;
  }
  function setTone(raw, newTone) {
    const p = parseTone(raw);
    if (!p) return raw;
    return p.body + String(newTone);
  }

  // ---------- segmentation ----------
  const MAX_WORD_LEN = 4;
  const CJK_RE = /[\u4e00-\u9fff]/;

  // Common "\u4e00 + measure/classifier word" combos that CEDICT lists as a
  // single dictionary entry but which are still ordinary numeral-plus-
  // classifier uses, subject to tone sandhi in real speech (see applySandhi).
  const YI_MEASURE_COMBOS = new Set([
    "\u4e00\u500b", "\u4e00\u4e9b", "\u4e00\u4e0b", "\u4e00\u9ede", "\u4e00\u6b21", "\u4e00\u6a23", "\u4e00\u76f4", "\u4e00\u5b9a", "\u4e00\u8d77",
    "\u4e00\u56de", "\u4e00\u904d", "\u4e00\u8072", "\u4e00\u7a2e", "\u4e00\u4f4d", "\u4e00\u4ef6", "\u4e00\u96bb", "\u4e00\u5f35", "\u4e00\u672c",
    "\u4e00\u676f", "\u4e00\u7897", "\u4e00\u7247", "\u4e00\u9846", "\u4e00\u7c92", "\u4e00\u7fa4", "\u4e00\u6279", "\u4e00\u5c0d", "\u4e00\u96d9",
    "\u4e00\u534a", "\u4e00\u584a", "\u4e00\u689d", "\u4e00\u9053", "\u4e00\u5834", "\u4e00\u8d9f", "\u4e00\u9663", "\u4e00\u523b", "\u4e00\u908a",
  ]);

  function isSurnameish(entry) {
    return /^[A-Z]/.test(entry.p); // CEDICT capitalizes proper-noun/surname headwords
  }

  function pickPrimary(entries) {
    const common = entries.filter((e) => !isSurnameish(e));
    const pool = common.length ? common : entries;
    return pool[0];
  }

  // effective (possibly Taiwan-overridden) numbered pinyin for an entry
  function effectivePinyin(entry) {
    return entry.tw || entry.p;
  }

  // Rare/formal dictionary words that greedy longest-match would otherwise
  // steal from a far more common following word, e.g. "在外" (outer;
  // excluded) swallowing the 在 that belongs with 外面 (outside) in "在外面".
  const SEGMENTATION_BLOCKLIST = new Set(["在外"]);

  function segment(text, dict) {
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      let matched = null;
      if (CJK_RE.test(text[i])) {
        for (let len = MAX_WORD_LEN; len >= 1; len--) {
          if (i + len > text.length) continue;
          const cand = text.slice(i, i + len);
          if (dict[cand] && !SEGMENTATION_BLOCKLIST.has(cand)) { matched = cand; break; }
        }
      }
      if (matched) {
        const entries = dict[matched];
        const primary = pickPrimary(entries);
        tokens.push({ hanzi: matched, entries, chosen: entries.indexOf(primary) });
        i += matched.length;
      } else {
        tokens.push({ hanzi: text[i], entries: null, chosen: 0 });
        i += 1;
      }
    }
    return tokens;
  }

  // Build the flat per-syllable stream (with references back to token index)
  // used for sandhi, and apply sandhi rules. Resets at any non-CJK token
  // (punctuation/space/newline) to respect prosodic breaks.
  function buildSyllableStream(tokens) {
    const stream = []; // {tokenIndex, syllIndex, raw}
    tokens.forEach((tok, ti) => {
      if (!tok.entries) { stream.push(null); return; } // boundary marker
      const entry = tok.entries[tok.chosen];
      const sylls = effectivePinyin(entry).split(" ");
      sylls.forEach((s, si) => stream.push({ tokenIndex: ti, syllIndex: si, raw: s }));
    });
    return stream;
  }

  function applySandhi(tokens) {
    const stream = buildSyllableStream(tokens);
    // group into runs separated by null boundaries
    const runs = [];
    let cur = [];
    for (const item of stream) {
      if (item === null) { if (cur.length) runs.push(cur); cur = []; }
      else cur.push(item);
    }
    if (cur.length) runs.push(cur);

    const result = {}; // "ti-si" -> { raw, changed, rule }
    for (const run of runs) {
      const origTones = run.map((it) => toneOf(it.raw));
      const newTones = origTones.slice();
      const rule = new Array(run.length).fill(null);
      // 3-3 sandhi (non-cascading, based on original tones). Only crosses a
      // word boundary when the leading word is a single character (pronoun/
      // surname/adverb + what follows, e.g. 你好, 許小姐, 很好) - the classic
      // tightly-bound cases. A multi-character word (e.g. a place name) does
      // NOT drag the sandhi into the next word across a subject/predicate
      // break (台北 before 很冷 must NOT sandhi 北). This rule is a spoken-
      // pronunciation note only - standard written pinyin keeps citation
      // tones for it (nǐ hǎo, not ní hǎo), unlike the 一/不 rules below.
      for (let k = 0; k < run.length - 1; k++) {
        if (origTones[k] !== 3 || origTones[k + 1] !== 3) continue;
        const sameToken = run[k].tokenIndex === run[k + 1].tokenIndex;
        const leadTok = tokens[run[k].tokenIndex];
        if (sameToken || leadTok.hanzi.length === 1) { newTones[k] = 2; rule[k] = "tone33"; }
      }
      // 不 + 4th tone -> bú (checked at the character's own position, so it
      // also fires inside multi-char words like 不錯/不是/是不是)
      for (let k = 0; k < run.length - 1; k++) {
        const tok = tokens[run[k].tokenIndex];
        const ch = tok.hanzi[run[k].syllIndex];
        if (ch === "不" && origTones[k] === 4 && origTones[k + 1] === 4) { newTones[k] = 2; rule[k] = "bu"; }
      }
      // 一 sandhi: fires when "一" stands as its own single-char token (not
      // absorbed into a longer dictionary word, e.g. 一月/十一/第一 keep their
      // citation tone), OR when it is the first character of one of the
      // common "一 + measure word" entries below, which ARE lexicalized as a
      // single CEDICT entry but are still ordinary "one + classifier" uses
      // that undergo the sandhi in real speech (一起/一樣/一個/一下 etc.).
      for (let k = 0; k < run.length - 1; k++) {
        const tok = tokens[run[k].tokenIndex];
        const isStandalone = tok.hanzi === "一" && run[k].syllIndex === 0;
        const isMeasureCombo = run[k].syllIndex === 0 && tok.hanzi[0] === "一" && YI_MEASURE_COMBOS.has(tok.hanzi);
        if ((isStandalone || isMeasureCombo) && tok.entries && origTones[k] === 1) {
          // 個 (classifier) surfaces as neutral tone (5) in CEDICT, but its
          // underlying tone is 4th (gè) for the purpose of this rule.
          const nextChar = tok.hanzi[run[k].syllIndex + 1];
          const nextTone = nextChar === "個" && origTones[k + 1] === 5 ? 4 : origTones[k + 1];
          newTones[k] = nextTone === 4 ? 2 : (nextTone <= 3 ? 4 : origTones[k]);
          rule[k] = "yi";
        }
      }
      run.forEach((it, k) => {
        result[`${it.tokenIndex}-${it.syllIndex}`] = {
          raw: setTone(it.raw, newTones[k]),
          changed: newTones[k] !== origTones[k],
          rule: rule[k],
        };
      });
    }
    return result;
  }

  // ---------- continuous sentence-style pinyin (textbook orthography) ----------
  // Words/tokens space-separated, syllables within one token joined with no
  // space (apostrophe inserted before an a/o/e-initial syllable to avoid
  // ambiguity, e.g. 企鵝 -> qi'e), proper nouns and sentence starts
  // capitalized, Chinese punctuation converted to its Western equivalent.
  const PUNCT_MAP = {
    "，": ",", "。": ".", "！": "!", "？": "?", "；": ";", "：": ":",
    "、": ",", "「": "“", "」": "”", "『": "‘", "』": "’",
    "（": "(", "）": ")", "《": "“", "》": "”", "…": "...", "—": "-",
  };
  const SENTENCE_END = new Set([".", "!", "?"]);

  function isProperEntry(entry) {
    return /^[A-Z]/.test(entry.p);
  }

  // Shared renderer for both toSentencePinyin and toSentenceZhuyin: words
  // space-separated, syllables within one word joined with no space
  // (pinyin mode additionally inserts an apostrophe before an a/o/e-initial
  // syllable, e.g. 企鵝 -> qi'e; zhuyin has no such ambiguity), proper nouns
  // and sentence starts capitalized (pinyin mode only), Chinese punctuation
  // converted to its Western equivalent.
  function toSentenceForm(tokens, sandhi, renderSyll, useApostrophe, capitalize) {
    let out = "";
    let atStart = true;
    tokens.forEach((tok, ti) => {
      if (tok.entries) {
        const entry = tok.entries[tok.chosen];
        const sylls = effectivePinyin(entry).split(" ");
        // Numeral+classifier combos (一個/一些/一下...) are one dictionary
        // entry but are written as two separate words in pinyin orthography.
        const splitAsWords = YI_MEASURE_COMBOS.has(tok.hanzi);
        let chunk = "";
        sylls.forEach((s, si) => {
          // Written pinyin conventionally keeps citation tones for 3rd-tone
          // sandhi, but writes out the 一/不 sandhi forms (yí, bú...).
          const adj = sandhi && sandhi[`${ti}-${si}`];
          const raw = adj && adj.rule !== "tone33" ? adj.raw : s;
          const rendered = renderSyll(raw);
          const startsVowel = useApostrophe && /^(u:)?[aoe]/i.test(raw);
          if (si > 0) chunk += splitAsWords ? " " : (startsVowel ? "'" : "");
          chunk += rendered;
        });
        if (capitalize && (atStart || isProperEntry(entry))) {
          chunk = chunk.charAt(0).toUpperCase() + chunk.slice(1);
        }
        out += (out && !out.endsWith(" ") ? " " : "") + chunk;
        atStart = false;
      } else {
        const ch = tok.hanzi;
        if (/\s/.test(ch)) {
          out += out.endsWith(" ") ? "" : " ";
          return;
        }
        const isPunct = ch in PUNCT_MAP;
        const mapped = isPunct ? PUNCT_MAP[ch] : ch;
        out += isPunct ? mapped : (out && !out.endsWith(" ") ? " " : "") + mapped;
        if (SENTENCE_END.has(mapped)) atStart = true;
      }
    });
    return out.trim().replace(/ +/g, " ");
  }

  function toSentencePinyin(tokens, sandhi) {
    return toSentenceForm(tokens, sandhi, toToneMarkPinyin, true, true);
  }

  function toSentenceZhuyin(tokens, sandhi) {
    return toSentenceForm(tokens, sandhi, toZhuyin, false, false);
  }

  const api = {
    toZhuyin, toToneMarkPinyin, parseTone, toneOf, setTone,
    segment, pickPrimary, effectivePinyin, applySandhi, isSurnameish,
    toSentencePinyin, toSentenceZhuyin,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.MandarinEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
