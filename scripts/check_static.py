"""Проверка статической сборки в Chromium: python check_static.py <dist_parent_dir> <out_png>"""
import functools, http.server, sys, threading
from playwright.sync_api import sync_playwright
d, png = sys.argv[1], sys.argv[2]
srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8099), functools.partial(http.server.SimpleHTTPRequestHandler, directory=d))
threading.Thread(target=srv.serve_forever, daemon=True).start()
errors = []
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("response", lambda r: r.status >= 400 and errors.append(f"{r.status} {r.url}"))
    pg.goto("http://127.0.0.1:8099/vkr-glossary/#fallback"); pg.wait_for_timeout(2500)
    title = pg.locator("#note h1").inner_text()
    pg.keyboard.press("Control+k"); pg.keyboard.type("webgpu"); pg.wait_for_timeout(400)
    n = pg.locator("#results li").count()
    pg.keyboard.press("Enter"); pg.wait_for_timeout(1200)
    title2 = pg.locator("#note h1").inner_text()
    pg.click("[data-tree=vkr]"); pg.wait_for_timeout(500)
    plan = pg.locator(".plan-sec").count()
    pg.screenshot(path=png)
    print(f"заметка: {title} | поиск: {n} -> {title2} | параграфов плана: {plan} | ошибки: {errors or 'нет'}")
    b.close()
