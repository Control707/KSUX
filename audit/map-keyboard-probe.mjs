import { chromium } from "@playwright/test";
const b = await chromium.launch(); const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto("http://127.0.0.1:3100/?demo=1"); await p.getByTestId("judge-demo-pill").waitFor({timeout:30000}); await p.waitForTimeout(4000);
for (const r of ["/parking","/transit"]) {
  await p.goto("http://127.0.0.1:3100"+r); await p.waitForTimeout(6000);
  const info = await p.evaluate(() => { const c=document.querySelector("canvas"); return c?{tabindex:c.getAttribute("tabindex"),label:c.getAttribute("aria-label"),role:c.getAttribute("role"),ctrls:document.querySelectorAll(".maplibregl-ctrl button").length,attrib:!!document.querySelector(".maplibregl-ctrl-attrib"),markers:document.querySelectorAll(".maplibregl-marker").length}:null; });
  let reached=false; for(let i=0;i<40;i++){ await p.keyboard.press("Tab"); if(await p.evaluate(()=>document.activeElement?.tagName==="CANVAS")){reached=i+1;break;} }
  let moved=null; if(reached){ const before=(await p.locator("canvas").first().screenshot()).toString("base64"); await p.keyboard.press("ArrowRight"); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(800); moved = before !== (await p.locator("canvas").first().screenshot()).toString("base64"); }
  console.log(r, JSON.stringify({...info, canvasReachedAtTab:reached, arrowPans:moved}));
}
await b.close();
