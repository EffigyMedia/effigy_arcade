import sys, threading, http.server, socketserver, functools
sys.path.insert(0,'tools')
from harness import launch_chromium, console_utf8
from playwright.sync_api import sync_playwright
console_utf8()
h=functools.partial(http.server.SimpleHTTPRequestHandler,directory='.')
srv=socketserver.TCPServer(('127.0.0.1',0),h); P=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
out=sys.argv[1]
with sync_playwright() as p:
    b=launch_chromium(p,headless=True,args=['--mute-audio','--autoplay-policy=no-user-gesture-required'])
    pg=b.new_context(viewport={'width':390,'height':844},device_scale_factor=2).new_page()
    errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{P}/games/em/hardpoint.html',wait_until='load')
    pg.wait_for_timeout(2200)
    # three frames across the loop so the chase is visibly moving
    for i,ms in enumerate([0,2600,5200]):
        if ms: pg.wait_for_timeout(ms)
        pg.screenshot(path=f'{out}/scene-{i}.png')
    sig = pg.evaluate("""() => {
      const c=document.getElementById('hpArt');
      if(!c) return {err:'no canvas'};
      const g=c.getContext('2d');
      const d=g.getImageData(0,0,c.width,c.height).data;
      let lit=0,sum=0;
      for(let i=0;i<d.length;i+=4){ if(d[i]+d[i+1]+d[i+2]>40) lit++; sum+=d[i]+d[i+1]+d[i+2]; }
      return {w:c.width,h:c.height,litPixels:lit,mean:Math.round(sum/(d.length/4))};
    }""")
    print('  canvas:',sig)
    print('  running on title:', pg.evaluate("() => document.getElementById('veil').classList.contains('art')"))
    # and it must STOP when a menu takes over
    pg.get_by_text('CONTROLS',exact=False).first.click(); pg.wait_for_timeout(600)
    print('  stops on CONTROLS:', not pg.evaluate("() => document.getElementById('veil').classList.contains('art')"))
    print('  errors:',errs or 'none')
    b.close()
srv.shutdown()
