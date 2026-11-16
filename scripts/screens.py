"""Скриншоты фронтенда для отчёта: python scripts/screens.py <base_url> <out_dir>"""
import sys
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(base + "/"); pg.wait_for_timeout(4000)
    pg.screenshot(path=f"{out}/01-graph.png")
    pg.mouse.move(1, 1)
    node = pg.evaluate("() => null")
    pg.goto(base + "/#adaptive-strategy"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{out}/02-term-card.png")
    pg.keyboard.press("Control+k"); pg.wait_for_timeout(300)
    pg.keyboard.type("задерж"); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{out}/03-search.png")
    pg.keyboard.press("Escape")
    pg.click("[data-tree=vkr]"); pg.wait_for_timeout(800)
    pg.screenshot(path=f"{out}/07-vkr-plan.png")
    pg.goto(base + "/#whisper"); pg.wait_for_timeout(2000)
    pg.screenshot(path=f"{out}/04-list.png")
    if not base.endswith("static"):
        pg.goto(base + "/docs"); pg.wait_for_timeout(2500)
        pg.screenshot(path=f"{out}/05-openapi.png")
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    m.on("pageerror", lambda e: errors.append(str(e)))
    m.goto(base + "/#whisper"); m.wait_for_timeout(2500)
    m.screenshot(path=f"{out}/06-mobile.png", full_page=False)
    b.close()
print("ошибки:", errors or "нет")
