import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { writeFile, unlink, readFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const html='.template-card-qa.html', tsx='src/template-card-qa.tsx';
await writeFile(html,'<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head><body><div id="root"></div><script type="module" src="/src/template-card-qa.tsx"></script></body></html>',{flag:'wx'});
await writeFile(tsx,`import React from 'react';
import {createRoot} from 'react-dom/client';
import {TemplateCardContent} from './components/messages/TemplateMessageCard';
import './index.css';
const failed=location.search.includes('failed');
createRoot(document.getElementById('root')!).render(<main className="flex justify-end p-4"><div className="max-w-[85%] rounded-xl bg-green-100 p-3 text-slate-900"><TemplateCardContent content={'Seu documento está pronto. Toque em *Assinar* para revisar e concluir sua assinatura. <img src=x onerror=alert(1)>'} template={{components:[{type:'header',parameters:[{type:'image',image:{link:failed?'https://suvsign.com/missing.jpg':'https://suvsign.com/og-sign.jpg'}}]},{type:'button',parameters:[{type:'text',text:'[link protegido]'}]}]}} display={{buttons:[{type:'URL',text:'Assinar'}],footer:'Central Trabalhista'}}/><div className="text-right text-xs text-slate-500">17:23 ✓✓</div></div></main>);`,{flag:'wx'});
let server,browser;
try {
  server=await createServer({server:{host:'127.0.0.1',port:5183,strictPort:true}});await server.listen();
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://suvsign.com/**',r=>r.request().url().includes('missing')?r.fulfill({status:404}):r.fulfill({contentType:'image/jpeg',body:readImage}));
  const readImage=process.env.QA_HEADER_IMAGE ? await readFile(process.env.QA_HEADER_IMAGE) : Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8ioAAAAASUVORK5CYII=','base64');
  for(const width of [1280,390]) {
    await page.setViewportSize({width,height:900});await page.goto('http://127.0.0.1:5183/.template-card-qa.html');
    await page.getByRole('img',{name:'Botão Assinar (prévia)',exact:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('img')?.naturalWidth>0);
    assert.equal(await page.locator('strong').innerText(),'Assinar');
    assert.equal(await page.locator('a').count(),0);assert.equal(await page.locator('img').count(),1);
    assert.equal(await page.getByText('[link protegido]',{exact:true}).count(),0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:'/private/tmp/template-card-'+width+'.png'});
  }
  await page.goto('http://127.0.0.1:5183/.template-card-qa.html?failed');await page.getByText('Imagem indisponível').waitFor();
  await page.getByRole('img',{name:'Botão Assinar (prévia)',exact:true}).waitFor();assert.deepEqual(errors,[]);
  console.log('3 browser scenarios passed: desktop, mobile, unavailable image. No sends.');
} finally {await browser?.close();await server?.close();await unlink(html);await unlink(tsx);}
