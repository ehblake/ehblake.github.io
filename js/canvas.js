/* ==========================================================================
   Infinite Tile Canvas

   Renders a grid of image tiles in two sizes (1-col: 320×480, 2-col: 680×480)
   with infinite panning in all directions via chunk-based loading.
   ========================================================================== */

(function () {
    'use strict';

    // ── Configuration ──────────────────────────────────────────────────

    const GAP = 10;                    // px between tiles
    const TILE_HEIGHT = 240;           // display height for both tile types
    const TILE_1COL_WIDTH = 160;       // narrow tile display width
    const TILE_2COL_WIDTH = 330;       // wide tile = 2 × 1col + gap (160+10+160)

    // Fixed tile dimensions — no responsive scaling
    function getTileDimensions() {
        return { h: TILE_HEIGHT, w1: TILE_1COL_WIDTH, w2: TILE_2COL_WIDTH, gap: GAP };
    }

    // ── Tile data ──────────────────────────────────────────────────────
    // Each tile has: image, size ('1col' | '2col'), and action.
    // Action can be: { type: 'link', url: '...' } or
    //                { type: 'modal', description: '...' }

    const TILES = [
        // 1col tiles (640×960 → 320×480 display)
        { image: 'images/tiles/tile-amnh-01.jpg', size: '1col', action: { type: 'modal', description: 'American Museum of Natural History' } },
        { image: 'images/tiles/tile-amnh-02.jpg', size: '1col', action: { type: 'modal', description: 'American Museum of Natural History' } },
        { image: 'images/tiles/tile-asd-01.jpg', size: '1col', action: { type: 'modal', description: 'ASD – Decoded' } },
        { image: 'images/tiles/tile-asd-02.jpg', size: '1col', action: { type: 'modal', description: 'ASD – Decoded' } },
        { image: 'images/tiles/tile-ashof-01.jpg', size: '1col', action: { type: 'modal', description: 'Australian Stockman\'s Hall of Fame' } },
        { image: 'images/tiles/tile-ashof-04.jpg', size: '1col', action: { type: 'modal', description: 'Australian Stockman\'s Hall of Fame' } },
        { image: 'images/tiles/tile-cma-01.jpg', size: '1col', action: { type: 'modal', description: 'Cleveland Museum of Art' } },
        { image: 'images/tiles/tile-cma-03.jpg', size: '1col', action: { type: 'modal', description: 'Cleveland Museum of Art' } },
        { image: 'images/tiles/tile-denny-02.jpg', size: '1col', action: { type: 'modal', description: 'Simon Denny: Mine' } },
        { image: 'images/tiles/tile-dols-01.jpg', size: '1col', action: { type: 'modal', description: 'DOLS' } },
        { image: 'images/tiles/tile-nma-02.jpg', size: '1col', action: { type: 'modal', description: 'National Museum of Australia' } },
        { image: 'images/tiles/tile-nma-04.jpg', size: '1col', action: { type: 'modal', description: 'National Museum of Australia' } },
        { image: 'images/tiles/tile-pent-01.jpg', size: '1col', action: { type: 'modal', description: 'Pentridge Prison' } },

        // 2col tiles (1320×960 → 660×480 display)
        { image: 'images/tiles/tile-aros-01.jpg', size: '2col', action: { type: 'modal', description: 'ARoS Kunstmuseum' } },
        { image: 'images/tiles/tile-aros-02.jpg', size: '2col', action: { type: 'modal', description: 'ARoS Kunstmuseum' } },
        { image: 'images/tiles/tile-aros-03.jpg', size: '2col', action: { type: 'modal', description: 'ARoS Kunstmuseum' } },
        { image: 'images/tiles/tile-aros-04.jpg', size: '2col', action: { type: 'modal', description: 'ARoS Kunstmuseum' } },
        { image: 'images/tiles/tile-asd-03.jpg', size: '2col', action: { type: 'modal', description: 'ASD – Decoded' } },
        { image: 'images/tiles/tile-ashof-02.jpg', size: '2col', action: { type: 'modal', description: 'Australian Stockman\'s Hall of Fame' } },
        { image: 'images/tiles/tile-ashof-03.jpg', size: '2col', action: { type: 'modal', description: 'Australian Stockman\'s Hall of Fame' } },
        { image: 'images/tiles/tile-cca-01.jpg', size: '2col', action: { type: 'modal', description: 'CCA' } },
        { image: 'images/tiles/tile-cma-02.jpg', size: '2col', action: { type: 'modal', description: 'Cleveland Museum of Art' } },
        { image: 'images/tiles/tile-denny-03.jpg', size: '2col', action: { type: 'modal', description: 'Simon Denny: Mine' } },
        { image: 'images/tiles/tile-denny-10.jpg', size: '2col', action: { type: 'modal', description: 'Simon Denny: Mine' } },
        { image: 'images/tiles/tile-lib-01.jpg', size: '2col', action: { type: 'modal', description: 'MONA Library' } },
        { image: 'images/tiles/tile-midd-01.jpg', size: '2col', action: { type: 'modal', description: 'Middlebrook' } },
        { image: 'images/tiles/tile-mona-01.jpg', size: '2col', action: { type: 'modal', description: 'MONA' } },
        { image: 'images/tiles/tile-nma-01.jpg', size: '2col', action: { type: 'modal', description: 'National Museum of Australia' } },
        { image: 'images/tiles/tile-nma-03.jpg', size: '2col', action: { type: 'modal', description: 'National Museum of Australia' } },
        { image: 'images/tiles/tile-ozzy-01.jpg', size: '2col', action: { type: 'modal', description: 'The Osbournes' } },
        { image: 'images/tiles/tile-pentridge-01.jpg', size: '2col', action: { type: 'modal', description: 'Pentridge Prison' } },
    ];

    // ── Row patterns ───────────────────────────────────────────────────
    // Each pattern is an array of tile sizes for one row.
    // All patterns produce the same total width (1360px at desktop).

    // Row patterns cycle in a fixed repeating sequence across ALL chunks
    // so that rows align seamlessly at chunk boundaries.
    const ROW_SEQUENCE = [
        ['1col', '1col', '2col'],        // 160+10+160+10+340 = 680
        ['2col', '1col', '1col'],        // 340+10+160+10+160 = 680
        ['1col', '2col', '1col'],        // 160+10+340+10+160 = 680
    ];

    const ROWS_PER_CHUNK = 3;

    // ── Compute chunk pixel size ───────────────────────────────────────

    function computeChunkSize() {
        const d = getTileDimensions();
        // Row content width: e.g. 320+20+320+20+680 = 1360
        // Add one trailing gap so adjacent chunks have proper spacing
        const chunkWidth = d.w1 + d.gap + d.w1 + d.gap + d.w2 + d.gap;
        const chunkHeight = ROWS_PER_CHUNK * (d.h + d.gap);
        return { chunkWidth, chunkHeight, dims: d };
    }

    // ── Seeded PRNG (deterministic per chunk) ──────────────────────────

    function seededRandom(seed) {
        let s = Math.abs(seed) || 1;
        return function () {
            s = (s * 16807) % 2147483647;
            return (s - 1) / 2147483646;
        };
    }

    function hashChunkCoord(cx, cy) {
        return (((cx + 1000) * 73856093) ^ ((cy + 1000) * 19349663)) >>> 0;
    }

    // ── Deterministic tile picker (no adjacent repeats) ──────────────
    //
    // Every tile slot on the infinite grid has an absolute address:
    //   absRow = cy * ROWS_PER_CHUNK + r
    //   slotCol = position within that row (0, 1, or 2)
    //   absCol  = cx * COLS_PER_CHUNK + slotCol   (unique across chunks)
    //
    // We deterministically pick a tile for (absRow, absCol) using a hash,
    // then filter out whatever was picked for the left and above neighbours.
    // Because the pick is purely based on coordinates, any chunk can
    // independently compute what any other slot chose — no shared state.

    const COLS_PER_CHUNK = 3; // every row pattern has 3 slots

    // Pre-split tiles by size for fast lookup
    const TILES_1COL = TILES.filter(function (t) { return t.size === '1col'; });
    const TILES_2COL = TILES.filter(function (t) { return t.size === '2col'; });

    function getTilePool(size) {
        return size === '2col' ? TILES_2COL : TILES_1COL;
    }

    // Get the row pattern for any absolute row
    function getPattern(absRow) {
        var idx = ((absRow % ROW_SEQUENCE.length) + ROW_SEQUENCE.length) % ROW_SEQUENCE.length;
        return ROW_SEQUENCE[idx];
    }

    // Get the tile size at a given absolute column within a row
    function getSizeAt(absRow, absCol) {
        var pattern = getPattern(absRow);
        // slotCol is the position within the 3-slot pattern
        var slotCol = ((absCol % COLS_PER_CHUNK) + COLS_PER_CHUNK) % COLS_PER_CHUNK;
        return pattern[slotCol];
    }

    // Hash an absolute slot coordinate to a deterministic number
    function hashSlot(absRow, absCol) {
        return (((absRow + 5000) * 73856093) ^ ((absCol + 5000) * 19349663)) >>> 0;
    }

    // Deterministically pick a tile for (absRow, absCol), avoiding
    // the images used by its left and above neighbours.
    // Pass excludeLeft/excludeAbove as image paths, or null.
    function pickTile(absRow, absCol, size, excludeLeft, excludeAbove) {
        var pool = getTilePool(size);
        if (pool.length === 0) return TILES[0];
        if (pool.length === 1) return pool[0];

        // Filter out neighbour images
        var filtered = pool.filter(function (t) {
            return t.image !== excludeLeft && t.image !== excludeAbove;
        });
        // Fallback: at least avoid horizontal duplicate (more noticeable)
        if (filtered.length === 0) {
            filtered = pool.filter(function (t) {
                return t.image !== excludeLeft;
            });
        }
        if (filtered.length === 0) filtered = pool;

        var hash = hashSlot(absRow, absCol);
        return filtered[hash % filtered.length];
    }

    // ── Reconstruct any tile on the grid by coordinates ──────────────
    // Walks the row left-to-right up to absCol so that each slot's
    // "left neighbour" exclusion is correctly chained. For the "above"
    // exclusion we do a single-slot lookup (no recursion).

    function getTileAt(absRow, absCol) {
        var pattern = getPattern(absRow);
        var slotCol = ((absCol % COLS_PER_CHUNK) + COLS_PER_CHUNK) % COLS_PER_CHUNK;

        // Which chunk does this absCol fall in?
        var chunkStartCol = absCol - slotCol;

        // Walk from the start of this chunk's row to the target slot
        var leftImage = null;

        // Seed leftImage from the previous chunk's last slot in this row
        if (true) {
            var prevAbsCol = chunkStartCol - 1;
            var prevSlot = ((prevAbsCol % COLS_PER_CHUNK) + COLS_PER_CHUNK) % COLS_PER_CHUNK;
            var prevSize = getSizeAt(absRow, prevAbsCol);
            var prevPool = getTilePool(prevSize);
            // Simple pick without left-exclusion (breaks the chain, but
            // one level is enough to prevent immediate duplicates)
            var prevHash = hashSlot(absRow, prevAbsCol);
            leftImage = prevPool.length > 0 ? prevPool[prevHash % prevPool.length].image : null;
        }

        var result = null;
        for (var s = 0; s <= slotCol; s++) {
            var currentAbsCol = chunkStartCol + s;
            var size = getSizeAt(absRow, currentAbsCol);
            // For above-exclusion, do a quick single lookup
            var aboveSize = getSizeAt(absRow - 1, currentAbsCol);
            var abovePool = getTilePool(aboveSize);
            var aboveHash = hashSlot(absRow - 1, currentAbsCol);
            var aboveImage = abovePool.length > 0 ? abovePool[aboveHash % abovePool.length].image : null;

            result = pickTile(absRow, currentAbsCol, size, leftImage, aboveImage);
            leftImage = result.image;
        }
        return result;
    }

    // ── Canvas state ───────────────────────────────────────────────────

    const canvasOffset = { x: 0, y: 0 };
    const grid = document.getElementById('canvas-grid');
    const container = document.getElementById('canvas-container');
    const loadedChunks = new Map();

    // ── Chunk management ───────────────────────────────────────────────

    function getVisibleChunkRange() {
        const { chunkWidth, chunkHeight } = computeChunkSize();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Which chunk coordinates are visible? Convert viewport edges
        // to world-space, then to chunk indices.  Add 1-chunk buffer.
        const worldLeft   = -canvasOffset.x;
        const worldRight  = -canvasOffset.x + vw;
        const worldTop    = -canvasOffset.y;
        const worldBottom = -canvasOffset.y + vh;

        const startCX = Math.floor(worldLeft / chunkWidth) - 1;
        const endCX   = Math.floor(worldRight / chunkWidth) + 1;
        const startCY = Math.floor(worldTop / chunkHeight) - 1;
        const endCY   = Math.floor(worldBottom / chunkHeight) + 1;

        return { startCX, endCX, startCY, endCY };
    }

    function createChunk(cx, cy) {
        const key = cx + '_' + cy;
        if (loadedChunks.has(key)) return;

        const { chunkWidth, chunkHeight, dims } = computeChunkSize();

        const chunkEl = document.createElement('div');
        chunkEl.style.cssText = 'position:absolute;left:' + (cx * chunkWidth) + 'px;top:' + (cy * chunkHeight) + 'px;width:' + chunkWidth + 'px;height:' + chunkHeight + 'px;';
        chunkEl.dataset.chunk = key;

        // Build rows — pattern is based on absolute row index so
        // horizontally adjacent chunks always use the same pattern per row
        let yPos = 0;
        for (let r = 0; r < ROWS_PER_CHUNK; r++) {
            const absRow = cy * ROWS_PER_CHUNK + r;
            // Modulo that works for negative numbers
            const patternIndex = ((absRow % ROW_SEQUENCE.length) + ROW_SEQUENCE.length) % ROW_SEQUENCE.length;
            const pattern = ROW_SEQUENCE[patternIndex];

            let xPos = 0;
            for (let c = 0; c < pattern.length; c++) {
                const tileSize = pattern[c];
                const tileW = tileSize === '2col' ? dims.w2 : dims.w1;
                const tileH = dims.h;

                // Absolute column across the infinite grid
                const absCol = cx * COLS_PER_CHUNK + c;

                // Use getTileAt which handles left + above exclusions
                const tileData = getTileAt(absRow, absCol);

                const tileEl = document.createElement('div');
                tileEl.className = 'tile';
                tileEl.style.position = 'absolute';
                tileEl.style.left = xPos + 'px';
                tileEl.style.top = yPos + 'px';
                tileEl.style.width = tileW + 'px';
                tileEl.style.height = tileH + 'px';

                const img = document.createElement('img');
                img.src = tileData.image;
                img.alt = tileData.action.description || '';
                img.width = tileW;
                img.height = tileH;
                img.loading = 'lazy';
                img.draggable = false;
                tileEl.appendChild(img);

                // Store action data
                tileEl.dataset.actionType = tileData.action.type;
                if (tileData.action.type === 'link') {
                    tileEl.dataset.url = tileData.action.url;
                } else if (tileData.action.type === 'modal') {
                    tileEl.dataset.description = tileData.action.description || '';
                    tileEl.dataset.image = tileData.image;
                }

                chunkEl.appendChild(tileEl);
                xPos += tileW + dims.gap;
            }

            yPos += dims.h + dims.gap;
        }

        grid.appendChild(chunkEl);
        loadedChunks.set(key, chunkEl);
    }

    function removeChunk(key) {
        const el = loadedChunks.get(key);
        if (el) {
            el.remove();
            loadedChunks.delete(key);
        }
    }

    function updateChunks() {
        const { startCX, endCX, startCY, endCY } = getVisibleChunkRange();

        // Add visible chunks
        for (let cy = startCY; cy <= endCY; cy++) {
            for (let cx = startCX; cx <= endCX; cx++) {
                createChunk(cx, cy);
            }
        }

        // Remove chunks far outside viewport
        for (const [key] of loadedChunks) {
            const parts = key.split('_');
            const chunkCX = parseInt(parts[0], 10);
            const chunkCY = parseInt(parts[1], 10);
            if (
                chunkCX < startCX - 2 || chunkCX > endCX + 2 ||
                chunkCY < startCY - 2 || chunkCY > endCY + 2
            ) {
                removeChunk(key);
            }
        }
    }

    function updateCanvasPosition() {
        grid.style.transform = 'translate(' + canvasOffset.x + 'px, ' + canvasOffset.y + 'px)';
        updateChunks();
    }

    // ── Center the canvas ──────────────────────────────────────────────
    // Position so that the middle of chunk (0,0) is at viewport center.

    function centerCanvas() {
        const { chunkWidth, chunkHeight } = computeChunkSize();
        canvasOffset.x = Math.round(window.innerWidth / 2 - chunkWidth / 2);
        canvasOffset.y = Math.round(window.innerHeight / 2 - chunkHeight / 2);
        updateCanvasPosition();
    }

    // ── Input: mouse drag ──────────────────────────────────────────────

    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let dragMoved = false;

    container.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        isDragging = true;
        dragMoved = false;
        dragStart.x = e.clientX - canvasOffset.x;
        dragStart.y = e.clientY - canvasOffset.y;
        container.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', function (e) {
        if (!isDragging) return;
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;
        if (Math.abs(newX - canvasOffset.x) > 3 || Math.abs(newY - canvasOffset.y) > 3) {
            dragMoved = true;
        }
        canvasOffset.x = newX;
        canvasOffset.y = newY;
        updateCanvasPosition();
    });

    window.addEventListener('mouseup', function () {
        isDragging = false;
        container.classList.remove('is-dragging');
    });

    // ── Input: touch drag ──────────────────────────────────────────────

    let touchStart = { x: 0, y: 0 };
    let touchDragMoved = false;

    container.addEventListener('touchstart', function (e) {
        const t = e.touches[0];
        touchStart.x = t.clientX - canvasOffset.x;
        touchStart.y = t.clientY - canvasOffset.y;
        touchDragMoved = false;
    }, { passive: true });

    container.addEventListener('touchmove', function (e) {
        const t = e.touches[0];
        const newX = t.clientX - touchStart.x;
        const newY = t.clientY - touchStart.y;
        if (Math.abs(newX - canvasOffset.x) > 3 || Math.abs(newY - canvasOffset.y) > 3) {
            touchDragMoved = true;
        }
        canvasOffset.x = newX;
        canvasOffset.y = newY;
        updateCanvasPosition();
    }, { passive: true });

    // ── Input: scroll wheel ────────────────────────────────────────────

    container.addEventListener('wheel', function (e) {
        e.preventDefault();
        canvasOffset.x -= e.deltaX;
        canvasOffset.y -= e.deltaY;
        updateCanvasPosition();
    }, { passive: false });

    // ── Tile click / tap ───────────────────────────────────────────────

    container.addEventListener('click', function (e) {
        if (dragMoved) return;

        const tile = e.target.closest('.tile');
        if (!tile) return;

        const actionType = tile.dataset.actionType;

        if (actionType === 'link') {
            window.location.href = tile.dataset.url;
        } else if (actionType === 'modal') {
            openModal(tile.dataset.image, tile.dataset.description);
        }
    });

    container.addEventListener('touchend', function (e) {
        if (touchDragMoved) return;

        const tile = e.target.closest('.tile');
        if (!tile) return;

        // Prevent synthetic click from also firing
        e.preventDefault();

        const actionType = tile.dataset.actionType;

        if (actionType === 'link') {
            window.location.href = tile.dataset.url;
        } else if (actionType === 'modal') {
            openModal(tile.dataset.image, tile.dataset.description);
        }
    });

    // ── Modal ──────────────────────────────────────────────────────────

    const modalOverlay = document.getElementById('modal-overlay');
    const modalImage = modalOverlay.querySelector('.modal-image');
    const modalDescription = modalOverlay.querySelector('.modal-description');
    const modalClose = modalOverlay.querySelector('.modal-close');

    function openModal(imageSrc, description) {
        modalImage.src = imageSrc;
        modalDescription.textContent = description || '';
        modalOverlay.classList.add('is-active');
    }

    function closeModal() {
        modalOverlay.classList.remove('is-active');
        modalImage.src = '';
    }

    modalClose.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', function (e) {
        if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') closeModal();
    });

    // ── Resize handling ────────────────────────────────────────────────

    let resizeTimeout;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function () {
            // Clear all chunks and rebuild at new dimensions
            for (const [key] of loadedChunks) {
                removeChunk(key);
            }
            centerCanvas();
        }, 200);
    });

    // ── Init ───────────────────────────────────────────────────────────

    centerCanvas();

})();
