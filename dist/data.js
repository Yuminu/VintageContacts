export const STORAGE_KEY = 'paper-and-ring.contacts.v1';
export const GROUPS_KEY = 'paper-and-ring.groups.v1';
export const HEADERS = ['姓名','分组','键盘短码','电话号码','电子邮箱','社交媒体账号','通讯地址','备注','特别关心'];
export const cleanPhone = value => String(value ?? '').replace(/[\s()+-]/g, '');
export const uid = () => globalThis.crypto?.randomUUID?.() ?? `contact-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const unique = values => [...new Set(values.map(v => String(v).trim()).filter(Boolean))];
export const splitValues = value => unique(String(value ?? '').split(/[;；\n]/));
export const blankContact = (phone = '') => ({id:uid(),name:'',group:'朋友',speedCode:'',phones:phone?[phone]:[''],emails:[''],socials:[{platform:'微信',value:''}],address:'',notes:'',favorite:false,dialCount:0,searchCount:0,lastContactAt:0,createdAt:Date.now(),updatedAt:Date.now()});
export const demoContacts = () => [
  ['林知夏','朋友','13800000001',true,'微信','summer.lin','下次见面，把那本借来的书带给她。','杭州 · 西湖'],
  ['陈屿','大学同学','13800000002',true,'微信','chen.yu','周末一起去看展。','上海 · 徐汇'],
  ['妈妈','家人','13800000003',true,'微信','mama','记得每周打个电话。','福州 · 鼓楼'],
  ['周予安','大学同学','13800000004',false,'QQ','10000004','一起做软件工程作业的搭档。','福州 · 大学城'],
  ['许老师','老师','13800000005',false,'邮箱','xu@example.com','周三下午可以去办公室请教。','福州'],
  ['宋一禾','朋友','13800000006',false,'微信','yihe.song','喜欢手写明信片。','南京'],
  ['安然','同事','13800000007',false,'微信','anran','咖啡不要加糖。','厦门'],
  ['叶舟','朋友','13800000008',false,'微信','ye.zhou','下个月生日。','泉州']
].map(([name,group,phone,favorite,platform,value,notes,address],i)=>({...blankContact(phone),name,group,favorite,speedCode:i<3?String(i+1).padStart(3,'0'):'',socials:[{platform,value}],notes,address,emails:[`${['summer','chenyu','family','zhou','xu','song','anran','ye'][i]}@example.com`],dialCount:i===0?3:i===1?2:0,searchCount:i===2?1:0,lastContactAt:Date.now()-i*86400000,demo:true}));
export function normalizeContact(c) {
  return {...blankContact(),...c,id:String(c.id||uid()),name:String(c.name||''),group:String(c.group||'未分组'),speedCode:String(c.speedCode||'').trim(),phones:unique((Array.isArray(c.phones)?c.phones:[]).map(cleanPhone)),emails:unique(Array.isArray(c.emails)?c.emails:[]),socials:(Array.isArray(c.socials)?c.socials:[]).filter(s=>s&&s.value).map(s=>({platform:String(s.platform||'其他'),value:String(s.value)})),address:String(c.address||''),notes:String(c.notes||''),favorite:!!c.favorite,dialCount:Math.max(0,Number(c.dialCount)||0),searchCount:Math.max(0,Number(c.searchCount)||0),lastContactAt:Number(c.lastContactAt)||0};
}
const collator = new Intl.Collator('zh-CN',{usage:'sort',sensitivity:'base'});
export const compareNames = (a,b) => collator.compare(a.name,b.name);
const initials = [['A','阿'],['B','八'],['C','嚓'],['D','搭'],['E','蛾'],['F','发'],['G','噶'],['H','哈'],['J','击'],['K','喀'],['L','垃'],['M','妈'],['N','拿'],['O','哦'],['P','啪'],['Q','期'],['R','然'],['S','撒'],['T','塌'],['W','挖'],['X','昔'],['Y','压'],['Z','匝']];
export function initial(name) {
  const first=String(name).trim().charAt(0);if(/[a-z]/i.test(first))return first.toUpperCase();if(!/[\u3400-\u9fff]/.test(first))return '#';
  let letter='#';for(const [key,boundary] of initials){if(collator.compare(first,boundary)>=0)letter=key;else break;}return letter;
}
export function validateContact(c, contacts=[]) {
  const errors={};if(!c.name.trim())errors.name='请写下联系人姓名';
  const code=String(c.speedCode||'').trim();
  if(code&&!/^\d{3}$/.test(code))errors.speedCode='键盘短码须为 3 位数字，例如 001';
  if(code&&contacts.some(other=>other.id!==c.id&&other.speedCode===code))errors.speedCode='这个键盘短码已被使用，请换一个';
  const phones=unique(c.phones.map(cleanPhone));
  if(phones.some(p=>!/^\d{3,20}$/.test(p)))errors.phones='电话号码应为 3–20 位数字，可包含空格、+ 或短横线';
  if(phones.some(p=>contacts.some(other=>other.id!==c.id&&other.phones.some(v=>cleanPhone(v)===p))))errors.phones='这个号码已属于另一位联系人，请先查看已有记录';
  if(c.emails.some(e=>e.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())))errors.emails='请检查邮箱格式，例如 name@example.com';
  const emailKeys=unique(c.emails.map(e=>e.trim().toLowerCase()));
  if(emailKeys.some(e=>contacts.some(other=>other.id!==c.id&&other.emails.some(v=>v.trim().toLowerCase()===e))))errors.emails='这个邮箱已属于另一位联系人，请先查看已有记录';
  return errors;
}
export function toExcelRows(contacts) {
  return contacts.slice().sort(compareNames).map(c=>({'姓名':c.name,'分组':c.group,'键盘短码':c.speedCode||'','电话号码':c.phones.join('；'),'电子邮箱':c.emails.join('；'),'社交媒体账号':c.socials.length?JSON.stringify(c.socials):'','通讯地址':c.address,'备注':c.notes,'特别关心':c.favorite?'是':'否'}));
}
function parseSocial(value) {
  if(!value)return [];
  if(String(value).trim().startsWith('[')){
    const data=JSON.parse(String(value));if(!Array.isArray(data)||data.some(s=>!s||typeof s!=='object'||!s.value))throw Error('社交媒体账号 JSON 格式不正确');
    return data.map(s=>({platform:String(s.platform||'其他'),value:String(s.value)}));
  }
  return splitValues(value).map(s=>{const match=s.match(/^([^:：]+)[:：](.+)$/);return match?{platform:match[1].trim(),value:match[2].trim()}:{platform:'其他',value:s};});
}
export function planImport(rows, existing) {
  const working=existing.map(c=>structuredClone(c));const issues=[];let added=0,merged=0;
  rows.forEach((row,index)=>{try{
    const name=String(row['姓名']??row.name??'').trim();if(!name)throw Error('缺少姓名');
    const phones=splitValues(row['电话号码']??row['电话']??row.phone??'').map(cleanPhone);
    const emails=splitValues(row['电子邮箱']??row['邮箱']??row.email??'');
    const matches=working.filter(c=>c.phones.some(p=>phones.includes(cleanPhone(p))));
    if(matches.length>1)throw Error('同一行的号码属于多位已有联系人，请手动核对');
    const old=matches[0];const social=parseSocial(row['社交媒体账号']??'');
    const socialMap=new Map([...(old?.socials||[]),...social].map(s=>[`${s.platform}:${s.value}`,s]));
    const favoriteValue=String(row['特别关心']??'').trim().toLowerCase();
    const c={...(old||blankContact()),name,group:String(row['分组']||old?.group||'未分组').trim(),speedCode:String(row['键盘短码']??old?.speedCode??'').trim(),phones:unique([...(old?.phones||[]),...phones]),emails:unique([...(old?.emails||[]),...emails]),socials:[...socialMap.values()],address:String(row['通讯地址']||old?.address||''),notes:String(row['备注']||old?.notes||''),favorite:old?.favorite||['是','true','1','yes'].includes(favoriteValue),updatedAt:Date.now(),demo:false};
    const errors=validateContact(c,working);if(Object.keys(errors).length)throw Error(Object.values(errors).join('；'));
    if(old){working[working.indexOf(old)]=c;merged++;}else{working.push(c);added++;}
  }catch(error){issues.push(`第 ${index+2} 行：${error.message}`);}});
  return {contacts:working,added,merged,issues};
}

export function findDialTarget(contacts,value){
  if(/^\d{3}$/.test(value))return contacts.find(c=>c.speedCode===value);
  if(/^\d{11}$/.test(value))return contacts.find(c=>c.phones.some(p=>cleanPhone(p)===value));
  return undefined;
}
