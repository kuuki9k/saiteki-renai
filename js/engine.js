/**
 * engine.js — ゲームエンジンコア
 * シーン制御・選択肢処理・変数管理を担当
 */

class GameEngine {
  constructor(state, renderer) {
    this.state    = state;
    this.renderer = renderer;

    this._scenes      = {};   // { sceneId: sceneObject }
    this._currentScene = null;
    this._waiting     = false; // クリック待ち中か
    this._onClickNext = null;  // クリック時のコールバック

    // シナリオキャッシュ（ファイル名 → Promise）
    this._scenarioCache = {};

    // 統合クリックハンドラー
    // ・タイプライター中  → 全文即表示（まだ進まない）
    // ・テキスト表示済み → 次シーンへ進む
    const handleInput = () => {
      // ログ画面が開いている間は入力を無視
      if (document.getElementById("log-screen")?.classList.contains("visible")) return;
      if (this.renderer.isTyping) {
        this.renderer.skipTypewriter(); // 全文表示のみ、進まない
        return;
      }
      this._handleClick();             // 次シーンへ
    };

    document.getElementById("text-box").addEventListener("click", handleInput);
    // スチル全面表示時など text-box が非表示でもクリックを受け取るためコンテナ全体に追加
    document.getElementById("game-container").addEventListener("click", (e) => {
      // ボタン・入力欄・HUD・各種画面のクリックは除外
      if (e.target.closest("button, input, #hud-box, #save-screen, #log-screen, #name-input-panel")) return;
      // text-box クリックはすでに上のハンドラーが処理するので二重発火を防ぐ
      if (e.target.closest("#text-box")) return;
      handleInput();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") handleInput();
    });
  }

  _handleClick() {
    if (this._waiting && this._onClickNext) {
      this._waiting = false;
      const cb = this._onClickNext;
      this._onClickNext = null;
      cb();
    }
  }

  // ========== シナリオ読み込み ==========

  async loadScenario(scenarioPath) {
    if (this._scenarioCache[scenarioPath]) {
      return this._scenarioCache[scenarioPath];
    }

    const promise = fetch(scenarioPath)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${scenarioPath}`);
        return res.json();
      })
      .then(scenes => {
        scenes.forEach(scene => {
          this._scenes[scene.id] = scene;
        });
        return scenes;
      });

    this._scenarioCache[scenarioPath] = promise;
    return promise;
  }

  // シーンIDからシナリオファイルを推定してロード
  async _ensureSceneLoaded(sceneId) {
    if (this._scenes[sceneId]) return;

    // シーンIDのプレフィックスからファイルを推定
    const prefix = sceneId.split("_")[0];
    const fileMap = {
      "pro":      "scenario/第0章/prologue.json",
      "common":   "scenario/第1章/common.json",
      "perfect":  "scenario/玲央ルート/scenes.json",
      "cool":     "scenario/湊ルート/scenes.json",
      "error":    "scenario/朔ルート/scenes.json",
      "childhood":"scenario/悠真ルート/scenes.json"
    };
    const filePath = fileMap[prefix];
    if (!filePath) {
      console.warn(`Unknown scene prefix: ${prefix} (id: ${sceneId})`);
      return;
    }
    await this.loadScenario(filePath);
  }

  // ========== シーン遷移 ==========

  async jumpToScene(sceneId) {
    await this._ensureSceneLoaded(sceneId);

    const scene = this._scenes[sceneId];
    if (!scene) {
      console.error(`Scene not found: ${sceneId}`);
      this.renderer.showMessage(`シーン "${sceneId}" が見つかりません`);
      return;
    }

    // 条件チェック（このシーン自体が表示可能か）
    if (scene.conditions && !this.checkCondition(scene.conditions)) {
      // 条件を満たさない場合は auto_next へ
      if (scene.auto_next) await this.jumpToScene(scene.auto_next);
      return;
    }

    // fade_in 付きシーンへ遷移する直前に自動で暗転（fade_out）
    if (scene.effect === "fade_in") {
      await this.renderer.applyEffect("fade_out");
    }

    this.state.currentScene = sceneId;
    this._currentScene = scene;
    await this.processScene(scene);
  }

  // ========== シーン処理 ==========

  async processScene(scene) {
    // ========== ルート自動分岐シーン ==========
    if (scene.type === "route_branch") {
      if (scene.background) this.renderer.setBackground(scene.background);
      if (scene.characters)  await this.renderer.renderCharacters(scene.characters);
      const rawText = Array.isArray(scene.text) ? scene.text.join("\n") : (scene.text ?? "");
      if (rawText) {
        await this.renderer.showText(scene.speaker, rawText);
        await this._waitForClick();
      }
      const routeId = this._computeRoute();
      await this.jumpToScene(routeId);
      return;
    }

    // ========== 名前入力シーン ==========
    if (scene.type === "name_input") {
      if (scene.background) this.renderer.setBackground(scene.background);
      if (scene.effect === "fade_in") await this.renderer.applyEffect("fade_in");
      const { familyName, givenName } = await this.renderer.showNameInputScene(scene);
      this.state.playerFamilyName = familyName;
      this.state.playerGivenName  = givenName;
      this.state.playerName       = givenName;
      this.renderer.updateHUD(this.state);
      if (scene.auto_next) await this.jumpToScene(scene.auto_next);
      return;
    }

    // 1. 背景設定
    if (scene.background) {
      this.renderer.setBackground(scene.background);
    }

    // 2. 演出（前）
    if (scene.effect === "fade_in") {
      // 暗転中（overlay不透明）に前シーンの立ち絵・テキストをクリアしてからフェードイン
      this.renderer.hideAllCharacters();
      this.renderer.clearScreen();
      await this.renderer.applyEffect("fade_in");
    } else if (scene.effect === "shake" || scene.effect === "flash") {
      await this.renderer.applyEffect(scene.effect);
    }

    // 3. キャラクター表示
    if (scene.characters) {
      await this.renderer.renderCharacters(scene.characters);
    }

    // 4. テキスト表示（セリフと地の文を自動分割して順番に表示）
    const rawText = Array.isArray(scene.text) ? scene.text.join("\n") : (scene.text ?? "");
    const textChunks = this._splitTextByType(rawText, scene.speaker);
    for (let ci = 0; ci < textChunks.length; ci++) {
      await this.renderer.showText(textChunks[ci].speaker, textChunks[ci].text);
      if (ci < textChunks.length - 1) {
        await this._waitForClick();
      }
    }

    // 5. 演出（後）- fade_out は次シーン移行前
    const postEffect = scene.effect === "fade_out" ? "fade_out" : null;

    // 6. シーン後フラグ設定（flags_after）
    if (scene.flags_after) {
      this.applyEffects(scene.flags_after);
    }

    // 7. HUD更新
    this.renderer.updateHUD(this.state);

    // 8. 選択肢 or 自動遷移
    const validChoices = this.processChoices(scene.choices || []);

    if (validChoices.length > 0) {
      // テキスト全文表示後、クリック待ちしてから選択肢へ
      await this._waitForClick();
      // 選択肢表示
      await new Promise((resolve) => {
        this.renderer.showChoices(validChoices, async (choice) => {
          this.renderer.clearChoices();
          if (choice.effects) this.applyEffects(choice.effects);
          this.renderer.updateHUD(this.state);
          await this.jumpToScene(choice.next_scene);
          resolve();
        });
      });
    } else if (scene.auto_next) {
      // クリック待ち → 次シーンへ
      await this._waitForClick();
      if (postEffect) await this.renderer.applyEffect(postEffect);
      await this.jumpToScene(scene.auto_next);
    } else {
      // エンドシーン：テキスト表示 → クリック → テキスト消去(スチル全面) → クリック → 暗転 → タイトルへ
      await this._waitForClick();
      if (this.renderer._isStill) {
        // スチル表示中：テキストボックスを消してスチルを全面に見せ、もう一度クリック待ち
        this.renderer.clearScreen();
        await this._waitForClick();
      }
      if (postEffect) await this.renderer.applyEffect(postEffect);
      this.renderer.showEndScreen();
    }
  }

  // ========== 選択肢処理 ==========

  processChoices(choices) {
    return choices.filter(choice => {
      if (!choice.condition) return true;
      return this.checkCondition(choice.condition);
    });
  }

  // ========== エフェクト適用 ==========

  applyEffects(effects) {
    if (!effects) return;
    for (const eff of effects) {
      switch (eff.type) {
        case "affection":
          if (eff.op === "add") {
            const keyMap = {
              perfect: "perfect", cool: "cool", error: "error", childhood: "childhood"
            };
            const key = keyMap[eff.target] ?? eff.target;
            this.state.addAffection(key, eff.value);
          }
          break;

        case "social_credit":
          if (eff.op === "add") this.state.addSocial(eff.value);
          break;

        case "flag":
          if (eff.op === "set") this.state.set(eff.target, eff.value);
          break;

        default:
          console.warn(`Unknown effect type: ${eff.type}`);
      }
    }
  }

  // ========== 条件チェック ==========

  checkCondition(condition) {
    if (!condition) return true;

    let actualValue;
    switch (condition.type) {
      case "affection": {
        const keyMap = {
          perfect: "perfect", cool: "cool", error: "error", childhood: "childhood"
        };
        actualValue = this.state.affection[keyMap[condition.target] ?? condition.target] ?? 0;
        break;
      }
      case "social_credit":
        actualValue = this.state.socialCredit;
        break;
      case "flag":
        actualValue = this.state.get(condition.target);
        break;
      default:
        console.warn(`Unknown condition type: ${condition.type}`);
        return true;
    }

    switch (condition.operator) {
      case "gte": return actualValue >= condition.value;
      case "lte": return actualValue <= condition.value;
      case "gt":  return actualValue >  condition.value;
      case "lt":  return actualValue <  condition.value;
      case "eq":  return actualValue === condition.value;
      case "neq": return actualValue !== condition.value;
      default:
        console.warn(`Unknown operator: ${condition.operator}`);
        return true;
    }
  }

  // ========== ルート判定 ==========

  _computeRoute() {
    const aff = this.state.affection;
    const sc  = this.state.socialCredit;

    // 好感度1位を取得
    const ranked = Object.entries(aff).sort((a, b) => b[1] - a[1]);
    const top = ranked[0][0];

    // プランの条件に従って判定
    // 朔ルート：朔1位 または 社会信用度39以下
    if (top === "error" || sc <= 39)           return "error_000";
    // 玲央ルート：玲央1位 かつ 社会信用度60以上
    if (top === "perfect" && sc >= 60)         return "perfect_000";
    // 湊ルート：湊1位 または 社会信用度40〜69
    if (top === "cool" || (sc >= 40 && sc <= 69)) return "cool_000";
    // 悠真ルート（デフォルト）
    return "childhood_000";
  }

  // ========== セリフ／地の文 自動分割 ==========

  _splitTextByType(rawText, speaker) {
    // 話者なし（ナレーションのみ）はそのまま
    if (!speaker) return [{ speaker: null, text: rawText }];

    const lines = rawText.split("\n");
    let insideQuote = false;

    // 各行を分析：種別 と、その行の後もクォートが継続中かどうか
    const lineData = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed === "") return { type: null, endsOpen: insideQuote };

      let isDialogue;
      if (insideQuote) {
        // 前行からクォートが継続中 → セリフ
        isDialogue = true;
      } else if (trimmed.startsWith("「")) {
        // 「で始まる行：」の後ろにテキストがあれば地の文中の引用
        const lastClose = trimmed.lastIndexOf("」");
        if (lastClose === -1) {
          isDialogue = true; // 閉じ」なし → 複数行セリフの冒頭
        } else {
          const afterClose = trimmed.slice(lastClose + 1).trim();
          isDialogue = afterClose.length === 0;
        }
      } else {
        isDialogue = false;
      }

      // クォート開閉状態を更新
      const opens  = (trimmed.match(/「/g) || []).length;
      const closes = (trimmed.match(/」/g) || []).length;
      if      (opens > closes) insideQuote = true;
      else if (closes > opens) insideQuote = false;
      else if (opens > 0)      insideQuote = false; // 「…」で完結

      return { type: isDialogue ? "dialogue" : "narration", endsOpen: insideQuote };
    });

    // 空行の種別を前後から補完（前優先）
    for (let i = 0; i < lineData.length; i++) {
      if (lineData[i].type !== null) continue;
      let prev = null, next = null;
      for (let j = i - 1; j >= 0; j--)               if (lineData[j].type) { prev = lineData[j].type; break; }
      for (let j = i + 1; j < lineData.length; j++) if (lineData[j].type) { next = lineData[j].type; break; }
      lineData[i].type = prev || next || "narration";
    }

    // チャンク分割：種別変化 OR 話し手交代（セリフが閉じて新しいセリフが始まる）
    const chunks = [];
    let curType      = lineData[0].type;
    let curLines     = [lines[0]];
    let prevEndsOpen = lineData[0].endsOpen;

    for (let i = 1; i < lines.length; i++) {
      const { type, endsOpen } = lineData[i];
      const trimmed = lines[i].trim();

      let shouldSplit = false;
      if (type !== curType) {
        // 種別が変わった（セリフ⇔地の文）
        shouldSplit = true;
      } else if (type === "dialogue" && trimmed !== "" && trimmed.startsWith("「")) {
        // 同じセリフ種別でも、直前のセリフが閉じていて新しい「が始まれば話し手交代
        if (!prevEndsOpen) shouldSplit = true;
      }

      if (shouldSplit) {
        const t = curLines.join("\n").trim();
        if (t) chunks.push({ speaker: curType === "dialogue" ? speaker : null, text: t });
        curType  = type;
        curLines = [lines[i]];
      } else {
        curLines.push(lines[i]);
      }

      if (trimmed !== "") prevEndsOpen = endsOpen;
    }

    const last = curLines.join("\n").trim();
    if (last) chunks.push({ speaker: curType === "dialogue" ? speaker : null, text: last });

    return chunks.length > 0 ? chunks : [{ speaker, text: rawText }];
  }

  // ========== クリック待ち ==========

  _waitForClick() {
    return new Promise((resolve) => {
      this._waiting = true;
      this._onClickNext = resolve;
    });
  }

  // ========== ゲーム開始 ==========

  async startGame(startSceneId = "pro_000") {
    this.state.reset();
    this.renderer.clearLog();
    await this.jumpToScene(startSceneId);
  }

  // ========== ロードから再開 ==========

  async resumeGame(savedState) {
    this.state.fromJSON(savedState);
    const sceneId = savedState.currentScene ?? "pro_001";
    await this.jumpToScene(sceneId);
  }
}
