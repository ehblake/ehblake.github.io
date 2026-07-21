(function () {
    'use strict';

    // Remove no-js class immediately since JS is running
    document.documentElement.classList.remove('no-js');

    var wrappers = document.querySelectorAll('[data-project-video]');
    if (!wrappers.length) return;

    var reduceMotion = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    Array.prototype.forEach.call(wrappers, function (wrap) {
        var video = wrap.querySelector('video');
        if (!video) return;

        var toggle = wrap.querySelector('.project-video__toggle');
        var label = wrap.querySelector('.project-video__toggle-label');

        // Once someone presses pause, scrolling must not undo that
        var userPaused = false;

        function reflect(paused) {
            wrap.classList.toggle('is-paused', paused);
            if (toggle) toggle.setAttribute('aria-pressed', paused ? 'true' : 'false');
            if (label) label.textContent = paused ? 'Play' : 'Pause';
        }

        function play() {
            var attempt = video.play();
            // Safari/iOS can refuse autoplay — fall back to the poster frame
            if (attempt && attempt.catch) {
                attempt.catch(function () {
                    userPaused = true;
                    reflect(true);
                });
            }
        }

        // Hold on the poster frame when the visitor has asked for less motion
        if (reduceMotion && reduceMotion.matches) {
            userPaused = true;
            video.removeAttribute('autoplay');
            video.pause();
            reflect(true);
        }

        if (toggle) {
            toggle.addEventListener('click', function () {
                if (video.paused) {
                    userPaused = false;
                    play();
                    reflect(false);
                } else {
                    userPaused = true;
                    video.pause();
                    reflect(true);
                }
            });
        }

        // Don't burn cycles decoding frames nobody is looking at
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(
                function (entries) {
                    entries.forEach(function (entry) {
                        if (userPaused) return;
                        if (entry.isIntersecting) {
                            play();
                        } else {
                            video.pause();
                        }
                    });
                },
                { threshold: 0.15 }
            ).observe(wrap);
        }
    });
})();
