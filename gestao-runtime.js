/* Vendalume Gestão: manager client. Only the publishable Supabase key is used here. */
(() => {
  'use strict';
  const SUPABASE_URL = 'https://zifubexfqkzlqrpjqdul.supabase.co';
  const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_nAk87ogyQHbQaJTD5hpTGA_H0ZfzeyA';
  const $ = id => document.getElementById(id);
  const money = n => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n)||0);
  const dateStr = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  let dbClient, manager, business, sellers=[], devices=[], sales=[], goals=[], lastPairCode='', realtime;
  let toastTimer;
  function toast(message){const el=$('toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200)}
  function setAuthMessage(message,isError=false){const el=$('authMessage');if(el){el.textContent=message;el.style.color=isError?'#f2aaaa':'#a6b2b6'}}
  function showGate(id){['authGate','businessGate'].forEach(x=>{const el=$(x);if(el)el.hidden=x!==id})}
  function initials(name){return String(name||'?').split(/\s+/).map(x=>x[0]).slice(0,2).join('').toUpperCase()}
  const esc=value=>String(value??'').replace(/[&<>\"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[ch]));
  function removeDemoLabels(){document.querySelectorAll('.demo-banner,.only-demo').forEach(e=>e.remove())}
  function setKpis(){
    const total=sales.reduce((a,s)=>a+Number(s.total||0),0),count=sales.length,commission=sales.reduce((a,s)=>a+Number(s.commission_total||0),0);
    const vals=document.querySelectorAll('#overview .kpi-value');
    if(vals[0])vals[0].textContent=money(total);if(vals[1])vals[1].textContent=String(count);if(vals[2])vals[2].textContent=money(count?total/count:0);if(vals[3])vals[3].textContent=money(commission);
    const foot=document.querySelectorAll('#overview .kpi-foot');if(foot[0])foot[0].textContent='Vendas sincronizadas da equipe';if(foot[1])foot[1].textContent='Vendas concluídas no período';if(foot[2])foot[2].textContent='Valor médio por venda';if(foot[3])foot[3].textContent='Comissões dos itens sincronizados';
  }
  function rangeForPeriod(){const now=new Date(),today=dateStr(now),sel=$('period')?.value||'Hoje';let from=today,to=today;if(sel==='Últimos 7 dias'){const d=new Date(now);d.setDate(d.getDate()-6);from=dateStr(d)}else if(sel==='Este mês'){from=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`}return {from,to:sel==='Este mês'?today:to}}
  function goalFor(period,metric,sellerId=null){const today=dateStr(new Date()),d=new Date();const anchor=period==='month'?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`:today;return goals.find(g=>g.period===period&&g.metric===metric&&(g.seller_id||null)===(sellerId||null)&&g.target_period===anchor)}
  function renderGoalCard(){
    const total=sales.reduce((a,s)=>a+Number(s.total||0),0),target=goalFor('day','sales_value');
    const pct=target?Math.min(100,Math.round(total/Number(target.target_value)*100)):0;
    const ring=document.querySelector('.ring .progress');if(ring)ring.style.strokeDashoffset=String(283-(283*pct/100));
    const pctEl=document.querySelector('.ring strong');if(pctEl)pctEl.textContent=`${pct}%`;
    const copy=document.querySelector('.goal-copy p');if(copy)copy.innerHTML=target?`${money(total)} de ${money(target.target_value)}<br>Meta diária da equipe`:`${money(total)} vendidos<br>Meta diária ainda não configurada`;
    const remaining=document.querySelector('.goal-mini');if(remaining)remaining.textContent=target?`Faltam ${money(Math.max(0,Number(target.target_value)-total))}`:'Defina uma meta para acompanhar o progresso';
    const productGoal=goalFor('day','main_product_units');
    const productName=productGoal?.main_product_name||'Produto principal';
    const units=sales.reduce((sum,s)=>sum+(s.items||[]).filter(i=>i.product_name===productName).reduce((a,i)=>a+Number(i.quantity||0),0),0);
    const productText=document.querySelector('.product-goal .progress-row');if(productText)productText.innerHTML=`<span>${esc(productName)}</span><strong>${units} / ${productGoal?Number(productGoal.target_value):0} un.</strong>`;
    const bar=document.querySelector('.product-goal .progress-bar span');if(bar)bar.style.width=`${productGoal?Math.min(100,Math.round(units/Number(productGoal.target_value)*100)):0}%`;
  }
  function renderSellerRows(query=''){
    const tbody=$('sellerRows');if(!tbody)return;
    const totalGoal=goalFor('day','sales_value');
    const stats=sellers.map(s=>{
      const ss=sales.filter(x=>x.seller_id===s.id),value=ss.reduce((a,x)=>a+Number(x.total||0),0),comm=ss.reduce((a,x)=>a+Number(x.commission_total||0),0);
      const g=goalFor('day','sales_value',s.id);const pct=g?Math.min(100,Math.round(value/Number(g.target_value)*100)):0;
      const cls=g?(pct>=100?'good':pct>=55?'warn':'low'):'warn';const state=g?(pct>=100?'Acima da meta':pct>=55?'No ritmo':'Atenção'):'Sem meta';
      return {...s,count:ss.length,value,comm,pct,cls,state};
    }).filter(s=>s.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>b.value-a.value);
    tbody.innerHTML=stats.length?stats.map(s=>`<tr><td><div class="seller-cell"><span class="seller-avatar">${initials(s.name)}</span>${esc(s.name)}</div></td><td>${s.count}</td><td><strong>${money(s.value)}</strong></td><td class="goal-cell"><div class="progress-row"><span>${s.pct}%</span><span>${s.state==='Sem meta'?'sem meta':'meta'}</span></div><div class="progress-bar"><span style="width:${s.pct}%"></span></div></td><td>${money(s.comm)}</td><td><span class="badge ${s.cls}">${s.state}</span></td></tr>`).join(''):`<tr><td colspan="6" class="muted">Nenhum vendedor cadastrado neste negócio.</td></tr>`;
    const count=document.querySelector('#overview .table-head .count-pill');if(count)count.textContent=`${sellers.filter(s=>s.active).length} vendedores`;
    const teamState=document.querySelector('#overview .card-head .count-pill');if(teamState&&totalGoal)teamState.textContent='Meta configurada';
  }
  function renderSellerPage(){
    const box=document.querySelector('#sellers .mini-list');if(!box)return;
    box.innerHTML=sellers.length?sellers.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).map(s=>`<div class="device-row"><div><strong>${esc(s.name)}</strong><small>${esc(s.code)} • ${s.active?'Vendedor ativo':'Vendedor desativado'}</small></div>${s.active?`<button class="btn small" data-deactivate="${s.id}">Desativar</button>`:'<span class="badge warn">Inativo</span>'}</div>`).join(''):`<div class="muted">Nenhum vendedor cadastrado.</div>`;
    box.querySelectorAll('[data-deactivate]').forEach(b=>b.addEventListener('click',()=>deactivateSeller(b.dataset.deactivate)));
  }
  function renderGoalForm(){
    const specs=[['goalDaySales','day','sales_value'],['goalMonthSales','month','sales_value'],['goalDayUnits','day','main_product_units'],['goalMonthUnits','month','main_product_units']];
    const now=new Date(),day=dateStr(now),month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    specs.forEach(([id,period,metric])=>{const el=$(id);if(!el)return;const target=goals.find(g=>g.period===period&&g.metric===metric&&!g.seller_id&&g.target_period===(period==='day'?day:month));el.value=target?String(target.target_value):''});
    const main=goals.find(g=>g.metric==='main_product_units'&&!g.seller_id)?.main_product_name;const product=$('mainProductName');if(product&&main)product.value=main;
  }
  function renderReport(){
    const card=document.querySelector('#reports .card');if(!card)return;
    const range=rangeForPeriod();
    const grouped=sellers.map(s=>{const ss=sales.filter(x=>x.seller_id===s.id);return {name:s.name,count:ss.length,total:ss.reduce((a,x)=>a+Number(x.total||0),0),commission:ss.reduce((a,x)=>a+Number(x.commission_total||0),0)}}).filter(x=>x.count||sales.length===0).sort((a,b)=>b.total-a.total);
    const products=new Map();
    sales.forEach(s=>{(s.items||[]).forEach(i=>{const name=String(i.product_name||'Produto sem nome');const row=products.get(name)||{name,quantity:0,total:0,commission:0};row.quantity+=Number(i.quantity||0);row.total+=Number(i.line_total||0);row.commission+=Number(i.commission_per_unit||0)*Number(i.quantity||0);products.set(name,row)})});
    const productRows=[...products.values()].sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name,'pt-BR'));
    const periodLabel=`${range.from} a ${range.to}`;
    card.innerHTML=`<div class="card-head"><div><h2 class="card-title">Resumo por vendedor</h2><div class="card-sub">Período: ${periodLabel}</div></div></div><div class="table-scroll"><table><thead><tr><th>Vendedor</th><th>Vendas</th><th>Total</th><th>Comissão</th></tr></thead><tbody>${grouped.length?grouped.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.count}</td><td>${money(x.total)}</td><td>${money(x.commission)}</td></tr>`).join(''):'<tr><td colspan="4">Sem vendas no período selecionado.</td></tr>'}</tbody></table></div><div class="card-head" style="margin-top:22px"><div><h2 class="card-title">Produtos vendidos</h2><div class="card-sub">Quantidade e valor total no período</div></div></div><div class="table-scroll"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor vendido</th><th>Comissão</th></tr></thead><tbody>${productRows.length?productRows.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.quantity}</td><td>${money(x.total)}</td><td>${money(x.commission)}</td></tr>`).join(''):'<tr><td colspan="4">Sem produtos vendidos no período.</td></tr>'}</tbody></table></div>`;
  }
  function renderChart(){
    const line=document.querySelector('#overview .chart-line'),fill=document.querySelector('#overview .chart-fill');if(!line||!fill)return;
    const days=[];const now=new Date();for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(now.getDate()-i);days.push(dateStr(d))}
    const totals=days.map(day=>sales.filter(s=>s.sale_date===day).reduce((a,s)=>a+Number(s.total||0),0));const max=Math.max(1,...totals);
    const pts=totals.map((v,i)=>({x:48+i*(642/6),y:158-(v/max)*125}));const d=pts.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');line.setAttribute('d',d);fill.setAttribute('d',`${d} L690 166 L48 166 Z`);
    const labels=document.querySelectorAll('#overview .chart-label');days.forEach((day,i)=>{if(labels[i])labels[i].textContent=new Date(`${day}T12:00:00`).toLocaleDateString('pt-BR',{weekday:'short'}).replace('.','')});
    const sub=document.querySelector('#overview .grid-main .card-sub');if(sub)sub.textContent=sales.length?'Equipe • vendas sincronizadas':'As vendas sincronizadas aparecerão aqui';
  }
  async function deactivateSeller(id){if(!confirm('Desativar este vendedor? O histórico de vendas e comissões será mantido.'))return;const {error}=await dbClient.from('gestao_sellers').update({active:false}).eq('business_id',business.id).eq('id',id);if(error){toast(error.message);return}await dbClient.from('gestao_devices').update({active:false}).eq('business_id',business.id).eq('seller_id',id);await loadDashboard();toast('Vendedor desativado; histórico mantido.')}
  function renderAlerts(){
    const list=document.querySelector('#overview .attention-list');if(!list)return;
    const teamGoal=goalFor('day','sales_value'),total=sales.reduce((a,s)=>a+Number(s.total||0),0);
    const atRisk=sellers.filter(s=>s.active&&!sales.some(x=>x.seller_id===s.id));
    const msgs=[];if(!sales.length)msgs.push({name:'Nenhuma venda sincronizada ainda',detail:'As novas vendas aparecerão aqui após o vínculo do aparelho.'});
    else if(teamGoal&&total<Number(teamGoal.target_value))msgs.push({name:'Meta diária em andamento',detail:`Faltam ${money(Number(teamGoal.target_value)-total)} para a meta da equipe.`});
    atRisk.slice(0,3).forEach(s=>msgs.push({name:s.name,detail:'Sem venda no período selecionado.'}));
    list.innerHTML=msgs.length?msgs.map(x=>`<div class="attention"><span class="attention-icon">!</span><p><strong>${x.name}</strong><small>${x.detail}</small></p></div>`).join(''):`<div class="attention"><span class="attention-icon">✓</span><p><strong>Sem alertas agora</strong><small>A equipe está registrando vendas.</small></p></div>`;
    const pill=list.closest('.card')?.querySelector('.count-pill');if(pill)pill.textContent=`${msgs.length} alertas`;
  }
  function renderDevices(){
    const box=document.querySelector('#devices .mini-list');if(!box)return;
    const byId=new Map(sellers.map(s=>[s.id,s]));
    box.innerHTML=devices.length?devices.map(d=>{const s=byId.get(d.seller_id);return `<div class="device-row"><div><strong>${esc(d.device_name||'Aparelho')} • ${esc(s?.name||'Vendedor')}</strong><small>${d.active?'Vinculado':'Desvinculado'} • última sincronização ${d.last_seen_at?new Date(d.last_seen_at).toLocaleString('pt-BR'):'ainda não'}</small></div>${d.active?`<button class="btn small" data-unlink="${d.id}">Desvincular</button>`:'<span class="badge warn">Inativo</span>'}</div>`}).join(''):`<div class="muted">Nenhum aparelho vinculado ainda.</div>`;
    box.querySelectorAll('[data-unlink]').forEach(b=>b.addEventListener('click',()=>unlinkDevice(b.dataset.unlink)));
    const limit=document.querySelector('#devices .count-pill');if(limit)limit.textContent=`${devices.filter(d=>d.active).length} de ${business.device_limit} aparelhos`;
    const syncCards=document.querySelectorAll('#overview .bottom-grid .card');const syncRows=syncCards[1]?.querySelectorAll('.device-row strong');if(syncRows?.[0])syncRows[0].textContent=String(sales.length);if(syncRows?.[1])syncRows[1].textContent=String(devices.filter(d=>d.active).length);
    const syncLabels=syncCards[1]?.querySelectorAll('.device-row small');if(syncLabels?.[0])syncLabels[0].textContent='Vendas recebidas neste período';if(syncLabels?.[1])syncLabels[1].textContent='Aparelhos ativos vinculados';
    const sel=$('pairSellerSelect');if(sel){const activeSellerIds=new Set(devices.filter(d=>d.active).map(d=>d.seller_id));sel.innerHTML='<option value="">Escolha um vendedor</option>'+sellers.filter(s=>s.active&&!activeSellerIds.has(s.id)).map(s=>`<option value="${s.id}">${s.name}</option>`).join('')}
  }
  async function loadDashboard(){
    if(!business||!dbClient)return;
    const {from,to}=rangeForPeriod();
    const [sellerRes,deviceRes,saleRes,goalRes]=await Promise.all([
      dbClient.from('gestao_sellers').select('id,code,name,active').eq('business_id',business.id).order('name'),
      dbClient.from('gestao_devices').select('id,business_id,seller_id,device_name,active,last_seen_at').eq('business_id',business.id),
      dbClient.from('gestao_sales').select('business_id,sale_id,seller_id,sale_date,sale_created_at,total,payment_method,pix_amount,cash_amount,commission_total,status').eq('business_id',business.id).eq('status','completed').gte('sale_date',from).lte('sale_date',to).order('sale_date',{ascending:false}).limit(1000),
      dbClient.from('gestao_goals').select('id,business_id,seller_id,period,metric,target_period,target_value,main_product_name').eq('business_id',business.id)
    ]);
    for(const r of [sellerRes,deviceRes,saleRes,goalRes])if(r.error)throw r.error;
    sellers=sellerRes.data||[];devices=deviceRes.data||[];sales=saleRes.data||[];goals=goalRes.data||[];
    const saleIds=sales.map(s=>s.sale_id);let itemData=[];
    if(saleIds.length){const items=await dbClient.from('gestao_sale_items').select('sale_id,product_name,quantity,unit_price,line_total,commission_per_unit').eq('business_id',business.id).in('sale_id',saleIds);if(items.error)throw items.error;itemData=items.data||[]}
    const itemMap=new Map();itemData.forEach(i=>{if(!itemMap.has(i.sale_id))itemMap.set(i.sale_id,[]);itemMap.get(i.sale_id).push(i)});sales=sales.map(s=>({...s,items:itemMap.get(s.sale_id)||[]}));
    setKpis();renderGoalCard();renderSellerRows($('sellerSearch')?.value||'');renderSellerPage();renderGoalForm();renderChart();renderAlerts();renderDevices();renderReport();
    const switcher=document.querySelector('.business-switch strong');if(switcher)switcher.textContent=business.name;
    const userLabel=document.querySelector('.user-box small');if(userLabel)userLabel.textContent=manager?.email||'Gerente';
    const topDate=document.querySelector('.topbar .eyebrow');if(topDate)topDate.textContent=`${new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).toLocaleUpperCase('pt-BR')}`;
  }
  async function loadManager(){
    const {data:{user},error}=await dbClient.auth.getUser();if(error||!user){showGate('authGate');return}manager=user;
    const {data:members,error:merr}=await dbClient.from('gestao_memberships').select('business_id,role').eq('user_id',user.id).eq('active',true);
    if(merr)throw merr;
    if(!members?.length){showGate('businessGate');return}
    const ids=members.map(m=>m.business_id);
    const {data:list,error:berr}=await dbClient.from('gestao_businesses').select('id,code,name,device_limit').in('id',ids);
    if(berr)throw berr;
    if(!list?.length){showGate('businessGate');return}
    business=list[0];showGate('');removeDemoLabels();
    document.querySelectorAll('.view').forEach(v=>v.dataset.connected='true');
    await loadDashboard();
    if(realtime)dbClient.removeChannel(realtime);
    realtime=dbClient.channel(`gestao-${business.id}`).on('postgres_changes',{event:'*',schema:'public',table:'gestao_sales',filter:`business_id=eq.${business.id}`},()=>loadDashboard().catch(e=>toast(e.message))).on('postgres_changes',{event:'*',schema:'public',table:'gestao_sale_items',filter:`business_id=eq.${business.id}`},()=>loadDashboard().catch(e=>toast(e.message))).on('postgres_changes',{event:'*',schema:'public',table:'gestao_sellers',filter:`business_id=eq.${business.id}`},()=>loadDashboard().catch(e=>toast(e.message))).on('postgres_changes',{event:'*',schema:'public',table:'gestao_devices',filter:`business_id=eq.${business.id}`},()=>loadDashboard().catch(e=>toast(e.message))).on('postgres_changes',{event:'*',schema:'public',table:'gestao_goals',filter:`business_id=eq.${business.id}`},()=>loadDashboard().catch(e=>toast(e.message))).subscribe();
  }
  async function refreshDashboard(){const button=$('refreshDashboard');if(!business||!dbClient){toast('Entre no negócio para atualizar.');return}if(button){button.disabled=true;button.textContent='Atualizando…'}try{await loadDashboard();toast('Dados atualizados.')}catch(error){toast(error.message||'Não consegui atualizar os dados.')}finally{if(button){button.disabled=false;button.textContent='↻ Atualizar'}}}
  async function signIn(e){e.preventDefault();if(!dbClient){setAuthMessage('Não consegui carregar o serviço de autenticação.',true);return}const email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||!password){setAuthMessage('Informe e-mail e senha.',true);return}setAuthMessage('Entrando…');const {error}=await dbClient.auth.signInWithPassword({email,password});if(error){setAuthMessage(error.message,true);return}try{await loadManager()}catch(err){setAuthMessage(err.message||'Não foi possível abrir o negócio.',true)}}
  async function signUp(){if(!dbClient){setAuthMessage('Não consegui carregar o serviço de autenticação.',true);return}const email=$('authEmail').value.trim(),password=$('authPassword').value;if(!email||password.length<8){setAuthMessage('Informe o e-mail e uma senha com pelo menos 8 caracteres.',true);return}setAuthMessage('Criando acesso…');const {data,error}=await dbClient.auth.signUp({email,password});if(error){setAuthMessage(error.message,true);return}if(!data.session){setAuthMessage('Acesse seu e-mail para confirmar a conta; depois volte e entre com sua senha.');return}try{await loadManager()}catch(err){setAuthMessage(err.message||'Não foi possível abrir o negócio.',true)}}
  async function createBusiness(e){e.preventDefault();const name=$('businessName')?.value.trim();if(!name){$('businessMessage').textContent='Informe o nome do negócio.';return}const {data,error}=await dbClient.rpc('gestao_create_business',{p_name:name,p_device_limit:31});if(error){$('businessMessage').textContent=error.message;return}const {data:{user}}=await dbClient.auth.getUser();manager=user;business={id:data.business_id,code:data.business_code,name:data.name,device_limit:data.device_limit};showGate('');removeDemoLabels();await loadDashboard()}
  async function addSeller(){if(!business)return;const name=prompt('Nome do vendedor:');if(!name?.trim())return;const code='VEN-'+randomPairCode().slice(0,8);const {error}=await dbClient.from('gestao_sellers').insert({business_id:business.id,code,name:name.trim(),active:true});if(error){toast(error.message);return}await loadDashboard();toast('Vendedor cadastrado.')}
  function installPairSelector(){const codeBox=$('pairCode');if(!codeBox||$('pairSellerSelect'))return;const s=document.createElement('select');s.id='pairSellerSelect';s.className='date-select';s.style.width='100%';s.style.marginTop='10px';s.innerHTML='<option value="">Escolha um vendedor</option>';codeBox.before(s)}
  function randomPairCode(){const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('').toUpperCase()}
  async function generateCode(){if(!business)return toast('Entre no negócio primeiro.');installPairSelector();const sellerId=$('pairSellerSelect')?.value;if(!sellerId)return toast('Escolha um vendedor antes de gerar o código.');const raw=randomPairCode();const {data,error}=await dbClient.rpc('gestao_create_pairing_code',{p_business_id:business.id,p_seller_id:sellerId,p_code:raw,p_device_name:'Aparelho do vendedor'});if(error){toast(error.message);return}lastPairCode=raw;$('pairCode').textContent=raw;const note=document.querySelector('#devices .only-demo');if(note)note.textContent=`Código de uso único. Expira às ${new Date(data.expires_at).toLocaleTimeString('pt-BR')}. Mostre-o ao vendedor apenas para vincular o aparelho.`;toast('Código temporário gerado; será exibido somente agora.')}
  async function copyCode(){if(!lastPairCode)return toast('Gere um código temporário primeiro.');try{await navigator.clipboard.writeText(lastPairCode);toast('Código copiado. Compartilhe somente com o vendedor correspondente.')}catch{toast('Não consegui copiar; selecione e copie o código manualmente.')}}
  async function unlinkDevice(id){if(!confirm('Desvincular este aparelho? O histórico de vendas continuará nos relatórios.'))return;const {error}=await dbClient.from('gestao_devices').update({active:false}).eq('id',id).eq('business_id',business.id);if(error){toast(error.message);return}await loadDashboard();toast('Aparelho desvinculado.')}
  async function changeDeviceLimit(){if(!business)return;const value=Number(prompt('Novo limite de aparelhos para este negócio:',String(business.device_limit)));if(!Number.isInteger(value)||value<1||value>500)return toast('Informe um número inteiro entre 1 e 500.');const {error}=await dbClient.from('gestao_businesses').update({device_limit:value}).eq('id',business.id);if(error){toast(error.message);return}business.device_limit=value;await loadDashboard();toast('Limite atualizado.')}
  async function saveGoals(){if(!business||!manager)return;const vals=[$('goalDaySales'),$('goalMonthSales'),$('goalDayUnits'),$('goalMonthUnits')].map(x=>Number(x?.value)||0);const productName=$('mainProductName')?.value.trim()||'';const now=new Date(),day=dateStr(now),month=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
    if((vals[2]>0||vals[3]>0)&&!productName)return toast('Informe o produto principal da meta.');
    const items=[['day','sales_value',day,vals[0],null],['month','sales_value',month,vals[1],null],['day','main_product_units',day,vals[2],productName],['month','main_product_units',month,vals[3],productName]].filter(x=>x[3]>0);
    for(const [period,metric,target_period,target_value,main_product_name] of items){const {data:old}=await dbClient.from('gestao_goals').select('id').eq('business_id',business.id).is('seller_id',null).eq('period',period).eq('metric',metric).eq('target_period',target_period).maybeSingle();const row={business_id:business.id,seller_id:null,period,metric,target_period,target_value,main_product_name,updated_by:manager.id,updated_at:new Date().toISOString()};const q=old?.id?dbClient.from('gestao_goals').update(row).eq('id',old.id):dbClient.from('gestao_goals').insert(row);const {error}=await q;if(error){toast(error.message);return}}
    await loadDashboard();toast('Metas salvas.')}
  async function printReport(){window.print()}
  async function signOut(){if(dbClient){if(realtime)dbClient.removeChannel(realtime);await dbClient.auth.signOut()}manager=null;business=null;showGate('authGate')}
  function showView(id){document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.id===id));document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===id));window.scrollTo({top:0,behavior:'smooth'})}
  function setup(){
    if(!window.supabase?.createClient){showGate('authGate');setAuthMessage('Não consegui carregar o serviço. Verifique a conexão com a internet e abra novamente.',true);return}
    dbClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    $('authForm')?.addEventListener('submit',signIn);$('signupButton')?.addEventListener('click',signUp);$('businessForm')?.addEventListener('submit',createBusiness);
    document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>showView(el.dataset.view)));
    $('sellerSearch')?.addEventListener('input',e=>renderSellerRows(e.target.value));$('period')?.addEventListener('change',()=>loadDashboard().catch(e=>toast(e.message)));
    const topActions=document.querySelector('#overview .top-actions');if(topActions&&!$('refreshDashboard')){const refresh=document.createElement('button');refresh.type='button';refresh.id='refreshDashboard';refresh.className='btn';refresh.textContent='↻ Atualizar';refresh.setAttribute('aria-label','Atualizar dados do Gestão');refresh.onclick=refreshDashboard;topActions.insertBefore(refresh,topActions.querySelector('button')||null)}
    const newSeller=document.querySelector('#sellers .topbar .btn.primary');if(newSeller)newSeller.onclick=addSeller;
    const genButtons=document.querySelectorAll('#devices button');genButtons.forEach(b=>{if(b.textContent.toLowerCase().includes('gerar código'))b.onclick=generateCode;if(b.textContent.toLowerCase().includes('copiar código'))b.onclick=copyCode});
    document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='PDF'||b.textContent.includes('Exportar PDF'))b.onclick=printReport});
    const save=document.querySelector('#goals .topbar .btn.primary');if(save)save.onclick=saveGoals;
    installPairSelector();const limitButton=document.createElement('button');limitButton.className='btn small';limitButton.textContent='Ajustar limite';limitButton.onclick=changeDeviceLimit;const devHead=document.querySelector('#devices .card-head');if(devHead&&!devHead.contains(limitButton))devHead.appendChild(limitButton);
    const userBox=document.querySelector('.user-box');if(userBox){const b=document.createElement('button');b.className='btn small';b.textContent='Sair';b.style.marginLeft='auto';b.onclick=signOut;userBox.appendChild(b)}
    dbClient.auth.getSession().then(async({data,error})=>{if(error){showGate('authGate');setAuthMessage(error.message,true);return}if(data.session){try{await loadManager()}catch(e){showGate('authGate');setAuthMessage(e.message||'Falha ao carregar os dados.',true)}}else showGate('authGate')});
  }
  window.generateCode=generateCode;window.copyCode=copyCode;window.printReport=printReport;window.showView=showView;window.addSeller=addSeller;
  window.addEventListener('DOMContentLoaded',setup);
})();
