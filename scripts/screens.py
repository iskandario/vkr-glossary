"""Скриншоты фронтенда для отчёта: python scripts/screens.py <base_url> <out_dir>"""
import sys
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    pg.goto(base + "/"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{out}/01-graph.png")
    pg.goto(base + "/#adaptive-strategy"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{out}/02-term-card.png")
    pg.fill("#q", "задерж"); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{out}/03-search.png")
    pg.keyboard.press("Escape"); pg.click("[data-view=list]"); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{out}/04-list.png")
    pg.click("[data-view=vkr]"); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{out}/07-vkr-plan.png")
    pg.goto(base + "/docs"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{out}/05-openapi.png")
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    m.goto(base + "/#whisper"); m.wait_for_timeout(2500)
    m.screenshot(path=f"{out}/06-mobile.png", full_page=True)
    b.close()
