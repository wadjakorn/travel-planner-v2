// Hotels & Transport management views + Add Booking modal

const { useState: useS_b } = React;

function HotelsView({ hotels, onAdd, onOpenInMap, days }) {
  const I = window.Ico;
  const total = hotels.reduce((s, h) => s + h.cost.amount, 0);
  const totalNights = hotels.reduce((s, h) => s + h.nights, 0);

  return (
    <div className="mgmt-view">
      <header className="mgmt-head">
        <div>
          <div className="mgmt-eyebrow">Stays</div>
          <h1 className="mgmt-title">Hotels</h1>
          <div className="mgmt-meta">
            {hotels.length} bookings · {totalNights} nights · ${total.toLocaleString()} total
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onAdd('hotel')}>
          <I.Plus /> Add hotel
        </button>
      </header>

      <div className="mgmt-list">
        {hotels.map((h, i) => (
          <article key={h.id} className="mgmt-card">
            <div className="mc-thumb" style={{background: h.thumb}}>
              <svg viewBox="0 0 80 80" width="80" height="80">
                <rect x="14" y="34" width="52" height="38" fill="rgba(255,255,255,0.55)"/>
                <rect x="20" y="42" width="8" height="8" fill="rgba(255,255,255,0.8)"/>
                <rect x="32" y="42" width="8" height="8" fill="rgba(255,255,255,0.8)"/>
                <rect x="44" y="42" width="8" height="8" fill="rgba(255,255,255,0.8)"/>
                <rect x="20" y="54" width="8" height="8" fill="rgba(255,255,255,0.8)"/>
                <rect x="32" y="54" width="8" height="8" fill="rgba(255,255,255,0.8)"/>
                <rect x="44" y="54" width="8" height="8" fill="rgba(255,255,255,0.8)"/>
              </svg>
            </div>

            <div className="mc-body">
              <div className="mc-top">
                <div className="mc-title-block">
                  <h3 className="mc-name">{h.name}</h3>
                  <div className="mc-addr">{h.address}</div>
                </div>
                <div className="mc-cost">
                  <div className="mc-amount">${h.cost.amount.toLocaleString()}</div>
                  <div className="mc-cost-sub">{h.nights} {h.nights === 1 ? 'night' : 'nights'}</div>
                </div>
              </div>

              <div className="mc-stay-strip">
                <div className="mc-stay-col">
                  <div className="mc-label">Check-in</div>
                  <div className="mc-stay-date">{h.checkIn.date}</div>
                  <div className="mc-stay-time">{h.checkIn.time}</div>
                </div>
                <div className="mc-stay-arrow">
                  <svg viewBox="0 0 80 24" width="80" height="24">
                    <line x1="4" y1="12" x2="72" y2="12" stroke="#c7c7cc" strokeWidth="1" strokeDasharray="3 3"/>
                    <path d="M70 8 L76 12 L70 16 Z" fill="#c7c7cc"/>
                    <text x="40" y="9" textAnchor="middle" fontSize="9" fill="#86868b">{h.nights}n</text>
                  </svg>
                </div>
                <div className="mc-stay-col">
                  <div className="mc-label">Check-out</div>
                  <div className="mc-stay-date">{h.checkOut.date}</div>
                  <div className="mc-stay-time">{h.checkOut.time}</div>
                </div>
              </div>

              <div className="mc-info-grid">
                <div className="mc-info"><span className="mc-info-l">Room</span><span className="mc-info-v">{h.room}</span></div>
                <div className="mc-info"><span className="mc-info-l">Guests</span><span className="mc-info-v">{h.guests}</span></div>
                <div className="mc-info"><span className="mc-info-l">Confirmation</span><span className="mc-info-v mono">{h.ref}</span></div>
                <div className="mc-info"><span className="mc-info-l">Cancellation</span><span className="mc-info-v">{h.cancellation}</span></div>
              </div>

              {h.notes && (
                <div className="mc-notes"><I.Note /> <span>{h.notes}</span></div>
              )}

              <div className="mc-foot">
                {h.attachment && (
                  <a className="mc-attach" onClick={(e)=>e.preventDefault()} href="#">
                    <span className="mc-attach-ico">PDF</span>
                    <span className="mc-attach-name">{h.attachment.name}</span>
                    <span className="mc-attach-size">{h.attachment.size}</span>
                  </a>
                )}
                <span style={{flex:1}}/>
                <a className="mc-btn-ghost" href={`tel:${h.contact}`}><I.Phone/> Call</a>
                <a className="mc-btn-ghost" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(h.name+', '+h.address)}`} target="_blank" rel="noreferrer"><I.GMaps/> Map</a>
                <button className="mc-btn-ghost"><I.External/> View</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TransportView({ transport, onAdd }) {
  const I = window.Ico;
  const total = transport.reduce((s, t) => s + t.cost.amount, 0);
  const typeIcon = { flight: I.Plane, train: I.Train, car: I.Car, ferry: I.Boat };
  const typeLabel = { flight: 'Flight', train: 'Train', car: 'Car rental', ferry: 'Ferry' };

  return (
    <div className="mgmt-view">
      <header className="mgmt-head">
        <div>
          <div className="mgmt-eyebrow">Getting around</div>
          <h1 className="mgmt-title">Transport</h1>
          <div className="mgmt-meta">
            {transport.length} bookings · ${total.toLocaleString()} total
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onAdd('transport')}>
          <I.Plus /> Add transport
        </button>
      </header>

      <div className="mgmt-list">
        {transport.map(t => {
          const TypeIco = typeIcon[t.type] || I.Plane;
          return (
            <article key={t.id} className="mgmt-card transport-card">
              <div className="tc-type">
                <span className={`tc-type-ico tc-${t.type}`}><TypeIco /></span>
                <span className="tc-type-label">{typeLabel[t.type]}</span>
              </div>

              <div className="mc-body">
                <div className="mc-top">
                  <div className="mc-title-block">
                    <h3 className="mc-name">{t.title}</h3>
                    <div className="mc-addr">{t.provider} · <span className="mono">{t.ref}</span></div>
                  </div>
                  <div className="mc-cost">
                    <div className="mc-amount">${t.cost.amount.toLocaleString()}</div>
                    <div className="mc-cost-sub">{t.duration}</div>
                  </div>
                </div>

                <div className="tc-route">
                  <div className="tc-endpoint">
                    <div className="tc-time">{t.from.time}</div>
                    <div className="tc-code">{t.from.code}</div>
                    <div className="tc-place">{t.from.name}</div>
                    <div className="tc-meta">{t.from.date} · {t.from.terminal}</div>
                  </div>
                  <div className="tc-line">
                    <div className="tc-line-track"/>
                    <div className="tc-line-ico"><TypeIco /></div>
                    <div className="tc-line-dur">{t.duration}</div>
                  </div>
                  <div className="tc-endpoint tc-end">
                    <div className="tc-time">{t.to.time}</div>
                    <div className="tc-code">{t.to.code}</div>
                    <div className="tc-place">{t.to.name}</div>
                    <div className="tc-meta">{t.to.date} · {t.to.terminal}</div>
                  </div>
                </div>

                <div className="mc-info-grid">
                  <div className="mc-info"><span className="mc-info-l">{t.type === 'car' ? 'Vehicle' : 'Seats'}</span><span className="mc-info-v">{t.seats}</span></div>
                  <div className="mc-info"><span className="mc-info-l">Baggage</span><span className="mc-info-v">{t.bag}</span></div>
                </div>

                <div className="mc-foot">
                  {t.attachment && (
                    <a className="mc-attach" onClick={(e)=>e.preventDefault()} href="#">
                      <span className="mc-attach-ico">PDF</span>
                      <span className="mc-attach-name">{t.attachment.name}</span>
                      <span className="mc-attach-size">{t.attachment.size}</span>
                    </a>
                  )}
                  <span style={{flex:1}}/>
                  <button className="mc-btn-ghost"><I.Note/> Notes</button>
                  <button className="mc-btn-ghost"><I.External/> View</button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

window.HotelsView = HotelsView;
window.TransportView = TransportView;
