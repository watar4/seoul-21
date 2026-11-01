import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,deal,act,score,baseAction,available,makeShoe,DEFAULT_RULES} from './engine.js';
const c=r=>({rank:String(r),suit:'♠'}),cards=(...r)=>r.map(c);
function rig(sequence,rules={}){const s=fresh(1000,{...DEFAULT_RULES,...rules});s.shoe=[...Array.from({length:100},()=>c(10)),...cards(...sequence).reverse()];return s;}
const strategy=(hand,up,rules={},options={})=>baseAction(cards(...hand),c(up),{...DEFAULT_RULES,...rules},options);
test('aces adapt without busting',()=>{assert.deepEqual(score(cards('A','A',9)),{total:21,soft:true});assert.deepEqual(score(cards('A',6,10)),{total:17,soft:false});});
test('shoe has six complete decks',()=>{const shoe=makeShoe();assert.equal(shoe.length,312);assert.equal(shoe.filter(x=>x.rank==='A').length,24);});
test('strategy hard totals, surrender, pairs and soft doubles',()=>{for(const [h,u,a] of [[[10,6],10,'surrender'],[[8,8],10,'split'],[[10,2],3,'hit'],[[10,2],4,'stand'],[['A',7],6,'double'],[['A',7],9,'hit'],[[5,5],9,'double'],[[4,4],5,'split'],[[10,7],'A','stand'],[[6,5],'A','hit']])assert.equal(strategy(h,u),a);assert.equal(strategy(['A',7],6,{}, {canDouble:false}),'stand');assert.equal(strategy([6,5],'A',{h17:true}),'double');assert.equal(strategy([8,8],'A',{h17:true}),'surrender');assert.equal(strategy([10,6],10,{}, {canSurrender:false}),'hit');});
test('ENHC changes exposed BJ risk',()=>{assert.equal(strategy([6,5],10,{mode:'enhc'},{canSurrender:false}),'hit');assert.equal(strategy([8,8],10,{mode:'enhc'},{canSurrender:false}),'hit');assert.equal(strategy(['A','A'],10,{mode:'enhc'},{canSurrender:false}),'split');});
test('blackjack pays 3:2, equal naturals push',()=>{let s=rig(['A',9,'K',8]);deal(s,50);assert.equal(s.phase,'finished');assert.equal(s.bankroll,1075);s=rig(['A','A','K',10]);deal(s,50);assert.equal(s.bankroll,1000);assert.equal(s.review.length,0);});
test('dealer BJ ends before player choices',()=>{const s=rig([9,'A',8,10]);deal(s,50);assert.equal(s.phase,'finished');assert.equal(s.bankroll,950);assert.deepEqual(available(s),[]);});
test('double consumes one card, updates stake and pays correctly',()=>{const s=rig([5,6,6,10,10,10]);deal(s,50);act(s,'double');assert.equal(s.hands[0].cards.length,3);assert.equal(s.hands[0].bet,100);assert.equal(s.bankroll,1100);assert.equal(s.review[0].expected,'double');});
test('surrender returns half, unavailable after hit',()=>{const s=rig([10,10,6,7,2]);deal(s,50);act(s,'surrender');assert.equal(s.bankroll,975);assert.equal(s.net,-25);const t=rig([3,10,2,7,2]);deal(t,50);act(t,'hit');assert.ok(!available(t).includes('surrender'));});
test('split aces draw once, split 21 pays even money',()=>{const s=rig(['A',6,'A',10,10,10,10]);deal(s,50);act(s,'split');assert.equal(s.phase,'finished');assert.equal(s.hands.length,2);assert.equal(s.bankroll,1100);assert.ok(s.hands.every(h=>h.result==='win'));});
test('split maximum three hands and funds restrictions',()=>{const s=rig([8,6,8,10,8,8,2,3]);deal(s,50);act(s,'split');act(s,'split');assert.equal(s.hands.length,3);assert.ok(!available(s).includes('split'));const t=rig([8,6,8,10]);deal(t,1000);assert.ok(!available(t).includes('split'));assert.ok(!available(t).includes('double'));});
test('S17 stays, H17 draws',()=>{for(const h17 of [false,true]){const s=rig([10,'A',8,6,4],{h17});deal(s,50);act(s,'stand');assert.equal(s.bankroll,h17?950:1050);assert.equal(s.dealer.length,h17?3:2);}});
test('ENHC dealer natural loses doubled bet',()=>{const s=rig([5,10,6,10,'A'],{mode:'enhc'});deal(s,50);act(s,'double');assert.equal(s.bankroll,900);assert.equal(s.dealer.length,2);});
test('no replay settlement; bankrupt session unlocks; reload state survives',()=>{const s=rig([10,10,6,7,10]);deal(s,1000);const restored=JSON.parse(JSON.stringify(s));act(restored,'hit');assert.equal(restored.bankroll,0);assert.equal(restored.locked,false);assert.throws(()=>act(restored,'stand'));});
test('decimal stakes, smallest balance remains playable',()=>{const s=rig([10,10,6,7]);s.bankroll=.01;deal(s,.01);act(s,'surrender');assert.equal(s.bankroll,.01);assert.throws(()=>deal(fresh(),NaN));assert.throws(()=>deal(fresh(),1001));assert.throws(()=>deal(fresh(),.001));});
test('many rounds maintain nonnegative funds and terminate',()=>{const s=fresh(1000);for(let i=0;i<400&&s.bankroll>0;i++){deal(s,Math.min(s.bankroll,10));let steps=0;while(s.phase==='playing'){assert.ok(++steps<100);const a=available(s),h=s.hands[s.active];act(s,baseAction(h.cards,s.dealer[0],s.rules,{canSplit:a.includes('split'),canDouble:a.includes('double'),canSurrender:a.includes('surrender')}));}assert.ok(s.bankroll>=0);assert.ok(Number.isFinite(s.bankroll));assert.equal(Math.round(s.bankroll*100)/100,s.bankroll);}});

import {explainDecision} from './review.js';

const reviewRecord=(hand,dealer,expected,extra={})=>({cards:hand.map(rank=>({rank:String(rank),suit:'♠'})),dealer:{rank:String(dealer),suit:'♥'},expected,action:'stand',correct:false,...extra});
test('review distinguishes soft, hard and pairs with concrete patterns',()=>{
 const hard=explainDecision(reviewRecord([10,2],3,'hit'),DEFAULT_RULES);assert.equal(hard.pattern,'ハード 12');assert.match(hard.rule,/対2・3/);
 const soft=explainDecision(reviewRecord(['A',7],9,'hit'),DEFAULT_RULES);assert.equal(soft.pattern,'ソフト 18');assert.match(soft.reason,/18でも/);
 const pair=explainDecision(reviewRecord([8,8],10,'split'),DEFAULT_RULES);assert.match(pair.reason,/16/);assert.match(pair.rule,/原則スプリット/);
});
test('review explains actual restrictions and uses decision-time rules',()=>{
 const e=explainDecision(reviewRecord(['A',7],6,'stand',{options:['hit','stand']}),DEFAULT_RULES);assert.match(e.notes.join(''),/通常の表ではダブル/);assert.match(e.notes.join(''),/スタンドを推奨/);
 const snapshot=explainDecision(reviewRecord([10,5],'A','surrender',{rules:{...DEFAULT_RULES,h17:true}}),DEFAULT_RULES);assert.match(snapshot.rule,/H17/);
});
test('review recognizes face cards as ten and dealer natural risk in ENHC',()=>{const e=explainDecision(reviewRecord([6,5],'K','hit'),{...DEFAULT_RULES,mode:'enhc'});assert.match(e.notes.join(''),/追加ベットも失います/);});

import {buildRoundPlan,settlementFor} from './round-flow.js';
const identify=s=>{let i=0;for(const card of [...s.shoe,...s.dealer,...s.hands.flatMap(h=>h.cards)])card.id||=String(++i);return s;};
test('round presentation reveals dealer, announces result, pays chips, then enables the optional review',()=>{
 const s=identify(rig([10,6,8,10,10]));deal(s,50);const before=structuredClone(s);act(s,'stand');
 const untouched=structuredClone(s),plan=buildRoundPlan(before,s,{kind:'action',action:'stand'}),types=plan.map(p=>p.type);
 assert.ok(types.indexOf('dealer-total')<types.indexOf('outcome'));
 assert.ok(types.indexOf('outcome')<types.indexOf('payout'));
 assert.equal(types.at(-1),'ready');
 const result=plan.find(p=>p.type==='outcome'),payout=plan.find(p=>p.type==='payout');
 assert.equal(result.view.bankroll,950);assert.equal(payout.payment.returned,100);
 assert.equal(payout.after.bankroll,1050);assert.equal(plan.at(-1).view.bankroll,s.bankroll);
 assert.ok(plan.every(p=>!['review','open-review'].includes(p.type)));
 assert.deepEqual(s,untouched);
});
test('loss, push, blackjack, surrender and double reconcile visual chip movements with engine payouts',()=>{
 const cases=[{r:[10,10,8,9],a:'stand',ret:0},{r:[10,10,8,8],a:'stand',ret:50},{r:['A',9,'K',8],a:null,ret:125},{r:[10,10,6,7],a:'surrender',ret:25},{r:[5,6,6,10,10,10],a:'double',ret:200}];
 for(const item of cases){const s=identify(rig(item.r));let before=structuredClone(s);deal(s,50);if(item.a){before=structuredClone(s);act(s,item.a);}const plan=buildRoundPlan(before,s,{kind:item.a?'action':'deal',action:item.a}),p=settlementFor(s);
  assert.equal(p.returned,item.ret);assert.equal(p.before+p.returned,p.after);
  const payments=plan.filter(step=>step.type==='payout');assert.equal(payments.reduce((n,step)=>n+step.payment.returned,0),item.ret);
  assert.equal(plan.at(-1).view.bankroll,s.bankroll);assert.equal(plan.at(-1).view.phase,'finished');
 }
});
test('split keeps original card identities, deals each new card separately, and pays each hand once',()=>{
 const s=identify(rig(['A',6,'A',10,10,10,10]));deal(s,50);const before=structuredClone(s);act(s,'split');
 const plan=buildRoundPlan(before,s,{kind:'action',action:'split'}),split=plan.find(p=>p.type==='split');
 assert.equal(split.view.hands[0].cards[0].id,before.hands[0].cards[0].id);
 assert.equal(split.view.hands[1].cards[0].id,before.hands[0].cards[1].id);
 assert.ok(split.view.hands.every(h=>h.cards.length===1));
 assert.equal(plan.filter(p=>p.type==='deal-card'&&p.side==='player').length,2);
 const payments=plan.filter(p=>p.type==='payout');assert.equal(payments.length,2);
 assert.equal(payments[0].view.bankroll,900);assert.equal(payments[0].after.bankroll,1000);
 assert.equal(payments[1].view.bankroll,1000);assert.equal(payments[1].after.bankroll,1100);
});
test('player cards stay covered during flight and the dealer hole card stays covered until dealer turn',()=>{
 const s=identify(rig([5,6,6,10,10]));const before=structuredClone(s);deal(s,50);
 const plan=buildRoundPlan(before,s,{kind:'deal'});
 for(const step of plan.filter(p=>p.type==='deal-card'))assert.ok(step.view.hiddenCards.includes(step.cardId));
 for(const step of plan.filter(p=>p.type==='turn-card'))assert.ok(!step.view.hiddenCards.includes(step.cardId));
 assert.ok(plan.at(-1).view.hiddenCards.includes(s.dealer[1].id));
 assert.ok(!plan.some(p=>p.type==='outcome'||p.type==='payout'));
});
test('ENHC reveals the second dealer card only after player action and before settlement',()=>{
 const s=identify(rig([5,10,6,10,'A'],{mode:'enhc'}));deal(s,50);const before=structuredClone(s);act(s,'double');
 const plan=buildRoundPlan(before,s,{kind:'action',action:'double'}),dealerDeal=plan.findIndex(p=>p.type==='deal-card'&&p.side==='dealer');
 assert.ok(dealerDeal>plan.findIndex(p=>p.type==='dealer-turn'));
 assert.ok(dealerDeal<plan.findIndex(p=>p.type==='outcome'));
 assert.equal(plan.at(-1).view.bankroll,900);
});

