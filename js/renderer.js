/**
 * renderer.js — DOM描画モジュール
 * テキスト・立ち絵・背景・選択肢・HUDの描画を担当
 */

class Renderer {
  constructor() {
    // DOM要素の参照
    this.bgLayer       = document.getElementById("bg-layer");
    this.charLeft      = document.getElementById("char-left");
    this.charCenter    = document.getElementById("char-center");
    this.charRight     = document.getElementById("char-right");
    this.textBox       = document.getElementById("text-box");
    this.speakerName   = document.getElementById("speaker-name");
    this.dialogueText  = document.getElementById("dialogue-text");
    this.choicesBox    = document.getElementById("choices-box");
    this.hudBox        = document.getElementById("hud-box");
    this.overlay       = document.getElementById("overlay");

    this._typewriterTimer = null;
    this._isTyping = false;
    this._fullText = "";
    this._fullHTML  = "";
    this._isStill  = false; // スチル表示中フラグ
    // 会話ログ
    this._log = [];
    // ※ クリックハンドラーは engine.js 側で一元管理
  }

  // タイプライター中かどうか（engine から参照）
  get isTyping() { return this._isTyping; }

  // タイプライターを即完了させる（engine から呼ばれる）
  skipTypewriter() { this._skipTypewriter(); }

  // ========== 背景 ==========

  setBackground(bgKey) {
    // スマホ縦画面判定（CSSのメディアクエリと同じ条件）
    const isPortrait = window.innerWidth <= 767 && window.innerWidth < window.innerHeight;
    const stillDir = isPortrait ? "イラスト/縦画面スチル" : "イラスト/スチル";

    const stillMap = {
      "still_reo_true":    `${stillDir}/玲央trueend.jpg`,
      "still_reo_happy":   `${stillDir}/玲央happyend.jpg`,
      "still_reo_normal":  `${stillDir}/玲央normalend.jpg`,
      "still_cool_true":   `${stillDir}/湊trueend.jpg`,
      "still_cool_happy":  `${stillDir}/湊happyend.jpg`,
      "still_cool_bitter": `${stillDir}/湊bitterend.jpg`,
      "still_error_true":  `${stillDir}/朔trueend.jpg`,
      "still_error_secret":`${stillDir}/朔secretend.jpg`,
      "still_error_bad":   `${stillDir}/朔badend.jpg`,
      "still_yuma_true":   `${stillDir}/悠真trueend.jpg`,
      "still_yuma_happy":  `${stillDir}/悠真happyend.jpg`,
      "still_yuma_friend": `${stillDir}/悠真friendshipend.jpg`,
    };

    if (bgKey === "bg_main") {
      this._isStill = false;
      this.bgLayer.style.backgroundImage = "url('イラスト/背景.png')";
      this.bgLayer.style.backgroundSize  = "cover";
      this.bgLayer.style.backgroundPosition = "center";
    } else if (stillMap[bgKey]) {
      this._isStill = true;
      this.hideAllCharacters();
      this.bgLayer.style.backgroundImage = `url('${stillMap[bgKey]}')`;
      this.bgLayer.style.backgroundSize  = "cover";
      this.bgLayer.style.backgroundPosition = "center";
    } else {
      this._isStill = false;
      // フォールバック：CSSグラデーション（夜明けの都市）
      this.bgLayer.style.backgroundImage =
        "linear-gradient(180deg, #0d0d2b 0%, #1a1a4e 40%, #2d1b4e 70%, #3d1a2e 100%)";
    }
  }

  // ========== 立ち絵 ==========

  async showCharacter(slot) {
    const { character_id, sprite, position, visible = true } = slot;

    const el = this._getCharEl(position);
    if (!el) return;

    if (!visible || !character_id) {
      el.style.opacity = "0";
      el.style.visibility = "hidden";
      el.innerHTML = "";
      return;
    }

    // characters.json からスプライトパスを取得
    const charData = window.CHARACTERS?.[character_id];
    if (!charData) return;

    const spritePath = charData.sprites?.[sprite] ?? charData.sprites?.normal;
    if (!spritePath) return;

    // 切り抜き済み PNG を <img> で直接表示（Canvas BFS 不要）
    el.innerHTML = "";
    const img = new Image();
    img.src = spritePath;
    img.alt = charData.name;
    img.style.cssText = "max-width:100%;max-height:100%;object-fit:contain;filter:drop-shadow(0 8px 24px rgba(0,0,0,0.6));";
    img.onerror = () => {
      console.warn(`Sprite load failed: ${spritePath}`);
      el.innerHTML = `<div class="char-fallback">${charData.name}</div>`;
    };
    el.appendChild(img);
    el.style.opacity    = "1";
    el.style.visibility = "visible";
  }

  hideAllCharacters() {
    for (const pos of ["left", "center", "right"]) {
      const el = this._getCharEl(pos);
      if (el) {
        el.style.opacity    = "0";
        el.style.visibility = "hidden";
        el.innerHTML = "";
      }
    }
  }

  async renderCharacters(charSlots) {
    // スチル表示中は立ち絵をすべて非表示
    if (this._isStill) {
      this.hideAllCharacters();
      return;
    }
    // 今フレームで表示しないポジションを消す（visible 未指定は表示扱い）
    const shown = new Set(charSlots.filter(s => s.visible !== false).map(s => s.position));
    for (const pos of ["left", "center", "right"]) {
      if (!shown.has(pos)) {
        const el = this._getCharEl(pos);
        if (el) {
          el.style.opacity    = "0";
          el.style.visibility = "hidden";
          el.innerHTML = "";
        }
      }
    }
    // 表示するキャラを描画
    await Promise.all(charSlots.map(slot => this.showCharacter(slot)));
  }

  _getCharEl(position) {
    switch (position) {
      case "left":   return this.charLeft;
      case "center": return this.charCenter;
      case "right":  return this.charRight;
      default:       return null;
    }
  }

  // ========== テキスト ==========

  showText(speaker, text) {
    // プレイヤー名プレースホルダーを置換
    const fn = GameState?.playerFamilyName ?? "";
    const gn = GameState?.playerGivenName  ?? GameState?.playerName ?? "主人公";
    text = text
      .replace(/\{playerLastName\}/g, fn)
      .replace(/\{playerName\}/g,     gn)
      .replace(/\{playerFullName\}/g, fn ? `${fn} ${gn}` : gn);

    return new Promise((resolve) => {
      let spkHTML  = null;
      let spkColor = null;

      // 話者名（ルビ記法対応）
      if (speaker) {
        const spkSegs = this._parseRuby(speaker);
        spkHTML = this._buildPartialHTML(spkSegs, Infinity);
        this.speakerName.innerHTML = spkHTML;
        this.speakerName.style.display = "block";

        // ルビ記法を除いた素の名前でキャラ色を照合
        const plainSpeaker = speaker.replace(/\{([^|{}]+)\|[^|{}]+\}/g, "$1");
        if (plainSpeaker === "FATES SYSTEM") {
          spkColor = "#00d4ff";
        } else {
          const charEntry = Object.values(window.CHARACTERS || {})
            .find(c => c.name === plainSpeaker);
          spkColor = charEntry?.nameColor ?? "#fff";
        }
        this.speakerName.style.color = spkColor;
      } else {
        this.speakerName.style.display = "none";
      }

      // テキストボックスを表示
      this.textBox.style.display = "block";
      this.choicesBox.innerHTML  = "";
      this.choicesBox.style.display = "none";

      // タイプライターエフェクト（_fullHTML はここで同期的にセットされる）
      this._startTypewriter(text, resolve);

      // ログに追記（地の文・セリフともに記録）
      if (this._fullHTML && this._fullHTML.trim()) {
        this._log.push({ spkHTML, spkColor, textHTML: this._fullHTML });
      }
    });
  }

  // 画面上のテキスト・選択肢をクリア（暗転中に呼ぶ）
  clearScreen() {
    this.textBox.style.display    = "none";
    this.speakerName.innerHTML    = "";
    this.dialogueText.innerHTML   = "";
    this.choicesBox.innerHTML     = "";
    this.choicesBox.style.display = "none";
  }

  // ログ取得
  getLog() { return this._log; }

  // ログクリア（新規ゲーム開始時）
  clearLog() { this._log = []; }

  _startTypewriter(text, onComplete) {
    if (this._typewriterTimer) clearTimeout(this._typewriterTimer);
    this._isTyping   = true;
    this._fullText   = text;
    this._onComplete = onComplete;

    const segments   = this._parseRuby(text);
    const totalChars = segments.reduce((n, s) => n + [...s.text].length, 0);
    this._fullHTML   = this._buildPartialHTML(segments, Infinity);

    this.dialogueText.innerHTML = "";
    let idx = 0;
    const SPEED = 40;

    const tick = () => {
      if (idx >= totalChars) {
        this._isTyping = false;
        this.dialogueText.innerHTML = this._fullHTML;
        onComplete();
        return;
      }
      idx++;
      this.dialogueText.innerHTML = this._buildPartialHTML(segments, idx);
      this._typewriterTimer = setTimeout(tick, SPEED);
    };
    tick();
  }

  _skipTypewriter() {
    if (!this._isTyping) return;
    clearTimeout(this._typewriterTimer);
    this._isTyping = false;
    this.dialogueText.innerHTML = this._fullHTML ?? "";
    if (this._onComplete) this._onComplete();
  }

  // ========== ルビ記法ヘルパー ==========

  // {語|よみ} 記法をセグメント配列に解析
  _parseRuby(text) {
    const segments = [];
    const regex    = /\{([^|{}]+)\|([^|{}]+)\}/g;
    let lastIdx    = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        segments.push({ text: text.slice(lastIdx, match.index), ruby: null });
      }
      segments.push({ text: match[1], ruby: match[2] });
      lastIdx = regex.lastIndex;
    }
    if (lastIdx < text.length) {
      segments.push({ text: text.slice(lastIdx), ruby: null });
    }
    return segments;
  }

  // charCount 文字分の HTML を構築（Infinity で全文）
  _buildPartialHTML(segments, charCount) {
    let html      = "";
    let remaining = charCount;
    for (const seg of segments) {
      if (remaining <= 0) break;
      const chars        = [...seg.text];
      const visibleCount = Math.min(chars.length, remaining);
      const visible      = chars.slice(0, visibleCount).join("");
      remaining -= visibleCount;
      if (seg.ruby) {
        if (visibleCount === chars.length) {
          // 単語全体が表示済み → ルビ付き
          html += `<ruby>${this._escapeHTML(seg.text)}<rt>${this._escapeHTML(seg.ruby)}</rt></ruby>`;
        } else {
          // 途中まで → ルビなしで先行表示
          html += this._escapeHTML(visible);
        }
      } else {
        html += this._escapeHTML(visible).replace(/\n/g, "<br>");
      }
    }
    return html;
  }

  _escapeHTML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // ========== 選択肢 ==========

  showChoices(choices, onSelect) {
    this.textBox.style.display    = "none";
    this.choicesBox.style.display = "flex";
    this.choicesBox.innerHTML = "";

    choices.forEach((choice, i) => {
      const btn = document.createElement("button");
      btn.className    = "choice-btn";
      btn.textContent  = choice.label;
      btn.addEventListener("click", () => {
        btn.classList.add("selected");
        onSelect(choice, i);
      });
      this.choicesBox.appendChild(btn);
    });
  }

  clearChoices() {
    this.choicesBox.innerHTML = "";
    this.choicesBox.style.display = "none";
  }

  // エンド後にタイトルへ戻るボタンを表示
  showEndScreen() {
    this.textBox.style.display    = "none";
    this.choicesBox.innerHTML     = "";
    this.choicesBox.style.display = "flex";

    const btn = document.createElement("button");
    btn.className   = "choice-btn";
    btn.textContent = "タイトルへ戻る";
    btn.addEventListener("click", () => {
      this.choicesBox.innerHTML     = "";
      this.choicesBox.style.display = "none";
      // overlay をリセット（暗転したままの場合に備えて）
      this.overlay.style.transition = "none";
      this.overlay.style.opacity    = "0";
      if (typeof showTitle === "function") showTitle();
    });
    this.choicesBox.appendChild(btn);
  }

  // ========== 演出 ==========

  applyEffect(effectTag) {
    if (!effectTag) return Promise.resolve();

    return new Promise((resolve) => {
      switch (effectTag) {
        case "fade_in":
          this._fadeOverlay(1, 0, 600, resolve);
          break;
        case "fade_out":
          this._fadeOverlay(0, 1, 600, resolve);
          break;
        case "shake":
          this._shakeScreen(resolve);
          break;
        case "flash":
          this._flashScreen(resolve);
          break;
        default:
          resolve();
      }
    });
  }

  _fadeOverlay(from, to, duration, cb) {
    this.overlay.style.opacity    = from;
    this.overlay.style.transition = `opacity ${duration}ms`;
    requestAnimationFrame(() => {
      this.overlay.style.opacity = to;
      setTimeout(cb, duration + 50);
    });
  }

  _shakeScreen(cb) {
    const el = document.getElementById("game-container");
    el.classList.add("shake");
    setTimeout(() => { el.classList.remove("shake"); cb(); }, 500);
  }

  _flashScreen(cb) {
    this.overlay.style.opacity    = 1;
    this.overlay.style.background = "#fff";
    this.overlay.style.transition = "opacity 150ms";
    setTimeout(() => {
      this.overlay.style.opacity = 0;
      setTimeout(() => {
        this.overlay.style.background = "#000";
        cb();
      }, 200);
    }, 150);
  }

  // ========== HUD ==========

  updateHUD(state) {
    const aff = state.affection;
    const sc  = state.socialCredit;

    const charNames = {
      perfect:   "玲央",
      cool:      "湊",
      error:     "朔",
      childhood: "悠真"
    };

    const hearts = (val) => {
      const filled = Math.round(val / 20);
      return "♥".repeat(filled) + "♡".repeat(5 - filled);
    };

    this.hudBox.innerHTML = `
      <div class="hud-row">
        ${Object.entries(aff).map(([key, val]) =>
          `<span class="hud-char" data-char="${key}">${charNames[key]} ${hearts(val)}</span>`
        ).join("")}
      </div>
      <div class="hud-social">
        社会信用度 <span class="hud-social-bar">
          <span class="hud-social-fill" style="width:${sc}%"></span>
        </span> ${sc}
      </div>
    `;
  }

  // ========== メッセージ ==========

  showMessage(msg) {
    const el = document.createElement("div");
    el.className   = "toast-message";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
  }

  // ========== 名前入力シーン（FATESターミナル演出）==========

  showNameInputScene(scene) {
    this.textBox.style.display    = "none";
    this.choicesBox.style.display = "none";

    return new Promise((resolve) => {
      const panel = document.createElement("div");
      panel.id = "name-input-panel";
      panel.innerHTML = `
        <div class="fates-terminal">
          <div class="fates-terminal-header">
            <span class="fates-sys-label">FATES SYSTEM</span>
            <span class="fates-version">ver. 4.2.1 ─ 第三支部</span>
          </div>
          <div class="fates-scan-text" id="fates-scan-msg">来訪者プロフィール解析中…</div>
          <div class="fates-progress-track">
            <div class="fates-progress-fill" id="fates-pg-fill"></div>
          </div>
          <div class="fates-scan-detail" id="fates-scan-detail">氏名データベース照合中</div>
          <div class="fates-form" id="fates-form">
            <div class="fates-confirmed">✓ 解析完了 ─ プロフィールを確認・修正してください</div>
            <div class="name-fields">
              <div class="name-field-wrap">
                <div class="name-field-label">苗　字</div>
                <input class="name-input-field" id="ni-family" type="text"
                       maxlength="6" placeholder="山田" autocomplete="off">
              </div>
              <div class="name-field-sep">　</div>
              <div class="name-field-wrap">
                <div class="name-field-label">名　前</div>
                <input class="name-input-field" id="ni-given" type="text"
                       maxlength="6" placeholder="花子" autocomplete="off">
              </div>
            </div>
            <div class="name-input-hint">各6文字まで　／　苗字 → Tab → 名前 → Enter で決定</div>
            <button class="name-input-btn" id="ni-confirm-btn">登　録</button>
          </div>
        </div>
      `;
      document.getElementById("game-container").appendChild(panel);

      // Phase 1: プログレスバーアニメ開始（次フレームで幅をセット）
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.getElementById("fates-pg-fill").style.width = "100%";
        });
      });

      // Phase 2: 1.5秒後「解析完了」表示
      setTimeout(() => {
        const msg    = document.getElementById("fates-scan-msg");
        const detail = document.getElementById("fates-scan-detail");
        if (msg)    { msg.textContent = "解析完了 / PROFILE CONFIRMED"; msg.classList.add("completed"); }
        if (detail) { detail.style.animation = "none"; detail.style.opacity = "0"; }
      }, 1500);

      // Phase 3: 2.0秒後フォーム表示
      setTimeout(() => {
        const form = document.getElementById("fates-form");
        if (!form) return;
        form.classList.add("visible");

        // 既存値があれば初期表示
        const savedFamily = GameState?.playerFamilyName ?? "";
        const savedGiven  = GameState?.playerGivenName  ?? "";
        const niFamily = document.getElementById("ni-family");
        const niGiven  = document.getElementById("ni-given");
        if (niFamily) niFamily.value = savedFamily;
        if (niGiven)  niGiven.value  = (savedGiven !== "主人公") ? savedGiven : "";
        if (niFamily) niFamily.focus();
      }, 2000);

      // 確定処理
      const confirm = () => {
        const familyName = (document.getElementById("ni-family")?.value.trim()) || "山田";
        const givenName  = (document.getElementById("ni-given")?.value.trim())  || "花子";
        panel.remove();
        resolve({ familyName, givenName });
      };

      // ボタンクリック
      setTimeout(() => {
        document.getElementById("ni-confirm-btn")
          ?.addEventListener("click", confirm);
      }, 2000); // フォーム表示後のみ有効

      // Tab でフィールド移動、Enter で確定
      document.addEventListener("keydown", function handler(e) {
        const form = document.getElementById("fates-form");
        if (!form || !form.classList.contains("visible")) return;
        if (e.key === "Enter") {
          document.removeEventListener("keydown", handler);
          confirm();
        }
      });
    });
  }

  // ========== タイトル画面 ==========

  showTitleScreen() {
    this.hideAllCharacters();
    this.clearChoices();
    this.textBox.style.display = "none";
    this.setBackground("bg_main");
  }
}
