// Shared by text and voice. Resolve conversational quantities against the
// previous assistant turn, never against a wall-preview frame count.
const words={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
const normalize=text=>String(text).toLowerCase().replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g,w=>words[w]);
function cartContext(state){
 const last=state?.messages?.findLast(m=>m.role==='assistant');
 if(!last)return false;
 const text=last.text||'',question=text.split(/[.!]/).at(-1)||text;
 if(/\b(frames?|pictures?|pounds?|lbs?|inches|weight|spacing|artwork)\b/i.test(question))return false;
 return last.presentation==='cart'||/\b(?:cart|quantity|how many (?:studio )?hangers?)\b/i.test(question);
}
function clean(text){return normalize(text).trim().replace(/^just\s+/, '').replace(/^(?:(?:yes|okay|ok)[,\s]+)?(?:(?:please\s+)|(?:(?:can|could|would) you\s+(?:please\s+)?))?/i,'').replace(/(?:[,\s]+please)?[.!?]*$/,'').trim().replace(/^just\s+/, '');}
function contextualTotal(text,state){
 if(!cartContext(state))return undefined;
 const match=clean(text).match(/^(?:(?:make|set|change|update)(?:\s+(?:it|that|the quantity|the total|them))?\s+(?:to\s+)?|(?:i(?:'d| would) like|i want|i need|let['’]s do)\s+)?(\d{1,3})(?:\s+(?:total|in total|instead|of them))?$/);
 return match?Number(match[1]):undefined;
}
export function cartPermission(text,state){
 if(/\b(don[’']?t|do not|never|not yet|without|avoid|should|can i|could i|would i|if i|maybe|explain|how to)\b/i.test(text))return false;
 const value=clean(text);
 return /\b(add|put|set|update|change|remove|clear|empty|take)\b.{0,80}\b(cart|bag)\b/i.test(value)||/\b(add|remove)\b.{0,40}\b(hangers?|units?)\b/i.test(value)||/^(?:add|remove)\s+(?:\d{1,3}|another)(?:\s+more)?(?:\s+of them)?$/.test(value)||/^(?:i(?:'d| would) like|i want|i need|i['’]ll take)\s+\d{1,3}\s+(?:studio\s+)?hangers?$/.test(value)||Number.isInteger(contextualTotal(text,state));
}
export function requestedCartQuantity(text,current,fallback,state){
 const value=normalize(text);
 if(/\b(?:clear|empty)\b.{0,30}\b(?:cart|bag)\b|\bremove\s+(?:all|everything)\b/.test(value))return 0;
 const relative=value.match(/\b(add|remove|take)\s+(\d{1,3}|another|a)\b/);
 if(relative){const n=['another','a'].includes(relative[2])?1:Number(relative[2]);return relative[1]==='add'?current+n:Math.max(0,current-n);}
 const total=value.match(/\b(?:set|change|update)\b.{0,40}\b(?:to|at)\s+(\d{1,3})\b/)||value.match(/\b(?:i(?:'d| would) like|i want|i need|i['’]ll take)\s+(\d{1,3})\s+(?:studio\s+)?hangers?\b/);
 if(total)return Number(total[1]);
 return contextualTotal(text,state)??fallback;
}
