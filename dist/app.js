import {STORAGE_KEY,GROUPS_KEY,HEADERS,blankContact,demoContacts,normalizeContact,cleanPhone,unique,compareNames,initial,validateContact,toExcelRows,planImport,findDialTarget} from './data.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DEFAULT_GROUPS=['家人','朋友','大学同学','同事','老师'];
let contacts=[],groups=[...DEFAULT_GROUPS],storageAvailable=true,serverAvailable=false,syncing=false,syncQueued=false,syncTimer,initialized=false;
function readLocalCache(){
  try{
    const raw=localStorage.getItem(STORAGE_KEY);
    const parsed=raw===null?null:JSON.parse(raw);
    if(Array.isArray(parsed))contacts=parsed.map(normalizeContact);
    const savedGroups=JSON.parse(localStorage.getItem(GROUPS_KEY)||'null');
    if(Array.isArray(savedGroups))groups=unique([...groups,...savedGroups]);
    storageAvailable=true;
  }catch(error){storageAvailable=false;console.warn('通讯录暂时无法读取本地存储',error);}
}
async function loadFromServer(){
  try{
    const response=await fetch('/api/contacts',{headers:{Accept:'application/json'}});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const payload=await response.json();
    const data=payload?.data;
    if(!data||!Array.isArray(data.contacts))throw Error('云端数据格式异常');
    contacts=data.contacts.map(normalizeContact);
    groups=unique(Array.isArray(data.groups)&&data.groups.length?data.groups:DEFAULT_GROUPS);
    serverAvailable=true;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(contacts));localStorage.setItem(GROUPS_KEY,JSON.stringify(groups));storageAvailable=true;}catch{}
  }catch(error){serverAvailable=false;console.warn('无法连接云端通讯录，使用本地缓存',error);}
}
async function initializeContacts(){
  readLocalCache();
  await loadFromServer();
  if(!serverAvailable&&!contacts.length)contacts=demoContacts().map(normalizeContact);
  groups=unique([...groups,...contacts.map(c=>c.group)]);
  initialized=true;
  updateHome();renderDial();
  if(!serverAvailable)setTimeout(()=>toast('云端暂时不可用，当前使用本地缓存'),700);
  else if(!storageAvailable)setTimeout(()=>toast('浏览器存储不可用，修改会直接保存到云端'),800);
}
function scheduleServerSync(){
  if(!initialized)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(syncToServer,300);
}
async function syncToServer(){
  syncTimer=null;
  if(syncing){syncQueued=true;return;}
  syncing=true;
  try{
    const response=await fetch('/api/contacts',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({contacts,groups})});
    if(!response.ok){let message=`HTTP ${response.status}`;try{const payload=await response.json();message=payload?.error?.message||message;}catch{}throw Error(message);}
    serverAvailable=true;
    if(currentView==='detail')setBookStatus('✓ 已保存到云端');
  }catch(error){
    serverAvailable=false;
    if(currentView==='detail')setBookStatus('仅保存在本机，云端同步失败');
    toast('云端同步失败，数据已保存在本机，请检查网络');
  }finally{
    syncing=false;
    if(syncQueued){syncQueued=false;scheduleServerSync();}
  }
}
let currentView='directory',draft=null,query='',groupFilter='',saveTimer,toastTimer,dialTimer,numberTimer,ringTimer,number='',ringing=false,soundOn=false,audioContext;
let rotation=0,dragging=false,lastAngle=0,dragStart=0,didDrag=false,selectedDigit=null,dialLocked=false;
const phoneArea=$('phoneArea'),overlay=$('bookOverlay'),dialog=$('utilityDialog');
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3800);}
function persist(){
  let localOk=true;
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(contacts));localStorage.setItem(GROUPS_KEY,JSON.stringify(groups));storageAvailable=true;}
  catch{storageAvailable=false;localOk=false;setBookStatus('本地存储不可用，正在保存到云端');toast('浏览器存储不可用，修改将直接保存到云端');}
  scheduleServerSync();updateHome();
  return localOk||serverAvailable;
}
function updateHome(){ $('contactCount').textContent=`${contacts.length} 位联系人`;$('miniNames').innerHTML='<span>一些名字<small>分组</small></span><span>一些名字<small>分组</small></span><span>一些名字<small>分组</small></span>'; }
function beep(freq=700,duration=.08){if(!soundOn)return;try{audioContext??=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume();const osc=audioContext.createOscillator(),gain=audioContext.createGain();osc.connect(gain);gain.connect(audioContext.destination);osc.frequency.value=freq;gain.gain.setValueAtTime(.025,audioContext.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audioContext.currentTime+duration);osc.start();osc.stop(audioContext.currentTime+duration);}catch{}}
function openDialog(title,body){$('dialogContent').innerHTML=`<h2 class="dialog-heading" id="dialogTitle">${title}<button data-action="close-dialog" aria-label="关闭窗口">×</button></h2>${body}`;if(!dialog.open)dialog.showModal();}
function closeDialog(){dialog.close();}
function showHelp(){openDialog('慢一点，也能好好联系',`<div class="dialog-body"><p><strong>01 / 拿起听筒</strong><br>点击听筒或转盘即可开始。拖动转盘，把数字转到右下方的指针处，停留 1 秒后录入；也可以轻点数字，或在气泡中直接输入。</p><p><strong>02 / 让电话替你翻页</strong><br>输入已设置的 3 位键盘短码，或号码满 11 位后，等待 2 秒，电话会响铃 1 秒，再打开已有联系人或新建页面。此处拨号用于查找联系人，不会拨打真实电话。短码可在联系人详情中设置；短号和国际号码可以在记事簿中录入。</p><p><strong>03 / 把值得记住的人写下</strong><br>点击小记事簿进入通讯录。详情页支持多个电话、邮箱、社交账号；点击右上书签标为特别关心。姓名有效时，修改自动保存，离开时再次检查。</p><p><strong>04 / 铅笔里藏着 Excel</strong><br>打开记事簿，点击右下角铅笔，可下载模板、导入或导出 Excel。</p><div class="dialog-rule"></div><p>联系人在保存时同步到<strong>云端的 SQLite 数据库</strong>，同时在本机保留一份缓存；刷新浏览器或换设备后重新打开即可读取。初次打开有 8 位虚构示例联系人，号码仅作演示。</p></div><div class="dialog-actions"><button class="primary-button" data-action="close-dialog">我知道了</button><button class="secondary-button" data-action="clear-demo">移除示例联系人</button></div>`);}
function personRow(c,extra='',showCode=false){const tones=['','red','gold'];return `<button class="person-row" data-action="open-contact" data-id="${esc(c.id)}"><span class="avatar ${tones[c.name.charCodeAt(0)%3]}">${esc(c.name.slice(0,1))}</span><span><span class="person-name">${esc(c.name)}</span><span class="person-meta">${esc(c.phones[0]||c.emails[0]||c.group)}</span></span><span class="row-detail">${showCode&&c.speedCode?`<span class="speed-code" aria-label="键盘短码 ${esc(c.speedCode)}">${esc(c.speedCode)}</span>`:''}${extra|| (c.favorite?'☆':'↗')}</span></button>`;}
function recordAccess(id,kind){const c=contacts.find(c=>c.id===id);if(!c)return;c[kind==='dial'?'dialCount':'searchCount']++;c.lastContactAt=Date.now();persist();}
function openBook(view='directory',phone=''){
  cancelPhoneTimers();ringing=false;phoneArea.classList.remove('ringing');overlay.hidden=false;document.body.style.overflow='hidden';
  if(view==='new'){draft={...blankContact(phone),dialCount:phone?1:0,lastContactAt:phone?Date.now():0};currentView='detail';renderDetail();}else{currentView='directory';query='';groupFilter='';renderDirectory();}
  $('closeBook').focus();
}
function closeBook(){if(currentView==='detail'&&!flushDraft(true))return;overlay.hidden=true;document.body.style.overflow='';resetPhone();$('openBook').focus();}
function setBookStatus(text){$('saveStatus').textContent=text;}
function renderDirectory(){currentView='directory';draft=null;$('bookBreadcrumb').textContent='通讯录 / 扉页';setBookStatus(serverAvailable?'云端已连接':(storageAvailable?'云端未连接，使用本地缓存':'本地存储不可用，请及时导出备份'));const favorites=contacts.filter(c=>c.favorite).sort(compareNames);const recent=contacts.filter(c=>c.dialCount+c.searchCount>0).sort((a,b)=>(b.dialCount+b.searchCount)-(a.dialCount+a.searchCount)||b.lastContactAt-a.lastContactAt).slice(0,5);
  $('leftPage').innerHTML=`<div class="page-eyebrow">ADDRESS BOOK</div><h2 class="page-heading" id="bookTitle">通讯录<span>✳</span></h2><h3 class="section-title">特别关心 <button class="plus" data-action="choose-favorites" aria-label="添加特别关心">+</button></h3><div class="favorite-list">${favorites.map(c=>personRow(c,'',true)).join('')||'<p class="paper-empty">把重要的人，夹在书签里。</p>'}</div><h3 class="section-title">最近联系的人 <small class="person-meta">常联系的前 5 位</small></h3><div class="recent-list">${recent.map(c=>personRow(c,`${c.dialCount+c.searchCount} 次`)).join('')||'<p class="paper-empty">拨个号码，或搜索一位朋友吧。</p>'}</div>`;
  $('rightPage').innerHTML=`<div class="page-eyebrow">A PLACE FOR EVERY NAME</div><h2 class="page-heading">所有联系人 <button class="small-icon" data-action="new-contact" aria-label="新增联系人">+</button></h2><div class="search-line"><span aria-hidden="true">⌕</span><input id="searchContacts" type="search" placeholder="寻找姓名、号码、邮箱或分组" aria-label="搜索联系人" value="${esc(query)}"></div><div class="directory-top"><span id="resultCount" class="person-meta"></span><button data-action="show-groups">分组索引 ↗</button></div><div id="directoryResults"></div>`;renderResults();}
function matchesQuery(c,q){return [c.name,c.group,...c.phones,...c.emails,...c.socials.map(s=>s.value),c.address].some(s=>s.toLowerCase().includes(q));}
function renderResults(){const q=query.trim().toLowerCase();const filtered=contacts.filter(c=>(!groupFilter||c.group===groupFilter)&&(!q||matchesQuery(c,q))).sort(compareNames);$('resultCount').textContent=`${groupFilter?groupFilter+' · ':''}${filtered.length} 位联系人${contacts.some(c=>c.demo)?' · 含示例':''}`;const buckets=new Map();filtered.forEach(c=>{const letter=initial(c.name);if(!buckets.has(letter))buckets.set(letter,[]);buckets.get(letter).push(c);});const keys=[...buckets.keys()].sort((a,b)=>a==='#'?1:b==='#'?-1:a.localeCompare(b));$('directoryResults').innerHTML=`${groupFilter?'<button class="back-button" data-action="all-groups">← 显示所有联系人</button>':''}<div class="contact-scroll"><nav class="alphabet" aria-label="字母索引">${keys.map(k=>`<button data-action="jump-letter" data-letter="${k}">${k}</button>`).join('')}</nav><div class="directory-list">${keys.map(k=>`<div class="letter-heading" id="letter-${k==='#'?'other':k}">${k}</div>${buckets.get(k).map(c=>personRow(c)).join('')}`).join('')||'<div class="paper-empty">这一页还没有名字。<br>点击右上角 +，写下一段新的联系。</div>'}</div></div>`;}
function openContact(id,countSearch=false){if(currentView==='detail'&&!flushDraft(true))return;const c=contacts.find(c=>c.id===id);if(!c)return;if(countSearch)recordAccess(id,'search');draft=structuredClone(c);if(!draft.phones.length)draft.phones=[''];if(!draft.emails.length)draft.emails=[''];if(!draft.socials.length)draft.socials=[{platform:'微信',value:''}];currentView='detail';renderDetail();}
function renderDetail(){if(!draft)return;const isNew=!contacts.some(c=>c.id===draft.id);$('bookBreadcrumb').textContent=`通讯录 / ${isNew?'新的一页':draft.name}`;setBookStatus(isNew?'写下姓名后，自动保存':'已保存');$('leftPage').innerHTML=`<button class="back-button" data-action="back-directory">← 回到通讯录</button><div class="page-eyebrow">LITTLE THINGS TO REMEMBER</div><h2 class="notes-label" id="bookTitle">关于这个人</h2><textarea class="notes-textarea" data-field="notes" aria-label="联系人备注" placeholder="记一件小事，或下一次见面的约定……">${esc(draft.notes)}</textarea>`;
  const groupOptions=unique([...groups,draft.group]);$('rightPage').innerHTML=`<button class="favorite-ribbon ${draft.favorite?'selected':''}" data-action="toggle-favorite" aria-label="${draft.favorite?'取消':'标记'}特别关心" aria-pressed="${draft.favorite}">特别关心</button><div class="page-eyebrow">A PAGE JUST FOR YOU</div><h2 class="detail-title">${isNew?'新的一位朋友':esc(draft.name)}</h2><div class="field"><label for="contactName">姓名 *</label><input id="contactName" data-field="name" value="${esc(draft.name)}" maxlength="60" placeholder="怎么称呼这位朋友"></div><div class="field"><label for="contactSpeedCode">键盘短码（3 位，选填）</label><input id="contactSpeedCode" data-field="speedCode" type="text" inputmode="numeric" maxlength="3" pattern="[0-9]{3}" value="${esc(draft.speedCode)}" placeholder="例如 001"></div><div class="field"><label for="contactGroup">分组</label><select id="contactGroup" data-field="group">${groupOptions.map(g=>`<option ${draft.group===g?'selected':''}>${esc(g)}</option>`).join('')}</select></div><div class="field"><div class="field-header"><label>电话号码</label><button data-action="add-phone" aria-label="添加电话号码">+</button></div><div id="phoneFields">${draft.phones.map((p,i)=>repeatPhone(p,i)).join('')}</div></div><div class="field"><div class="field-header"><label>电子邮箱</label><button data-action="add-email" aria-label="添加电子邮箱">+</button></div><div id="emailFields">${draft.emails.map((p,i)=>repeatEmail(p,i)).join('')}</div></div><div class="field"><div class="field-header"><label>社交媒体账号</label><button data-action="add-social" aria-label="添加社交媒体账号">+</button></div><div id="socialFields">${draft.socials.map((s,i)=>repeatSocial(s,i)).join('')}</div></div><div class="field"><label for="contactAddress">通讯地址</label><textarea id="contactAddress" data-field="address" rows="1" maxlength="500" placeholder="寄一封信也能找到的地方">${esc(draft.address)}</textarea></div><div id="formErrors" class="error-text" role="status"></div><div class="detail-actions"><span>自动保存</span>${isNew?'<button data-action="discard-draft">放弃这一页</button>':'<button class="delete-contact" data-action="delete-contact">删除联系人</button>'}</div>`;}
function repeatPhone(p,i){return `<div class="repeat-row"><input type="tel" inputmode="tel" data-array="phones" data-index="${i}" value="${esc(p)}" aria-label="电话号码 ${i+1}" placeholder="电话号码" maxlength="35"><button class="remove-field" data-action="remove-phone" data-index="${i}" aria-label="移除此电话号码">−</button></div>`;}
function repeatEmail(p,i){return `<div class="repeat-row"><input type="email" data-array="emails" data-index="${i}" value="${esc(p)}" aria-label="电子邮箱 ${i+1}" placeholder="name@example.com" maxlength="150"><button class="remove-field" data-action="remove-email" data-index="${i}" aria-label="移除此邮箱">−</button></div>`;}
function repeatSocial(s,i){const platforms=unique(['微信','QQ','微博','Instagram','GitHub','其他',s.platform]);return `<div class="repeat-row"><select data-social="platform" data-index="${i}" aria-label="社交平台 ${i+1}">${platforms.map(p=>`<option ${s.platform===p?'selected':''}>${esc(p)}</option>`).join('')}</select><input data-social="value" data-index="${i}" value="${esc(s.value)}" aria-label="社交账号 ${i+1}" placeholder="写下账号" maxlength="200"><button class="remove-field" data-action="remove-social" data-index="${i}" aria-label="移除此社交账号">−</button></div>`;}
function flushDraft(leaving=false){clearTimeout(saveTimer);if(!draft)return true;const isNew=!contacts.some(c=>c.id===draft.id);const meaningful=[draft.name,draft.speedCode||'',draft.notes,draft.address,...draft.phones,...draft.emails,...draft.socials.map(s=>s.value)].some(s=>s.trim());if(isNew&&!meaningful)return true;const errors=validateContact(draft,contacts);$('formErrors')&&( $('formErrors').textContent=Object.values(errors).join('；'));if(Object.keys(errors).length){setBookStatus(isNew&&!draft.name.trim()?'请写下姓名，再记下这位朋友':'尚未保存，请检查填写内容');if(leaving){toast(Object.values(errors)[0]);const bad=$('rightPage').querySelector(errors.name?'[data-field="name"]':errors.speedCode?'[data-field="speedCode"]':errors.phones?'[data-array="phones"]':'[data-array="emails"]');bad?.focus();}return false;}const normalized=normalizeContact({...draft,updatedAt:Date.now(),demo:false});const i=contacts.findIndex(c=>c.id===normalized.id);const previous=i>=0?contacts[i]:null;if(i<0)contacts.push(normalized);else contacts[i]=normalized;if(!persist()){if(i<0)contacts.pop();else contacts[i]=previous;return false;}setBookStatus('✓ 已保存');document.querySelector('.detail-title').textContent=draft.name;if(isNew)document.querySelector('.detail-actions').innerHTML='<span>自动保存</span><button class="delete-contact" data-action="delete-contact">删除联系人</button>';$('bookBreadcrumb').textContent=`通讯录 / ${draft.name}`;return true;}
function editDraft(target){if(!draft)return;if(target.dataset.field)draft[target.dataset.field]=target.value;if(target.dataset.array)draft[target.dataset.array][+target.dataset.index]=target.value;if(target.dataset.social)draft.socials[+target.dataset.index][target.dataset.social]=target.value;clearTimeout(saveTimer);setBookStatus('正在记下…');saveTimer=setTimeout(()=>flushDraft(),450);}
function showGroups(){currentView='groups';draft=null;$('bookBreadcrumb').textContent='通讯录 / 分组索引';$('rightPage').innerHTML=`<div class="page-eyebrow">EVERY CIRCLE HAS A STORY</div><h2 class="page-heading">分组索引 <button class="small-icon" data-action="new-group" aria-label="新建分组">+</button></h2><p class="page-subtitle">给不同阶段相识的人，留一页位置。</p>${groups.map(g=>`<div class="group-row"><button data-action="filter-group" data-group="${esc(g)}">${esc(g)}</button><small>${contacts.filter(c=>c.group===g).length} 人</small><button class="remove-group" data-action="delete-group" data-group="${esc(g)}" aria-label="删除分组 ${esc(g)}">×</button></div>`).join('')}<button class="back-button" style="margin-top:25px" data-action="back-directory">← 所有联系人</button>`;}
function chooseFavorites(){openDialog('把重要的人夹在书签里',`<div class="choose-list">${contacts.slice().sort(compareNames).map(c=>`<label class="choose-row"><input type="checkbox" data-favorite-id="${esc(c.id)}" ${c.favorite?'checked':''}><span>${esc(c.name)}</span><small class="person-meta">${esc(c.group)}</small></label>`).join('')||'<p class="paper-empty">先写下一位联系人吧。</p>'}</div><div class="dialog-actions"><button class="primary-button" data-action="save-favorites">夹好书签</button></div>`);}
function showExcel(){if(currentView==='detail'&&!flushDraft())toast('当前页面尚未保存，导出仅包含已保存的联系人');openDialog('铅笔里的 Excel',`<div class="dialog-body"><p><strong>导入格式</strong><br>使用 .xlsx / .xls 文件的第一个工作表，首行为列名，必需列为「姓名」，其余列可选：分组、键盘短码、电话号码、电子邮箱、社交媒体账号、通讯地址、备注、特别关心。</p><p>同一人的多个电话或邮箱以中文分号「；」分隔。社交账号支持「微信:账号；QQ:账号」，也兼容本站导出的 JSON 格式。电话号码建议设为文本，保留前导零。</p><p>导入前先预览；同号码合并，保留原有联系方式，其他非空字段更新。错误行跳过并列出原因。最多 5 MB / 5000 行。</p></div><div class="dialog-actions"><button class="primary-button" data-action="select-excel">选择 Excel 导入 ↗</button><button class="secondary-button" data-action="download-template">下载模板 ↓</button></div><div class="dialog-rule"></div><div class="dialog-body">一位联系人一行，保留所有联系方式和特别关心标记。</div><div class="dialog-actions"><button class="secondary-button" data-action="export-excel">导出全部 ${contacts.length} 位联系人 ↓</button></div><p class="small-note">联系人在保存时同步到云端，仍建议定期导出备份。</p>`);}
function downloadExcel(template=false){if(!window.XLSX){toast('Excel 组件未加载，请刷新后重试');return;}const rows=template?[{'姓名':'示例姓名','分组':'朋友','键盘短码':'001','电话号码':'13800000000；13900000000','电子邮箱':'hello@example.com','社交媒体账号':'微信:example；QQ:123456','通讯地址':'示例城市和街道','备注':'可删除这一行后填写自己的联系人','特别关心':'是'}]:toExcelRows(contacts);const ws=XLSX.utils.json_to_sheet(rows,{header:HEADERS});ws['!cols']=HEADERS.map(h=>({wch:({'姓名':16,'分组':14,'键盘短码':14,'社交媒体账号':48,'备注':40,'特别关心':12})[h]||32}));for(const key of Object.keys(ws)){if(!key.startsWith('!')&&ws[key].t==='s')ws[key].z='@';}const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'通讯录');XLSX.writeFile(wb,template?'纸间来电-导入模板.xlsx':`纸间来电-通讯录-${new Date().toISOString().slice(0,10)}.xlsx`);toast(template?'模板已下载，按列填写即可':'通讯录已导出，请好好保存');}
let pendingImport=null;
async function readExcel(file){if(!file)return;if(!window.XLSX){toast('Excel 组件未加载，请刷新重试');return;}if(file.size>5*1024*1024){toast('文件超过 5 MB，请分批导入');return;}try{const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});const ws=wb.Sheets[wb.SheetNames[0]];if(!ws)throw Error('未找到工作表');const grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});if(!grid.length||!grid[0].some(v=>['姓名','name'].includes(String(v).trim())))throw Error('首行需包含「姓名」列，请下载模板核对');const range=XLSX.utils.decode_range(ws['!ref']||'A1');if(range.e.r>5000)throw Error('最多支持 5000 行，请分批导入');const rows=XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});if(!rows.length)throw Error('文件中没有联系人');pendingImport=planImport(rows,contacts);const {added,merged,issues}=pendingImport;openDialog('先看看，要记下哪些人',`<div class="dialog-body">文件：${esc(file.name)}<br>本次导入将新增 <strong>${added}</strong> 位、合并 <strong>${merged}</strong> 条，跳过 <strong>${issues.length}</strong> 条。</div>${issues.length?`<div class="import-report">${issues.map(esc).join('<br>')}</div>`:'<p class="small-note">✓ 每一行都检查过了。</p>'}<div class="dialog-actions"><button class="primary-button" data-action="confirm-import" ${added+merged===0?'disabled':''}>确认导入</button><button class="secondary-button" data-action="cancel-import">取消</button></div>`);}catch(error){toast(`无法导入：${error.message}`);}finally{$('excelFile').value='';}}


let cordFrame,manualEntry=false;
function animateCord(){
  cancelAnimationFrame(cordFrame);
  const until=performance.now()+1450;
  function sync(){
    const handset=$('handset'),svg=handset.ownerSVGElement;
    const start=new DOMPoint(148,145).matrixTransform(handset.getScreenCTM()).matrixTransform(svg.getScreenCTM().inverse());
    $('handsetCord').setAttribute('d',`M${start.x} ${start.y} C${start.x-68} ${start.y} 94 255 112 290 C65 310 126 328 94 345 C55 365 122 386 91 405 C55 426 124 446 94 466 C58 488 118 513 136 553`);
    if(performance.now()<until)cordFrame=requestAnimationFrame(sync);
  }
  cordFrame=requestAnimationFrame(sync);
}

function showNumber(){
  const active=overlay.hidden&&!ringing&&(manualEntry||(dragging&&selectedDigit!==null));
  const changed=phoneArea.classList.contains('active')!==active;
  phoneArea.classList.toggle('active',active);$('numberBubble').hidden=!active;
  if(changed)animateCord();
}
function cancelPhoneTimers(){clearTimeout(dialTimer);clearTimeout(numberTimer);clearTimeout(ringTimer);}
function updateNumber(value){clearTimeout(numberTimer);clearTimeout(ringTimer);ringing=false;phoneArea.classList.remove('ringing');number=value.replace(/\D/g,'').slice(0,11);$('phoneInput').value=number;showNumber();const shortMatch=number.length===3?findDialTarget(contacts,number):null;
  $('numberHint').textContent=shortMatch?'短码已找到，2 秒后翻开联系人':number.length===11?'2 秒后，替你翻开这一页…':number.length===3?'短码未设置，可继续输入完整号码':`已记下 ${number.length} / 11 位`;
  if(number.length===11||shortMatch)numberTimer=setTimeout(startRing,2000);
}
function editNumber(value){clearTimeout(dialTimer);rotation=0;selectedDigit=null;dialLocked=false;renderDial();updateNumber(value);}
function resetPhone(){manualEntry=false;cancelPhoneTimers();number='';$('phoneInput').value='';$('numberBubble').hidden=true;phoneArea.classList.remove('active','ringing');animateCord();ringing=false;dialLocked=false;dragging=false;rotation=0;selectedDigit=null;renderDial();}
function startRing(){if(!overlay.hidden||(number.length!==11&&!(number.length===3&&findDialTarget(contacts,number))))return;ringing=true;$('numberBubble').hidden=true;phoneArea.classList.add('ringing');animateCord();beep(880,.2);setTimeout(()=>{if(ringing)beep(740,.2);},350);ringTimer=setTimeout(()=>{const target=findDialTarget(contacts,number);const phone=number;phoneArea.classList.remove('ringing');ringing=false;if(target){recordAccess(target.id,'dial');openBook();openContact(target.id);}else{openBook('new',phone);toast('这是个新号码，为这位朋友写一页吧');}},1000);}
const digits=['1','2','3','4','5','6','7','8','9','0'];
function renderDial(){const holeRadius=39;$('dialDigits').style.transform=`rotate(${rotation}deg)`;$('dialDigits').innerHTML=digits.map((digit,i)=>{const angle=(-36-i*32)*Math.PI/180;return `<button class="digit-hole ${selectedDigit===digit?'chosen':''}" data-digit="${digit}" aria-label="拨数字 ${digit}" style="left:${50+Math.cos(angle)*holeRadius-9.4}%;top:${50+Math.sin(angle)*holeRadius-9.4}%"><span style="transform:rotate(${-rotation}deg)">${digit}</span></button>`;}).join('');$('dialPreview').textContent=selectedDigit??'拨';$('dialPreview').classList.toggle('numeric',selectedDigit!==null);$('dialCaption').textContent=selectedDigit?'停留 1 秒，记下数字':'转动 · 停留 · 记下';}
function nearestDigit(){const pointer=35;let min=360,best=null;digits.forEach((d,i)=>{const angle=-36-i*32+rotation;const delta=Math.abs(((angle-pointer)%360+540)%360-180);if(delta<min){min=delta;best=d;}});return min<=14?best:null;}
function commitDigit(digit){if(number.length>=11){dialLocked=false;rotation=0;selectedDigit=null;renderDial();return;}updateNumber(number+digit);beep(460+Number(digit)*35);$('dialCaption').textContent='记下了';dialLocked=true;clearTimeout(dialTimer);dialTimer=setTimeout(()=>{rotation=0;selectedDigit=null;dialLocked=false;renderDial();showNumber();},230);}
function armDigit(digit){clearTimeout(dialTimer);selectedDigit=digit;renderDial();showNumber();if(digit)dialTimer=setTimeout(()=>{if(selectedDigit===digit)commitDigit(digit);},1000);}
function dialAngle(event){const rect=$('rotary').getBoundingClientRect();return Math.atan2(event.clientY-(rect.top+rect.height/2),event.clientX-(rect.left+rect.width/2))*180/Math.PI;}
$('rotary').addEventListener('pointerdown',event=>{
  if(dialLocked||ringing||number.length>=11)return;
  if(event.target.closest('.dial-center'))return;
  manualEntry=false;$('phoneInput').blur();clearTimeout(dialTimer);
  dragging=true;didDrag=false;selectedDigit=null;dragStart=lastAngle=dialAngle(event);
  $('rotary').setPointerCapture(event.pointerId);showNumber();
});
$('rotary').addEventListener('pointermove',event=>{
  if(!dragging||dialLocked)return;
  const angle=dialAngle(event);let delta=angle-lastAngle;
  if(delta>180)delta-=360;if(delta< -180)delta+=360;lastAngle=angle;
  const rect=$('rotary').getBoundingClientRect();
  const radius=Math.hypot(event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2)/rect.width;
  if(radius<.28||radius>.51){armDigit(null);return;}
  if(Math.abs(angle-dragStart)>3)didDrag=true;if(!didDrag)return;
  rotation+=delta;const digit=nearestDigit();
  if(digit!==selectedDigit)armDigit(digit);
  else{renderDial();if(Math.abs(delta)>.25)armDigit(digit);}
});
$('rotary').addEventListener('pointerup',event=>{
  if(!dragging)return;dragging=false;
  if($('rotary').hasPointerCapture(event.pointerId))$('rotary').releasePointerCapture(event.pointerId);
  if(didDrag){
    if(!dialLocked){clearTimeout(dialTimer);rotation=0;selectedDigit=null;renderDial();}
  }else{
    const hole=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-digit]');
    if(hole)selectDialDigit(hole.dataset.digit);
  }
  showNumber();
});
$('rotary').addEventListener('pointercancel',()=>{
  dragging=false;clearTimeout(dialTimer);selectedDigit=null;rotation=0;dialLocked=false;renderDial();showNumber();
});
function selectDialDigit(digit){if(dialLocked||ringing||number.length>=11)return;showNumber();const i=digits.indexOf(digit);rotation=35-(-36-i*32);armDigit(digit);}
$('rotary').addEventListener('click',event=>{if(event.detail===0){const digit=event.target.closest('[data-digit]')?.dataset.digit;if(digit)selectDialDigit(digit);}});
$('liftHandset').onclick=()=>{if(!ringing){manualEntry=true;showNumber();$('phoneInput').focus();}};
$('numberBubble').addEventListener('focusin',()=>{manualEntry=true;showNumber();});
$('numberBubble').addEventListener('focusout',event=>{
  if(event.relatedTarget&&$('numberBubble').contains(event.relatedTarget))return;
  setTimeout(()=>{if(!$('numberBubble').contains(document.activeElement)){manualEntry=false;showNumber();}},0);
});
document.addEventListener('pointerdown',event=>{
  if(manualEntry&&!$('numberBubble').contains(event.target)&&!event.target.closest('#liftHandset')){
    manualEntry=false;showNumber();
  }
});
$('phoneInput').addEventListener('input',e=>{clearTimeout(dialTimer);rotation=0;selectedDigit=null;dialLocked=false;renderDial();updateNumber(e.target.value);});$('backspace').onclick=()=>editNumber(number.slice(0,-1));$('clearNumber').onclick=()=>{editNumber('');$('phoneInput').focus();};
document.addEventListener('keydown',event=>{
  if(!overlay.hidden||dialog.open||ringing||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if(/^\d$/.test(event.key)){
    event.preventDefault();manualEntry=true;editNumber(number+event.key);$('phoneInput').focus();
  }
});
$('soundButton').onclick=()=>{soundOn=!soundOn;$('soundButton').classList.toggle('sound-on',soundOn);$('soundButton').setAttribute('aria-label',soundOn?'关闭音效':'开启音效');$('soundButton').title=soundOn?'关闭音效':'开启音效';beep();toast(soundOn?'拨号音效已开启':'拨号音效已关闭');};
$('openBook').onclick=()=>openBook();$('openBookTop').onclick=()=>openBook();$('closeBook').onclick=closeBook;$('homeLink').onclick=e=>{e.preventDefault();if(overlay.hidden)resetPhone();};$('helpButton').onclick=showHelp;$('pencilButton').onclick=showExcel;
// 收起记事簿仅由右上角按钮触发，点击纸页外不关闭。
overlay.addEventListener('input',event=>{const t=event.target;if(t.id==='searchContacts'){query=t.value;renderResults();}else if(currentView==='detail')editDraft(t);});
overlay.addEventListener('change',event=>{if(currentView==='detail'&&event.target.tagName==='SELECT')editDraft(event.target);});
$('excelFile').addEventListener('change',event=>readExcel(event.target.files[0]));
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!dialog.open&&!overlay.hidden){event.preventDefault();}});
dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeDialog();}});
document.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(!target)return;const action=target.dataset.action;switch(action){
  case 'close-dialog':closeDialog();break;
  case 'clear-demo':{const n=contacts.filter(c=>c.demo).length;if(!n){toast('没有未修改的示例联系人');break;}openDialog('移除示例联系人？',`<div class="dialog-body">将移除 ${n} 位未修改的虚构示例联系人，你编辑过的记录会保留。</div><div class="dialog-actions"><button class="primary-button" data-action="confirm-clear-demo">移除示例</button><button class="secondary-button" data-action="close-dialog">保留</button></div>`);break;}
  case 'confirm-clear-demo':{const before=contacts;contacts=contacts.filter(c=>!c.demo);if(persist()){closeDialog();if(!overlay.hidden)renderDirectory();toast('示例已移除，可以写自己的通讯录了');}else contacts=before;break;}
  case 'open-contact':openContact(target.dataset.id,!!query.trim());break;
  case 'new-contact':if(currentView==='detail'&&!flushDraft(true))break;draft=blankContact();currentView='detail';renderDetail();$('contactName').focus();break;
  case 'back-directory':if(currentView==='detail'&&!flushDraft(true))break;query='';groupFilter='';renderDirectory();break;
  case 'discard-draft':clearTimeout(saveTimer);draft=null;query='';renderDirectory();break;
  case 'toggle-favorite':draft.favorite=!draft.favorite;target.classList.toggle('selected',draft.favorite);target.setAttribute('aria-pressed',draft.favorite);target.setAttribute('aria-label',`${draft.favorite?'取消':'标记'}特别关心`);flushDraft();break;
  case 'add-phone':draft.phones.push('');$('phoneFields').innerHTML=draft.phones.map(repeatPhone).join('');$('phoneFields').lastElementChild.querySelector('input').focus();break;
  case 'add-email':draft.emails.push('');$('emailFields').innerHTML=draft.emails.map(repeatEmail).join('');$('emailFields').lastElementChild.querySelector('input').focus();break;
  case 'add-social':draft.socials.push({platform:'微信',value:''});$('socialFields').innerHTML=draft.socials.map(repeatSocial).join('');$('socialFields').lastElementChild.querySelector('input').focus();break;
  case 'remove-phone':draft.phones.splice(+target.dataset.index,1);if(!draft.phones.length)draft.phones=[''];$('phoneFields').innerHTML=draft.phones.map(repeatPhone).join('');flushDraft();break;
  case 'remove-email':draft.emails.splice(+target.dataset.index,1);if(!draft.emails.length)draft.emails=[''];$('emailFields').innerHTML=draft.emails.map(repeatEmail).join('');flushDraft();break;
  case 'remove-social':draft.socials.splice(+target.dataset.index,1);if(!draft.socials.length)draft.socials=[{platform:'微信',value:''}];$('socialFields').innerHTML=draft.socials.map(repeatSocial).join('');flushDraft();break;
  case 'delete-contact':openDialog('这一页，要撕下吗？',`<div class="dialog-body">将删除「${esc(draft.name)}」及其全部联系方式。此操作不能撤销，建议先导出备份。</div><div class="dialog-actions"><button class="primary-button" data-action="confirm-delete">确认删除</button><button class="secondary-button" data-action="close-dialog">留下这一页</button></div>`);break;
  case 'confirm-delete':{clearTimeout(saveTimer);const before=contacts;contacts=contacts.filter(c=>c.id!==draft.id);if(persist()){draft=null;closeDialog();renderDirectory();toast('这一页已移除');}else contacts=before;break;}
  case 'choose-favorites':chooseFavorites();break;
  case 'save-favorites':{const before=contacts.map(c=>({...c}));document.querySelectorAll('[data-favorite-id]').forEach(input=>{const c=contacts.find(c=>c.id===input.dataset.favoriteId);if(c)c.favorite=input.checked;});if(persist()){closeDialog();renderDirectory();toast('书签已夹好');}else contacts=before;break;}
  case 'show-groups':showGroups();break;
  case 'filter-group':groupFilter=target.dataset.group;query='';renderDirectory();break;
  case 'all-groups':groupFilter='';renderDirectory();break;
  case 'new-group':openDialog('给这一组人起个名字',`<input class="dialog-input" id="newGroupName" placeholder="例如：高中同学" maxlength="30" aria-label="分组名称"><div class="dialog-actions"><button class="primary-button" data-action="confirm-new-group">写下分组</button></div>`);$('newGroupName').focus();break;
  case 'confirm-new-group':{const g=$('newGroupName').value.trim();if(!g){toast('请先写下分组名称');break;}if(groups.includes(g)){toast('已经有这个分组了');break;}groups.push(g);if(persist()){closeDialog();showGroups();}else groups.pop();break;}
  case 'delete-group':openDialog('移除这个分组？',`<div class="dialog-body">移除「${esc(target.dataset.group)}」后，联系人仍会保留，并归入「未分组」。</div><div class="dialog-actions"><button class="primary-button" data-action="confirm-delete-group" data-group="${esc(target.dataset.group)}">移除分组</button><button class="secondary-button" data-action="close-dialog">取消</button></div>`);break;
  case 'confirm-delete-group':{const g=target.dataset.group,oldGroups=[...groups],oldContacts=structuredClone(contacts);groups=groups.filter(v=>v!==g);contacts.forEach(c=>{if(c.group===g)c.group='未分组';});if(contacts.some(c=>c.group==='未分组')&&!groups.includes('未分组'))groups.push('未分组');if(persist()){closeDialog();showGroups();}else{groups=oldGroups;contacts=oldContacts;}break;}
  case 'jump-letter':$('letter-'+(target.dataset.letter==='#'?'other':target.dataset.letter))?.scrollIntoView({behavior:'smooth',block:'start'});break;
  case 'select-excel':$('excelFile').click();break;
  case 'download-template':downloadExcel(true);break;
  case 'export-excel':downloadExcel();break;
  case 'cancel-import':pendingImport=null;showExcel();break;
  case 'confirm-import':if(pendingImport){const previous=contacts,oldGroups=groups;contacts=pendingImport.contacts;groups=unique([...groups,...contacts.map(c=>c.group)]);if(persist()){const count=pendingImport.added+pendingImport.merged;pendingImport=null;closeDialog();draft=null;renderDirectory();toast(`已记下 ${count} 条联系人记录`);}else{contacts=previous;groups=oldGroups;}}break;
}});
document.addEventListener('keydown',event=>{if(event.key!=='Tab'||overlay.hidden||dialog.open)return;const focusables=[...overlay.querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&el.getClientRects().length);const first=focusables[0],last=focusables.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});
window.addEventListener('beforeunload',event=>{if(draft&&!flushDraft()){event.preventDefault();event.returnValue='';}});
renderDial();initializeContacts();
window.addEventListener('online',()=>{if(initialized)scheduleServerSync();});
window.addEventListener('beforeunload',()=>{if(!initialized||!syncTimer)return;clearTimeout(syncTimer);try{void fetch('/api/contacts',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({contacts,groups}),keepalive:true});}catch{}});
