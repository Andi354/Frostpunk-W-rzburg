// STUB (step G): the ids the sites refer to, so that explore.ts and the site table resolve.
// Step I replaces this file with the full EVENTS table (texts, choices, triggers).
export interface EventStub {
  id: string;
  title: string;
}

export const EVENTS: Record<string, EventStub> = {
  fluechtlingszug: { id: 'fluechtlingszug', title: 'Der Flüchtlingszug' },
  kranke_zurueck: { id: 'kranke_zurueck', title: 'Kranke im Krankenhaus' },
  domschatz: { id: 'domschatz', title: 'Der Domschatz' },
  treck_wertheim: { id: 'treck_wertheim', title: 'Der Treck von Wertheim' },
  sturmwarnung: { id: 'sturmwarnung', title: 'Sturmwarnung' },
};
