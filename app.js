import {buildRoundPlan,settlementFor} from './round-flow.js';
import {TableView,stampCards,pause} from './table-motion.js';
import {HandSignals} from './hand-signals.js';
import {explainDecision} from './review.js';
import {fresh,deal,act,available,score,baseAction,LABELS} from './engine.js';
const $=id=>document.getElementById(id),key='seoul21.state.v1';
let state=fresh(),reviewOn=true,signalOn=true,storageOK=true;
let busy=false,presentation=null;
try{const stored=JSON.parse(localStorage.getItem(key));if(stored?.version===1&&Number.isFinite(stored.bankroll)&&stored.bankroll>=0&&Number.isFinite(stored.initial)&&stored.initial>=1&&['playing','finished','betting'].includes(stored.phase)&&Array.isArray(stored.hands)&&stored.rules)state=stored;reviewOn=localStorage.getItem('seoul21.review')!=='off';signalOn=localStorage.getItem('seoul21.signal')!=='off';}catch{storageOK=false;}
const fmt=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2}),signed=n=>(n>0?'+':n<0?'−':'±')+fmt(Math.abs(n));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function save(){try{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('seoul21.review',reviewOn?'on':'off');localStorage.setItem('seoul21.signal',signalOn?'on':'off');}catch{storageOK=false;}}
function card(c,back=false){if(back)return '<div class="card back" aria-label="裏向きのカード">♠</div>';const r=esc(c.rank),s=esc(c.suit);return `<div class="card ${['♥','♦'].includes(c.suit)?'red':''}" aria-label="${s}${r}"><span class="corner">${r}<small>${s}</small></span>${s}<span class="corner bottom">${r}<small>${s}</small></span></div>`;}
function totalText(cards){const x=score(cards);return (x.soft?'SOFT ':'')+x.total;}
function ruleText(){return `6デッキ / ${state.rules.h17?'H17':'S17'} / DAS / 最大3ハンド / ${state.rules.mode==='peek'?'BJ先確認・レイトサレンダー':'ENHC・追加分も損失・サレンダーなし'}`;}
const board=new TableView(chipHTML,totalText,score);
const signals=new HandSignals($('gesture-overlay'));
stampCards(state);
function render(){
 const view=presentation||state,playing=view.phase==='playing',finished=view.phase==='finished';
 const inRound=!['betting','finished'].includes(view.phase),pending=view.phase==='betting'?Math.min(view.bankroll,Number($('bet').value)||0):0;
 $('balance').textContent=fmt(Math.max(0,view.bankroll-pending));
 $('initial').value=view.initial;$('initial').disabled=view.locked||inRound;
 $('lock-note').textContent=inRound||view.locked?'開始額は残高が0になるまで固定されます。':view.bankroll===0?'チップがなくなりました。開始額を変更できます。':'最初のプレイ前に変更できます。';
 const unreturned=inRound?view.hands.reduce((n,h,i)=>n+(view.settledHands?.includes(i)?0:h.bet),0):0;
 $('profit').textContent=signed(['result','settling'].includes(view.phase)?state.bankroll-state.initial:view.bankroll+unreturned-view.initial);
 $('round').textContent='ROUND '+String(view.round).padStart(2,'0');
 $('table-rules').textContent=view.rules.h17?'DEALER HITS SOFT 17':'DEALER STANDS ON ALL 17';
 board.render(view);
 $('status').textContent=playing?`あなたの番です${view.hands.length>1?' / ハンド '+(view.active+1):''}。行動を選んでください。`:finished?(view.bankroll===0?'チップがなくなりました。設定からリセットできます。':reviewOn?'振り返りを見るか、次のベットへ進めます。':'次のベットへ進めます。'):'チップをタップしてベットしてください。';
 $('bet-form').hidden=view.phase!=='betting';
 $('actions').hidden=!playing;
 $('round-end').hidden=!finished;
 const choices=available(state);
 $('actions').innerHTML=Object.entries(LABELS).map(([a,l])=>`<button data-action="${a}" ${!busy&&choices.includes(a)?'':'disabled'}>${l}<small>${a.toUpperCase()}</small></button>`).join('');
 $('review-open').hidden=!reviewOn;$('review-open').disabled=busy;
 $('next-round').disabled=busy||view.bankroll===0;
 $('deal').disabled=busy||view.bankroll===0||Number($('bet').value)<=0;
 $('deal').innerHTML='ディール <span>→</span>';
 $('bet').max=view.bankroll;$('bet').disabled=busy;
 for(const id of ['rules-open','undo','clear-bet'])$(id).disabled=busy;
 $('review-toggle').checked=reviewOn;$('signal-toggle').checked=signalOn;
 $('accuracy').textContent=view.stats.decisions?Math.round(view.stats.correct/view.stats.decisions*100)+'%':'—';
 $('record').textContent=`${view.stats.wins} / ${view.stats.losses} / ${view.stats.pushes}`;
 $('dealer-rule').value=view.rules.h17?'h17':'s17';$('deal-rule').value=view.rules.mode;
 $('dealer-rule').disabled=inRound;$('deal-rule').disabled=inRound;
 $('review').hidden=!finished||!reviewOn;
 if(finished&&reviewOn)renderReview();
 if(finished){const paid=settlementFor(view);$('settlement-receipt').textContent=`ベット ${fmt(view.hands.reduce((n,h)=>n+h.bet,0))} / 戻り ${fmt(paid.returned)} CHIPS`;}
 renderWager(view);
 document.querySelectorAll('#chip-rack button').forEach(b=>b.disabled=busy||view.phase!=='betting'||Number(b.dataset.chip)>view.bankroll-Number($('bet').value));
 document.querySelector('.tray-caption span').textContent=view.phase==='betting'?'チップをタップして追加':finished?'次のベットでチップを選べます':'ベットしたチップはテーブルへ';
 if(!storageOK)$('error').textContent='このブラウザでは保存できません。ページを閉じると進行状況が失われます。';
 save();
}
function run(fn){$('error').textContent='';try{fn();render();}catch(e){$('error').textContent=e.message;}}
$('bet-form').addEventListener('submit',e=>{e.preventDefault();if(!busy)perform('deal');});
$('actions').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b&&!busy)perform('action',b.dataset.action);});
$('initial').addEventListener('change',()=>run(()=>{if(state.locked||state.phase==='playing')throw Error('開始額は残高が0になるまで固定されています');const n=Number($('initial').value);if(!Number.isSafeInteger(n)||n<1||n>100000000){$('initial').value=state.initial;throw Error('開始チップは1〜100,000,000の整数で指定してください');}state=fresh(n,state.rules);betHistory=[];$('bet').value=0;}));
$('review-toggle').addEventListener('change',()=>{reviewOn=$('review-toggle').checked;render();});
function setBet(n){$('bet').value=Math.max(0,Math.min(state.bankroll,Math.round(n*100)/100));render();}
const denominations=[1,5,25,100,500,1000,2000,5000,20000,50000];
const colors=['#245cbe','#b53442','#74a647','#303c39','#6854a4','#2698b5','#d49336','#b6ad39','#9697a1','#ab5aaf'];
const chipName=n=>n>=1000?(n/1000)+'K':String(n);
function chipHTML(n,index=denominations.indexOf(n)){const i=index<0?Math.max(0,denominations.findLastIndex(d=>d<=n)):index;return '<span class="poker-chip" style="--chip:'+colors[i]+';--edge:'+colors[i]+'"><span>'+chipName(n)+'</span></span>';}
$('chip-rack').innerHTML=denominations.map((n,i)=>'<button type="button" class="poker-chip" style="--chip:'+colors[i]+';--edge:'+colors[i]+'" data-chip="'+n+'" aria-label="'+n+'チップを追加"><span>'+chipName(n)+'</span></button>').join('');
let betHistory=[];
$('chip-rack').addEventListener('click',e=>{const b=e.target.closest('[data-chip]');if(!b||busy||state.phase!=='betting')return;const amount=Number(b.dataset.chip),current=Number($('bet').value)||0;if(current+amount>state.bankroll){$('error').textContent='残高が足りません。';return;}betHistory.push(current);$('error').textContent='';setBet(current+amount);board.chips(amount,b,$('wager-stack'),{duration:480});b.classList.add('chosen');setTimeout(()=>b.classList.remove('chosen'),250);});
$('undo').onclick=()=>{if(!busy&&state.phase!=='playing')setBet(betHistory.length?betHistory.pop():0);};
$('clear-bet').onclick=()=>{if(busy)return;betHistory=[];setBet(0);};
$('bet').addEventListener('change',()=>{betHistory=[];setBet(Number($('bet').value)||0);});
function renderWager(view=state){
 const betting=view.phase==='betting',n=betting?Number($('bet').value)||0:view.hands.reduce((sum,h)=>sum+h.bet,0);
 $('wager-total').textContent=fmt(n);$('wager-stack').hidden=!betting;
 $('wager-zone').classList.toggle('in-play',!betting);
 let rest=n,items=[];
 for(let i=denominations.length-1;i>=0;i--){let count=Math.floor((rest+1e-8)/denominations[i]);rest-=count*denominations[i];while(count--&&items.length<6)items.push(chipHTML(denominations[i],i));}
 if(!items.length&&n>0)items.push(chipHTML(n,0));
 $('wager-stack').innerHTML=items.length?items.join(''):'<span class="bet-ring">BET</span>';
 $('chip-rack').setAttribute('aria-disabled',String(!betting));
}
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
function present(view,text){presentation=view;render();if(text)$('status').textContent=text;}
const stageText={
 'place-bet':'ベット確定。カードを配ります。',
 'deal-card':'カードを配っています…',
 'turn-card':'カードをオープン…',
 'split':'2枚を分け、同額のチップを追加します。',
 'add-stake':'チップを追加。ダブルの1枚を配ります。',
 'close-hand':'手札が確定しました。',
 'dealer-turn':'ディーラーの番です。',
 'dealer-total':'ディーラーの手札が確定しました。',
 'outcome':'勝敗が決まりました。',
 'payout':'テーブルのチップを精算しています…'
};
async function perform(kind,action){
 if(busy)return;
 stampCards(state);
 const before=structuredClone(state);busy=true;$('error').textContent='';
 let gesture=Promise.resolve();
 try{
  if(kind==='deal'){deal(state,Number($('bet').value));betHistory=[];}
  else {act(state,action);if(action==='double')state.hands[before.active].doubled=true;}
  stampCards(state);save();
  const final=structuredClone(state),steps=buildRoundPlan(before,final,{kind,action});
  for(const step of steps){
   const previous=['split','deal-card'].includes(step.type)?board.capture():null;
   present(step.view,stageText[step.type]);
   switch(step.type){
    case 'place-bet': await board.chips(final.hands[0].bet,$('wager-zone'),document.querySelector('.hand-wager'));break;
    case 'action':
     if(signalOn)gesture=signals.play(action);
     await board.action(action,step.hand);break;
    case 'deal-card': await Promise.all([board.move(previous),board.deal(step.cardId)]);break;
    case 'turn-card': await board.turn(step.cardId,step.hole);await board.total(step.side==='dealer'?'dealer':step.hand);break;
    case 'split': await Promise.all([board.move(previous),board.chips(step.amount,$('balance'),$('hands').children[step.hand+1].querySelector('.hand-wager'))]);break;
    case 'add-stake': await board.chips(step.amount,$('balance'),$('hands').children[step.hand].querySelector('.hand-wager'));break;
    case 'close-hand': await board.closeHand(step.action,step.hand);break;
    case 'hand-total': await board.total(step.hand);await gesture;board.clearAction();break;
    case 'dealer-turn': await pause(500);break;
    case 'dealer-total': await board.total('dealer');await pause(650);break;
    case 'outcome': await board.outcome(step.view);break;
    case 'payout': await board.payout(step);present(step.after,stageText.payout);break;
    case 'ready': break;
   }
  }
  presentation=null;busy=false;render();await board.ready();
 }catch(e){signals.stop();presentation=null;busy=false;render();$('error').textContent=e.message;}
}
function requestReview(){
 if(busy||state.phase!=='finished'||!reviewOn||document.querySelector('dialog[open]'))return;
 renderReview();$('review-dialog').showModal();
}
$('next-round').onclick=async()=>{
 if(busy||state.phase!=='finished')return;
 busy=true;render();await board.clear();
 state.phase='betting';state.hands=[];state.dealer=[];state.active=0;
 $('bet').value=0;betHistory=[];busy=false;render();
};
$('signal-toggle').addEventListener('change',()=>{signalOn=$('signal-toggle').checked;save();});
