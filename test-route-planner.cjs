const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) throw new Error('No embedded script');
const source = scripts.map(x => x[1]).join('\n');
const begin = source.indexOf('function validCustomerCoords(');
const end = source.indexOf('function renderCustomers(){', begin);
if (begin < 0 || end < 0) throw new Error('Route functions not found');
const routeCode = source.slice(begin, end);
const routeExports = new Function('text', 'num', 'compareCustomerNames', 'productById', `${routeCode}\nreturn {validCustomerCoords,haversineKm,calculateRouteOrder,customerDirectionsUrl,sanitizeRouteForecastOrders,routeForecastTotal,routeForecastToSaleCart};`)(
  x => x == null ? '' : String(x),
  (x, fallback=0) => Number.isFinite(Number(x)) ? Number(x) : fallback,
  (a,b) => String(a.name).localeCompare(String(b.name),'pt-BR',{sensitivity:'base'}),
  id => ({id:'water',name:'Água 20lts',price:7.5,commissionPerUnit:.75})
);
const {validCustomerCoords, haversineKm, calculateRouteOrder, customerDirectionsUrl,sanitizeRouteForecastOrders,routeForecastTotal,routeForecastToSaleCart} = routeExports;
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const close = (a,b,tol=.3) => Math.abs(a-b) <= tol;
assert(validCustomerCoords({coords:'-23.55, -46.63'}).lat === -23.55, 'valid negative coordinates');
assert(validCustomerCoords({coords:'91,0'}) === null, 'reject out-of-range latitude');
assert(validCustomerCoords({coords:'0,181'}) === null, 'reject out-of-range longitude');
assert(validCustomerCoords({coords:'abc'}) === null, 'reject malformed coordinates');
assert(close(haversineKm({lat:0,lng:0},{lat:0,lng:1}),111.19,.4), 'haversine degree distance');
const A={id:'A',name:'A',coords:'0,0'}, B={id:'B',name:'B',coords:'0,1'}, C={id:'C',name:'C',coords:'0,2'}, far={id:'F',name:'F',coords:'10,10'};
let r=calculateRouteOrder([A,B,C],'C');
assert(r.ordered.map(x=>x.id).join(',')==='C,B,A', 'nearest-neighbor chosen start and next stops');
assert(close(r.distance,222.39,.6), 'approximate consecutive distance');
const no={id:'N',name:'Manual first',address:'Rua Um'}, selected=[C,no,A];
r=calculateRouteOrder(selected,'N');
assert(calculateRouteOrder([A,C],'A').ordered.map(x=>x.id).join(',')==='A,C', 'only selected customers are routed');
assert(calculateRouteOrder([A,C],'A').ordered.every(x=>x.id!=='B'&&x.id!=='F'), 'unselected customers are omitted');
const far={id:'F',name:'Far',coords:'10,10'};
assert(calculateRouteOrder([A,B,C,far],'C').ordered.map(x=>x.id).join(',')==='C,B,A,F', 'nearest neighbor continues with remaining far stop');
const originalRouteOrder=calculateRouteOrder([A,B,C],'C').ordered.map(x=>x.id).join(',');
assert(originalRouteOrder==='C,B,A', 'chosen first stop preserved after route calculation');
r=calculateRouteOrder(selected,'N');
assert(r.ordered.map(x=>x.id).join(',')==='N,A,C', 'manual first stop retained; coordinate stops are ordered');
assert(close(r.distance,222.39,.6), 'distance excludes unknown segment from manual first stop');
assert(!r.ordered.some(x=>x.id==='B'||x.id==='F'), 'only supplied selected subset is planned');
assert(calculateRouteOrder([no],'N').ordered.map(x=>x.id).join(',')==='N', 'single customer without coordinates remains manually routable');
assert(source.includes('function moveManualRouteStop'), 'manual stops can be reordered with accessible controls');
const mix=calculateRouteOrder([B,no,C],'B');
assert(mix.ordered.map(x=>x.id).join(',')==='B,C,N', 'mixed coordinate/manual stops');
assert(customerDirectionsUrl({coords:'-23.5,-46.6',address:'Rua A'}).includes(encodeURIComponent('-23.5,-46.6')), 'maps uses coordinates first');
assert(customerDirectionsUrl({coords:'bad',address:'Rua A, São Luís'}).includes(encodeURIComponent('Rua A, São Luís')), 'maps address fallback');
assert(customerDirectionsUrl({coords:'bad',address:''}) === '', 'no map link without location or address');
assert(source.includes("`${ROUTE_DAY_KEY}:${today}`"), 'route state key scoped per date');
assert(source.includes('routeState.selectedIds=routeState.selectedIds.filter(id=>validIds.has(id))'), 'deleted customers pruned from local selection');
const payloadStart=source.indexOf('function buildGestaoOutbox('), payloadEnd=source.indexOf('function enqueueGestaoSale(',payloadStart);
assert(payloadStart>=0 && payloadEnd>payloadStart, 'sync payload builder exists');
const payloadCode=source.slice(payloadStart,payloadEnd);
assert(!payloadCode.includes('routeState') && !payloadCode.includes('ROUTE_DAY_KEY'), 'route fields are absent from Gestão sync payload builder');

const products=[{id:'water',name:'Água 20lts',price:7.5,commissionPerUnit:.75},{id:'cup',name:'Copo',price:2,commissionPerUnit:0}];
const rawForecast={C:{items:[{productId:'water',quantity:10},{productId:'cup',quantity:0},{productId:'missing',quantity:4}],updatedAt:'2026-10-28T00:00:00Z'},gone:{items:[{productId:'water',quantity:2}]}};
const forecasts=sanitizeRouteForecastOrders(rawForecast,['C'],products);
assert(forecasts.C.items.length===1&&forecasts.C.items[0].quantity===10,'route forecast keeps valid products and quantities only');
assert(!forecasts.gone,'forecast for deleted/nonexistent customer is pruned');
assert(forecasts.C.items[0].unitPrice===7.5,'forecast price refreshes from current catalog');
assert(routeForecastTotal(forecasts.C)===75,'forecast total is only an estimate');
const draftCart=routeForecastToSaleCart.call(null,forecasts.C);
assert(draftCart.length===1&&draftCart[0].total===75 && draftCart[0].unitPrice===7.5,'arrival creates editable cart draft with forecast line total');
assert(!payloadCode.includes('plannedOrders')&&!payloadCode.includes('routeForecast'),'forecast never enters the Gestão sync payload');
assert(source.includes('delete routeState.plannedOrders[String(current.id)]'),'forecast clears only after completed sale advances route');
assert(source.includes('Salvar previsão neste aparelho')||source.includes('Previsão salva neste aparelho'),'forecast is explicitly local and not a sale');

console.log('Route planner tests passed: route ordering, maps, day-local persistence, planned-order filtering, estimate total, editable arrival draft, no sync leakage, and clearing after completed sale.');
