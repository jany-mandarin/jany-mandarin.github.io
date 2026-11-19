(function () {
  const E = window.MandarinEngine;
  const statusEl = document.getElementById("status");
  const input = document.getElementById("input");
  const sandhiToggle = document.getElementById("sandhiToggle");
  const breakdownBody = document.getElementById("breakdownBody");
  const line4zh = document.getElementById("line4zh");
  const line4zy = document.getElementById("line4zy");
  const line4py = document.getElementById("line4py");
  const line4en = document.getElementById("line4en");

  let dict = null;
  let tokens = [];

  function setStatus(msg, isErr) {
    statusEl.textContent = msg || "";
    statusEl.className = "status" + (isErr ? " err" : "");
  }

  fetch("data/cedict.json")
    .then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then((d) => {
      dict = d;
      setStatus("字典載入完成（" + Object.keys(dict).length + " 筆），可以開始分析了！");
      analyze();
    })
    .catch((err) => {
      setStatus("字典載入失敗：" + err.message + "（請確認 data/cedict.json 有上傳）", true);
    });

  function shortGloss(e) {
    // first clause only, with parenthetical asides stripped (CEDICT glosses
    // often contain their own "(...)" notes, which would otherwise collide
    // with the "(...)" we wrap pinyin/zhuyin in for compact display)
    let first = e.split(";")[0].trim();
    first = first.replace(/\([^()]*\)/g, "").replace(/\s{2,}/g, " ").trim();
    if (!first) first = e.split(";")[0].trim(); // fallback if that emptied it
    return first.length > 36 ? first.slice(0, 34) + "…" : first;
  }

  function buildTokens(text) {
    if (!dict) return [];
    return E.segment(text, dict);
  }

  // citation-form display values for a token: her override if she's typed
  // one, otherwise the computed default from the currently chosen entry.
  function citationDisplay(tok) {
    const entry = tok.entries[tok.chosen];
    const sylls = E.effectivePinyin(entry).split(" ");
    return {
      zhuyin: sylls.map(E.toZhuyin).join(""),
      pinyin: sylls.map(E.toToneMarkPinyin).join(" "),
      english: entry.e,
    };
  }
  function currentDisplay(tok) {
    return tok.override || citationDisplay(tok);
  }

  // Cheap refresh: only the 四行格式 zhuyin/pinyin lines, no table rebuild
  // (so typing in a breakdown-table field never loses focus/cursor).
  function updateLine4() {
    const sandhiOn = sandhiToggle.checked;
    const sandhi = sandhiOn ? E.applySandhi(tokens) : {};
    line4zh.textContent = input.value.trim();
    line4zy.value = "(" + E.toSentenceZhuyin(tokens, sandhi) + ")";
    line4py.value = "(" + E.toSentencePinyin(tokens, sandhi) + ")";
  }

  function renderBreakdown() {
    breakdownBody.innerHTML = "";

    tokens.forEach((tok, ti) => {
      if (!tok.entries) return; // punctuation / latin / digits / unknown char: no breakdown row

      const tr = document.createElement("tr");
      const tdHz = document.createElement("td");
      tdHz.className = "hz";
      tdHz.textContent = tok.hanzi;

      const tdZy = document.createElement("td");
      const zyInput = document.createElement("input");
      zyInput.className = "cellEdit";
      const tdPy = document.createElement("td");
      const pyWrap = document.createElement("div");
      pyWrap.className = "pyWrap";
      const pyInput = document.createElement("input");
      pyInput.className = "cellEdit";
      const tdEn = document.createElement("td");
      const enInput = document.createElement("input");
      enInput.className = "cellEdit cellEditWide";

      function fillFromCurrent() {
        const d = currentDisplay(tok);
        zyInput.value = d.zhuyin;
        pyInput.value = d.pinyin;
        enInput.value = d.english;
      }
      fillFromCurrent();

      function onEdit() {
        tok.override = { zhuyin: zyInput.value, pinyin: pyInput.value, english: enInput.value };
        updateLine4();
      }
      zyInput.addEventListener("input", onEdit);
      pyInput.addEventListener("input", onEdit);
      enInput.addEventListener("input", onEdit);

      if (tok.entries.length > 1) {
        const sel = document.createElement("select");
        tok.entries.forEach((e, idx) => {
          const opt = document.createElement("option");
          const p = E.effectivePinyin(e).split(" ").map(E.toToneMarkPinyin).join(" ");
          opt.value = idx;
          opt.textContent = `${p} - ${shortGloss(e.e)}`;
          if (idx === tok.chosen) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener("change", () => {
          tok.chosen = parseInt(sel.value, 10);
          tok.override = null; // switching dictionary sense starts fresh
          fillFromCurrent();
          updateLine4();
        });
        pyWrap.appendChild(sel);
      }
      pyWrap.appendChild(pyInput);
      tdPy.appendChild(pyWrap);
      tdZy.appendChild(zyInput);
      tdEn.appendChild(enInput);
      tr.append(tdHz, tdZy, tdPy, tdEn);
      breakdownBody.appendChild(tr);
    });
  }

  function analyze() {
    if (!dict) { setStatus("字典還在載入中，請稍等…"); return; }
    const text = input.value.trim();
    if (!text) { setStatus("請先輸入中文"); return; }
    tokens = buildTokens(text);
    renderBreakdown();
    updateLine4();
    setStatus("完成！共 " + tokens.length + " 個字/詞/符號。");
  }

  document.getElementById("analyzeBtn").addEventListener("click", analyze);
  sandhiToggle.addEventListener("change", updateLine4);

  let debounceTimer = null;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(analyze, 500);
  });

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* ignore */ }
    document.body.removeChild(ta);
  }

  document.querySelectorAll(".copybtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.copy);
      const text = btn.dataset.copyValue ? target.value : target.innerText;
      copyText(text).then(() => {
        btn.textContent = "已複製！";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = "複製"; btn.classList.remove("copied"); }, 1500);
      });
    });
  });

  function bindCombinedCopy(btnId, buildLines) {
    document.getElementById(btnId).addEventListener("click", () => {
      copyText(buildLines().join("\n")).then(() => {
        const btn = document.getElementById(btnId);
        const orig = btn.textContent;
        btn.textContent = "已複製！";
        setTimeout(() => { btn.textContent = orig; }, 1500);
      });
    });
  }

  bindCombinedCopy("copy4Btn", () => {
    const lines = [line4zh.textContent, line4zy.value, line4py.value];
    if (line4en.value.trim()) lines.push(line4en.value.trim());
    return lines;
  });

  bindCombinedCopy("copy3Btn", () => {
    const lines = [line4zh.textContent, line4py.value];
    if (line4en.value.trim()) lines.push(line4en.value.trim());
    return lines;
  });

  // --- US / NZ (British-style) spelling toggle for the English line ---
  const US_TO_NZ = {
    color: "colour", colors: "colours", colored: "coloured", coloring: "colouring",
    favorite: "favourite", favorites: "favourites", favor: "favour", favors: "favours", favored: "favoured",
    honor: "honour", honors: "honours", honored: "honoured", honoring: "honouring",
    humor: "humour", humorous: "humourous", labor: "labour", labored: "laboured",
    neighbor: "neighbour", neighbors: "neighbours", neighborhood: "neighbourhood",
    behavior: "behaviour", behaviors: "behaviours", flavor: "flavour", flavors: "flavours",
    rumor: "rumour", rumors: "rumours", vigor: "vigour", valor: "valour", armor: "armour",
    realize: "realise", realized: "realised", realizes: "realises", realizing: "realising",
    organize: "organise", organized: "organised", organizes: "organises", organizing: "organising",
    organization: "organisation", organizations: "organisations",
    recognize: "recognise", recognized: "recognised", recognizes: "recognises", recognizing: "recognising",
    apologize: "apologise", apologized: "apologised", apologizes: "apologises", apologizing: "apologising",
    analyze: "analyse", analyzed: "analysed", analyzes: "analyses", analyzing: "analysing",
    center: "centre", centers: "centres", centered: "centred",
    theater: "theatre", theaters: "theatres", liter: "litre", liters: "litres", meter: "metre", meters: "metres",
    traveling: "travelling", traveled: "travelled", traveler: "traveller", travelers: "travellers",
    canceled: "cancelled", canceling: "cancelling", modeling: "modelling", modeled: "modelled",
    labeled: "labelled", labeling: "labelling",
    gray: "grey", grays: "greys",
    defense: "defence", offense: "offence", license: "licence", pretense: "pretence",
    tire: "tyre", tires: "tyres", curb: "kerb", aluminum: "aluminium",
    math: "maths", mom: "mum", moms: "mums",
    airplane: "aeroplane", apartment: "flat", cookie: "biscuit", cookies: "biscuits",
    vacation: "holiday", vacations: "holidays", candy: "sweets", sidewalk: "pavement",
    gasoline: "petrol", soccer: "football", pajamas: "pyjamas", diaper: "nappy", diapers: "nappies",
  };
  const NZ_TO_US = Object.fromEntries(Object.entries(US_TO_NZ).map(([a, b]) => [b, a]));

  function matchCase(sample, word) {
    if (sample === sample.toUpperCase()) return word.toUpperCase();
    if (sample[0] === sample[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
    return word;
  }

  function convertSpelling(text, map) {
    return text.replace(/[A-Za-z]+/g, (word) => {
      const hit = map[word.toLowerCase()];
      return hit ? matchCase(word, hit) : word;
    });
  }

  document.getElementById("toNzBtn").addEventListener("click", () => {
    line4en.value = convertSpelling(line4en.value, US_TO_NZ);
  });
  document.getElementById("toUsBtn").addEventListener("click", () => {
    line4en.value = convertSpelling(line4en.value, NZ_TO_US);
  });

  document.getElementById("copyListBtn").addEventListener("click", () => {
    const lines = [];
    tokens.forEach((tok) => {
      if (!tok.entries) return;
      const d = currentDisplay(tok);
      lines.push(`${tok.hanzi}(${d.zhuyin})(${d.pinyin})-${shortGloss(d.english)}`);
    });
    copyText(lines.join("\n")).then(() => {
      const btn = document.getElementById("copyListBtn");
      const orig = btn.textContent;
      btn.textContent = "已複製！";
      setTimeout(() => { btn.textContent = orig; }, 1500);
    });
  });
})();
