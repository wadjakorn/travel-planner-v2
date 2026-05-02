// Calendar / Budget / Notes views

const { useState: useS_ot } = React;

/* ============================================================
   CALENDAR VIEW — month view with trip days highlighted
   ============================================================ */
function CalendarView({ trip, days, bookings, onDayClick }) {
  const I = window.Ico;
  // April 2026 — 30 days, starts Wed (Apr 1, 2026 = Wednesday)
  const startDow = 3; // Wed
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= 30; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  // Trip is Apr 12-16
  const tripStart = 12;
  const tripEnd = 16;

  const eventsForDay = (d) => {
    const events = [];
    bookings.hotels.forEach(h => {
      const m = h.checkIn.date.match(/Apr (\d+)/);
      if (m && +m[1] === d) events.push({ type: 'hotel', label: h.name, color: '#5b3fd9' });
    });
    bookings.transport.forEach(t => {
      const m = t.from.date.match(/Apr (\d+)/);
      if (m && +m[1] === d) events.push({ type: t.type, label: t.title.split(' · ')[0], color: t.type === 'flight' ? '#0071e3' : t.type === 'train' ? '#29a847' : '#ff9500' });
    });
    return events;
  };

  return (
    <div className="mgmt-view">
      <header className="mgmt-head">
        <div>
          <div className="mgmt-eyebrow">When</div>
          <h1 className="mgmt-title">Calendar</h1>
          <div className="mgmt-meta">April 2026 · {trip.days.length}-day trip · Apr 12–16</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-tonal"><I.Calendar /> Month</button>
          <button className="btn btn-tonal">Week</button>
          <button className="btn btn-tonal">Agenda</button>
        </div>
      </header>

      <div className="cal-wrap">
        <div className="cal-nav">
          <button className="icon-btn"><I.ChevLeft /></button>
          <h2 className="cal-month">April 2026</h2>
          <button className="icon-btn"><I.ChevRight /></button>
          <span style={{flex:1}}/>
          <button className="btn btn-tonal">Today</button>
        </div>

        <div className="cal-grid">
          <div className="cal-dow">Sun</div>
          <div className="cal-dow">Mon</div>
          <div className="cal-dow">Tue</div>
          <div className="cal-dow">Wed</div>
          <div className="cal-dow">Thu</div>
          <div className="cal-dow">Fri</div>
          <div className="cal-dow">Sat</div>

          {cells.map((d, i) => {
            const inTrip = d && d >= tripStart && d <= tripEnd;
            const dayIdx = inTrip ? d - tripStart : -1;
            const isStart = d === tripStart;
            const isEnd = d === tripEnd;
            const events = d ? eventsForDay(d) : [];
            return (
              <div
                key={i}
                className={`cal-cell ${!d?'empty':''} ${inTrip?'in-trip':''} ${isStart?'trip-start':''} ${isEnd?'trip-end':''}`}
                onClick={() => inTrip && onDayClick && onDayClick(dayIdx)}
              >
                {d && (
                  <>
                    <div className="cal-num">{d}</div>
                    {inTrip && <div className="cal-trip-bar"/>}
                    {events.length > 0 && (
                      <div className="cal-events">
                        {events.slice(0,3).map((e, j) => (
                          <div key={j} className="cal-event" style={{background: e.color+'18', color: e.color, borderLeftColor: e.color}}>
                            {e.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="cal-legend">
          <span className="cal-legend-item"><span className="dot" style={{background:'#5b3fd9'}}/>Hotel</span>
          <span className="cal-legend-item"><span className="dot" style={{background:'#0071e3'}}/>Flight</span>
          <span className="cal-legend-item"><span className="dot" style={{background:'#29a847'}}/>Train</span>
          <span className="cal-legend-item"><span className="dot" style={{background:'#ff9500'}}/>Car</span>
          <span style={{flex:1}}/>
          <span className="cal-legend-item"><span className="trip-swatch"/>Trip days</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   BUDGET VIEW
   ============================================================ */
function BudgetView({ bookings, days }) {
  const I = window.Ico;
  const hotelTotal = bookings.hotels.reduce((s,h)=>s+h.cost.amount, 0);
  const transportTotal = bookings.transport.reduce((s,t)=>s+t.cost.amount, 0);
  // Mock activity + food estimates
  const activitiesTotal = 480;
  const foodTotal = 720;
  const shoppingTotal = 350;
  const total = hotelTotal + transportTotal + activitiesTotal + foodTotal + shoppingTotal;
  const budget = 8000;
  const remaining = budget - total;
  const pctUsed = Math.round((total/budget)*100);

  const cats = [
    { id:'transport', label:'Transport', amount: transportTotal, color:'#0071e3', icon: I.Plane, count: bookings.transport.length, unit:'bookings' },
    { id:'hotels', label:'Hotels', amount: hotelTotal, color:'#5b3fd9', icon: I.Bed, count: bookings.hotels.length, unit:'nights' },
    { id:'food', label:'Food & dining', amount: foodTotal, color:'#ff9500', icon: I.Food, count: 18, unit:'meals' },
    { id:'activities', label:'Activities', amount: activitiesTotal, color:'#29a847', icon: I.Sight, count: 7, unit:'activities' },
    { id:'shopping', label:'Shopping & misc', amount: shoppingTotal, color:'#ea4335', icon: I.Wallet, count: 0, unit:'budgeted' },
  ];

  // Recent expenses (mock)
  const expenses = [
    { id:'e1', date:'Apr 12', label:'Park Hotel Tokyo · Night 1', cat:'hotels', amount: 380 },
    { id:'e2', date:'Apr 12', label:'Sushi Saito dinner', cat:'food', amount: 240 },
    { id:'e3', date:'Apr 13', label:'Car rental · Times', cat:'transport', amount: 88 },
    { id:'e4', date:'Apr 13', label:'Hoshinoya Fuji', cat:'hotels', amount: 720 },
    { id:'e5', date:'Apr 14', label:'Shinkansen tickets', cat:'transport', amount: 76 },
    { id:'e6', date:'Apr 14', label:'Hakone open-air museum', cat:'activities', amount: 28 },
    { id:'e7', date:'Apr 15', label:'Kamakura souvenirs', cat:'shopping', amount: 145 },
  ];

  const catColor = Object.fromEntries(cats.map(c => [c.id, c.color]));

  return (
    <div className="mgmt-view">
      <header className="mgmt-head">
        <div>
          <div className="mgmt-eyebrow">Spending</div>
          <h1 className="mgmt-title">Budget</h1>
          <div className="mgmt-meta">2 travelers · Apr 12–16, 2026</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-tonal"><I.Plus /> Add expense</button>
          <button className="btn btn-tonal">Split bills</button>
          <button className="btn btn-primary">Export</button>
        </div>
      </header>

      <div className="bud-wrap">
        <div className="bud-hero">
          <div className="bud-hero-main">
            <div className="bud-eyebrow">Total spent</div>
            <div className="bud-amount">${total.toLocaleString()}</div>
            <div className="bud-of">of ${budget.toLocaleString()} budget</div>
            <div className="bud-progress">
              <div className="bud-progress-track">
                {cats.map((c, i) => {
                  const left = cats.slice(0,i).reduce((s,x)=>s+x.amount,0)/budget*100;
                  const w = c.amount/budget*100;
                  return <div key={c.id} className="bud-progress-seg" style={{left:`${left}%`, width:`${w}%`, background: c.color}}/>;
                })}
              </div>
              <div className="bud-progress-meta">
                <span>{pctUsed}% used</span>
                <span>${remaining.toLocaleString()} remaining</span>
              </div>
            </div>
          </div>
          <div className="bud-hero-side">
            <div className="bud-stat">
              <div className="bud-stat-l">Per day</div>
              <div className="bud-stat-v">${Math.round(total/5).toLocaleString()}</div>
            </div>
            <div className="bud-stat">
              <div className="bud-stat-l">Per person</div>
              <div className="bud-stat-v">${Math.round(total/2).toLocaleString()}</div>
            </div>
            <div className="bud-stat">
              <div className="bud-stat-l">Avg meal</div>
              <div className="bud-stat-v">$40</div>
            </div>
          </div>
        </div>

        <div className="bud-cats">
          {cats.map(c => {
            const Ico = c.icon;
            const pct = Math.round((c.amount/total)*100);
            return (
              <div key={c.id} className="bud-cat">
                <div className="bud-cat-ico" style={{background: c.color+'18', color: c.color}}>
                  <Ico />
                </div>
                <div className="bud-cat-body">
                  <div className="bud-cat-row">
                    <span className="bud-cat-label">{c.label}</span>
                    <span className="bud-cat-amt">${c.amount.toLocaleString()}</span>
                  </div>
                  <div className="bud-cat-bar">
                    <div className="bud-cat-fill" style={{width:`${pct}%`, background: c.color}}/>
                  </div>
                  <div className="bud-cat-meta">
                    <span>{c.count} {c.unit}</span>
                    <span>{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bud-recent">
          <div className="bud-recent-head">
            <h3>Recent expenses</h3>
            <button className="mc-btn-ghost">View all</button>
          </div>
          <div className="bud-recent-list">
            {expenses.map(e => (
              <div key={e.id} className="bud-exp">
                <div className="bud-exp-date">{e.date}</div>
                <div className="bud-exp-dot" style={{background: catColor[e.cat]}}/>
                <div className="bud-exp-label">{e.label}</div>
                <div className="bud-exp-amt">${e.amount.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   NOTES VIEW — checklist + free notes
   ============================================================ */
function NotesView() {
  const I = window.Ico;
  const [notes, setNotes] = useS_ot([
    { id:'n1', title:'Packing list', updated:'2 days ago', items: [
      { id:'p1', text:'Passport + JR Pass voucher', done: true },
      { id:'p2', text:'Universal adapter (Type A)', done: true },
      { id:'p3', text:'Comfortable walking shoes', done: true },
      { id:'p4', text:'Light rain jacket', done: false },
      { id:'p5', text:'Yen cash (¥30,000)', done: false },
      { id:'p6', text:'Camera + extra batteries', done: false },
    ]},
    { id:'n2', title:'Restaurant reservations', updated:'yesterday', items: [
      { id:'r1', text:'Sushi Saito · Apr 12, 7pm (confirmed)', done: true },
      { id:'r2', text:'Narisawa · Apr 15, 6:30pm — needs deposit', done: false },
      { id:'r3', text:'Tofuya Ukai · Apr 16 lunch', done: false },
    ]},
  ]);
  const [activeId, setActiveId] = useS_ot('n1');
  const [docNotes] = useS_ot([
    { id:'d1', title:'Things to see in Hakone', body: 'The open-air museum is the must-do. Allow 2-3 hours. Hakone Shrine and Lake Ashi cruise are the classic combo. Onsen etiquette: tattoos are still tricky in older spots — Tenseien is tattoo-friendly.' },
    { id:'d2', title:'Phrases to know', body: 'Sumimasen (excuse me) · Arigatou gozaimasu (thank you) · O-cha kudasai (tea please) · Omakase de (chef\'s choice).' },
  ]);
  const active = notes.find(n => n.id === activeId);

  const toggle = (noteId, itemId) => {
    setNotes(ns => ns.map(n => n.id !== noteId ? n : {
      ...n,
      items: n.items.map(it => it.id !== itemId ? it : {...it, done: !it.done}),
    }));
  };

  return (
    <div className="mgmt-view">
      <header className="mgmt-head">
        <div>
          <div className="mgmt-eyebrow">Reminders</div>
          <h1 className="mgmt-title">Notes & checklists</h1>
          <div className="mgmt-meta">{notes.length} checklists · {docNotes.length} docs</div>
        </div>
        <button className="btn btn-primary"><I.Plus /> New note</button>
      </header>

      <div className="notes-wrap">
        <aside className="notes-list">
          <div className="notes-list-section">
            <div className="notes-section-label">Checklists</div>
            {notes.map(n => {
              const done = n.items.filter(i => i.done).length;
              return (
                <button
                  key={n.id}
                  className={`notes-item ${activeId === n.id ? 'on' : ''}`}
                  onClick={() => setActiveId(n.id)}
                >
                  <I.Notes />
                  <div className="notes-item-body">
                    <div className="notes-item-title">{n.title}</div>
                    <div className="notes-item-sub">{done}/{n.items.length} · {n.updated}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="notes-list-section">
            <div className="notes-section-label">Docs</div>
            {docNotes.map(d => (
              <button key={d.id} className="notes-item">
                <I.Note />
                <div className="notes-item-body">
                  <div className="notes-item-title">{d.title}</div>
                  <div className="notes-item-sub">tap to read</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <main className="notes-detail">
          {active && (
            <>
              <div className="notes-detail-head">
                <h2 contentEditable suppressContentEditableWarning>{active.title}</h2>
                <div className="notes-detail-meta">Last edited {active.updated}</div>
              </div>
              <div className="notes-checklist">
                {active.items.map(it => (
                  <label key={it.id} className={`notes-check ${it.done?'done':''}`}>
                    <input type="checkbox" checked={it.done} onChange={() => toggle(active.id, it.id)} />
                    <span className="notes-check-box"><I.Check /></span>
                    <span className="notes-check-text">{it.text}</span>
                  </label>
                ))}
                <button className="notes-add-item">
                  <I.Plus /> Add item
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

window.CalendarView = CalendarView;
window.BudgetView = BudgetView;
window.NotesView = NotesView;
