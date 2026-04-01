#!/bin/bash
# Optimize images: convert JPG/PNG over 400KB to WebP, back up originals
# Target: ~400KB per image, quality adjusted per file size

DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP="$DIR/_originals"
mkdir -p "$BACKUP"

converted=0
skipped=0
saved_total=0

for img in "$DIR"/*.jpg "$DIR"/*.jpeg "$DIR"/*.png; do
    [ -f "$img" ] || continue

    filename=$(basename "$img")
    size=$(stat -f%z "$img")
    size_kb=$((size / 1024))

    # Skip files already under 400KB
    if [ "$size_kb" -lt 400 ]; then
        skipped=$((skipped + 1))
        continue
    fi

    # Set quality based on file size
    if [ "$size_kb" -gt 5000 ]; then
        quality=50
    elif [ "$size_kb" -gt 2000 ]; then
        quality=60
    elif [ "$size_kb" -gt 1000 ]; then
        quality=70
    else
        quality=75
    fi

    # Output filename: replace extension with .webp
    base="${filename%.*}"
    webp_file="$DIR/${base}.webp"

    # Skip if a webp version already exists (don't double-convert)
    if [ -f "$webp_file" ]; then
        echo "SKIP (webp exists): $filename"
        skipped=$((skipped + 1))
        continue
    fi

    # Convert to WebP
    cwebp -q "$quality" -m 6 "$img" -o "$webp_file" 2>/dev/null

    if [ -f "$webp_file" ]; then
        new_size=$(stat -f%z "$webp_file")
        new_size_kb=$((new_size / 1024))
        savings=$((size_kb - new_size_kb))
        saved_total=$((saved_total + savings))

        # Back up original and remove it
        cp "$img" "$BACKUP/$filename"
        rm "$img"

        converted=$((converted + 1))
        echo "OK: $filename (${size_kb}KB) → ${base}.webp (${new_size_kb}KB) saved ${savings}KB"
    else
        echo "FAIL: $filename"
    fi
done

echo ""
echo "Done: $converted converted, $skipped skipped"
echo "Total saved: ${saved_total}KB ($((saved_total / 1024))MB)"
