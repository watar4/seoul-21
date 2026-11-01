// The engine settles immediately; this timeline reveals only what has happened
// on the table. Persist the engine state, never these intermediate snapshots.
const copy = value => structuredClone(value);
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function settlementFor(final) {
  const hands = final.hands.map((hand, index) => {
    const returned = cents(hand.bet + hand.net);
    return {index, bet:hand.bet, returned, won:Math.max(0, hand.net), collected:cents(Math.max(0, -hand.net)), result:hand.result};
  });
  const returned = cents(hands.reduce((sum, hand) => sum + hand.returned, 0));
  return {hands, returned, before:cents(final.bankroll - returned), after:final.bankroll};
}

export function buildRoundPlan(before, final, {kind, action}) {
  const steps = [];
  const paid = final.phase === 'finished' ? settlementFor(final) : null;
  const unpaid = () => {
    const view = copy(final);
    view.phase = 'playing';
    view.bankroll = paid ? paid.before : final.bankroll;
    view.net = 0;
    view.active = Math.min(final.active, final.hands.length - 1);
    for (const h of view.hands) { delete h.result; delete h.net; }
    return view;
  };
  let view = copy(before);
  view.hiddenCards = before.phase === 'playing' && before.rules.mode === 'peek' ? [before.dealer[1]?.id] : [];
  view.settledHands = [];
  const emit = (type, data = {}) => steps.push({type, view:copy(view), ...data});
  const add = (side, hand, card, faceUp = true) => {
    const list = side === 'dealer' ? view.dealer : view.hands[hand].cards;
    list.push(copy(card));
    view.hiddenCards.push(card.id);
    emit('deal-card', {side, hand, cardId:card.id});
    if (faceUp) {
      view.hiddenCards = view.hiddenCards.filter(id => id !== card.id);
      emit('turn-card', {side, hand, cardId:card.id});
    }
  };

  if (kind === 'deal') {
    view = unpaid();
    view.stage = 'dealing';
    view.hiddenCards = [];
    view.settledHands = [];
    view.dealer = [];
    view.hands[0].cards = [];
    view.hands[0].done = false;
    emit('place-bet');
    add('player', 0, final.hands[0].cards[0]);
    add('dealer', 0, final.dealer[0]);
    add('player', 0, final.hands[0].cards[1]);
    if (final.rules.mode === 'peek') add('dealer', 0, final.dealer[1], false);
  } else {
    view.stage = 'action';
    emit('action', {action, hand:before.active});
    const index = before.active;
    if (action === 'split') {
      const next = unpaid();
      next.dealer = copy(before.dealer);
      next.hiddenCards = copy(view.hiddenCards);
      next.settledHands = [];
      next.stage = 'action';
      next.active = index;
      for (const i of [index, index + 1]) {
        next.hands[i].cards = [copy(final.hands[i].cards[0])];
        next.hands[i].done = false;
      }
      view = next;
      emit('split', {hand:index, amount:before.hands[index].bet});
      add('player', index, final.hands[index].cards[1]);
      add('player', index + 1, final.hands[index + 1].cards[1]);
    } else {
      if (action === 'double') {
        view.bankroll = cents(view.bankroll - before.hands[index].bet);
        view.hands[index].bet = final.hands[index].bet;
        view.hands[index].doubled = true;
        emit('add-stake', {hand:index, amount:before.hands[index].bet});
      }
      if (action === 'hit' || action === 'double') add('player', index, final.hands[index].cards.at(-1));
      if (action === 'stand' || action === 'surrender') {
        view.hands[index].done = true;
        if (action === 'surrender') view.hands[index].surrendered = true;
        emit('close-hand', {action, hand:index});
      }
    }
  }

  const dealt = copy(view.dealer), hidden = copy(view.hiddenCards);
  view = unpaid();
  view.dealer = dealt;
  view.hiddenCards = hidden;
  view.settledHands = [];
  view.stage = 'playing';
  emit('hand-total', {hand:kind === 'deal' ? 0 : before.active});
  if (!paid) {
    view = copy(final);
    view.stage = 'playing';
    view.hiddenCards = hidden;
    emit('ready');
    return steps;
  }

  view.phase = 'revealing';
  view.stage = 'dealer';
  emit('dealer-turn');
  if (final.rules.mode === 'peek') {
    view.hiddenCards = [];
    emit('turn-card', {side:'dealer', hand:0, cardId:final.dealer[1].id, hole:true});
  } else {
    add('dealer', 0, final.dealer[1]);
  }
  for (const card of final.dealer.slice(2)) add('dealer', 0, card);
  emit('dealer-total');

  view = copy(final);
  view.bankroll = paid.before;
  view.phase = 'result';
  view.stage = 'result';
  view.hiddenCards = [];
  view.settledHands = [];
  emit('outcome');
  view.phase = 'settling';
  view.stage = 'settling';
  for (const hand of paid.hands) {
    const from = copy(view);
    view.bankroll = cents(view.bankroll + hand.returned);
    view.settledHands.push(hand.index);
    steps.push({type:'payout', view:from, after:copy(view), payment:hand});
  }
  view = copy(final);
  view.stage = 'finished';
  view.hiddenCards = [];
  view.settledHands = final.hands.map((_, index) => index);
  emit('ready');
  return steps;
}
