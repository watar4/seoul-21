import {paceTime, pause} from './pacing.js';
export {pause} from './pacing.js';
const $ = id => document.getElementById(id);
const fmt = n => Number(n).toLocaleString('ja-JP', {maximumFractionDigits:2});
const signed = n => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function stampCards(state) {
  for (const card of [...state.shoe, ...state.dealer, ...state.hands.flatMap(h => h.cards)]) card.id ||= crypto.randomUUID();
}

async function animate(el, frames, duration = 450, options = {}) {
  if (!el) return;
  const animation = el.animate(frames, {easing:'cubic-bezier(.22,.7,.2,1)', fill:'backwards', ...options, duration:reduced() ? 1 : paceTime(duration), delay:reduced() ? 0 : paceTime(options.delay || 0)});
  try { await animation.finished; } catch { /* A reload / layout change can cancel a visual, never a wager. */ }
}
const center = el => { const r = el.getBoundingClientRect(); return {x:r.left+r.width/2, y:r.top+r.height/2}; };
const resultName = {win:'WIN', lose:'LOSE', bust:'BUST', blackjack:'BLACKJACK', push:'PUSH', surrender:'SURRENDER'};

function face(card) {
  const rank = escape(card.rank), suit = escape(card.suit), count = Number(card.rank);
  const pipPositions = {
    2:[[50,25],[50,75]], 3:[[50,23],[50,50],[50,77]],
    4:[[33,25],[67,25],[33,75],[67,75]], 5:[[33,25],[67,25],[50,50],[33,75],[67,75]],
    6:[[33,24],[67,24],[33,50],[67,50],[33,76],[67,76]],
    7:[[33,24],[67,24],[50,37],[33,50],[67,50],[33,76],[67,76]],
    8:[[33,22],[67,22],[50,36],[33,50],[67,50],[50,64],[33,78],[67,78]],
    9:[[33,21],[67,21],[33,40],[67,40],[50,50],[33,60],[67,60],[33,79],[67,79]],
    10:[[33,20],[67,20],[50,30],[33,40],[67,40],[33,60],[67,60],[50,70],[33,80],[67,80]]
  };
  const middle = pipPositions[count]
    ? '<span class="pips">'+pipPositions[count].map(([x,y])=>`<i style="left:${x}%;top:${y}%;--pip-turn:${y>50?'180deg':'0deg'}">${suit}</i>`).join('')+'</span>'
    : `<span class="court ${card.rank==='A'?'ace':''}"><i>${suit}</i>${card.rank==='A'?'':`<b>${rank}</b>`}</span>`;
  return `<span class="corner">${rank}<small>${suit}</small></span>${middle}<span class="corner bottom">${rank}<small>${suit}</small></span>`;
}

export class TableView {
  constructor(chip, total, score) {
    this.chip = chip;
    this.totalText = total;
    this.score = score;
    this.cards = new Map();
  }
  pile(amount) {
    const coins=[];
    for(const n of [50000,20000,5000,2000,1000,500,100,25,5,1])while(amount>=n&&coins.length<2){coins.push(this.chip(n));amount-=n;}
    return coins.join('') || this.chip(amount);
  }
  card(card, down, index, length) {
    let el = this.cards.get(card.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'card table-card';
      el.dataset.cardId = card.id;
      el.setAttribute('role','img');
      el.innerHTML = '<div class="card-inner" aria-hidden="true"><div class="card-side card-front"></div><div class="card-side card-reverse"><span class="back-frame"><i>♠</i><small>SEOUL 21</small></span></div></div><span class="card-sheen"></span>';
      this.cards.set(card.id, el);
    }
    el.classList.toggle('red', ['♥','♦'].includes(card.suit));
    el.dataset.down = String(down);
    el.setAttribute('aria-label', down ? '裏向きのカード' : card.suit + card.rank);
    el.querySelector('.card-front').innerHTML = down ? '' : face(card);
    el.style.setProperty('--fan', `${(index-(length-1)/2)*2.8}deg`);
    el.style.setProperty('--card-lift', `${Math.abs(index-(length-1)/2)*1.4}px`);
    el.style.zIndex = index + 1;
    return el;
  }
  sync(container, cards, hidden) {
    const ids = new Set(cards.map(c=>c.id));
    for (const el of [...container.children]) if (!ids.has(el.dataset.cardId)) el.remove();
    for (const [index, card] of cards.entries()) container.append(this.card(card, hidden.includes(card.id), index, cards.length));
    if (!cards.length) container.innerHTML = '<div class="card placeholder" aria-hidden="true">♠</div><div class="card placeholder" aria-hidden="true">♢</div>';
  }
  render(view) {
    const hidden = view.hiddenCards || (view.phase==='playing' && view.rules.mode==='peek' ? [view.dealer[1]?.id] : []);
    const ended = ['result','settling','finished'].includes(view.phase);
    const settled = view.settledHands || (view.phase==='finished' ? view.hands.map((_,i)=>i) : []);
    const stage = view.stage || view.phase;
    document.querySelector('.felt').dataset.stage = stage;
    $('casino').dataset.stage = stage;
    this.sync($('dealer-cards'), view.dealer, hidden);
    const visibleDealer = view.dealer.filter(c=>!hidden.includes(c.id));
    $('dealer-score').textContent = visibleDealer.length ? this.totalText(visibleDealer) : '';
    $('dealer-score').classList.toggle('is-bust', this.score(visibleDealer).total>21);
    const hands = $('hands');
    hands.classList.toggle('multi',view.hands.length>1);
    while (hands.children.length > Math.max(1,view.hands.length)) hands.lastElementChild.remove();
    for (let i=0;i<Math.max(1,view.hands.length);i++) {
      let el = hands.children[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'hand';
        el.innerHTML = '<div class="hand-label"><span class="hand-name"></span><span class="score"></span></div><div class="cards"></div><div class="hand-foot"><span class="hand-wager"><span class="mini-chips" aria-hidden="true"></span><b class="hand-bet"></b></span><span class="hand-state"></span></div>';
        hands.append(el);
      }
      const h = view.hands[i], visible = h?.cards.filter(c=>!hidden.includes(c.id)) || [];
      el.dataset.hand = i;
      el.classList.toggle('active',!!h && view.phase==='playing' && view.active===i);
      el.classList.toggle('settled',settled.includes(i));
      el.dataset.result = ended && h ? h.result : '';
      el.querySelector('.hand-name').textContent = view.hands.length>1 ? 'HAND '+(i+1) : 'YOU';
      el.querySelector('.score').textContent = visible.length ? this.totalText(visible) : '';
      el.querySelector('.score').classList.toggle('is-bust',this.score(visible).total>21);
      this.sync(el.querySelector('.cards'),h?.cards||[],hidden);
      el.querySelector('.hand-wager').hidden = !h;
      el.querySelector('.hand-bet').textContent = h ? fmt(h.bet) : '';
      el.querySelector('.mini-chips').innerHTML = h ? this.pile(h.bet) : '';
      el.querySelector('.mini-chips').style.opacity = '';
      el.querySelector('.hand-state').textContent = !h ? '' : ended ? resultName[h.result]+' '+signed(h.net) : visible.length<h.cards.length ? '' : this.score(visible).total>21 ? 'BUST' : h.surrendered ? 'SURRENDER' : h.doubled ? 'DOUBLE ×2' : h.done ? 'STAND' : '';
    }
    $('round-result').hidden = !ended;
    document.querySelector('.table-mark').classList.toggle('has-result',ended);
    if (ended) {
      const won = view.net>0, lost=view.net<0;
      const blackjack = view.hands.length===1 && view.hands[0].result==='blackjack';
      $('round-result').dataset.outcome = won?'win':lost?'lose':'push';
      $('result-title').textContent = blackjack?'BLACKJACK':won?'YOU WIN':lost?'YOU LOSE':'PUSH';
      $('result-description').textContent = blackjack?'ブラックジャック · 3 : 2':won?'あなたの勝ち':lost?'あなたの負け':'引き分け';
      $('result-net').textContent = signed(view.net);
      $('result-payment').textContent = stage==='finished' ? 'チップの精算完了' : stage==='settling' ? 'チップを精算しています' : '勝敗確定';
    }
    if (view.phase==='betting' && !view.hands.length) this.cards.clear();
  }
  find(id) { return this.cards.get(id); }
  capture() { return new Map([...this.cards].filter(([,el])=>el.isConnected).map(([id,el])=>[id,el.getBoundingClientRect()])); }
  async move(previous) {
    await Promise.all([...this.cards].map(async ([id,el])=>{
      const old = previous.get(id); if (!old || !el.isConnected) return;
      const now=el.getBoundingClientRect(), end=getComputedStyle(el).transform;
      if(Math.abs(old.x-now.x)+Math.abs(old.y-now.y)<1)return;
      await animate(el,[{transform:`translate(${old.x-now.x}px,${old.y-now.y}px) ${end}`,filter:'drop-shadow(0 12px 6px #0005)'},{transform:end,filter:'drop-shadow(0 2px 2px #0003)'}],1050);
    }));
  }
  async deal(id) {
    const el=this.find(id), origin=center($('shoe')), target=center(el), base=getComputedStyle(el).transform;
    const x=origin.x-target.x,y=origin.y-target.y;
    await animate(el,[
      {transform:`translate(${x}px,${y}px) rotate(24deg) scale(.58)`,filter:'drop-shadow(0 2px 1px #0004)',offset:0},
      {transform:`translate(${x*.40}px,${y*.47-22}px) rotate(-12deg) scale(1.06)`,filter:'drop-shadow(9px 22px 9px #0006)',offset:.55},
      {transform:`translate(0,-3px) rotate(-2deg) scale(1.025)`,filter:'drop-shadow(0 9px 4px #0005)',offset:.86},
      {transform:base,filter:'drop-shadow(0 2px 2px #0003)',offset:1}
    ],1000,{easing:'cubic-bezier(.19,.55,.22,1)'});
  }
  async turn(id, hole=false) {
    const el=this.find(id), inner=el.querySelector('.card-inner'), base=getComputedStyle(el).transform;
    await Promise.all([
      animate(inner,[{transform:'rotateY(180deg)',filter:'brightness(.78)'},{transform:'rotateY(270deg)',filter:'brightness(.55)',offset:.46},{transform:'rotateY(360deg)',filter:'brightness(1)',offset:1}],hole?1300:800,{easing:'cubic-bezier(.3,.05,.3,1)'}),
      animate(el,[{transform:base},{transform:`translateY(-12px) rotate(-3deg) ${base}`,offset:.42},{transform:base}],hole?1300:800),
      animate(el.querySelector('.card-sheen'),[{opacity:0,transform:'translateX(-110%)'},{opacity:.6,offset:.48},{opacity:0,transform:'translateX(130%)'}],hole?1350:850)
    ]);
  }
  async total(hand) {
    const score=hand==='dealer'?$('dealer-score'):$('hands').children[hand]?.querySelector('.score');
    await animate(score,[{transform:'scale(.9)',filter:'brightness(1)'},{transform:'scale(1.18)',filter:'brightness(1.8)',offset:.45},{transform:'scale(1)',filter:'brightness(1)'}],450);
  }
  async action(action, hand) {
    const text={hit:['HIT','カードを1枚'],stand:['STAND','この手札で勝負'],double:['DOUBLE','ベットを2倍に'],split:['SPLIT','2つのハンドへ'],surrender:['SURRENDER','ベットの半分を返却']}[action];
    const badge=$('action-flash');
    badge.innerHTML=`<span class="action-symbol">${{hit:'＋',stand:'✓',double:'×2',split:'⑂',surrender:'½'}[action]}</span><span><b>${text[0]}</b><small>${text[1]}</small></span>`;
    badge.hidden=false;
    await animate(badge,[{opacity:0,transform:'translateY(12px) scale(.88)'},{opacity:1,transform:'translateY(-2px) scale(1.03)',offset:.7},{opacity:1,transform:'none'}],550);
    const el=$('hands').children[hand];
    if (el) await animate(el,[{filter:'brightness(1)'},{filter:'brightness(1.2)',offset:.45},{filter:'brightness(1)'}],350);
    await pause(450);
  }
  async closeHand(action, hand) {
    const el=$('hands').children[hand];
    await Promise.all([...el.querySelectorAll('.table-card')].map((card,i)=>{
      const base=getComputedStyle(card).transform;
      return animate(card,[{transform:base},{transform:`translateY(${action==='stand'?-5:6}px) rotate(${action==='stand'?-3:3}deg) ${base}`,offset:.5},{transform:base}],800,{delay:i*80});
    }));
  }
  clearAction() { $('action-flash').hidden=true; }
  async chips(amount, from, to, {duration=1150}={}) {
    if (!amount || !from || !to) return;
    const a=center(from),b=center(to),layer=$('motion-layer');
    const values=[50000,20000,5000,2000,1000,500,100,25,5,1];
    let remainder=amount;
    const coins=[];
    for(const n of values){while(remainder>=n-0.001&&coins.length<7){coins.push(n);remainder-=n;}}
    if(!coins.length) coins.push(amount);
    await Promise.all(coins.map(async(n,i)=>{
      const ghost=document.createElement('div');
      ghost.className='flying-chip';ghost.innerHTML=this.chip(n);layer.append(ghost);
      const spread=(i-(coins.length-1)/2)*7;
      await animate(ghost,[
        {transform:`translate(${a.x-17+spread}px,${a.y-17-i*2}px) rotateX(22deg) rotate(-12deg) scale(.9)`,opacity:0,offset:0},
        {opacity:1,offset:.08},
        {transform:`translate(${a.x+(b.x-a.x)*.55-17+spread}px,${a.y+(b.y-a.y)*.48-49}px) rotateX(5deg) rotate(${35+i*9}deg) scale(1.12)`,opacity:1,offset:.55},
        {transform:`translate(${b.x-17+spread*.2}px,${b.y-17-i}px) rotateX(30deg) rotate(${65+i*9}deg) scale(.85)`,opacity:1,offset:.93},
        {transform:`translate(${b.x-17}px,${b.y-17}px) rotateX(30deg) scale(.7)`,opacity:0,offset:1}
      ],duration,{delay:i*90,easing:'cubic-bezier(.3,.05,.25,1)'});
      ghost.remove();
    }));
  }
  async outcome(view) {
    this.clearAction();
    const el=$('round-result');
    await Promise.all([
      animate(el,[{opacity:0,transform:'translateY(15px) scale(.75)',filter:'blur(5px)'},{opacity:1,transform:'translateY(-3px) scale(1.04)',filter:'blur(0)',offset:.72},{opacity:1,transform:'none'}],1100),
      ...[...$('hands').children].map((hand,i)=>animate(hand,[{boxShadow:'0 0 0 0 transparent'},{boxShadow:`0 0 30px 3px ${view.hands[i].net>0?'#f1d38865':view.hands[i].net<0?'#e4807155':'#a6d9d955'}`,offset:.5},{boxShadow:'0 0 0 0 transparent'}],1400))
    ]);
    await pause(2800);
  }
  async payout(step) {
    const p=step.payment,hand=$('hands').children[p.index],pile=hand.querySelector('.mini-chips'),bank=$('balance'),dealer=$('dealer-bank');
    if(p.collected){await this.chips(p.collected,pile,dealer);if(!p.returned)pile.style.opacity='0';}
    if(p.won){await this.chips(p.won,dealer,pile);await pause(500);}
    if(p.returned){
      const moving=this.chips(p.returned,pile,bank,{duration:1400});
      pile.style.opacity='0';
      await Promise.all([moving,this.countBank(step.view.bankroll,step.after.bankroll)]);
      await animate(bank,[{color:'#fff5ce',transform:'scale(1.13)'},{color:'#f5e8b8',transform:'scale(1)'}],450);
    }
    await pause(600);
  }
  async countBank(from,to) {
    if(reduced()){$('balance').textContent=fmt(to);return;}
    const start=performance.now(),duration=paceTime(1450);
    await new Promise(resolve=>{
      const tick=now=>{const t=Math.min(1,(now-start)/duration),ease=1-(1-t)**3;$('balance').textContent=fmt(Math.round((from+(to-from)*ease)*100)/100);if(t<1)requestAnimationFrame(tick);else resolve();};
      requestAnimationFrame(tick);
    });
  }
  async clear() {
    this.clearAction();
    $('round-result').hidden=true;
    const destination=center($('discard'));
    await Promise.all([...this.cards.values()].filter(el=>el.isConnected).map((el,i)=>{
      const r=center(el),base=getComputedStyle(el).transform;
      return animate(el,[{transform:base,opacity:1},{transform:`translate(${destination.x-r.x}px,${destination.y-r.y}px) rotate(-35deg) scale(.45)`,opacity:0}],850,{delay:i*75,fill:'forwards'});
    }));
    this.cards.clear();
  }
  async ready() {
    this.clearAction();
    const el=$('round-end');
    if(!el.hidden) await animate(el,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}],550);
  }
}
