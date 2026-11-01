import {explainDecision} from './review.js';
import {fresh,deal,act,available,score,natural,value,baseAction,LABELS} from './engine.js';
const $=id=>document.getElementById(id),key='seoul21.state.v1';
let state=fresh(),reviewOn=true,signalOn=true,storageOK=true;
let busy=false,presentation=null,pendingReview=false;
try{const stored=JSON.parse(localStorage.getItem(key));if(stored?.version===1&&Number.isFinite(stored.bankroll)&&stored.bankroll>=0&&Number.isFinite(stored.initial)&&stored.initial>=1&&['playing','finished','betting'].includes(stored.phase)&&Array.isArray(stored.hands)&&stored.rules)state=stored;reviewOn=localStorage.getItem('seoul21.review')!=='off';signalOn=localStorage.getItem('seoul21.signal')!=='off';}catch{storageOK=false;}
const fmt=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2}),signed=n=>(n>0?'+':n<0?'−':'±')+fmt(Math.abs(n));
const results={win:'WIN',lose:'LOSE',push:'PUSH',blackjack:'BLACKJACK',bust:'BUST',surrender:'SURRENDER'};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save(){try{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('seoul21.review',reviewOn?'on':'off');localStorage.setItem('seoul21.signal',signalOn?'on':'off');}catch{storageOK=false;}}
function card(c,back=false){if(back)return '<div class="card back" aria-label="裏向きのカード">♠</div>';const r=esc(c.rank),s=esc(c.suit);return `<div class="card ${['♥','♦'].includes(c.suit)?'red':''}" aria-label="${s}${r}"><span class="corner">${r}<small>${s}</small></span>${s}<span class="corner bottom">${r}<small>${s}</small></span></div>`;}
const placeholder=()=>'<div class="card placeholder" aria-hidden="true">♠</div><div class="card placeholder" aria-hidden="true">♢</div>';
function totalText(cards){const x=score(cards);return (x.soft?'SOFT ':'')+x.total;}
function ruleText(){return `6デッキ / ${state.rules.h17?'H17':'S17'} / DAS / 最大3ハンド / ${state.rules.mode==='peek'?'BJ先確認・レイトサレンダー':'ENHC・追加分も損失・サレンダーなし'}`;}
function render(){for(const id of ['rules-open','undo','clear-bet','review-open'])$(id).disabled=busy;const view=presentation||state;const playing=view.phase==='playing',finished=view.phase==='finished';$('balance').textContent=fmt(Math.max(0,view.bankroll-(playing||busy?0:Math.min(view.bankroll,Number($('bet').value)||0))));$('initial').value=view.initial;$('initial').disabled=view.locked||playing;$('lock-note').textContent=playing||view.locked?'開始額は残高が0になるまで固定されます。':view.bankroll===0?'チップがなくなりました。開始額を変更できます。':'最初のプレイ前に変更できます。';$('profit').textContent=signed(view.bankroll+(playing?view.hands.reduce((s,h)=>s+h.bet,0):0)-view.initial);$('round').textContent='ROUND '+String(view.round).padStart(2,'0');$('table-rules').textContent=view.rules.h17?'DEALER HITS SOFT 17':'DEALER STANDS ON ALL 17';$('dealer-cards').innerHTML=view.dealer.length?card(view.dealer[0])+(playing?(view.rules.mode==='peek'&&view.dealer.length>1?card(null,true):''):view.dealer.slice(1).map(c=>card(c)).join('')):placeholder();$('dealer-score').textContent=view.dealer.length?(playing?String(value(view.dealer[0])):totalText(view.dealer)):'';
 $('hands').classList.toggle('multi',view.hands.length>1);$('hands').innerHTML=view.hands.length?view.hands.map((h,i)=>`<div class="hand ${playing&&view.active===i?'active':''}"><div class="hand-label">${view.hands.length>1?'HAND '+(i+1):'YOU'} <span class="score">${totalText(h.cards)}</span></div><div class="cards">${h.cards.map(c=>card(c)).join('')}</div><div class="hand-foot">◉ ${fmt(h.bet)}${finished?' · '+results[h.result]+' '+signed(h.net):h.done?' · 確定':playing&&view.active===i?' · あなたの番':''}</div></div>`).join(''):`<div class="hand"><div class="hand-label">YOU</div><div class="cards">${placeholder()}</div></div>`;
 $('status').textContent=playing?`あなたの番です${view.hands.length>1?' / ハンド '+(view.active+1):''}。行動を選んでください。`:finished?`ラウンド終了 · ${signed(view.net)} CHIPS${view.bankroll===0?' / 開始額を設定するかリセットしてください。':''}`:'ベットを決めて、最初の一手へ。';$('bet-form').hidden=playing;$('actions').hidden=!playing;const choices=available(state);$('actions').innerHTML=Object.entries(LABELS).map(([a,l])=>`<button data-action="${a}" ${choices.includes(a)?'':'disabled'}>${l}<small>${a.toUpperCase()}</small></button>`).join('');$('review-open').hidden=!finished||!reviewOn;$('deal').disabled=view.bankroll===0||Number($('bet').value)<=0;$('deal').innerHTML=(finished?'次へ':'ディール')+' <span>→</span>';$('bet').max=view.bankroll;if(!playing&&Number($('bet').value)>view.bankroll&&view.bankroll>0)$('bet').value=view.bankroll;$('review-toggle').checked=reviewOn;$('signal-toggle').checked=signalOn;$('accuracy').textContent=view.stats.decisions?Math.round(view.stats.correct/view.stats.decisions*100)+'%':'—';$('record').textContent=`${view.stats.wins} / ${view.stats.losses} / ${view.stats.pushes}`;$('dealer-rule').value=view.rules.h17?'h17':'s17';$('deal-rule').value=view.rules.mode;$('dealer-rule').disabled=playing;$('deal-rule').disabled=playing;$('review').hidden=!finished||!reviewOn;
 if(finished&&reviewOn)renderReview();
 renderWager(view);document.querySelectorAll('#chip-rack button').forEach(b=>b.disabled=playing||Number(b.dataset.chip)>view.bankroll-Number($('bet').value));if(busy){for(const b of document.querySelectorAll('#actions button,#deal,#chip-rack button,#undo,#clear-bet,#rules-open,#review-open'))b.disabled=true;$('bet').disabled=true;}else $('bet').disabled=false;if(!storageOK)$('error').textContent='このブラウザでは保存できません。ページを閉じると進行状況が失われます。';save();}
function run(fn){$('error').textContent='';try{fn();render();}catch(e){$('error').textContent=e.message;}}
$('bet-form').addEventListener('submit',e=>{e.preventDefault();if(!busy)perform('deal');});
$('actions').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!busy)perform('action',b.dataset.action);});
$('initial').addEventListener('change',()=>run(()=>{if(state.locked||state.phase==='playing')throw Error('開始額は残高が0になるまで固定されています');const n=Number($('initial').value);if(!Number.isSafeInteger(n)||n<1||n>100000000){$('initial').value=state.initial;throw Error('開始チップは1〜100,000,000の整数で指定してください');}state=fresh(n,state.rules);betHistory=[];$('bet').value=0;}));
$('review-toggle').addEventListener('change',()=>{reviewOn=$('review-toggle').checked;render();});
function setBet(n){$('bet').value=Math.max(0,Math.min(state.bankroll,Math.round(n*100)/100));render();}
const denominations=[1,5,25,100,500,1000,2000,5000,20000,50000];
const colors=['#245cbe','#b53442','#74a647','#303c39','#6854a4','#2698b5','#d49336','#b6ad39','#9697a1','#ab5aaf'];
const chipName=n=>n>=1000?(n/1000)+'K':String(n);
function chipHTML(n,index=denominations.indexOf(n)){const i=Math.max(0,index);return '<span class="poker-chip" style="--chip:'+colors[i]+';--edge:'+colors[i]+'"><span>'+chipName(n)+'</span></span>';}
$('chip-rack').innerHTML=denominations.map((n,i)=>'<button type="button" class="poker-chip" style="--chip:'+colors[i]+';--edge:'+colors[i]+'" data-chip="'+n+'" aria-label="'+n+'チップを追加"><span>'+chipName(n)+'</span></button>').join('');
let betHistory=[];
$('chip-rack').addEventListener('click',e=>{const b=e.target.closest('[data-chip]');if(!b||busy||state.phase==='playing')return;const amount=Number(b.dataset.chip),current=Number($('bet').value)||0;if(current+amount>state.bankroll){$('error').textContent='残高が足りません。';return;}betHistory.push(current);$('error').textContent='';setBet(current+amount);b.classList.add('chosen');setTimeout(()=>b.classList.remove('chosen'),250);});
$('undo').onclick=()=>{if(!busy&&state.phase!=='playing')setBet(betHistory.length?betHistory.pop():0);};
$('clear-bet').onclick=()=>{if(busy)return;betHistory=[];setBet(0);};
$('bet').addEventListener('change',()=>{betHistory=[];setBet(Number($('bet').value)||0);});
function renderWager(view=state){const playing=view.phase==='playing',n=playing?view.hands.reduce((sum,h)=>sum+h.bet,0):Number($('bet').value)||0;$('wager-total').textContent=fmt(n);let rest=n,items=[];for(let i=denominations.length-1;i>=0;i--){let count=Math.floor((rest+1e-8)/denominations[i]);rest-=count*denominations[i];while(count--&&items.length<6)items.push(chipHTML(denominations[i],i));}if(!items.length&&n>0)items.push(chipHTML(n,0));$('wager-stack').innerHTML=items.length?items.join(''):'<span class="bet-ring">BET</span>';$('chip-rack').setAttribute('aria-disabled',String(playing));}
$('review-open').onclick=()=>{if(!busy)requestReview();};
for(const id of ['strategy','rules','guide'])$(id+'-open').onclick=()=>{if(id==='strategy')buildCharts();$(id+'-dialog').showModal();};
$('reset').onclick=()=>$('reset-dialog').showModal();$('confirm-reset').onclick=()=>{const initial=state.initial,rules=state.rules;state=fresh(initial,rules);state.locked=true;betHistory=[];$('bet').value=0;save();render();$('reset-dialog').close();};
for(const b of document.querySelectorAll('[data-close]'))b.onclick=()=>b.closest('dialog').close();
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
$('dealer-rule').onchange=()=>run(()=>{if(state.phase==='playing')throw Error('ラウンド終了後に変更できます');state.rules.h17=$('dealer-rule').value==='h17';});$('deal-rule').onchange=()=>run(()=>{if(state.phase==='playing')throw Error('ラウンド終了後に変更できます');state.rules.mode=$('deal-rule').value;});
function buildCharts(){const make=rank=>({rank:String(rank),suit:'♠'}),ups=['2','3','4','5','6','7','8','9','10','A'],code={hit:'H',stand:'S',double:'D',split:'P',surrender:'R'};const groups=[['ハードハンド',Array.from({length:14},(_,i)=>{const n=i+8;return [String(n),n<=11?[make(2),make(n-2)]:[make(10),make(n-10)]];})],['ソフトハンド',Array.from({length:8},(_,i)=>['A, '+(i+2),[make('A'),make(i+2)]])],['ペア',ups.map(r=>[r+', '+r,[make(r),make(r)]])]];$('strategy-rules').textContent=ruleText();$('charts').innerHTML=groups.map(([title,rows])=>'<div class="chart-wrap"><h3>'+title+'</h3><table><thead><tr><th scope="col">自分 ↓ / 相手 →</th>'+ups.map(u=>'<th scope="col">'+u+'</th>').join('')+'</tr></thead><tbody>'+rows.map(([label,cards])=>'<tr><th scope="row">'+label+'</th>'+ups.map(u=>{const opts={canSplit:true,canDouble:true,canSurrender:state.rules.mode!=='enhc'},a=baseAction(cards,make(u),state.rules,opts);let c=code[a];if(a==='double')c+='/'+code[baseAction(cards,make(u),state.rules,{...opts,canDouble:false})];if(a==='surrender')c+='/'+code[baseAction(cards,make(u),state.rules,{...opts,canSurrender:false})];return `<td class="${code[a]}" title="${LABELS[a]}">${c}</td>`;}).join('')+'</tr>').join('')+'</tbody></table></div>').join('');}
render();

function renderReview(){
 const rows=state.review.map((r,i)=>{const e=explainDecision(r,state.rules);return '<article class="decision"><div class="decision-heading"><span>判断 '+(i+1)+' · ハンド '+r.hand+'</span><span class="'+(r.correct?'check':'wrong')+'">'+(r.correct?'✓ 一致':'↗ 要復習')+'</span></div><div class="review-cards"><div><span class="review-label">あなた · '+esc(e.pattern)+'</span><div class="cards">'+r.cards.map(c=>card(c)).join('')+'</div></div><div><span class="review-label">ディーラーの表向き</span><div class="cards">'+card(r.dealer)+'</div></div></div><div class="decision-choice"><span>あなた：'+LABELS[r.action]+'</span><strong>推奨：'+LABELS[r.expected]+'</strong></div><p class="decision-context">'+esc(e.context)+'</p><p class="decision-reason">'+esc('今回は'+e.pattern+' 対 ディーラー'+r.dealer.rank+'なので、'+LABELS[r.expected]+'を選びます。'+e.reason)+'</p><div class="pattern-rule"><span>覚えるパターン</span><p>'+esc(e.rule)+'</p></div>'+e.notes.map(n=>'<p class="decision-note">'+esc(n)+'</p>').join('')+'<p class="decision-match">'+esc(e.match)+'</p></article>';});
 $('review').innerHTML='<p class="review-intro">ROUND '+state.round+' · 収支 '+signed(state.net)+' CHIPS</p><p class="review-lead">結果ではなく、判断した時点の手札とディーラーの表向きカードで振り返ります。</p>'+(rows.length?rows.join(''):'<p class="decision-reason">ブラックジャックで決着したため、今回は行動選択がありませんでした。最初の2枚のAと10点カードがブラックジャックです。相手もブラックジャックなら引き分け、それ以外は3:2の配当です。</p>')+'<p class="review-footer">'+esc(ruleText())+'<br>ベーシックストラテジーは平均的な損失を抑える判断です。推奨通りでも、この1回の勝利を保証しません。</p>';
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
async function motion(el,frames,duration=450){if(!el)return;await el.animate(frames,{duration:reduced()?1:duration,easing:'cubic-bezier(.2,.75,.2,1)',fill:'backwards'}).finished;}
async function fly(el){if(!el)return;const shoe=document.querySelector('.shoe').getBoundingClientRect(),r=el.getBoundingClientRect();await motion(el,[{transform:'translate('+ (shoe.x-r.x)+'px,'+(shoe.y-r.y)+'px) rotate(22deg) scale(.65)',opacity:0,filter:'brightness(.7)'},{transform:'translate(0,0) rotate(-3deg) scale(1.03)',opacity:1,offset:.85},{transform:'translate(0,0) rotate(0) scale(1)',opacity:1}],480);}
function snapshotForPlay(final){const v=structuredClone(final);v.phase='playing';v.active=Math.min(v.active,v.hands.length-1);v.bankroll=final.bankroll-final.hands.reduce((n,h)=>n+(h.bet+h.net),0);return v;}
function present(v,text){presentation=v;render();if(text)$('status').textContent=text;}
async function dealSequence(final){const v=final.phase==='finished'?snapshotForPlay(final):structuredClone(final),full=structuredClone(v);v.hands[0].cards=[];v.dealer=[];present(v,'カードを配っています…');
 v.hands[0].cards.push(full.hands[0].cards[0]);present(v,'カードを配っています…');await fly(document.querySelector('#hands .card'));
 v.dealer.push(full.dealer[0]);present(v,'カードを配っています…');await fly(document.querySelector('#dealer-cards .card'));
 v.hands[0].cards.push(full.hands[0].cards[1]);present(v,'カードを配っています…');await fly(document.querySelector('#hands .card:last-child'));
 if(final.rules.mode==='peek'){v.dealer.push(full.dealer[1]);present(v,'カードを配っています…');await fly(document.querySelector('#dealer-cards .card:last-child'));}
 return v;
}
async function playerSequence(before,final,action){const v=final.phase==='finished'?snapshotForPlay(final):structuredClone(final);v.dealer=structuredClone(before.dealer);present(v,action==='split'?'2つのハンドに分けます…':action==='stand'?'スタンド。ディーラーの番を待ちます。':'カードを確認しています…');
 if(action==='split'){await Promise.all([...document.querySelectorAll('#hands .hand')].map((el,i)=>motion(el,[{transform:'translateX('+(i%2?-30:30)+'px)',opacity:.5},{transform:'translateX(0)',opacity:1}],440)));await Promise.all([...document.querySelectorAll('#hands .hand .card:last-child')].map(fly));}
 else if(action==='hit'||action==='double'){const i=before.active;await fly(document.querySelectorAll('#hands .hand')[i]?.querySelector('.card:last-child'));}
 else await wait(reduced()?1:220);
 return v;
}
async function dealerSequence(v,final){
 present(v,'ディーラーのカードをオープン…');
 if(final.rules.mode==='peek'){
  await motion(document.querySelector('#dealer-cards .card:nth-child(2)'),[{transform:'perspective(600px) rotateY(0)'},{transform:'perspective(600px) rotateY(90deg)'}],250);
  v.dealer=structuredClone(final.dealer.slice(0,2));v.phase='revealing';present(v,'ディーラーのカードをオープン…');
  await motion(document.querySelector('#dealer-cards .card:nth-child(2)'),[{transform:'perspective(600px) rotateY(-90deg)',filter:'brightness(.6)'},{transform:'perspective(600px) rotateY(0)',filter:'brightness(1)'}],330);
 }else{v.dealer=structuredClone(final.dealer.slice(0,2));v.phase='revealing';present(v,'ディーラーの2枚目を配ります…');await fly(document.querySelector('#dealer-cards .card:nth-child(2)'));}
 for(let i=2;i<final.dealer.length;i++){await wait(reduced()?1:200);v.dealer.push({...final.dealer[i]});present(v,'ディーラーが追加カードを引きます…');await fly(document.querySelector('#dealer-cards .card:last-child'));}
 await wait(reduced()?1:350);
}
async function perform(kind,action){if(busy)return;const before=structuredClone(state);busy=true;pendingReview=false;$('error').textContent='';
 try{
  if(kind==='deal'){deal(state,Number($('bet').value));betHistory=[];}else act(state,action);save();
  const final=structuredClone(state);present(before,kind==='action'?LABELS[action]+'を選択しました。':'カードを配ります…');
  if(kind==='action'&&signalOn)await showSignal(action);
  const v=kind==='deal'?await dealSequence(final):await playerSequence(before,final,action);
  if(final.phase==='finished')await dealerSequence(v,final);
  presentation=null;render();await wait(reduced()?1:600);
  busy=false;render();if(final.phase==='finished'&&reviewOn)requestReview();
 }catch(e){presentation=null;busy=false;render();$('error').textContent=e.message;}
}
function requestReview(){if(busy)return;if(document.querySelector('dialog[open]')){pendingReview=true;return;}if(state.phase==='finished'&&reviewOn){pendingReview=false;$('review-dialog').showModal();}}
for(const d of document.querySelectorAll('dialog'))d.addEventListener('close',()=>{if(pendingReview&&!document.querySelector('dialog[open]'))requestReview();});
const palm='<path d="M49 113 30 89Q24 80 31 75Q36 72 42 80L49 88 44 34Q43 23 51 22Q58 21 59 31L63 64 62 19Q62 9 70 9Q78 9 78 20L79 61 84 26Q86 16 94 18Q102 20 99 31L94 68 103 43Q107 34 114 39Q120 43 115 53L104 91Q99 109 91 118L89 143 56 143Z"/>';
const finger='<path d="M53 143 51 112 35 90Q29 82 35 77Q42 72 49 82L55 90 55 22Q55 11 64 11Q73 11 73 22L74 70Q83 58 91 67Q102 59 108 72Q119 71 119 83L115 108 103 126 102 143Z"/>';
const two='<path d="M50 143 48 113 32 91Q27 83 33 78Q39 75 46 83L53 91 44 26Q43 16 51 15Q59 14 61 24L70 72 81 22Q83 12 91 14Q99 17 96 27L86 78Q94 65 103 74Q117 69 117 84L114 108 102 126 101 143Z"/>';
async function showSignal(action){const text={hit:'ヒット · 指でテーブルを軽く叩く',stand:'スタンド · 手を横に振る',double:'ダブル · 追加ベットを置き、1枚を示す',split:'スプリット · 2本指でハンドを分ける',surrender:'サレンダー · 人差し指で横線を引く'}[action];const path=action==='stand'?palm:action==='split'?two:finger;
 const layer=$('gesture-overlay');layer.className='gesture-overlay signal-'+action;layer.innerHTML='<svg class="signal-hand" viewBox="0 0 150 160" aria-hidden="true"><g fill="#edc598" stroke="#9e704c" stroke-width="2" stroke-linejoin="round">'+path+'<path d="M55 135H103V158H55Z" fill="#fcf5db"/><path d="M53 147H105V160H53Z" fill="#273b4e"/></g></svg><span class="gesture-trail" aria-hidden="true"></span><span class="gesture-caption">'+text+'</span>';layer.hidden=false;
 await wait(reduced()?500:1050);layer.hidden=true;layer.innerHTML='';
}
$('signal-toggle').addEventListener('change',()=>{signalOn=$('signal-toggle').checked;save();});
