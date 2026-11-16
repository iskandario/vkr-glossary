import sys
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(); m = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    m.on("pageerror", lambda e: print("ERR", e)); m.on("console", lambda c: print("console", c.text) if c.type == "error" else None)
    m.goto(sys.argv[1]); m.wait_for_timeout(3000)
    print(m.evaluate("""() => ['app','left','graph-pane','graph','tabs','right'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return id+':'+Math.round(r.x)+','+Math.round(r.y)+' '+Math.round(r.width)+'x'+Math.round(r.height); })"""))
    print(m.evaluate("() => getComputedStyle(document.getElementById('app')).gridTemplateColumns"), m.evaluate("() => document.getElementById('app').className"))
    b.close()
