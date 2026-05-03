// Main App — orchestrates state, day switching, drag/drop, optimize

const { useState: useS, useRef: useR, useEffect: useE, useMemo } = React;

// pin path used for map markers
const PIN_PATH = "M16 0C7.2 0 0 7 0 15.7c0 11.5 14.4 21 15 21.4l1 .6 1-.6c.6-.4 15-9.9 15-21.4C32 7 24.8 0 16 0z";

function PinMarker({ place, idx, isActive, isHotel, onClick, onMouseEnter, onMouseLeave }) {
  const color = isHotel ? "#5b3fd9" : (isActive ? "#0071e3" : "#1d1d1f");
  return (
    <div
      className={`pin-marker ${isActive ? 'active' : ''} ${isHotel ? 'hotel' : ''}`}
      style={{ left: `${(place.x/1000)*100}%`, top: `${(place.y/700)*100}%` }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="balloon">
        <svg viewBox="0 0 32 38">
          <path className="fill" d={PIN_PATH} fill={color}/>
          <circle cx="16" cy="14" r="10" fill="white"/>
        </svg>
        <div className="num" style={{color: color, top: 9}}>{idx + 1}</div>
      </div>
    </div>
  );
}

function RouteOverlay({ places }) {
  if (places.length < 2) return null;
  // Simple curved path through points
  const d = places.map((p, i) => {
    const x = (p.x/1000)*100;
    const y = (p.y/700)*100 - 4; // anchor near pin tip
    return `${i===0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  return (
    <svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <path d={d} fill="none" stroke="#0071e3" strokeWidth="0.6" strokeDasharray="1.4 1.2" strokeLinecap="round" opacity="0.8" vectorEffect="non-scaling-stroke" style={{strokeDasharray: '6 5'}}/>
    </svg>
  );
}

function App() {
  const I = window.Ico;
  const trip = window.TRIP;
  const [days, setDays] = useS(trip.days);
  const [activeDay, setActiveDay] = useS(1); // start on Fuji day
  const [activePlace, setActivePlace] = useS(null);
  const [hoveredPin, setHoveredPin] = useS(null);
  const [optimizeStatus, setOptimizeStatus] = useS({}); // { dayIdx: 'idle'|'loading'|'applied' }
  const [draggingId, setDraggingId] = useS(null);
  const [newIds, setNewIds] = useS({}); // {placeId: true}
  const [toast, setToast] = useS(null);
  const [mapPanel, setMapPanel] = useS(null);
  const [mapStyle, setMapStyle] = useS('std');
  const [mapOverlays, setMapOverlays] = useS({ traffic: false, transit: false, bike: false });
  const [mapFilters, setMapFilters] = useS({ sight: true, food: true, hotel: true, transit: true });
  const [view, setView] = useS('itinerary'); // 'itinerary' | 'hotels' | 'transport'
  const [bookings, setBookings] = useS(window.BOOKINGS);
  const [addModal, setAddModal] = useS(null); // null | 'hotel' | 'transport'
  // Account + settings
  const [accounts, setAccounts] = useS(window.ACCOUNTS);
  const [activeAcct, setActiveAcct] = useS('a1');
  const [invites, setInvites] = useS(window.INVITES);
  const [settings, setSettings] = useS({
    theme: 'light', lang: 'en', units: 'metric',
    notifEmail: true, notifPush: true, publicTrip: false,
  });
  const [showSettings, setShowSettings] = useS(false);
  const [showInvite, setShowInvite] = useS(false);
  const [mobileMapOpen, setMobileMapOpen] = useS(false);
  const t = window.I18N[settings.lang];
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme',
      settings.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme);
  }, [settings.theme]);
  const sidebarRef = useR(null);

  const day = days[activeDay];

  // Switch day -> scroll sidebar to top, smooth fade
  const switchDay = (i) => {
    setActiveDay(i);
    setActivePlace(null);
    if (sidebarRef.current) sidebarRef.current.scrollTop = 0;
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  // Optimize: reorder places (visual swap of two stops to feel like an improvement)
  const optimize = (dIdx) => {
    setOptimizeStatus({ ...optimizeStatus, [dIdx]: 'loading' });
    setTimeout(() => {
      setDays(prev => {
        const next = prev.map(d => ({ ...d, places: [...d.places] }));
        const ps = next[dIdx].places;
        if (ps.length >= 4) {
          // swap places at index 1 and 3 (visual reorder feel)
          [ps[1], ps[3]] = [ps[3], ps[1]];
        } else if (ps.length >= 2) {
          [ps[0], ps[1]] = [ps[1], ps[0]];
        }
        return next;
      });
      setOptimizeStatus(s => ({ ...s, [dIdx]: 'applied' }));
      showToast('Route optimized · saved 47 minutes');
    }, 1100);
  };

  // Drag & drop reorder
  const onDragStart = (id) => setDraggingId(id);
  const onDragEnd = () => setDraggingId(null);
  const onDropOn = (dIdx, targetId) => {
    if (!draggingId || draggingId === targetId) return;
    setDays(prev => {
      const next = prev.map(d => ({ ...d, places: [...d.places] }));
      const ps = next[dIdx].places;
      const fromIdx = ps.findIndex(p => p.id === draggingId);
      const toIdx = ps.findIndex(p => p.id === targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      const [moved] = ps.splice(fromIdx, 1);
      ps.splice(toIdx, 0, moved);
      return next;
    });
    setDraggingId(null);
    showToast('Reordered');
  };

  const addPlaceToDay = (dIdx, result) => {
    const id = `n${Date.now()}`;
    const cx = day.places[day.places.length-1]?.x || 500;
    const cy = day.places[day.places.length-1]?.y || 300;
    const newPlace = {
      id,
      kind: result.kind,
      name: result.name,
      category: result.sub,
      rating: 4.6,
      reviews: Math.floor(Math.random()*5000) + 800,
      time: '5:00 PM',
      x: cx + (Math.random()*60 - 30),
      y: cy + (Math.random()*60 - 30),
    };
    setDays(prev => {
      const next = prev.map(d => ({ ...d, places: [...d.places] }));
      next[dIdx].places.push(newPlace);
      return next;
    });
    setNewIds(n => ({ ...n, [id]: true }));
    setTimeout(() => setNewIds(n => { const c = {...n}; delete c[id]; return c; }), 1700);
    showToast(`Added ${result.name}`);
  };

  const removePlace = (dIdx, id) => {
    setDays(prev => {
      const next = prev.map(d => ({ ...d, places: [...d.places] }));
      next[dIdx].places = next[dIdx].places.filter(p => p.id !== id);
      return next;
    });
    showToast('Removed');
  };

  // Tooltip for hovered pin
  const tooltipPlace = useMemo(() => {
    if (!hoveredPin) return null;
    return day.places.find(p => p.id === hoveredPin);
  }, [hoveredPin, day]);

  return (
    <div className="app">
      {/* TOPBAR */}
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 3.2c-3.4 0-5.5 2-7.6 2-2.2 0-4.6-1.9-6.6.5C-.6 8.5.4 14.6 3.6 19.7c1.6 2.5 3.7 5.3 6.5 5.2 2.6-.1 3.6-1.7 6.7-1.7 3.1 0 4 1.7 6.7 1.6 2.8-.1 4.6-2.6 6.3-5.1 1.9-2.9 2.7-5.7 2.7-5.9-.1 0-5.2-2-5.3-7.9 0-4.9 4-7.3 4.2-7.4-2.3-3.4-5.9-3.8-7.2-3.9-3.3-.3-6 1.9-7.5 1.9z"/></svg>
          <span className="name">Wander</span>
          <span className="sep">/</span>
          <span className="trip">{trip.title}</span>
          <span className="saved">· Saved 2m ago</span>
        </div>
        <div className="divider"/>
        <div className="undo-redo">
          <button className="icon-btn" title="Undo"><I.Undo /></button>
          <button className="icon-btn disabled" title="Redo"><I.Redo /></button>
        </div>
        <div className="spacer"/>
        <div className="avatars">
          {trip.collaborators.map((c, i) => (
            <span key={i} className="avatar" style={{background: c.color}}>{c.initials}</span>
          ))}
        </div>
        <button className="btn btn-tonal" onClick={() => setShowInvite(true)}><I.Share /> {t.share}</button>
        <button className="btn btn-primary">{t.export}</button>
        <window.AccountMenu
          accounts={accounts}
          activeId={activeAcct}
          onSwitch={setActiveAcct}
          onAddAccount={() => alert('Google sign-in flow')}
          onInvite={() => setShowInvite(true)}
          onSettings={() => setShowSettings(true)}
          onSignOut={() => window.location.reload()}
          t={t}
        />
      </header>

      <div className={`app-body ${mobileMapOpen ? 'show-map' : ''}`}>
        {/* RAIL */}
        <aside className="rail">
          <button className={`rail-btn ${view==='itinerary'?'active':''}`} title="Itinerary" onClick={() => setView('itinerary')}><I.Map /></button>
          <button className={`rail-btn ${view==='calendar'?'active':''}`} title="Calendar" onClick={() => setView('calendar')}><I.Calendar /></button>
          <button className={`rail-btn ${view==='hotels'?'active':''}`} title="Hotels" onClick={() => setView('hotels')}>
            <I.Bed />
            {bookings.hotels.length > 0 && <span className="rail-count">{bookings.hotels.length}</span>}
          </button>
          <button className={`rail-btn ${view==='transport'?'active':''}`} title="Transport" onClick={() => setView('transport')}>
            <I.Plane />
            {bookings.transport.length > 0 && <span className="rail-count">{bookings.transport.length}</span>}
          </button>
          <button className={`rail-btn ${view==='budget'?'active':''}`} title="Budget" onClick={() => setView('budget')}><I.Wallet /></button>
          <button className={`rail-btn ${view==='notes'?'active':''}`} title="Notes" onClick={() => setView('notes')}><I.Notes /></button>
          <span className="spacer"/>
          <button className="rail-btn" title="Help"><I.Help /></button>
        </aside>

        {/* SIDEBAR */}
        {view === 'itinerary' && (
        <section className="sidebar" ref={sidebarRef}>
          <window.TripCover trip={trip}/>

          <div className="day-strip">
            {days.map((d, i) => (
              <button key={i} className={`day-chip ${i===activeDay ? 'active':''}`} onClick={() => switchDay(i)}>
                <span className="label">{d.label}</span>
                <span className="num">{d.num}</span>
              </button>
            ))}
            <button className="day-chip" title="Add day" style={{minWidth:36, color:'#86868b'}}>
              <I.Plus />
            </button>
          </div>

          <div className="day-section fade-in" key={activeDay}>
            <window.DayHeader day={day}/>

            {(day.optimizeSavings || optimizeStatus[activeDay] === 'applied') && (
              <window.OptimizeStrip
                savings={day.optimizeSavings || { time: '47m', swap: '2 stops' }}
                status={optimizeStatus[activeDay] || 'idle'}
                onOptimize={() => optimize(activeDay)}
              />
            )}

            <div className="places-list">
              {day.places.map((p, i) => (
                <div className="place-row" key={p.id}>
                  <window.PlaceRow
                    place={p}
                    idx={i}
                    dayIdx={activeDay}
                    isActive={activePlace === p.id}
                    isDragging={draggingId === p.id}
                    isNew={!!newIds[p.id]}
                    onClick={() => setActivePlace(p.id === activePlace ? null : p.id)}
                    onHover={() => setHoveredPin(p.id)}
                    onLeave={() => setHoveredPin(null)}
                    onDragStart={() => onDragStart(p.id)}
                    onDragEnd={onDragEnd}
                    onDrop={() => onDropOn(activeDay, p.id)}
                    onDelete={() => removePlace(activeDay, p.id)}
                  />
                  {i < day.places.length - 1 && day.segments[i] && <window.Segment seg={day.segments[i]} fromPlace={p} toPlace={day.places[i+1]}/>}
                </div>
              ))}
              <window.AddPlace onAdd={(r) => addPlaceToDay(activeDay, r)}/>
            </div>
          </div>

          <window.Recco onAdd={(r) => addPlaceToDay(activeDay, r)}/>
        </section>
        )}

        {/* HOTELS / TRANSPORT VIEWS */}
        {view === 'hotels' && (
          <window.HotelsView
            hotels={bookings.hotels}
            onAdd={() => setAddModal('hotel')}
            days={days}
          />
        )}
        {view === 'transport' && (
          <window.TransportView
            transport={bookings.transport}
            onAdd={() => setAddModal('transport')}
          />
        )}
        {view === 'calendar' && (
          <window.CalendarView
            trip={trip}
            days={days}
            bookings={bookings}
            onDayClick={(idx) => { setActiveDay(idx); setView('itinerary'); }}
          />
        )}
        {view === 'budget' && (
          <window.BudgetView bookings={bookings} days={days} />
        )}
        {view === 'notes' && (
          <window.NotesView />
        )}

        {/* MAP */}
        {view === 'itinerary' && (
        <section className="map-wrap">
          <window.MapCanvas/>

          <RouteOverlay places={day.places}/>

          {day.places.map((p, i) => (
            <PinMarker
              key={p.id}
              place={p}
              idx={i}
              isActive={activePlace === p.id || hoveredPin === p.id}
              isHotel={p.kind === 'hotel'}
              onClick={() => setActivePlace(p.id === activePlace ? null : p.id)}
              onMouseEnter={() => setHoveredPin(p.id)}
              onMouseLeave={() => setHoveredPin(null)}
            />
          ))}

          {tooltipPlace && (
            <div className="map-tooltip" style={{ left: `${(tooltipPlace.x/1000)*100}%`, top: `${(tooltipPlace.y/700)*100}%` }}>
              <div className="nm">{tooltipPlace.name}</div>
              <div className="sub">{tooltipPlace.category} · {tooltipPlace.time}</div>
            </div>
          )}

          {/* Map UI overlays */}
          <div className="map-overlay-tl">
            <div className="map-pill day-pill"><I.Calendar /> Day {activeDay+1} · {day.label} {day.num}</div>
          </div>

          <div className="map-overlay-tr">
            <div className="map-icon-stack">
              <button title="Layers" className={mapPanel==='layers'?'on':''} onClick={() => setMapPanel(mapPanel==='layers'?null:'layers')}><I.Layers /></button>
              <button title="Filter" className={mapPanel==='filter'?'on':''} onClick={() => setMapPanel(mapPanel==='filter'?null:'filter')}><I.Filter /></button>
              <button title="My location" className={mapPanel==='locate'?'on':''} onClick={() => setMapPanel(mapPanel==='locate'?null:'locate')}><I.Locate /></button>
            </div>
            {mapPanel === 'layers' && (
              <div className="map-popover fade-in-fast">
                <div className="mp-title">Map type</div>
                <div className="mp-grid">
                  {[
                    {id:'std', label:'Default', bg:'linear-gradient(135deg,#e8eef4,#dbe6ee)'},
                    {id:'sat', label:'Satellite', bg:'linear-gradient(135deg,#3a4a3a,#5b6b4a)'},
                    {id:'ter', label:'Terrain', bg:'linear-gradient(135deg,#d8e0c8,#b8c8a0)'},
                    {id:'tra', label:'Transit', bg:'linear-gradient(135deg,#fff5e0,#ffe0c4)'},
                  ].map(o => (
                    <button key={o.id} className={`mp-tile ${mapStyle===o.id?'sel':''}`} onClick={() => setMapStyle(o.id)}>
                      <span className="mp-swatch" style={{background:o.bg}}/>
                      <span>{o.label}</span>
                    </button>
                  ))}
                </div>
                <div className="mp-divider"/>
                <div className="mp-title">Overlays</div>
                {[
                  {id:'traffic', label:'Traffic'},
                  {id:'transit', label:'Public transit'},
                  {id:'bike', label:'Bicycle paths'},
                ].map(o => (
                  <label key={o.id} className="mp-check">
                    <input type="checkbox" checked={!!mapOverlays[o.id]} onChange={(e) => setMapOverlays({...mapOverlays, [o.id]: e.target.checked})}/>
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            )}
            {mapPanel === 'filter' && (
              <div className="map-popover fade-in-fast">
                <div className="mp-title">Show on map</div>
                {[
                  {id:'sight', label:'Attractions', color:'#0071e3'},
                  {id:'food', label:'Restaurants', color:'#ff9500'},
                  {id:'hotel', label:'Hotels', color:'#5b3fd9'},
                  {id:'transit', label:'Transit', color:'#29a847'},
                ].map(f => (
                  <label key={f.id} className="mp-check">
                    <input type="checkbox" checked={mapFilters[f.id] !== false} onChange={(e) => setMapFilters({...mapFilters, [f.id]: e.target.checked})}/>
                    <span className="mp-dot" style={{background: f.color}}/>
                    <span>{f.label}</span>
                  </label>
                ))}
                <div className="mp-divider"/>
                <div className="mp-title">Range</div>
                <div className="mp-range">
                  <input type="range" min="1" max="50" defaultValue="25"/>
                  <span className="mp-range-val">25 km</span>
                </div>
              </div>
            )}
            {mapPanel === 'locate' && (
              <div className="map-popover fade-in-fast" style={{minWidth: 220}}>
                <div className="mp-title">Your location</div>
                <div className="mp-loc-card">
                  <div className="mp-loc-pulse"/>
                  <div>
                    <div style={{fontWeight: 600, fontSize: 12}}>Park Hotel Tokyo</div>
                    <div style={{fontSize: 11, color: '#86868b'}}>1-7-1 Higashi-Shimbashi</div>
                  </div>
                </div>
                <button className="mp-btn-primary"><I.Locate /> Center map on me</button>
                <button className="mp-btn-ghost">Share my location</button>
              </div>
            )}
          </div>

          <div className="map-overlay-br">
            <div className="map-icon-stack">
              <button title="Zoom in"><I.ZoomIn /></button>
              <button title="Zoom out"><I.ZoomOut /></button>
            </div>
          </div>

          <div className="map-overlay-bl">
            <div className="map-pill"><I.Route /> {day.summary.distance} · {day.summary.time}</div>
          </div>
        </section>
        )}

        {/* Mobile: back-to-list pill (only visible when map is open on mobile) */}
        <button className="mobile-map-back" onClick={() => setMobileMapOpen(false)}>
          <I.ChevronLeft /> List
        </button>

        {/* Mobile: floating map button (only visible on itinerary view, on mobile) */}
        {view === 'itinerary' && !mobileMapOpen && (
          <button className="mobile-map-fab" onClick={() => setMobileMapOpen(true)} title="Show map">
            <I.Map />
          </button>
        )}

        {/* Mobile: bottom tab bar */}
        <nav className="mobile-tabbar">
          <button className={`mobile-tab ${view==='itinerary'?'active':''}`} onClick={() => { setView('itinerary'); setMobileMapOpen(false); }}>
            <I.Map /><span>Plan</span>
          </button>
          <button className={`mobile-tab ${view==='calendar'?'active':''}`} onClick={() => { setView('calendar'); setMobileMapOpen(false); }}>
            <I.Calendar /><span>Calendar</span>
          </button>
          <button className={`mobile-tab ${view==='hotels'?'active':''}`} onClick={() => { setView('hotels'); setMobileMapOpen(false); }}>
            <I.Bed /><span>Hotels</span>
          </button>
          <button className={`mobile-tab ${view==='transport'?'active':''}`} onClick={() => { setView('transport'); setMobileMapOpen(false); }}>
            <I.Plane /><span>Transport</span>
          </button>
          <button className={`mobile-tab ${view==='budget'?'active':''}`} onClick={() => { setView('budget'); setMobileMapOpen(false); }}>
            <I.Wallet /><span>Budget</span>
          </button>
        </nav>
      </div>

      {addModal && (
        <window.AddBookingModal
          kind={addModal}
          onClose={() => setAddModal(null)}
          onSave={(data) => {
            // Add to bookings
            const id = `new-${Date.now()}`;
            if (data.kind === 'hotel') {
              const f = data.form;
              setBookings(b => ({
                ...b,
                hotels: [...b.hotels, {
                  id, name: f.name, address: f.address || '',
                  checkIn: { date: f.checkInDate, time: f.checkInTime || '15:00' },
                  checkOut: { date: f.checkOutDate, time: f.checkOutTime || '11:00' },
                  nights: 1, room: f.room || 'Standard', guests: parseInt(f.guests) || 2,
                  ref: f.ref || `NEW-${Math.floor(Math.random()*9999)}`,
                  cost: { amount: parseFloat(f.cost) || 0, currency: 'USD' },
                  cancellation: 'Not specified', contact: '—', notes: f.notes || '',
                  attachment: null, thumb: '#e8e8ed', dayIdx: 0,
                }]
              }));
            } else {
              const f = data.form;
              setBookings(b => ({
                ...b,
                transport: [...b.transport, {
                  id, type: data.transportType, title: f.title,
                  provider: f.provider || '—',
                  ref: f.ref || `NEW-${Math.floor(Math.random()*9999)}`,
                  from: { code: f.fromCode, name: f.fromCode, time: f.fromTime || '—', date: f.fromDate || '—', terminal: '—' },
                  to: { code: f.toCode, name: f.toCode, time: f.toTime || '—', date: f.toDate || '—', terminal: '—' },
                  duration: '—', seats: f.seats || '—', bag: '—',
                  cost: { amount: parseFloat(f.cost) || 0, currency: 'USD' },
                  attachment: null, dayIdx: 0,
                }]
              }));
            }
            setAddModal(null);
            setToast(`${data.kind === 'hotel' ? 'Hotel' : 'Transport'} added`);
            setTimeout(() => setToast(null), 2400);
          }}
        />
      )}

      {toast && <div className="toast"><I.Check /> {toast}</div>}

      {showSettings && (
        <window.SettingsModal
          settings={settings}
          setSettings={setSettings}
          onClose={() => setShowSettings(false)}
          t={t}
        />
      )}
      {showInvite && (
        <window.InviteModal
          invites={invites}
          setInvites={setInvites}
          onClose={() => setShowInvite(false)}
          t={t}
        />
      )}
    </div>
  );
}

window.App = App;

function Root() {
  const [signedIn, setSignedIn] = React.useState(true);
  const [lang, setLang] = React.useState('en');
  const t = window.I18N[lang];
  if (!signedIn) {
    return <window.SignInScreen t={t} onSignIn={() => setSignedIn(true)}/>;
  }
  return <App/>;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<Root/>);
