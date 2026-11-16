import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {blankContact,normalizeContact,validateContact,planImport,toExcelRows,initial,cleanPhone,findDialTarget} from '../dist/data.js';
const make=(name,phone)=>normalizeContact({...blankContact(phone),name});

test('多种联系方式校验、格式归一化与跨联系人号码冲突',()=>{
  const a=make('林知夏','13800000001');const b=make('陈屿','13800000002');
  assert.equal(cleanPhone('+86 (138) 0000-0001'),'8613800000001');
  assert.deepEqual(validateContact(a,[a,b]),{});
  assert.match(validateContact({...a,phones:['138 0000 0002']},[a,b]).phones,/另一位/);
  assert.match(validateContact({...a,emails:['wrong@']},[a,b]).emails,/邮箱/);
});
test('邮箱跨联系人冲突会被阻止保存',()=>{
  const a={...make('甲','13800000001'),emails:['a@example.com']};
  const b={...make('乙','13900000001'),emails:['b@example.com']};
  assert.match(validateContact({...a,emails:['b@example.com']},[a,b]).emails,/另一位/);
});

test('导入可合并多联系方式，不覆盖原数组、统计、备注和收藏',()=>{
  const old={...make('林知夏','13800000001'),emails:['old@example.com'],notes:'旧备注',favorite:true,dialCount:4};
  const result=planImport([{'姓名':'林知夏','电话号码':'13800000001；13900000001','电子邮箱':'new@example.com','社交媒体账号':'微信:summer；QQ:123'}],[old]);
  assert.equal(result.added,0);assert.equal(result.merged,1);assert.equal(result.issues.length,0);
  assert.equal(result.contacts[0].phones.length,2);assert.equal(result.contacts[0].emails.length,2);
  assert.equal(result.contacts[0].notes,'旧备注');assert.equal(result.contacts[0].favorite,true);assert.equal(result.contacts[0].dialCount,4);
  assert.equal(old.phones.length,1);
});
test('冲突号码、缺失姓名、非法邮箱、非法社交 JSON 会列出错误并跳过',()=>{
  const old=[make('甲','13800000001'),make('乙','13800000002')];
  const result=planImport([{'姓名':'冲突','电话号码':'13800000001；13800000002'},{'姓名':''},{'姓名':'邮箱错','电子邮箱':'bad@'},{'姓名':'JSON错','社交媒体账号':'[bad]'}, {'姓名':'正常','电话号码':'13800000003'}],old);
  assert.equal(result.issues.length,4);assert.equal(result.added,1);assert.equal(result.contacts.length,3);
});
test('真实 xlsx 编解码往返保留前导零、多账号、换行备注与特别关心',()=>{
  const context={console};vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../dist/vendor/xlsx.full.min.js',import.meta.url),'utf8'),context);
  const XLSX=context.XLSX;
  const original={...make('王小明','01012345678'),phones:['01012345678','13800000001'],emails:['one@example.com','two@example.com'],socials:[{platform:'微信',value:'hello'},{platform:'QQ',value:'000123'}],notes:'第一行\n第二行',favorite:true};
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(toExcelRows([original])),'通讯录');
  const file=XLSX.write(book,{type:'buffer',bookType:'xlsx'});assert.ok(file.length>1000);
  const loaded=XLSX.read(file,{type:'buffer'});const rows=XLSX.utils.sheet_to_json(loaded.Sheets['通讯录'],{raw:false});
  const result=planImport(rows,[]);assert.equal(result.issues.length,0);
  for(const key of ['name','phones','emails','socials','notes','favorite'])assert.deepEqual(result.contacts[0][key],original[key]);
});
test('常见中文和英文姓名映射到字母目录，数字归入 #',()=>{
  for(const [name,letter] of [['安然','A'],['陈屿','C'],['林知夏','L'],['宋一禾','S'],['许老师','X'],['叶舟','Y'],['周予安','Z'],['Alice','A'],['123','#']])assert.equal(initial(name),letter);
});

test('三位短码可选、唯一、保留前导零，未知短码不匹配',()=>{
  const a={...make('家人','13800000001'),speedCode:'001'};
  const b={...make('朋友','13800000002'),speedCode:'002'};
  assert.equal(validateContact({...b,speedCode:''},[a,b]).speedCode,undefined);
  assert.match(validateContact({...b,speedCode:'001'},[a,b]).speedCode,/已被使用/);
  for(const code of ['1','01','0001','abc'])assert.match(validateContact({...b,speedCode:code},[a,b]).speedCode,/3 位数字/);
  assert.equal(findDialTarget([a,b],'001'),a);
  assert.equal(findDialTarget([a,b],'999'),undefined);
  assert.equal(findDialTarget([a,b],'13800000002'),b);
});

test('短码 Excel 映射与旧格式合并兼容，重复短码不会覆盖其他联系人',()=>{
  const old={...make('家人','13800000001'),speedCode:'001'};
  const row=toExcelRows([old])[0];assert.equal(row['键盘短码'],'001');
  const roundtrip=planImport([row],[]);assert.equal(roundtrip.contacts[0].speedCode,'001');
  const merged=planImport([{'姓名':'家人','电话号码':'13800000001'}],[old]);
  assert.equal(merged.contacts[0].speedCode,'001');
  const conflict=planImport([{'姓名':'朋友','电话号码':'13800000002','键盘短码':'001'}],[old]);
  assert.equal(conflict.added,0);assert.match(conflict.issues[0],/短码已被使用/);
});
