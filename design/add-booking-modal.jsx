// Add Booking modal — multi-step flow for hotel + transport

const { useState: useS_m, useEffect: useE_m } = React;

function AddBookingModal({ kind, onClose, onSave }) {
  const I = window.Ico;
  const [step, setStep] = useS_m(1); // 1 = type select (transport only) or details, 2 = details, 3 = review
  const [transportType, setTransportType] = useS_m('flight');
  const [form, setForm] = useS_m({});

  // Skip type-select for hotel — go straight to details
  useE_m(() => {
    if (kind === 'hotel') setStep(2);
  }, [kind]);

  const upd = (k, v) => setForm(f => ({...f, [k]: v}));

  // Esc closes
  useE_m(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const isHotel = kind === 'hotel';
  const headerLabel = isHotel ? 'Add hotel' : 'Add transport';

  const canSubmit = isHotel
    ? (form.name && form.checkInDate && form.checkOutDate)
    : (form.title && form.fromCode && form.toCode);

  const handleSave = () => {
    if (!canSubmit) return;
    onSave({ kind, transportType, form });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e)=>e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <div className="modal-eyebrow">New booking</div>
            <h2 className="modal-title">{headerLabel}</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><I.Close /></button>
        </header>

        <div className="modal-stepper">
          {!isHotel && (
            <div className={`step-pip ${step >= 1 ? 'on' : ''}`}>
              <span className="pip-num">1</span> Type
            </div>
          )}
          <div className={`step-pip ${step >= 2 ? 'on' : ''}`}>
            <span className="pip-num">{isHotel ? 1 : 2}</span> Details
          </div>
          <div className={`step-pip ${step >= 3 ? 'on' : ''}`}>
            <span className="pip-num">{isHotel ? 2 : 3}</span> Review
          </div>
        </div>

        <div className="modal-body">
          {/* Step 1: Transport type select */}
          {!isHotel && step === 1 && (
            <div className="step-pane fade-in-fast">
              <div className="step-title">What kind of transport?</div>
              <div className="type-grid">
                {[
                  {id:'flight', label:'Flight', icon: I.Plane, sub:'Airline · seat · gate'},
                  {id:'train', label:'Train', icon: I.Train, sub:'Rail · platform · car'},
                  {id:'car', label:'Car rental', icon: I.Car, sub:'Pickup & return'},
                  {id:'ferry', label:'Ferry', icon: I.Boat, sub:'Port · dock · cabin'},
                ].map(t => {
                  const Ico = t.icon;
                  return (
                    <button
                      key={t.id}
                      className={`type-tile ${transportType === t.id ? 'sel' : ''}`}
                      onClick={() => setTransportType(t.id)}
                    >
                      <span className="type-tile-ico"><Ico /></span>
                      <span className="type-tile-label">{t.label}</span>
                      <span className="type-tile-sub">{t.sub}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Details form */}
          {step === 2 && (
            <div className="step-pane fade-in-fast">
              {isHotel ? (
                <>
                  <Field label="Hotel name" required>
                    <input type="text" placeholder="e.g. Park Hotel Tokyo" value={form.name||''} onChange={e=>upd('name', e.target.value)}/>
                  </Field>
                  <Field label="Address">
                    <input type="text" placeholder="Street, city, country" value={form.address||''} onChange={e=>upd('address', e.target.value)}/>
                  </Field>
                  <div className="field-row">
                    <Field label="Check-in" required>
                      <input type="date" value={form.checkInDate||''} onChange={e=>upd('checkInDate', e.target.value)}/>
                    </Field>
                    <Field label="Time">
                      <input type="time" value={form.checkInTime||'15:00'} onChange={e=>upd('checkInTime', e.target.value)}/>
                    </Field>
                  </div>
                  <div className="field-row">
                    <Field label="Check-out" required>
                      <input type="date" value={form.checkOutDate||''} onChange={e=>upd('checkOutDate', e.target.value)}/>
                    </Field>
                    <Field label="Time">
                      <input type="time" value={form.checkOutTime||'11:00'} onChange={e=>upd('checkOutTime', e.target.value)}/>
                    </Field>
                  </div>
                  <div className="field-row">
                    <Field label="Room type">
                      <input type="text" placeholder="e.g. King · City view" value={form.room||''} onChange={e=>upd('room', e.target.value)}/>
                    </Field>
                    <Field label="Guests">
                      <input type="number" min="1" value={form.guests||2} onChange={e=>upd('guests', e.target.value)}/>
                    </Field>
                  </div>
                  <div className="field-row">
                    <Field label="Confirmation #">
                      <input type="text" placeholder="ABC-12345" value={form.ref||''} onChange={e=>upd('ref', e.target.value)}/>
                    </Field>
                    <Field label="Total cost (USD)">
                      <input type="number" placeholder="0.00" value={form.cost||''} onChange={e=>upd('cost', e.target.value)}/>
                    </Field>
                  </div>
                  <Field label="Notes">
                    <textarea rows="2" placeholder="Special requests, parking info..." value={form.notes||''} onChange={e=>upd('notes', e.target.value)}/>
                  </Field>
                  <Field label="Attach booking">
                    <div className="upload-zone">
                      <I.Note />
                      <div>
                        <div className="uz-title">Drop PDF or email here</div>
                        <div className="uz-sub">We'll auto-fill the fields</div>
                      </div>
                      <button className="uz-btn">Choose file</button>
                    </div>
                  </Field>
                </>
              ) : (
                <>
                  <Field label={transportType === 'flight' ? 'Flight name' : transportType === 'car' ? 'Vehicle/agency' : 'Title'} required>
                    <input type="text" placeholder={
                      transportType === 'flight' ? 'e.g. JL5 · LAX → NRT' :
                      transportType === 'train' ? 'e.g. Shinkansen · Tokyo → Kyoto' :
                      transportType === 'car' ? 'e.g. Toyota Prius · 3 days' : 'e.g. Tokyo → Oshima ferry'
                    } value={form.title||''} onChange={e=>upd('title', e.target.value)}/>
                  </Field>
                  <Field label="Provider">
                    <input type="text" placeholder={transportType === 'flight' ? 'Japan Airlines' : transportType === 'car' ? 'Times Car Rental' : 'JR East'} value={form.provider||''} onChange={e=>upd('provider', e.target.value)}/>
                  </Field>

                  <div className="route-fields">
                    <div className="route-side">
                      <div className="route-label">From</div>
                      <Field label={transportType === 'flight' ? 'Airport' : 'Station/place'} required compact>
                        <input type="text" placeholder={transportType === 'flight' ? 'LAX' : 'Tokyo Sta.'} value={form.fromCode||''} onChange={e=>upd('fromCode', e.target.value)}/>
                      </Field>
                      <div className="field-row">
                        <Field label="Date" compact>
                          <input type="date" value={form.fromDate||''} onChange={e=>upd('fromDate', e.target.value)}/>
                        </Field>
                        <Field label="Time" compact>
                          <input type="time" value={form.fromTime||''} onChange={e=>upd('fromTime', e.target.value)}/>
                        </Field>
                      </div>
                    </div>
                    <div className="route-arrow">
                      <svg viewBox="0 0 32 32" width="32" height="32">
                        <path d="M6 16 L26 16 M20 10 L26 16 L20 22" fill="none" stroke="#86868b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="route-side">
                      <div className="route-label">To</div>
                      <Field label={transportType === 'flight' ? 'Airport' : 'Station/place'} required compact>
                        <input type="text" placeholder={transportType === 'flight' ? 'NRT' : 'Kyoto Sta.'} value={form.toCode||''} onChange={e=>upd('toCode', e.target.value)}/>
                      </Field>
                      <div className="field-row">
                        <Field label="Date" compact>
                          <input type="date" value={form.toDate||''} onChange={e=>upd('toDate', e.target.value)}/>
                        </Field>
                        <Field label="Time" compact>
                          <input type="time" value={form.toTime||''} onChange={e=>upd('toTime', e.target.value)}/>
                        </Field>
                      </div>
                    </div>
                  </div>

                  <div className="field-row">
                    <Field label={transportType === 'car' ? 'Vehicle' : 'Seats'}>
                      <input type="text" placeholder={transportType === 'flight' ? '14A, 14B · Economy' : transportType === 'car' ? 'Compact · Hybrid' : 'Car 7 · 12A, 12B'} value={form.seats||''} onChange={e=>upd('seats', e.target.value)}/>
                    </Field>
                    <Field label="Confirmation #">
                      <input type="text" placeholder="ABC-12345" value={form.ref||''} onChange={e=>upd('ref', e.target.value)}/>
                    </Field>
                  </div>
                  <Field label="Total cost (USD)">
                    <input type="number" placeholder="0.00" value={form.cost||''} onChange={e=>upd('cost', e.target.value)}/>
                  </Field>
                  <Field label="Attach ticket">
                    <div className="upload-zone">
                      <I.Note />
                      <div>
                        <div className="uz-title">Drop PDF, image, or forward email</div>
                        <div className="uz-sub">plan@wanderlist.app · auto-imports tickets</div>
                      </div>
                      <button className="uz-btn">Choose file</button>
                    </div>
                  </Field>
                </>
              )}
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="step-pane fade-in-fast">
              <div className="review-card">
                <div className="review-ico">
                  {isHotel ? <I.Bed /> : (transportType === 'flight' ? <I.Plane/> : transportType === 'train' ? <I.Train/> : transportType === 'car' ? <I.Car/> : <I.Boat/>)}
                </div>
                <div className="review-body">
                  <div className="review-title">{form.name || form.title || 'New booking'}</div>
                  <div className="review-sub">
                    {isHotel
                      ? `${form.checkInDate || '—'} → ${form.checkOutDate || '—'} · ${form.guests || 2} guests`
                      : `${form.fromCode || '—'} → ${form.toCode || '—'} · ${form.fromDate || '—'}`}
                  </div>
                  <div className="review-cost">${(form.cost || 0).toLocaleString()}</div>
                </div>
              </div>

              <div className="review-summary">
                <div className="rs-row"><span>Confirmation</span><span className="mono">{form.ref || '—'}</span></div>
                {isHotel && <div className="rs-row"><span>Room</span><span>{form.room || '—'}</span></div>}
                {!isHotel && <div className="rs-row"><span>{transportType === 'car' ? 'Vehicle' : 'Seats'}</span><span>{form.seats || '—'}</span></div>}
                <div className="rs-row"><span>Adds to itinerary</span><span style={{color:'#29a847', fontWeight:600}}>✓ Day pinned automatically</span></div>
              </div>

              <div className="review-note">
                <I.Note />
                <span>This booking will appear on its day in the itinerary and on the map.</span>
              </div>
            </div>
          )}
        </div>

        <footer className="modal-foot">
          {step > (isHotel ? 2 : 1) ? (
            <button className="btn btn-tonal" onClick={() => setStep(s => s-1)}>Back</button>
          ) : (
            <button className="btn btn-tonal" onClick={onClose}>Cancel</button>
          )}
          <span style={{flex:1}}/>
          {step < 3 ? (
            <button
              className="btn btn-primary"
              disabled={step === 2 && !canSubmit}
              onClick={() => setStep(s => s+1)}
            >
              Continue
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleSave}>
              <window.Ico.Check /> Save booking
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Field({ label, required, compact, children }) {
  return (
    <label className={`form-field ${compact?'compact':''}`}>
      <span className="ff-label">{label}{required && <span className="ff-req">*</span>}</span>
      {children}
    </label>
  );
}

window.AddBookingModal = AddBookingModal;
