(function () {
    'use strict';

    // Remove no-js class immediately since JS is running
    document.documentElement.classList.remove('no-js');

    var banner = document.querySelector('.project-hero-banner');
    if (!banner) return;

    var header = banner.querySelector('.header');
    if (!header) return;

    // Extract background-image URL from inline style
    var bgStyle = banner.style.background || banner.style.backgroundImage || '';
    var urlMatch = bgStyle.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    if (!urlMatch) {
        header.classList.add('header--visible');
        return;
    }

    var imgUrl = urlMatch[1];

    // Resolve relative URL to absolute (avoids cross-origin issues)
    var a = document.createElement('a');
    a.href = imgUrl;
    var absoluteUrl = a.href;

    // Inject mobile-only <img> after the header so the hero appears below
    // logo+nav on small screens (CSS hides on desktop, shows ≤768px)
    var mobileImg = document.createElement('img');
    mobileImg.src = imgUrl;
    mobileImg.className = 'project-hero-banner__mobile-img';
    mobileImg.alt = '';
    banner.appendChild(mobileImg);

    var img = new Image();

    img.onload = function () {
        try {
            var canvas = document.createElement('canvas');
            var ctx = canvas.getContext('2d');

            // Downscale for speed
            var sampleWidth = Math.min(img.naturalWidth, 400);
            var scale = sampleWidth / img.naturalWidth;
            var sampleHeight = Math.round(img.naturalHeight * scale);

            canvas.width = sampleWidth;
            canvas.height = sampleHeight;

            ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);

            // Sample top 20% where header sits
            var regionHeight = Math.max(Math.round(sampleHeight * 0.2), 1);
            var imageData = ctx.getImageData(0, 0, sampleWidth, regionHeight);
            var data = imageData.data;

            // Perceptual luminance
            var totalLuminance = 0;
            var pixelCount = data.length / 4;

            for (var i = 0; i < data.length; i += 4) {
                totalLuminance += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }

            var avgLuminance = totalLuminance / pixelCount;

            // Light background → dark text
            if (avgLuminance >= 140) {
                banner.classList.add('banner--light');
            }
        } catch (e) {
            // Canvas tainted or getImageData failed — fall through to show header
        }

        header.classList.add('header--visible');
    };

    img.onerror = function () {
        header.classList.add('header--visible');
    };

    // Timeout fallback
    setTimeout(function () {
        if (!header.classList.contains('header--visible')) {
            header.classList.add('header--visible');
        }
    }, 2000);

    img.src = absoluteUrl;
})();
