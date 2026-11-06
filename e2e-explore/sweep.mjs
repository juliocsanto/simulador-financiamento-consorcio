import { chromium } from '@playwright/test';
const URL = process.env.BASE_URL || 'http://localhost:4173/simulador-financiamento-consorcio/';
const EMP = Number(process.env.EMP || '0.01');
const num = s => { const m = s.replace(/\s/g,'').match(/(-?)R\$(-?)([\d.]+)/); return m ? (m[1]||m[2] ? -1 : 1) * Number(m[3].replace(/\./g,'')) : NaN; };
let seed = Number(process.env.SEED || 7); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd()*a.length)];
const fixed = [
  {}, { sistema:'PRICE' }, { entradaPct: 50, jurosAa: 9 }, { valorCarta: 900000 }, { valorCarta: 450000 },
  { lancePct: 30, embutidoPct: 10 }, { lancePct: 30, embutidoPct: 10, embutidoAbateSaldo: true }, { lancePct: 40, embutidoPct: 40 },
  { redutorParcelaPct: 35, mesContemplacao: 60 }, { mesContemplacao: 1 }, { mesContemplacao: 200 }, { mesContemplacao: 400 },
  { amortExtraMensal: 2000 }, { amortExtraMensal: 2000, modoAmortExtra: 'parcela' }, { fgtsSaldo: 80000, fgtsAporteMensal: 600 },
  { situacaoAtual:'consorcio-em-andamento', parcelasPagasConsorcio: 41, mesContemplacao: 60 },
  { situacaoAtual:'consorcio-em-andamento', parcelasPagasConsorcio: 41, mesContemplacao: 42, valorImovel: 750000, valorCarta: 1000000, lancePct: 58, tarifaAvaliacaoConsorcio: 920000 },
  { lancePct: 58, modoPosLance: 'parcela', valorCarta: 1000000, valorImovel: 750000 },
  { situacaoAtual:'consorcio-em-andamento', parcelasPagasConsorcio: 150, mesContemplacao: 160, valorCarta: 1000000 },
  { situacaoAtual:'financiamento-em-andamento', parcelasPagasFinanciamento: 60 },
  { situacaoAtual:'financiamento-em-andamento', parcelasPagasFinanciamento: 340 },
  { custoOportunidadeAa: 0 }, { custoOportunidadeAa: 25 }, { ipcaAa: 0, reajusteCartaAa: 0, trAm: 0 }, { aluguelMensal: 0 },
  { devolveFundoReserva: true, fundoReservaPct: 3 }, { seguroAm: 0.05 }, { taxaAdmPct: 0 }, { prazoMesesConsorcio: 60, mesContemplacao: 10 },
  { prazoMeses: 60 }, { valorImovel: 150000, valorCarta: 150000 }, { valorImovel: 5000000, valorCarta: 5000000 },
];
const SIT = process.env.SIT === '1';
for (let i = 0; i < 40; i++) fixed.push({
  ...(SIT ? pick([{situacaoAtual:'consorcio-em-andamento', parcelasPagasConsorcio: pick([5,41,100,180,199])},{situacaoAtual:'financiamento-em-andamento', parcelasPagasFinanciamento: pick([1,60,200,350])},{}]) : {}),
  sistema: pick(['SAC','PRICE']), entradaPct: pick([10,20,30,60,90]), jurosAa: pick([8,10.5,12,14]), prazoMeses: pick([120,240,360,420]),
  valorCarta: pick([500000,600000,700000,1000000]), prazoMesesConsorcio: pick([120,180,200,220]), taxaAdmPct: pick([12,16,19,25]),
  mesContemplacao: pick([1,6,24,60,120,180]), lancePct: pick([0,0,15,30,50]), embutidoPct: pick([0,0,10,25]),
  embutidoAbateSaldo: rnd()<0.5, redutorParcelaPct: pick([0,0,25,35]), modoPosLance: pick(['prazo','parcela']),
  custoOportunidadeAa: pick([6,9,11.4,14]), amortExtraMensal: pick([0,0,500,3000]), modoAmortExtra: pick(['prazo','parcela']),
  devolveFundoReserva: rnd()<0.3,
});
const b = await chromium.launch(); const p = await b.newPage();
const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
const fails = []; let n = 0;
for (const sc of fixed) {
  n++; const before = errs.length;
  await p.goto(URL); await p.getByTestId('verdict-winner').waitFor();
  const ordered = Object.entries(sc).sort(([a]) => a === 'situacaoAtual' ? -1 : 0);
  for (const [k, v] of ordered) {
    const el = p.locator('#campo-' + k); if (!(await el.count())) { fails.push([sc, 'campo ausente ' + k]); continue; }
    const tag = await el.evaluate(e => e.tagName + ':' + (e.type || ''));
    if (tag.startsWith('SELECT')) await el.selectOption(String(v)); else if (tag.includes('checkbox')) await el.setChecked(!!v); else await el.fill(String(v));
  }
  await p.waitForTimeout(400); await p.locator("main.resultados[aria-busy=false]").waitFor();
  const body = await p.locator('body').innerText();
  const bad = s => fails.push([sc, s]);
  if (/NaN|Infinity|undefined|null\b|\[object/.test(body)) bad('texto quebrado: ' + body.match(/.{0,40}(NaN|Infinity|undefined|null\b|\[object).{0,40}/)?.[0]);
  if (errs.length > before) bad('console: ' + errs.slice(before).join(' / '));
  const tabs = await p.$$eval('table', ts => ts.map(t => ({ id: t.dataset.testid || '', h: t.closest('section')?.querySelector('h2')?.innerText || '', rows: [...t.rows].map(r => [...r.cells].map(c => c.innerText.trim())) })));
  const sum = tabs.find(t => t.id === 'summary-table'); const cat = tabs.find(t => t.h.startsWith('Custos por categoria'));
  if (!sum || !cat) { bad('tabela ausente'); continue; }
  const row = l => sum.rows.find(r => r[0].startsWith(l));
  const vp = row('Régua econômica').slice(1).map(num), nom = row('Régua ingênua').slice(1).map(num), real = row('Em R$ de hoje').slice(1).map(num);
  const tot = cat.rows.find(r => r[0] === 'Total').slice(1).map(num);
  const body2 = cat.rows.slice(2).filter(r => r[0] !== 'Total');
  const s = [0,1,2,3].map(j => body2.reduce((a, r) => a + num(r[j+1]), 0));
  const tol = Math.max(5, body2.length);
  [[tot[0],nom[0],'nom fin'],[tot[1],vp[0],'vp fin'],[tot[2],nom[1],'nom con'],[tot[3],vp[1],'vp con']].forEach(([a,c,l]) => { if (Math.abs(a-c) > 2) bad(`total categoria ${l} ${a} != resumo ${c}`); });
  s.forEach((x, j) => { if (Math.abs(x - tot[j]) > tol) bad(`soma categorias col${j} ${x} != total ${tot[j]}`); });
  const temEntrada = cat.rows.some(r => /entrada de caixa/.test(r[0])); const ipca = sc.ipcaAa ?? 4.6; if (ipca > 0 && !temEntrada) [0,1].forEach(j => { if (real[j] > nom[j] + 1) bad(`real > nominal col${j}`); });
  const imovel = sc.valorImovel ?? 600000; const diff = vp[0] - vp[1];
  const esperado = Math.abs(diff) < EMP * imovel ? 'Empate' : diff > 0 ? 'Consórcio' : 'Financiamento';
  const win = (await p.getByTestId('verdict-winner').innerText()).trim();
  if (!win.toLowerCase().startsWith(esperado.toLowerCase().slice(0,5))) bad(`vencedor "${win}" mas VP fin ${vp[0]} con ${vp[1]} → ${esperado}`);
  for (const id of ['verdict','hidden-costs','payoff-plan']) { const tx = await p.getByTestId(id).locator(':scope > p, :scope li, :scope p').allInnerTexts().then(a => a.join(' ')).catch(() => ''); const m = tx.match(/.{0,50}-R\$.{0,20}/); if (m) bad(`valor negativo em prosa (${id}): ${m[0]}`); }
  // contradições título x texto nos itens ocultos do consórcio (print do usuário, nov/2026)
  const li = async id => (await p.locator('#' + id).count()) ? (await p.locator('#' + id).innerText()) : '';
  const parc = await li('con-parcela-cresce');
  const ini = num((parc.match(/começa em (R\$\s?[\d.]+)/) || [])[1] || ''), fim = num((parc.match(/termina em (R\$\s?[\d.]+)/) || [])[1] || '');
  if (/cresce/.test(parc.split('.')[0]) && (/ cai de /.test(parc) || fim < ini)) bad(`parcela "cresce" mas cai: ${parc.slice(0, 160)}`);
  if (/estável/.test(parc.split('.')[0]) && Math.abs(fim - ini) > ini * 0.005) bad(`parcela "estável" mas muda: ${parc.slice(0, 160)}`);
  if (/reajuste anual de 0,0%/.test(parc)) bad('parcela atribui crescimento a reajuste de 0%');
  const emb = await li('con-embutido');
  if (/não abate/.test(emb.split('.')[0]) && /a dívida cai junto/.test(emb)) bad('embutido: título "não abate" com texto "abate"');
  const meses = new Set([...(await p.getByTestId('hidden-costs').innerText()).matchAll(/contemplação (?:no |\()?mês (\d+)/g)].map(x => x[1]));
  if (meses.size > 1) bad('meses de contemplação divergentes entre itens: ' + [...meses].join(','));
  const exig = await li('con-exigencias'); const tarifa = num((exig.match(/custa (R\$\s?[\d.]+)/) || [])[1] || '');
  if (tarifa > 0.02 * (sc.valorImovel ?? 600000) && !/parece ser o preço do imóvel/.test(exig)) bad('tarifa de avaliação absurda sem ressalva');
  const e = sc.entradaPct ?? 20; const alertaE = /dificilmente é aprovada|compra à vista/.test(body);
  if ((sc.situacaoAtual ?? 'nova-compra') !== 'financiamento-em-andamento' && alertaE !== (e < 20 || e > 80)) bad(`alerta de entrada=${alertaE} com entrada ${e}%`);
  const neg = cat.rows.slice(2).filter(r => r[0] !== 'Total' && !/espécie|devolução|restitui/i.test(r[0]) && !(r[0].startsWith('Principal') && /amortização negativa/.test(body)) && !(r[0].startsWith('Fundo de reserva') && /Fundo de reserva negativo/.test(body))).filter(r => r.slice(1).some(c => num(c) < 0));
  if (neg.length) bad('categoria negativa: ' + neg.map(r => r[0]).join(','));
}
console.log(`cenarios=${n} falhas=${fails.length}`);
for (const [sc, f] of fails) console.log(JSON.stringify(sc), '->', f);
await b.close();
