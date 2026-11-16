export const DIAL_DIGITS=['1','2','3','4','5','6','7','8','9','0'];
export const digitAngle=index=>-36-index*32;

export function closestStop(rotation,digit){
  const index=DIAL_DIGITS.indexOf(digit);
  if(index<0)throw new Error('Invalid dial digit');
  const stop=35-digitAngle(index);
  return stop+Math.round((rotation-stop)/360)*360;
}

// A small dead band keeps a mechanical detent stable near the boundary.
export function snapDial(rotation,previousDigit=null){
  let best=null;
  for(const digit of DIAL_DIGITS){
    const stop=closestStop(rotation,digit),distance=Math.abs(rotation-stop);
    if(best===null||distance<best.distance)best={digit,rotation:stop,distance};
  }
  if(previousDigit!==null&&previousDigit!==best.digit){
    const previous=closestStop(rotation,previousDigit);
    if(Math.abs(rotation-previous)<=best.distance+6)return {digit:previousDigit,rotation:previous};
  }
  return {digit:best.digit,rotation:best.rotation};
}
