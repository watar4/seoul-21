export const LABELS = {hit:'ヒット',stand:'スタンド',double:'ダブル',split:'スプリット',surrender:'サレンダー'};
export const DEFAULT_RULES = {decks:6,h17:false,das:true,surrender:true,maxHands:3,mode:'peek'};
export function value(card){return card.rank==='A'?11:Math.min(10,Number(card.rank)||10);}
export function score(cards){let total=cards.reduce((s,c)=>s+value(c),0),aces=cards.filter(c=>c.rank==='A').length;while(total>21&&aces){total-=10;aces--;}return {total,soft:aces>0};}
export function natural(hand){return !hand.fromSplit&&hand.cards.length===2&&score(hand.cards).total===21;}
export function makeShoe(decks=6){const cards=[];for(let d=0;d<decks;d++)for(const suit of ['♠','♥','♦','♣'])for(const rank of ['A','2','3','4','5','6','7','8','9','10','J','Q','K'])cards.push({rank,suit});for(let i=cards.length-1;i>0;i--){const n=new Uint32Array(1);let j,limit=Math.floor(4294967296/(i+1))*(i+1);do{crypto.getRandomValues(n);}while(n[0]>=limit);j=n[0]%(i+1);[cards[i],cards[j]]=[cards[j],cards[i]];}return cards;}
export function baseAction(cards,up,rules=DEFAULT_RULES,{canSplit=true,canDouble=true,canSurrender=true}={}){
 const {total:t,soft}=score(cards),d=value(up),pair=cards.length===2&&value(cards[0])===value(cards[1]),p=value(cards[0]);
 // Total-dependent multi-deck strategy. ENHC: all added bets lose to dealer BJ.
 if(rules.surrender&&canSurrender&&!soft&&((t===16&&!(pair&&p===8&&canSplit)&&d>=9)||(t===15&&d===10)||(rules.h17&&d===11&&[15,16,17].includes(t))))return 'surrender';
 if(pair&&canSplit){let split=p===11||p===8||(p===9&&([2,3,4,5,6,8,9].includes(d)))||(p===7&&d<=7)||(p===6&&d<=6&&(rules.das||d>=3))||([2,3].includes(p)&&d<=7&&(rules.das||d>=4))||(p===4&&rules.das&&[5,6].includes(d));if(rules.mode==='enhc'&&d>=10&&!(p===11&&d===10))split=false;if(split)return 'split';}
 let dbl=false,stand=false;
 if(soft){dbl=([13,14].includes(t)&&[5,6].includes(d))||([15,16].includes(t)&&d>=4&&d<=6)||([17,18].includes(t)&&d>=3&&d<=6)||(rules.h17&&((t===18&&d===2)||(t===19&&d===6)));stand=t>=19||(t===18&&d<=8);}
 else {dbl=(t===9&&d>=3&&d<=6)||(t===10&&d<=9)||(t===11&&(d!==11||rules.h17));stand=t>=17||(t>=13&&t<=16&&d<=6)||(t===12&&d>=4&&d<=6);}
 if(rules.mode==='enhc'&&d>=10)dbl=false;
 if(dbl&&canDouble)return 'double';return stand?'stand':'hit';
}
export function fresh(initial=1000,rules=DEFAULT_RULES){return {version:1,initial,bankroll:initial,locked:false,phase:'betting',rules:{...rules},shoe:[],dealer:[],hands:[],active:0,review:[],round:0,stats:{wins:0,losses:0,pushes:0,correct:0,decisions:0},net:0};}
export function available(s){if(s.phase!=='playing')return [];const h=s.hands[s.active];if(!h||h.done)return [];const a=['hit','stand'];if(h.cards.length===2&&s.bankroll>=h.bet&&(!h.fromSplit||s.rules.das))a.push('double');if(h.cards.length===2&&value(h.cards[0])===value(h.cards[1])&&s.hands.length<s.rules.maxHands&&s.bankroll>=h.bet&&!h.splitAce)a.push('split');if(s.rules.surrender&&h.cards.length===2&&!h.fromSplit&&s.rules.mode!=='enhc')a.push('surrender');return a;}
export function recommendation(s){const a=available(s);return baseAction(s.hands[s.active].cards,s.dealer[0],s.rules,{canSplit:a.includes('split'),canDouble:a.includes('double'),canSurrender:a.includes('surrender')});}
function draw(s){if(!s.shoe.length)throw Error('シューにカードがありません');return s.shoe.pop();}
export function deal(s,bet){if(s.phase==='playing')throw Error('ラウンド進行中です');if(!Number.isFinite(bet)||bet<0.01||Math.abs(bet*100-Math.round(bet*100))>1e-7||bet>s.bankroll)throw Error('ベットは残高以内の0.01刻みで指定してください');if(s.shoe.length<80)s.shoe=makeShoe(s.rules.decks);s.locked=true;s.bankroll=Math.round((s.bankroll-bet)*100)/100;s.round++;s.phase='playing';s.active=0;s.review=[];s.net=0;s.hands=[{cards:[draw(s)],bet,fromSplit:false,done:false}];s.dealer=[draw(s)];s.hands[0].cards.push(draw(s));if(s.rules.mode==='peek')s.dealer.push(draw(s));if(s.rules.mode==='peek'&&(score(s.dealer).total===21||natural(s.hands[0])))settle(s);else if(natural(s.hands[0])){s.hands[0].done=true;settle(s);}return s;}
export function act(s,action){if(!available(s).includes(action))throw Error('この行動は選択できません');const h=s.hands[s.active],expected=recommendation(s);s.review.push({cards:structuredClone(h.cards),dealer:{...s.dealer[0]},action,expected,hand:s.active+1,correct:action===expected});s.stats.decisions++;if(action===expected)s.stats.correct++;
 if(action==='hit'){h.cards.push(draw(s));h.done=score(h.cards).total>=21;}
 if(action==='stand')h.done=true;
 if(action==='surrender'){h.surrendered=true;h.done=true;}
 if(action==='double'){s.bankroll=Math.round((s.bankroll-h.bet)*100)/100;h.bet*=2;h.cards.push(draw(s));h.done=true;}
 if(action==='split'){s.bankroll=Math.round((s.bankroll-h.bet)*100)/100;const ace=h.cards[0].rank==='A';const second={cards:[h.cards.pop()],bet:h.bet,fromSplit:true,done:false,splitAce:ace};h.fromSplit=true;h.splitAce=ace;h.cards.push(draw(s));second.cards.push(draw(s));h.done=ace||score(h.cards).total===21;second.done=ace||score(second.cards).total===21;s.hands.splice(s.active+1,0,second);}
 if(h.done){while(s.active<s.hands.length&&s.hands[s.active].done)s.active++;if(s.active===s.hands.length)settle(s);}return s;
}
export function settle(s){if(s.phase==='finished')return s;if(s.dealer.length===1)s.dealer.push(draw(s));const dealerBJ=score(s.dealer).total===21&&s.dealer.length===2;const live=s.hands.some(h=>!h.surrendered&&score(h.cards).total<=21&&!natural(h));if(!dealerBJ&&live){while(score(s.dealer).total<17||(s.rules.h17&&score(s.dealer).total===17&&score(s.dealer).soft))s.dealer.push(draw(s));}
 const d=score(s.dealer).total;s.net=0;
 for(const h of s.hands){const t=score(h.cards).total;let payout=0;
 if(h.surrendered){payout=h.bet/2;h.result='surrender';}
 else if(t>21){h.result='bust';}
 else if(dealerBJ){if(natural(h)){payout=h.bet;h.result='push';}else h.result='lose';}
 else if(natural(h)){payout=h.bet*2.5;h.result='blackjack';}
 else if(d>21||t>d){payout=h.bet*2;h.result='win';}
 else if(t===d){payout=h.bet;h.result='push';}else h.result='lose';
 payout=Math.round((payout+Number.EPSILON)*100)/100;h.done=true;h.net=Math.round((payout-h.bet)*100)/100;s.net=Math.round((s.net+h.net)*100)/100;s.bankroll=Math.round((s.bankroll+payout)*100)/100;if(h.net>0)s.stats.wins++;else if(h.net<0)s.stats.losses++;else s.stats.pushes++;
 }s.phase='finished';if(s.bankroll===0)s.locked=false;return s;}
