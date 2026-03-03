/**
 * state.js — ゲーム状態管理
 */

const GameState = {
  playerFamilyName: "",       // 苗字
  playerGivenName:  "主人公", // 名前
  playerName:       "主人公", // 後方互換用（名前と同値）

  affection: {
    perfect:   0,
    cool:      0,
    error:     0,
    childhood: 0
  },

  socialCredit: 50,

  flags: {
    met_perfect:   false,
    met_cool:      false,
    met_error:     false,
    met_childhood: false,
    route_locked:  null
  },

  currentScene:    "pro_000",
  currentScenario: "prologue",

  get(key)        { return this.flags[key]; },
  set(key, value) { this.flags[key] = value; },

  addAffection(id, val) {
    if (!(id in this.affection)) return;
    this.affection[id] = Math.max(0, Math.min(100, this.affection[id] + val));
  },

  addSocial(val) {
    this.socialCredit = Math.max(0, Math.min(100, this.socialCredit + val));
  },

  toJSON() {
    return {
      playerFamilyName: this.playerFamilyName,
      playerGivenName:  this.playerGivenName,
      playerName:       this.playerGivenName,
      affection:        { ...this.affection },
      socialCredit:     this.socialCredit,
      flags:            { ...this.flags },
      currentScene:     this.currentScene,
      currentScenario:  this.currentScenario
    };
  },

  fromJSON(data) {
    this.playerFamilyName = data.playerFamilyName ?? "";
    this.playerGivenName  = data.playerGivenName  ?? data.playerName ?? "主人公";
    this.playerName       = this.playerGivenName;
    this.affection        = { ...this.affection, ...data.affection };
    this.socialCredit     = data.socialCredit ?? 50;
    this.flags            = { ...this.flags,   ...data.flags };
    this.currentScene     = data.currentScene  ?? "pro_000";
    this.currentScenario  = data.currentScenario ?? "prologue";
  },

  reset() {
    this.playerFamilyName = "";
    this.playerGivenName  = "主人公";
    this.playerName       = "主人公";
    this.affection        = { perfect: 0, cool: 0, error: 0, childhood: 0 };
    this.socialCredit     = 50;
    this.flags = {
      met_perfect:   false,
      met_cool:      false,
      met_error:     false,
      met_childhood: false,
      route_locked:  null
    };
    this.currentScene    = "pro_000";
    this.currentScenario = "prologue";
  }
};
