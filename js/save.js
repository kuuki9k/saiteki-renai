/**
 * save.js — セーブ/ロード（localStorage）
 */

const SaveManager = (() => {
  const SAVE_PREFIX = "fates_save_";
  const MAX_SLOTS   = 3;

  function _key(slot) {
    return `${SAVE_PREFIX}slot${slot}`;
  }

  /**
   * 指定スロットへセーブ
   * @param {number} slot - 1〜MAX_SLOTS
   * @param {GameState} state
   * @returns {boolean} 成功/失敗
   */
  function save(slot, state) {
    if (slot < 1 || slot > MAX_SLOTS) return false;
    try {
      const data = {
        ...state.toJSON(),
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(_key(slot), JSON.stringify(data));
      return true;
    } catch (e) {
      console.error("Save failed:", e);
      return false;
    }
  }

  /**
   * 指定スロットからロード
   * @param {number} slot
   * @returns {object|null} セーブデータ、なければnull
   */
  function load(slot) {
    if (slot < 1 || slot > MAX_SLOTS) return null;
    try {
      const raw = localStorage.getItem(_key(slot));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error("Load failed:", e);
      return null;
    }
  }

  /**
   * 全スロットのサマリーを返す（スロット番号 → {savedAt, sceneId, playerName} or null）
   */
  function getAllSlotSummaries() {
    const summaries = {};
    for (let i = 1; i <= MAX_SLOTS; i++) {
      const data = load(i);
      if (data) {
        const family = data.playerFamilyName || "";
        const given  = data.playerGivenName  || data.playerName || "主人公";
        summaries[i] = {
          savedAt:     data.savedAt,
          sceneId:     data.currentScene ?? "?",
          playerName:  family ? `${family} ${given}` : given,
          socialCredit: data.socialCredit ?? 50
        };
      } else {
        summaries[i] = null;
      }
    }
    return summaries;
  }

  /**
   * 指定スロットを削除
   */
  function deleteSave(slot) {
    localStorage.removeItem(_key(slot));
  }

  /**
   * セーブ存在確認
   */
  function hasSave(slot) {
    return localStorage.getItem(_key(slot)) !== null;
  }

  return { save, load, getAllSlotSummaries, deleteSave, hasSave, MAX_SLOTS };
})();
