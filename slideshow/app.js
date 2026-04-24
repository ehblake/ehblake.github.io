/* ==========================================================================
   Slideshow — vertical infinite masonry grid with caption modal
   ========================================================================== */
(function () {
    'use strict';

    const STATIC_PASSWORD_HASH = '25cd7ee1934d6f91cb9eca7b955cd8d8b8aaf21895cb8fa27a150b96321a5124';

    async function sha256Hex(str) {
        const buf = new TextEncoder().encode(str);
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash))
            .map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }

    async function passwordGate() {
        const overlay = document.getElementById('auth-overlay');
        if (sessionStorage.getItem('slideshow-auth') === STATIC_PASSWORD_HASH) {
            overlay.classList.add('is-unlocked');
            return true;
        }
        return new Promise(function (resolve) {
            const form = overlay.querySelector('.auth-form');
            const input = overlay.querySelector('.auth-input');
            const err = overlay.querySelector('.auth-error');
            form.addEventListener('submit', async function (e) {
                e.preventDefault();
                const hash = await sha256Hex(input.value);
                if (hash === STATIC_PASSWORD_HASH) {
                    sessionStorage.setItem('slideshow-auth', STATIC_PASSWORD_HASH);
                    overlay.classList.add('is-unlocked');
                    resolve(true);
                } else {
                    err.textContent = 'Nope';
                    form.classList.remove('auth-shake');
                    void form.offsetWidth;
                    form.classList.add('auth-shake');
                    input.select();
                }
            });
        });
    }

    // ── Config ────────────────────────────────────────────────────────────
    const GAP = 16;            // px between tiles
    const MARGIN = 16;         // page margin (matches CSS #grid margin)
    const BATCH = 24;          // tiles appended per refill
    const PREFILL_VH = 2.5;    // fill this many viewport-heights ahead

    // ── DOM ───────────────────────────────────────────────────────────────
    const grid = document.getElementById('grid');
    const sentinel = document.getElementById('sentinel');
    const modal = document.getElementById('modal');
    const modalImage = modal.querySelector('.modal-image');
    const modalCaption = modal.querySelector('.modal-caption');
    const modalStatus = modal.querySelector('.modal-status');
    const modalClose = modal.querySelector('.modal-close');
    const modalPrev = modal.querySelector('.modal-nav--prev');
    const modalNext = modal.querySelector('.modal-nav--next');

    // ── State ─────────────────────────────────────────────────────────────
    let manifest = [];          // [{file, w, h}, …]
    let captions = {};          // { filename: "caption text" }
    let nextIndex = 0;          // next position in the infinite stream
    let columnCount = 0;
    let columnWidth = 0;
    let columnHeights = [];     // running pixel height of each column
    let currentTileIndex = -1;  // for prev/next inside modal
    let stopAtEnd = false;      // filtered views: no infinite looping

    // ── Init ──────────────────────────────────────────────────────────────
    async function init() {
        // Static deploy: password gate + reveal logo on success
        const _logo = document.querySelector('.site-logo');
        const _ok = await passwordGate();
        if (!_ok) return;
        if (_logo) _logo.removeAttribute('hidden');
        try {
            const manifestRes = await fetch('manifest.json?v=1777014706');
            manifest = await manifestRes.json();
        } catch (e) {
            grid.innerHTML = '<p style="padding:24px;color:#f66">Could not load manifest.json. Run <code>python3 generate_manifest.py</code>.</p>';
            return;
        }

        try {
            const capRes = await fetch('./captions.json?v=1777014706');
            if (capRes.ok) captions = await capRes.json();
        } catch (e) {
            captions = {};
        }

        // Build collection index + determine which files are "collection-only"
        // (they get hidden from main grid, year filters, and uncaptioned view)
        const collections = buildCollectionIndex(manifest, captions);
        const hiddenFiles = collections.hidden;

        // The "public" manifest excludes hidden files — used for year index + totals
        const publicManifest = manifest.filter(function (item) { return !hiddenFiles.has(item.file); });
        const yearIndex = buildYearIndex(publicManifest, captions);
        const totalCount = publicManifest.length;

        // Parse URL for filter params
        const params = new URLSearchParams(window.location.search);
        const filterMode = params.get('filter');  // 'uncaptioned' | null
        const yearFilter = params.get('year');    // '2018' | ... | 'undated' | null
        const collectionFilter = params.get('collection'); // 'tony-hardhat' | ...

        let activeLabel = null;
        let activeCollection = null;

        if (filterMode === 'uncaptioned') {
            manifest = publicManifest.filter(function (item) {
                const c = captions[item.file];
                return !c || !c.trim();
            });
            activeLabel = 'uncaptioned';
        } else if (yearFilter) {
            let files;
            if (yearFilter === 'undated') {
                files = new Set(yearIndex.undated || []);
            } else {
                files = new Set(yearIndex.years[yearFilter] || []);
            }
            manifest = publicManifest.filter(function (item) { return files.has(item.file); });
            activeLabel = yearFilter;
        } else if (collectionFilter && COLLECTIONS[collectionFilter]) {
            const files = new Set(collections.index[collectionFilter] || []);
            manifest = manifest.filter(function (item) { return files.has(item.file); });
            activeLabel = COLLECTIONS[collectionFilter].label;
            activeCollection = collectionFilter;
        } else {
            // Default view — hide collection-only files from the main grid
            manifest = publicManifest;
        }

        // Year / undated / uncaptioned views show each image once (no looping)
        // and disable drift. Main view + curated collections stay infinite
        // with drift — collections are handpicked so repeats feel intentional.
        stopAtEnd = !!activeLabel && !activeCollection;

        // Populate year picker and wire it up
        populateYearPicker(yearIndex, collections.index, totalCount, yearFilter, activeCollection);
        setupYearPickerToggle();

        if (activeLabel) {
            showFilterBadge(manifest.length, activeLabel);
        }

        // Jumble the order — Fisher-Yates shuffle, fresh every page load
        shuffle(manifest);

        layoutInit();
        fillToBottom();
        setupSentinel();
    }

    // ── Special curated collections ──────────────────────────────────────
    // Each collection is matched by exact caption text. Appears in the year
    // picker below the Undated row. To add images, paste the caption here.

    const COLLECTIONS = {
        'tony-hardhat': {
            label: 'Tony in a hard hat',
            // Captions that ALSO appear in the main grid / year filters
            captions: [
                'Tony and Tim Stroh with WAM and Multiplex teams, 2020',
                'Mona tour with David, April 2019',
                'Tony at NMA, Dec 2020',
                "DW and Tony walking through Kiefer's cathedral, 2024",
                'Site tour with DW, 2024',
                'Tony at Mona, 2024',
                'Hard-headed Tony, 2024',
                'DW, Nic, Tony and Kim, Kiefer site at Mona, 2024',
            ],
            // Captions that ONLY appear here — hidden from main grid + year views
            hiddenCaptions: [],
            // Filename prefixes (case-insensitive). Matching files are hidden
            // from everything else and only appear in this collection.
            hiddenPrefixes: ['th-hat'],
        },
    };

    // ── Year extraction + picker ─────────────────────────────────────────
    const YEAR_RE = /\b(20\d{2})\b/g;

    function extractYear(caption) {
        if (!caption) return null;
        const matches = caption.match(YEAR_RE);
        if (!matches || matches.length === 0) return null;
        // Use the LAST year mentioned — captions sometimes reference an
        // earlier year as context (e.g. "10 years after the 2014 exhibit, 2024")
        return matches[matches.length - 1];
    }

    function buildYearIndex(items, caps) {
        const years = {};
        const undated = [];
        for (const item of items) {
            const y = extractYear(caps[item.file]);
            if (y) {
                (years[y] = years[y] || []).push(item.file);
            } else {
                undated.push(item.file);
            }
        }
        return { years: years, undated: undated };
    }

    // For each collection, resolve caption lists + filename prefixes to filenames.
    // Returns { index: { collectionKey: [files…] }, hidden: Set(files) }
    // where `hidden` is files that should ONLY appear inside their collection.
    function buildCollectionIndex(items, caps) {
        const index = {};
        const hidden = new Set();
        for (const key in COLLECTIONS) {
            const col = COLLECTIONS[key];
            const visibleCaps = new Set(col.captions || []);
            const hiddenCaps = new Set(col.hiddenCaptions || []);
            const hiddenPrefixes = (col.hiddenPrefixes || []).map(function (p) {
                return p.toLowerCase();
            });
            const files = [];
            const seen = new Set();
            for (const item of items) {
                const c = (caps[item.file] || '').trim();
                const nameLower = item.file.toLowerCase();
                const matchesPrefix = hiddenPrefixes.some(function (p) {
                    return nameLower.startsWith(p);
                });
                if (matchesPrefix) {
                    if (!seen.has(item.file)) { files.push(item.file); seen.add(item.file); }
                    hidden.add(item.file);
                    continue;
                }
                if (!c) continue;
                if (visibleCaps.has(c)) {
                    if (!seen.has(item.file)) { files.push(item.file); seen.add(item.file); }
                } else if (hiddenCaps.has(c)) {
                    if (!seen.has(item.file)) { files.push(item.file); seen.add(item.file); }
                    hidden.add(item.file);
                }
            }
            index[key] = files;
        }
        return { index: index, hidden: hidden };
    }

    function populateYearPicker(yearIndex, collectionIndex, totalCount, activeYear, activeCollection) {
        const picker = document.querySelector('.year-picker');
        if (!picker) return;
        picker.innerHTML = '';

        function addLink(href, label, count, isActive) {
            const a = document.createElement('a');
            a.href = href;
            a.className = isActive ? 'is-active' : '';
            a.innerHTML = '<span class="label">' + label + '</span>' +
                          '<span class="count">' + count + '</span>';
            picker.appendChild(a);
        }

        const nothingActive = !activeYear && !activeCollection;
        addLink('./', 'All years', totalCount, nothingActive);

        const divider = document.createElement('hr');
        picker.appendChild(divider);

        const yearKeys = Object.keys(yearIndex.years).sort();
        for (const y of yearKeys) {
            addLink('?year=' + y, y, yearIndex.years[y].length, activeYear === y);
        }

        if (yearIndex.undated.length > 0) {
            const divider2 = document.createElement('hr');
            picker.appendChild(divider2);
            addLink('?year=undated', 'Undated', yearIndex.undated.length, activeYear === 'undated');
        }

        // Curated collections appear at the very bottom
        const collectionKeys = Object.keys(COLLECTIONS);
        if (collectionKeys.length > 0) {
            const divider3 = document.createElement('hr');
            picker.appendChild(divider3);
            for (const key of collectionKeys) {
                const count = (collectionIndex[key] || []).length;
                addLink(
                    '?collection=' + key,
                    COLLECTIONS[key].label,
                    count,
                    activeCollection === key
                );
            }
        }
    }

    function setupYearPickerToggle() {
        const logo = document.querySelector('.site-logo');
        const picker = document.querySelector('.year-picker');
        if (!logo || !picker) return;

        function setOpen(open) {
            picker.classList.toggle('is-open', open);
            logo.setAttribute('aria-expanded', open ? 'true' : 'false');
        }

        logo.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(!picker.classList.contains('is-open'));
        });

        document.addEventListener('click', function (e) {
            if (!picker.classList.contains('is-open')) return;
            if (logo.contains(e.target) || picker.contains(e.target)) return;
            setOpen(false);
        });

        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && picker.classList.contains('is-open')) {
                setOpen(false);
            }
        });
    }

    function showFilterBadge(count, label) {
        const badge = document.createElement('div');
        badge.className = 'filter-badge';
        badge.innerHTML =
            '<span>' + count + ' · ' + label + '</span>' +
            '<a href="./">clear</a>';
        document.body.appendChild(badge);
    }

    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
    }

    // ── Column math ───────────────────────────────────────────────────────
    function getColumnCount() {
        const w = window.innerWidth;
        if (w >= 1800) return 5;
        if (w >= 1300) return 4;
        if (w >= 900)  return 3;
        if (w >= 560)  return 2;
        return 1;
    }

    function layoutInit() {
        grid.innerHTML = '';
        nextIndex = 0;
        columnCount = getColumnCount();
        const usable = window.innerWidth - MARGIN * 2;
        columnWidth = (usable - GAP * (columnCount - 1)) / columnCount;
        columnHeights = new Array(columnCount).fill(0);
        grid.style.height = '0px';
    }

    function shortestColumn() {
        let idx = 0;
        for (let i = 1; i < columnCount; i++) {
            if (columnHeights[i] < columnHeights[idx]) idx = i;
        }
        return idx;
    }

    // ── Tile creation ─────────────────────────────────────────────────────
    function appendTile(item, absIndex) {
        const col = shortestColumn();
        const aspect = item.w / item.h;
        const tileH = Math.round(columnWidth / aspect);
        const x = Math.round(col * (columnWidth + GAP));
        const y = Math.round(columnHeights[col]);

        const el = document.createElement('div');
        el.className = 'tile';
        el.style.cssText =
            'position:absolute;left:' + x + 'px;top:' + y + 'px;' +
            'width:' + columnWidth + 'px;height:' + tileH + 'px;';
        el.dataset.file = item.file;
        el.dataset.absIndex = String(absIndex);

        const img = document.createElement('img');
        img.src = 'images/' + encodeURIComponent(item.file);
        img.alt = '';
        img.loading = 'lazy';
        img.draggable = false;
        img.addEventListener('load', function () { img.classList.add('is-loaded'); });
        img.addEventListener('error', function () { img.classList.add('is-loaded'); });
        el.appendChild(img);

        grid.appendChild(el);
        columnHeights[col] += tileH + GAP;
        grid.style.height = Math.max.apply(null, columnHeights) + 'px';
    }

    function appendBatch(n) {
        if (manifest.length === 0) return;
        for (let i = 0; i < n; i++) {
            if (stopAtEnd && nextIndex >= manifest.length) return;
            const item = manifest[nextIndex % manifest.length];
            appendTile(item, nextIndex);
            nextIndex++;
        }
    }

    function fillToBottom() {
        // Keep enough buffer below the viewport so scrolling feels seamless
        const targetBottom = window.scrollY + window.innerHeight * PREFILL_VH;
        let safety = 50;
        while (Math.max.apply(null, columnHeights) < targetBottom && safety-- > 0) {
            const before = nextIndex;
            appendBatch(BATCH);
            // In filtered mode we may have exhausted the stream — stop looping
            if (nextIndex === before) break;
        }
    }

    // ── Infinite scroll sentinel ──────────────────────────────────────────
    function setupSentinel() {
        const observer = new IntersectionObserver(function (entries) {
            for (const e of entries) {
                if (e.isIntersecting) {
                    appendBatch(BATCH);
                }
            }
        }, { rootMargin: '800px 0px' });
        observer.observe(sentinel);
    }

    // ── Modal ─────────────────────────────────────────────────────────────
    grid.addEventListener('click', function (e) {
        const tile = e.target.closest('.tile');
        if (!tile) return;
        openModalForTile(tile);
    });

    function openModalForTile(tile) {
        currentTileIndex = parseInt(tile.dataset.absIndex, 10);
        showImage(tile.dataset.file);
        modal.classList.add('is-active');
        modal.setAttribute('aria-hidden', 'false');
        // Lock background scroll
        document.body.style.overflow = 'hidden';
    }

    function showImage(file) {
        modalImage.src = 'images/' + encodeURIComponent(file);
        modalImage.alt = file;
        // contenteditable div: use textContent (clear fully so :empty CSS kicks in)
        const existing = captions[file] || '';
        if (existing) {
            modalCaption.textContent = existing;
        } else {
            modalCaption.innerHTML = '';
        }
        modalCaption.dataset.file = file;
        modalStatus.textContent = '';
    }

    function closeModal() {
        // Flush any pending save before closing
        flushSave();
        modal.classList.remove('is-active');
        modal.setAttribute('aria-hidden', 'true');
        modalImage.src = '';
        modalCaption.innerHTML = '';
        modalCaption.blur();
        delete modalCaption.dataset.file;
        document.body.style.overflow = '';
        currentTileIndex = -1;
    }

    function navigate(delta) {
        if (currentTileIndex < 0 || manifest.length === 0) return;
        flushSave();
        currentTileIndex += delta;
        // Wrap around the stream (matches the infinite grid's looping behavior)
        if (currentTileIndex < 0) currentTileIndex = 0;
        const item = manifest[currentTileIndex % manifest.length];
        showImage(item.file);
    }

    modalClose.addEventListener('click', closeModal);
    modalPrev.addEventListener('click', function () { navigate(-1); });
    modalNext.addEventListener('click', function () { navigate(1); });

    modal.addEventListener('click', function (e) {
        // Close on any click outside the image, nav buttons, or caption.
        // Clicking the backdrop, padding, or empty gap all return to the grid.
        if (e.target.closest('.modal-image')) return;
        if (e.target.closest('.modal-nav')) return;
        if (e.target.closest('.modal-caption')) return;
        closeModal();
    });

    document.addEventListener('keydown', function (e) {
        if (!modal.classList.contains('is-active')) return;
        if (e.key === 'Escape') {
            closeModal();
        } else if (e.key === 'ArrowLeft' && document.activeElement !== modalCaption) {
            navigate(-1);
        } else if (e.key === 'ArrowRight' && document.activeElement !== modalCaption) {
            navigate(1);
        }
    });

    // ── Caption save (debounced) ──────────────────────────────────────────
    let saveTimeout = null;
    let pendingSave = false;
    let saveInFlight = false;

    modalCaption.addEventListener('input', function () {
        return; // static deploy: no caption saving
        const file = modalCaption.dataset.file;
        if (!file) return;
        const value = modalCaption.textContent;
        if (value.trim() === '') {
            // Reset innerHTML so CSS :empty kicks in and placeholder shows again
            if (modalCaption.innerHTML !== '') modalCaption.innerHTML = '';
            delete captions[file];
        } else {
            captions[file] = value;
        }
        modalStatus.textContent = 'Saving…';
        pendingSave = true;
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(saveCaptions, 400);
    });

    function flushSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        if (pendingSave) saveCaptions();
    }

    async function saveCaptions() {
        if (saveInFlight) {
            // Try again after current request finishes
            saveTimeout = setTimeout(saveCaptions, 200);
            return;
        }
        saveInFlight = true;
        pendingSave = false;
        try {
            const res = await fetch('/api/captions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(captions),
            });
            if (res.ok) {
                modalStatus.textContent = 'Saved';
                setTimeout(function () {
                    if (modalStatus.textContent === 'Saved') modalStatus.textContent = '';
                }, 1400);
            } else {
                modalStatus.textContent = 'Save failed';
            }
        } catch (e) {
            modalStatus.textContent = 'Save failed (server offline?)';
        } finally {
            saveInFlight = false;
            if (pendingSave) saveCaptions();
        }
    }

    // ── Resize ────────────────────────────────────────────────────────────
    let resizeTimer = null;
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if (window.innerWidth === lastWidth) return;
            lastWidth = window.innerWidth;
            // Rebuild from scratch at the new column count.
            const scrollRatio = window.scrollY / Math.max(1, document.body.scrollHeight);
            layoutInit();
            fillToBottom();
            // Best-effort scroll restore
            window.scrollTo(0, scrollRatio * document.body.scrollHeight);
        }, 180);
    });

    // ── Slow vertical drift ───────────────────────────────────────────────
    // Page auto-scrolls downward at a very slow pace. Pauses while the
    // modal is open, while the tab is hidden, and briefly after any
    // manual scroll/keyboard input so the user is never fighting it.

    const DRIFT_PX_PER_SEC = 7;    // tweak for faster/slower drift
    const MANUAL_PAUSE_MS = 2500;  // how long to pause after user scrolls

    let driftLastFrame = 0;
    let driftAccumulator = 0;
    let manualPauseUntil = 0;

    function pauseDrift(ms) {
        manualPauseUntil = Math.max(manualPauseUntil, Date.now() + (ms || MANUAL_PAUSE_MS));
        driftLastFrame = 0; // avoid a dt spike on resume
    }

    function shouldDrift() {
        if (document.hidden) return false;
        if (modal.classList.contains('is-active')) return false;
        if (Date.now() < manualPauseUntil) return false;
        if (stopAtEnd) return false;   // filtered views: no drift
        return true;
    }

    function driftTick(now) {
        requestAnimationFrame(driftTick);
        if (!driftLastFrame) { driftLastFrame = now; return; }
        const dt = (now - driftLastFrame) / 1000;
        driftLastFrame = now;
        if (dt > 0.5) return; // tab was backgrounded — skip this frame
        if (!shouldDrift()) return;

        driftAccumulator += DRIFT_PX_PER_SEC * dt;
        if (driftAccumulator >= 1) {
            const whole = Math.floor(driftAccumulator);
            driftAccumulator -= whole;
            window.scrollBy(0, whole);
        }
    }

    // Pause drift on any user-initiated scroll/navigation input
    window.addEventListener('wheel', function () { pauseDrift(); }, { passive: true });
    window.addEventListener('touchstart', function () { pauseDrift(); }, { passive: true });
    window.addEventListener('touchmove', function () { pauseDrift(); }, { passive: true });
    window.addEventListener('keydown', function (e) {
        const navKeys = ['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' ', 'Spacebar'];
        if (navKeys.indexOf(e.key) !== -1) pauseDrift();
    });
    document.addEventListener('visibilitychange', function () {
        driftLastFrame = 0;
    });

    requestAnimationFrame(driftTick);

    // ── Idle auto-slideshow ───────────────────────────────────────────────
    // After 5s of no user input, open the modal and play a burst of 6 random
    // images (4s each), then close the modal for a 5s grid break, then start
    // another burst — forever, until the user moves/clicks/types.

    const IDLE_DELAY_MS = 5000;        // idle time before slideshow starts
    const IDLE_SHOW_MS = 4000;         // how long EACH image in the burst stays up
    const IDLE_BURST_COUNT = 6;        // images per burst
    const IDLE_BETWEEN_MS = 5000;      // grid break between bursts

    let lastActivity = Date.now();
    let idleShowActive = false;
    let idleTimer = null;
    let idleStoppedAt = 0;
    let idleBurstRemaining = 0;

    function markActivity() {
        lastActivity = Date.now();
        if (idleShowActive) stopIdleShow();
    }

    function idleCheck() {
        if (idleShowActive) return;
        if (document.hidden) return;
        // Don't hijack a modal the user opened themselves
        if (modal.classList.contains('is-active')) return;
        if (Date.now() - lastActivity >= IDLE_DELAY_MS) {
            startIdleShow();
        }
    }
    setInterval(idleCheck, 1000);

    function startIdleShow() {
        if (!manifest.length) return;
        idleShowActive = true;
        idleBurstRemaining = IDLE_BURST_COUNT;
        showNextIdleImage();
    }

    function showNextIdleImage() {
        if (!idleShowActive) return;
        const idx = Math.floor(Math.random() * manifest.length);
        const item = manifest[idx];
        currentTileIndex = idx;
        showImage(item.file);
        // Keep the modal open across the whole burst; only open it once.
        if (!modal.classList.contains('is-active')) {
            modal.classList.add('is-active');
            modal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
        }
        idleBurstRemaining--;

        idleTimer = setTimeout(function () {
            if (!idleShowActive) return;
            if (idleBurstRemaining > 0) {
                // Swap to the next image without closing the modal
                showNextIdleImage();
            } else {
                // Burst complete — close modal, pause on the grid, then loop
                hideIdleModal();
                idleTimer = setTimeout(function () {
                    if (!idleShowActive) return;
                    idleBurstRemaining = IDLE_BURST_COUNT;
                    showNextIdleImage();
                }, IDLE_BETWEEN_MS);
            }
        }, IDLE_SHOW_MS);
    }

    function hideIdleModal() {
        modal.classList.remove('is-active');
        modal.setAttribute('aria-hidden', 'true');
        modalImage.src = '';
        modalCaption.innerHTML = '';
        delete modalCaption.dataset.file;
        document.body.style.overflow = '';
        currentTileIndex = -1;
    }

    function stopIdleShow() {
        if (!idleShowActive) return;
        idleShowActive = false;
        idleStoppedAt = Date.now();
        if (idleTimer) {
            clearTimeout(idleTimer);
            idleTimer = null;
        }
        if (modal.classList.contains('is-active')) {
            hideIdleModal();
        }
    }

    // Filter mousemove: only count it as activity when the cursor's viewport
    // position actually changes. Without this filter, the drift auto-scroll
    // under a stationary cursor fires mousemove events (the pointer's document
    // coordinates change even though screen coords don't), which would reset
    // the idle timer and prevent the slideshow from ever starting.
    let lastMouseX = -1;
    let lastMouseY = -1;
    function handleRealMouseMove(e) {
        if (e.clientX === lastMouseX && e.clientY === lastMouseY) return;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        markActivity();
    }

    // Activity listeners (capture phase so they always fire first)
    window.addEventListener('mousemove', handleRealMouseMove, { capture: true, passive: true });
    window.addEventListener('mousedown', markActivity, { capture: true, passive: true });
    window.addEventListener('wheel',     markActivity, { capture: true, passive: true });
    window.addEventListener('touchstart',markActivity, { capture: true, passive: true });
    window.addEventListener('touchmove', markActivity, { capture: true, passive: true });
    window.addEventListener('keydown',   markActivity, { capture: true });
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && idleShowActive) stopIdleShow();
        if (!document.hidden) markActivity();
    });

    // Swallow stray clicks that fire right after the idle show is stopped
    // (e.g. a click that closed the auto-modal but would otherwise land on
    //  whatever tile sits underneath).
    grid.addEventListener('click', function (e) {
        if (Date.now() - idleStoppedAt < 350) {
            e.stopPropagation();
            e.preventDefault();
        }
    }, true);

    // ── Boot ──────────────────────────────────────────────────────────────
    init();
})();
