// Sidebar — itinerary list, day header, search, recommendations

const { useState, useRef, useEffect } = React;

function DayHeader({ day }) {
  const I = window.Ico;
  const dayUrl = window.gmaps.gmapsDayRouteUrl(day.places);
  return (
    <div>
      <div className="day-header">
        <h2>Day {day.num - 11}: {day.title}</h2>
        <a className="day-gmaps-btn" href={dayUrl} target="_blank" rel="noreferrer" title="Open this day's route in Google Maps">
          <I.GMaps /> Open in Maps
        </a>
      </div>
      <div className="day-summary">
        <span><I.Route /> {day.summary.distance}</span>
        <span><I.Clock /> {day.summary.time}</span>
        <span style={{color:'#86868b'}}>· {day.date}</span>
      </div>
    </div>
  );
}

function OptimizeStrip({ savings, status, onOptimize }) {
  const I = window.Ico;
  if (status === 'applied') {
    return (
      <div className="optimize-strip applied">
        <span className="sparkle" style={{color:'#29a847'}}><I.Check /></span>
        <span className="text">Route optimized · saved <b>{savings.time}</b> of driving</span>
        <span style={{fontSize:11, color:'#6e6e73'}}>Undo</span>
      </div>
    );
  }
  return (
    <div className="optimize-strip">
      <span className="sparkle"><I.Sparkle /></span>
      <span className="text">Reorder this day to save <b>~{savings.time}</b> driving</span>
      <button className="opt-btn" onClick={onOptimize} disabled={status === 'loading'}>
        {status === 'loading' ? 'Optimizing…' : 'Optimize'}
      </button>
    </div>
  );
}

function AddPlace({ onAdd }) {
  const I = window.Ico;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const filtered = window.SEARCH_RESULTS.filter(r =>
    !query || r.name.toLowerCase().includes(query.toLowerCase())
  );

  if (!open) {
    return (
      <button className="add-place" onClick={() => setOpen(true)}>
        <span className="plus"><I.Plus /></span>
        <span>Add a place, hotel, or note</span>
      </button>
    );
  }

  return (
    <div style={{position:'relative'}}>
      <button className="add-place" style={{borderColor:'#1d1d1f', color:'#1d1d1f'}}>
        <span className="plus" style={{background:'#1d1d1f', color:'white'}}><I.Search /></span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e)=>setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
          placeholder="Search places, restaurants, attractions…"
          style={{flex:1, border:0, background:'transparent', outline:'none', fontSize:13, color:'#1d1d1f'}}
        />
      </button>
      <div className="search-pop" style={{top:'100%', left:0, right:0, marginTop:6}}>
        {filtered.map((r, i) => (
          <button key={i} className="search-result" onMouseDown={(e) => { e.preventDefault(); onAdd(r); setOpen(false); setQuery(''); }}>
            <span className="ico">
              {r.kind === 'food' ? <I.Fork /> : r.kind === 'hotel' ? <I.Bed /> : <I.Map />}
            </span>
            <span className="info">
              <div className="nm">{r.name}</div>
              <div className="sub">{r.sub}</div>
            </span>
            <span className="add-ico"><I.Plus /></span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div style={{padding:'18px 16px', fontSize:12, color:'#86868b'}}>No matches</div>
        )}
      </div>
    </div>
  );
}

function Recco({ onAdd }) {
  const I = window.Ico;
  return (
    <div className="recco-section">
      <div className="recco-head">
        <h3>Suggested for this day</h3>
        <button className="more">See all</button>
      </div>
      <div className="recco-grid">
        {window.TRIP.recco.map((r, i) => (
          <button key={i} className="recco" onClick={() => onAdd({ name: r.name, sub: r.sub, kind: 'sight' })}>
            <div className="thumb" style={{background: r.color}}>
              <svg viewBox="0 0 44 44" width="44" height="44">
                <circle cx="22" cy="28" r="14" fill="rgba(255,255,255,0.5)"/>
                <path d="M8 28 L18 18 L26 26 L36 16 L36 38 L8 38 Z" fill="rgba(255,255,255,0.8)"/>
                <circle cx="30" cy="14" r="3" fill="rgba(255,255,255,0.9)"/>
              </svg>
            </div>
            <div className="info">
              <div className="nm">{r.name}</div>
              <div className="sub">{r.sub}</div>
            </div>
            <div className="add"><I.Plus /></div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TripCover({ trip }) {
  const I = window.Ico;
  return (
    <div className="trip-cover">
      <svg className="mountain" viewBox="0 0 480 180" preserveAspectRatio="xMidYMax slice">
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbeee0"/>
            <stop offset="50%" stopColor="#fde8e1"/>
            <stop offset="100%" stopColor="#e8d5e8"/>
          </linearGradient>
          <linearGradient id="far" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a8b8c9"/>
            <stop offset="100%" stopColor="#8a9bad"/>
          </linearGradient>
          <linearGradient id="mid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7a8b9e"/>
            <stop offset="100%" stopColor="#5e6f82"/>
          </linearGradient>
        </defs>
        <rect width="480" height="180" fill="url(#sky)"/>
        {/* sun */}
        <circle cx="370" cy="58" r="22" fill="#ffd49a" opacity="0.7"/>
        {/* far Fuji */}
        <path d="M0 130 L130 60 Q150 40 170 60 L300 130 Z" fill="url(#far)"/>
        <path d="M120 70 L150 40 L180 70 L168 72 L160 64 L150 70 L140 64 L130 72 Z" fill="#ffffff" opacity="0.95"/>
        {/* mid hills */}
        <path d="M0 145 L80 110 L160 130 L240 105 L320 130 L400 115 L480 130 L480 180 L0 180 Z" fill="url(#mid)" opacity="0.8"/>
        {/* foreground cherry blossoms */}
        <g opacity="0.9">
          <ellipse cx="60" cy="155" rx="60" ry="22" fill="#f4c5d3"/>
          <ellipse cx="430" cy="160" rx="50" ry="20" fill="#f4c5d3"/>
          <ellipse cx="240" cy="170" rx="80" ry="18" fill="#eda5be"/>
        </g>
      </svg>
      <div className="cover-actions">
        <button className="cover-icon" title="Edit cover"><I.Camera /></button>
        <button className="cover-icon" title="More"><I.More /></button>
      </div>
      <div className="cover-meta">
        <div className="eyebrow">{trip.subtitle}</div>
        <h1>{trip.title}</h1>
        <div className="dates">{trip.dates} · 5 days · 3 travelers</div>
      </div>
    </div>
  );
}

window.DayHeader = DayHeader;
window.OptimizeStrip = OptimizeStrip;
window.AddPlace = AddPlace;
window.Recco = Recco;
window.TripCover = TripCover;
