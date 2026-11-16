import test from 'node:test';
import assert from 'node:assert/strict';
import {closestStop,snapDial} from '../dist/dial.js';

const stops=[['1',71],['2',103],['3',135],['4',167],['5',199],['6',231],['7',263],['8',295],['9',327],['0',359]];

test('closestStop 选择距当前转盘最近的一圈，不使零位整圈回跳',()=>{
  for(const [rotation,digit,expected] of [[0,'0',-1],[360,'0',359],[-360,'0',-361],[780,'1',791],[-650,'1',-649],[415,'2',463],[-250,'2',-257]]){
    assert.equal(closestStop(rotation,digit),expected,`${digit} near ${rotation}`);
  }
});

test('每个数字及其前后小范围都吸附到对应数字，可连续跨越多圈',()=>{
  for(const [digit,stop] of stops){
    for(const turns of [-2,-1,0,1,2]){
      const expected=stop+turns*360;
      for(const offset of [-10,0,10])assert.deepEqual(snapDial(expected+offset),{digit,rotation:expected});
    }
  }
});

test('相邻数字边界有滞回，不因轻微抖动反复换档',()=>{
  let selected='1';
  for(const angle of [86,88,87,89,90,87]){
    const snapped=snapDial(angle,selected);assert.equal(snapped.digit,'1');selected=snapped.digit;
  }
  assert.deepEqual(snapDial(90.1,'1'),{digit:'2',rotation:103});
  assert.deepEqual(snapDial(86,'2'),{digit:'2',rotation:103});
  assert.deepEqual(snapDial(83.9,'2'),{digit:'1',rotation:71});
});

test('数字 0/1 之间较大的空白扇区保持原档，越过死区才切换',()=>{
  let selected='0';
  for(const angle of [30,35,37,34,38,36]){
    const snapped=snapDial(angle,selected);assert.deepEqual(snapped,{digit:'0',rotation:-1});selected=snapped.digit;
  }
  assert.deepEqual(snapDial(38.1,'0'),{digit:'1',rotation:71});
  assert.deepEqual(snapDial(34,'1'),{digit:'1',rotation:71});
  assert.deepEqual(snapDial(31.9,'1'),{digit:'0',rotation:-1});
  assert.deepEqual(snapDial(398.1,'0'),{digit:'1',rotation:431});
  assert.deepEqual(snapDial(-328.1,'1'),{digit:'0',rotation:-361});
});

test('跨越 ±180°、0° 和 360° 时结果有限，保持当前圈中的邻近位置',()=>{
  for(const angle of [179,180,181])assert.deepEqual(snapDial(angle),{digit:'4',rotation:167});
  for(const angle of [-181,-180,-179])assert.deepEqual(snapDial(angle),{digit:'4',rotation:-193});
  for(const angle of [-2,-1,0,1,2])assert.deepEqual(snapDial(angle),{digit:'0',rotation:-1});
  for(const angle of [358,359,360,361,362])assert.deepEqual(snapDial(angle),{digit:'0',rotation:359});

  let previous=null,previousRotation=null;
  for(let angle=-1085;angle<=1085;angle++){
    const snapped=snapDial(angle,previous);
    assert.ok(Number.isFinite(snapped.rotation));
    assert.ok(Math.abs(snapped.rotation-angle)<=39,'吸附位置不能跳到远处的一圈');
    if(previousRotation!==null)assert.ok(Math.abs(snapped.rotation-previousRotation)<=72,'只能切到相邻档位');
    previous=snapped.digit;previousRotation=snapped.rotation;
  }
});
