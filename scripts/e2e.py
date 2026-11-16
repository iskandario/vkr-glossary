"""Сквозная проверка интерфейса: python scripts/e2e.py <base_url> <out_dir>"""
import json, sys, zipfile, io
from playwright.sync_api import sync_playwright

base, out = sys.argv[1], sys.argv[2]
errors = []
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(base + "/"); pg.wait_for_timeout(1200)
    shot0 = pg.screenshot()
    pg.wait_for_timeout(1500)
    shot1 = pg.screenshot()
    print("граф движется (кадры различаются):", shot0 != shot1)
    pg.wait_for_timeout(3000)
    pg.screenshot(path=f"{out}/01-graph.png")
    # наведение на центр графа и перетаскивание
    box = pg.locator("#graph canvas").first.bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    pg.mouse.move(cx, cy); pg.wait_for_timeout(300)
    pg.mouse.wheel(0, -600); pg.wait_for_timeout(900)
    pg.screenshot(path=f"{out}/08-graph-zoom.png")
    # заметка о термине + мои заметки
    pg.goto(base + "/#adaptive-strategy"); pg.wait_for_timeout(2500)
    pg.screenshot(path=f"{out}/02-term-card.png")
    pg.click(".my-notes .btn"); pg.keyboard.type("Главная идея главы 2. Сравнить с [[Задер"); pg.wait_for_timeout(300)
    ac = pg.locator("#ac li").count(); pg.keyboard.press("Enter"); pg.keyboard.type(" и [[Whisp"); pg.keyboard.press("Enter")
    pg.click(".my-notes .btn.primary"); pg.wait_for_timeout(500)
    links = pg.locator(".my-notes .md a.wl").count()
    print("подсказки [[:", ac, "| ссылок в заметке:", links)
    # своя заметка
    pg.keyboard.press("Alt+KeyN"); pg.wait_for_timeout(400)
    pg.fill("#mine .title-input", "Черновик 2.3 Стратегии")
    pg.click("#mine .editor"); pg.keyboard.type("S4 проигрывает из-за [[Откат на локальное распознавание]], решение — [[Хеджирование запросов]].")
    pg.locator("#mine .editor").blur(); pg.wait_for_timeout(500)
    pg.screenshot(path=f"{out}/09-my-note.png")
    stored = pg.evaluate("() => JSON.parse(localStorage.getItem('vkr-notes-v1'))")
    print("сохранено: заметок к терминам", len(stored["terms"]), "| своих заметок", len(stored["mine"]))
    pg.keyboard.press("Control+g"); pg.wait_for_timeout(2500)
    mine_nodes = pg.evaluate("() => document.querySelector('#graph canvas') !== null")
    pg.screenshot(path=f"{out}/10-graph-with-notes.png")
    # поиск и план
    pg.keyboard.press("Control+k"); pg.keyboard.type("задерж"); pg.wait_for_timeout(400)
    pg.screenshot(path=f"{out}/03-search.png"); pg.keyboard.press("Escape")
    pg.click("[data-tree=vkr]"); pg.wait_for_timeout(700)
    pg.screenshot(path=f"{out}/07-vkr-plan.png")
    # экспорт для Obsidian
    files = pg.evaluate("() => window.__vaultFiles().map(f => f.name)")
    with pg.expect_download() as d:
        pg.click("#export-vault")
    data = open(d.value.path(), "rb").read()
    z = zipfile.ZipFile(io.BytesIO(data)); bad = z.testzip()
    names = z.namelist()
    whisper = [n for n in names if n.endswith("/Whisper.md")][0]
    print("zip:", len(names), "файлов, битых:", bad, "| пример:", whisper, "|", z.read(whisper).decode()[:80].replace("\n", " / "))
    print("свои заметки в zip:", [n for n in names if "Мои заметки" in n])
    if not base.endswith("static"):
        pg.goto(base + "/docs"); pg.wait_for_timeout(2500); pg.screenshot(path=f"{out}/05-openapi.png")
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=2)
    m.on("pageerror", lambda e: errors.append(str(e)))
    m.goto(base + "/#whisper"); m.wait_for_timeout(2500); m.screenshot(path=f"{out}/06-mobile.png")
    m.goto(base + "/"); m.wait_for_timeout(4000); m.screenshot(path=f"{out}/06b-mobile-graph.png")
    b.close()
print("ошибки JS:", errors or "нет")
