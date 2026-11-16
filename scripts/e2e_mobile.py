"""Проверка телефона и обучения: python scripts/e2e_mobile.py <base_url> <out_dir>"""
import sys
from playwright.sync_api import sync_playwright
base, out = sys.argv[1], sys.argv[2]
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    m.on("pageerror", lambda e: errors.append(str(e)))
    m.goto(base + "/"); m.wait_for_timeout(4500)
    w = m.evaluate("() => document.getElementById('graph').getBoundingClientRect().width")
    m.screenshot(path=f"{out}/m1-graph.png")
    m.tap("[data-m=tree]"); m.wait_for_timeout(500); m.screenshot(path=f"{out}/m2-tree.png")
    m.tap(".tree .folder .row"); m.wait_for_timeout(300)
    m.locator(".tree .kids .row").first.tap(); m.wait_for_timeout(1500)
    tree_hidden = m.evaluate("() => getComputedStyle(document.getElementById('left')).display")
    m.screenshot(path=f"{out}/m3-note.png")
    m.tap("[data-m=learn]"); m.wait_for_timeout(600); m.screenshot(path=f"{out}/m4-learn.png")
    m.locator(".mode").first.tap(); m.wait_for_timeout(400)
    m.locator("text=Показать ответ").tap(); m.wait_for_timeout(300); m.screenshot(path=f"{out}/m5-card.png")
    m.locator("text=✓ Знаю").tap(); m.wait_for_timeout(300)
    m.tap("text=← К урокам"); m.wait_for_timeout(300)
    m.locator(".mode").nth(1).tap(); m.wait_for_timeout(400); m.locator(".opt").first.tap(); m.wait_for_timeout(300)
    m.screenshot(path=f"{out}/m6-quiz.png")
    prog = m.evaluate("() => JSON.parse(localStorage.getItem('vkr-learn-v1'))")
    m.tap("[data-m=graph]"); m.wait_for_timeout(800)
    gw = m.evaluate("() => document.getElementById('graph').getBoundingClientRect().width")
    print(f"ширина графа: {w:.0f} -> {gw:.0f} | дерево после выбора: {tree_hidden} | оценок в обучении: {len(prog['box'])}")
    b.close()
print("ошибки JS:", errors or "нет")
