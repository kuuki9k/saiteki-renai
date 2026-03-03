/**
 * sprite.js — スプライト背景除去モジュール
 * Canvas APIを使ってイラストの背景を透明化する
 */

const SpriteLoader = (() => {
  const _cache = new Map();

  function _loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });
  }

  // 四隅（5×5px）の平均色を背景色としてサンプリング
  function _sampleCornerColor(data, width, height) {
    const corners = [
      [0, 0], [width - 5, 0],
      [0, height - 5], [width - 5, height - 5]
    ];
    let r = 0, g = 0, b = 0, count = 0;

    for (const [cx, cy] of corners) {
      for (let dy = 0; dy < 5; dy++) {
        for (let dx = 0; dx < 5; dx++) {
          const px = cx + dx;
          const py = cy + dy;
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
      }
    }
    return { r: r / count, g: g / count, b: b / count };
  }

  // BFSフラッドフィルで背景ピクセルを透明化
  function _floodFillRemove(imageData, bgColor, tolerance) {
    const { width, height, data } = imageData;
    const visited = new Uint8Array(width * height);

    function colorDist(idx) {
      const dr = data[idx]     - bgColor.r;
      const dg = data[idx + 1] - bgColor.g;
      const db = data[idx + 2] - bgColor.b;
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }

    function makeTransparent(idx) {
      data[idx + 3] = 0;
    }

    const queue = [];

    // 四辺の全ピクセルをシードとして追加
    for (let x = 0; x < width; x++) {
      queue.push(x, 0);
      queue.push(x, height - 1);
    }
    for (let y = 1; y < height - 1; y++) {
      queue.push(0, y);
      queue.push(width - 1, y);
    }

    let qi = 0;
    while (qi < queue.length) {
      const x = queue[qi++];
      const y = queue[qi++];

      if (x < 0 || x >= width || y < 0 || y >= height) continue;
      const pos = y * width + x;
      if (visited[pos]) continue;
      visited[pos] = 1;

      const idx = pos * 4;
      if (data[idx + 3] === 0) continue; // すでに透明
      if (colorDist(idx) > tolerance) continue;

      makeTransparent(idx);

      queue.push(x + 1, y);
      queue.push(x - 1, y);
      queue.push(x, y + 1);
      queue.push(x, y - 1);
    }
  }

  // エッジのギザギザを柔らかくするアルファフェード
  function _smoothEdges(imageData) {
    const { width, height, data } = imageData;
    const copy = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = (y * width + x) * 4;
        if (copy[idx + 3] === 0) continue;

        // 周囲8ピクセルの透明ピクセル数をカウント
        let transparentCount = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nidx = ((y + dy) * width + (x + dx)) * 4;
            if (copy[nidx + 3] === 0) transparentCount++;
          }
        }

        // エッジピクセル（隣に透明がある）はアルファを下げる
        if (transparentCount > 0) {
          data[idx + 3] = Math.round(255 * (1 - transparentCount / 12));
        }
      }
    }
  }

  /**
   * 背景を除去したスプライトcanvasを返す（キャッシュ付き）
   * @param {string} path - 画像パス
   * @param {number} tolerance - 背景色の許容距離（デフォルト45）
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function loadSpriteWithBGRemoval(path, tolerance = 45) {
    if (_cache.has(path)) return _cache.get(path);

    const img = await _loadImage(path);
    const canvas = document.createElement("canvas");
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bgColor   = _sampleCornerColor(imageData.data, canvas.width, canvas.height);

    _floodFillRemove(imageData, bgColor, tolerance);
    _smoothEdges(imageData);

    ctx.putImageData(imageData, 0, 0);

    _cache.set(path, canvas);
    return canvas;
  }

  /**
   * キャッシュをクリア
   */
  function clearCache() {
    _cache.clear();
  }

  return { loadSpriteWithBGRemoval, clearCache };
})();
