#!/usr/bin/env python3
"""Scrape past event attendance from a Last.fm user profile."""

import csv
import json
import re
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

USERNAME = "blake0102"
BASE_URL = f"https://www.last.fm/user/{USERNAME}/events"
YEAR_RANGE = range(1995, 2021)  # 1995 through 2020 inclusive
OUTPUT_DIR = Path(__file__).parent
DELAY = 1.0  # seconds between requests

HEADERS = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"}

# Month abbreviation to number mapping (Last.fm uses "Jan", "Feb", etc. in the art cell)
MONTH_MAP = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


def parse_date(art_text: str, year: int) -> str:
    """Parse 'Jan15' style date from the art cell into 'YYYY-MM-DD'."""
    match = re.match(r"([A-Z][a-z]{2})(\d{1,2})", art_text)
    if not match:
        return ""
    month_str, day_str = match.groups()
    month = MONTH_MAP.get(month_str, 0)
    if not month:
        return ""
    return f"{year}-{month:02d}-{int(day_str):02d}"


def parse_attendance(text: str) -> int:
    """Extract number from '46 went'."""
    match = re.search(r"(\d+)", text)
    return int(match.group(1)) if match else 0


def clean_lineup(text: str) -> str:
    """Clean whitespace from lineup text."""
    # Collapse whitespace and strip
    return re.sub(r"\s+", " ", text).strip()


def scrape_year(year: int) -> list[dict]:
    """Scrape all events for a given year."""
    url = f"{BASE_URL}/{year}"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()

    soup = BeautifulSoup(resp.text, "html.parser")
    rows = soup.find_all("tr", class_="events-list-item")

    events = []
    for row in rows:
        art = row.find("td", class_="events-list-item-art")
        event_td = row.find("td", class_="events-list-item-event")
        venue_td = row.find("td", class_="events-list-item-venue")
        attendees_td = row.find("td", class_="events-list-item-attendees")

        # Date
        art_text = art.get_text(strip=True) if art else ""
        date = parse_date(art_text, year)

        # Artist / event title
        title_div = event_td.find("div", class_="events-list-item-event--title") if event_td else None
        artist = title_div.get_text(strip=True) if title_div else ""

        # Lineup / support
        lineup_div = event_td.find("div", class_="events-list-item-event--lineup") if event_td else None
        lineup = clean_lineup(lineup_div.get_text()) if lineup_div else ""

        # Venue details
        venue_name = ""
        city = ""
        country = ""
        if venue_td:
            vt = venue_td.find("div", class_="events-list-item-venue--title")
            vc = venue_td.find("div", class_="events-list-item-venue--city")
            vco = venue_td.find("div", class_="events-list-item-venue--country")
            venue_name = vt.get_text(strip=True) if vt else ""
            city = vc.get_text(strip=True) if vc else ""
            country = vco.get_text(strip=True) if vco else ""

        # Attendance
        att_text = attendees_td.get_text(strip=True) if attendees_td else ""
        attendance = parse_attendance(att_text)

        # Event URL
        cover_link = row.find("a", class_="events-list-cover-link")
        event_url = f"https://www.last.fm{cover_link['href']}" if cover_link else ""

        events.append({
            "date": date,
            "year": year,
            "artist": artist,
            "lineup": lineup,
            "venue": venue_name,
            "city": city,
            "country": country,
            "attendance": attendance,
            "url": event_url,
        })

    return events


def main():
    all_events = []

    for year in YEAR_RANGE:
        print(f"Scraping {year}...", end=" ", flush=True)
        events = scrape_year(year)
        print(f"{len(events)} events")
        all_events.extend(events)
        if year < max(YEAR_RANGE):
            time.sleep(DELAY)

    # Sort by date
    all_events.sort(key=lambda e: e["date"])

    print(f"\nTotal: {len(all_events)} events")

    # Write JSON
    json_path = OUTPUT_DIR / "events.json"
    with open(json_path, "w") as f:
        json.dump(all_events, f, indent=2)
    print(f"Wrote {json_path}")

    # Write CSV
    csv_path = OUTPUT_DIR / "events.csv"
    fieldnames = ["date", "year", "artist", "lineup", "venue", "city", "country", "attendance", "url"]
    with open(csv_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_events)
    print(f"Wrote {csv_path}")


if __name__ == "__main__":
    main()
