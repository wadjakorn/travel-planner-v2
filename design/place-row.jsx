// Place row — clean, minimal itinerary card

function gmapsSearchUrl(place) {
  const q = encodeURIComponent(`${place.name}, ${place.address || ''}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
function gmapsDirectionsUrl(place, mode = 'driving') {
  const q = encodeURIComponent(`${place.name}, ${place.address || ''}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=${mode}`;
}
function gmapsDayRouteUrl(places) {
  if (!places || places.length === 0) return '#';
  const enc = (p) => encodeURIComponent(`${p.name}${p.address ? ', ' + p.address : ''}`);
  const origin = enc(places[0]);
  const destination = enc(places[places.length - 1]);
  const waypoints = places.slice(1, -1).map(enc).join('|');
  let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=driving`;
  if (waypoints) url += `&waypoints=${waypoints}`;
  return url;
}
window.gmaps = { gmapsSearchUrl, gmapsDirectionsUrl, gmapsDayRouteUrl };

function PlaceRow({ place, idx, dayIdx, isActive, isDragging, onClick, onHover, onLeave, onDragStart, onDragEnd, onDragOver, onDrop, onDelete, isNew }) {
  const I = window.Ico;
  const KindIcon = place.kind === 'hotel' ? I.Bed : place.kind === 'food' ? I.Fork : place.kind === 'transit' ? I.Transit : I.Map;
  const stop = (e) => e.stopPropagation();

  return (
    <div
      className={`place ${isActive ? 'active' : ''} ${isDragging ? 'dragging' : ''} ${isNew ? 'new-pulse' : ''}`}
      data-place-id={place.id}
      draggable
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => { e.preventDefault(); onDragOver && onDragOver(e); }}
      onDrop={onDrop}
    >
      {/* Collapsed header — always visible */}
      <div className="place-head">
        <div className="pin">{idx + 1}</div>

        <div className="place-thumb" style={{background: place.thumb || '#e8e8ed'}}>
          <svg viewBox="0 0 48 48" width="48" height="48">
            <circle cx="34" cy="16" r="5" fill="rgba(255,255,255,0.7)"/>
            <path d="M 4 38 L 16 26 L 24 32 L 36 22 L 48 32 L 48 48 L 4 48 Z" fill="rgba(255,255,255,0.6)"/>
          </svg>
        </div>

        <div className="place-main">
          <div className="place-name">{place.name}</div>
          <div className="place-meta">
            <span className="kind-chip"><KindIcon /></span>
            {place.rating != null && (
              <span className="rating"><I.Star /> {place.rating}</span>
            )}
            <span className="meta-sep">·</span>
            <span className="meta-text">{place.category}</span>
            {place.price && <><span className="meta-sep">·</span><span className="price">{place.price}</span></>}
          </div>
        </div>

        <div className="place-time">{place.time}</div>
      </div>

      {/* Quietly visible context — note + booking only when they exist */}
      {(place.note || place.booking) && !isActive && (
        <div className="place-quiet">
          {place.booking && (
            <div className="chip-booking">
              <I.Check />
              <span>{place.kind === 'hotel' ? 'Reserved' : place.kind === 'transit' ? 'Confirmed' : 'Booked'} · {place.booking.ref}</span>
            </div>
          )}
          {place.note && (
            <div className="chip-note">
              <I.Note />
              <span>{place.note}</span>
            </div>
          )}
        </div>
      )}

      {/* Expanded — full detail */}
      {isActive && (
        <div className="place-expanded fade-in-fast">
          {place.tags && place.tags.length > 0 && (
            <div className="tag-row">
              {place.tags.map((t, i) => <span key={i} className="tag">{t}</span>)}
            </div>
          )}

          <div className="info-grid">
            <div className="info-item">
              <span className="info-label">When</span>
              <span className="info-value">{place.time}{place.duration ? ` · ${place.duration}` : ''}</span>
            </div>
            {place.hours && (
              <div className="info-item">
                <span className="info-label">Hours</span>
                <span className="info-value">{place.hours}</span>
              </div>
            )}
            {place.address && (
              <div className="info-item info-full">
                <span className="info-label">Address</span>
                <a className="info-value info-link" href={gmapsSearchUrl(place)} target="_blank" rel="noreferrer" onClick={stop}>
                  {place.address}
                  <I.External />
                </a>
              </div>
            )}
            {place.phone && (
              <div className="info-item">
                <span className="info-label">Phone</span>
                <a className="info-value info-link" href={`tel:${place.phone}`} onClick={stop}>{place.phone}</a>
              </div>
            )}
            {place.website && (
              <div className="info-item">
                <span className="info-label">Website</span>
                <a className="info-value info-link" href={`https://${place.website}`} target="_blank" rel="noreferrer" onClick={stop}>{place.website}</a>
              </div>
            )}
          </div>

          {place.note && (
            <div className="chip-note expanded-note">
              <I.Note />
              <span>{place.note}</span>
            </div>
          )}

          {place.booking && (
            <div className="booking-card">
              <div className="booking-head">
                <span className="booking-ico"><I.Check /></span>
                <div>
                  <div className="booking-title">{place.kind === 'hotel' ? 'Reservation' : place.kind === 'transit' ? 'Flight' : 'Booking'} confirmed</div>
                  <div className="booking-sub">{place.booking.room}{place.booking.nights ? ` · ${place.booking.nights} nights` : ''}{place.booking.total ? ` · ${place.booking.total}` : ''}</div>
                </div>
                <span className="booking-ref">{place.booking.ref}</span>
              </div>
            </div>
          )}

          <div className="action-row">
            <a className="ar-btn ar-btn-primary" href={gmapsDirectionsUrl(place)} target="_blank" rel="noreferrer" onClick={stop}>
              <I.GMaps /> Directions
            </a>
            <a className="ar-btn" href={gmapsSearchUrl(place)} target="_blank" rel="noreferrer" onClick={stop}>
              <I.External /> Open in Maps
            </a>
            <button className="ar-btn" onClick={stop}><I.Note /> Note</button>
            <button className="ar-btn" onClick={stop}><I.Clock /> Time</button>
            <button className="ar-btn" onClick={stop}><I.Wallet /> Cost</button>
          </div>
        </div>
      )}

      {/* Hover-only side actions */}
      <div className="place-side-actions">
        <button className="row-icon drag-handle" title="Drag" onClick={stop}><I.Drag /></button>
        <button className="row-icon" title="Delete" onClick={(e)=>{e.stopPropagation(); onDelete && onDelete();}}><I.Trash /></button>
      </div>
    </div>
  );
}

function Segment({ seg, fromPlace, toPlace }) {
  const I = window.Ico;
  const ModeIcon = seg.mode === 'walk' ? I.Walk : seg.mode === 'transit' ? I.Transit : I.Drive;
  const modeLabel = seg.mode.charAt(0).toUpperCase() + seg.mode.slice(1);
  const navUrl = (fromPlace && toPlace)
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(fromPlace.name + ', ' + (fromPlace.address||''))}&destination=${encodeURIComponent(toPlace.name + ', ' + (toPlace.address||''))}&travelmode=${seg.mode === 'walk' ? 'walking' : seg.mode === 'transit' ? 'transit' : 'driving'}`
    : null;
  return (
    <div className="segment">
      <span className="mode"><ModeIcon /></span>
      <span>{modeLabel} · {seg.distance} · {seg.time}</span>
      {navUrl && (<>
        <span style={{color:'#c7c7cc'}}>·</span>
        <a className="navigate-link" href={navUrl} target="_blank" rel="noreferrer">
          <I.GMaps /> Navigate
        </a>
      </>)}
    </div>
  );
}

window.PlaceRow = PlaceRow;
window.Segment = Segment;
