const fs = require('fs');
const s = fs.readFileSync('frontend/produtos.html','utf8');
const m = s.match(/<script[\s\S]*?>[\s\S]*?<\/script>/i);
if(!m){console.error('Script tag not found'); process.exit(2);}
const script = m[0].replace(/^<script[\s\S]*?>/i, '').replace(/<\/script>$/i,'');
function checkBalance(code){
  const stack=[];
  let i=0; const L=code.length;
  let inSingle=false, inDouble=false, inTemplate=false, inComment=false, inLineComment=false, escaped=false;
  for(;i<L;i++){
    const c=code[i];
    const next = code[i+1];
    if(inComment){
      if(code.slice(i-1,i+1)==='*/') inComment=false;
      continue;
    }
    if(inLineComment){
      if(c==='\n') inLineComment=false;
      continue;
    }
    if(!inSingle && !inDouble && !inTemplate){
      if(c==='/' && next==='*'){ inComment=true; i++; continue; }
      if(c==='/' && next==='/'){ inLineComment=true; i++; continue; }
    }
    if(c==='\\') { escaped = !escaped; continue; }
    if(!escaped && !inDouble && !inTemplate && c==="'") { inSingle = !inSingle; continue; }
    if(!escaped && !inSingle && !inTemplate && c==='"') { inDouble = !inDouble; continue; }
    if(!escaped && !inSingle && !inDouble && c==='`') { inTemplate = !inTemplate; continue; }
    escaped = false;
    if(inSingle || inDouble || inTemplate) continue;
    if(c==='(' || c==='{' || c==='[') stack.push(c);
    if(c===')'){ const t=stack.pop(); if(t!=='('){ console.error('Unbalanced ) at',i); return false;}}
    if(c==='}'){ const t=stack.pop(); if(t!=='{'){ console.error('Unbalanced } at',i); return false;}}
    if(c===']'){ const t=stack.pop(); if(t!=='['){ console.error('Unbalanced ] at',i); return false;}}
  }
  if(inSingle) console.error('Unclosed single quote');
  if(inDouble) console.error('Unclosed double quote');
  if(inTemplate) console.error('Unclosed template literal');
  if(inComment) console.error('Unclosed comment');
  if(stack.length) console.error('Unclosed brackets:', stack);
  return !(inSingle||inDouble||inTemplate||inComment||stack.length);
}
const ok = checkBalance(script);
console.log('Balanced?', ok);
if(!ok) process.exit(1);
