// Icon library — line icons matching Appled aesthetic
// All 24x24 viewBox, stroke="currentColor"

const Ico = {
  // Brand
  Logo: () => (
    <svg viewBox="0 0 32 32" fill="currentColor"><path d="M16 3.2c-3.4 0-5.5 2-7.6 2-2.2 0-4.6-1.9-6.6.5C-.6 8.5.4 14.6 3.6 19.7c1.6 2.5 3.7 5.3 6.5 5.2 2.6-.1 3.6-1.7 6.7-1.7 3.1 0 4 1.7 6.7 1.6 2.8-.1 4.6-2.6 6.3-5.1 1.9-2.9 2.7-5.7 2.7-5.9-.1 0-5.2-2-5.3-7.9 0-4.9 4-7.3 4.2-7.4-2.3-3.4-5.9-3.8-7.2-3.9-3.3-.3-6 1.9-7.5 1.9zM21.4 1c.5 1.7-.4 3.4-1.2 4.6-.9 1.2-2.3 2.1-3.7 2-.6-1.6.4-3.4 1.2-4.4 1-1.2 2.7-2.1 3.7-2.2z"/></svg>
  ),
  // Topbar
  Undo: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 14l-5-5 5-5"/><path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H8"/></svg>,
  Redo: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0-5 5v0a5 5 0 0 0 5 5h7"/></svg>,
  Search: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  Share: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 4v12"/><path d="M8 8l4-4 4 4"/><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/></svg>,
  More: () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>,
  Settings: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  // Rail
  Trips: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h16M4 18h10"/></svg>,
  Map: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>,
  Wallet: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/></svg>,
  Notes: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/></svg>,
  Wand: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m15 6 3 3-9 9-3-3 9-9z"/><path d="M20 4l-1 1M4 20l1-1M20 14l-1 1M4 8l1-1"/></svg>,
  Help: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/></svg>,
  Calendar: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>,
  ChevronLeft: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 18l-6-6 6-6"/></svg>,
  // Cover actions
  Edit: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>,
  Camera: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z"/><circle cx="12" cy="13" r="3.5"/></svg>,
  // Place meta
  Star: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 2 2.9 6.6 7.1.6-5.4 4.7L18.3 21 12 17.3 5.7 21l1.7-7.1L2 9.2l7.1-.6L12 2z"/></svg>,
  Clock: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  Route: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M6 8c0 5 4 4 6 6s6 1 6 4"/></svg>,
  Drive: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 16h14l-2-7H7l-2 7z"/><circle cx="8" cy="17" r="1.4"/><circle cx="16" cy="17" r="1.4"/></svg>,
  Walk: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="13" cy="4" r="1.5"/><path d="M11 22l1-7-3-3 2-5 3 3 4 1"/><path d="M9 12l-2 5"/></svg>,
  Transit: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="6" y="3" width="12" height="14" rx="3"/><path d="M6 11h12M9 17l-2 4M15 17l2 4"/><circle cx="9" cy="14" r="0.6" fill="currentColor"/><circle cx="15" cy="14" r="0.6" fill="currentColor"/></svg>,
  // Row actions
  Plus: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"/></svg>,
  Drag: () => <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.4"/><circle cx="15" cy="6" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="18" r="1.4"/><circle cx="15" cy="18" r="1.4"/></svg>,
  Trash: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/></svg>,
  Note: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h12l4 4v12H4z"/><path d="M16 4v4h4"/></svg>,
  // Map ui
  Sparkle: () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.3L19 9l-5.3 1.7L12 16l-1.7-5.3L5 9l5.3-1.7L12 2zM19 14l1 3 3 1-3 1-1 3-1-3-3-1 3-1 1-3z"/></svg>,
  Check: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12l5 5 9-11"/></svg>,
  ZoomIn: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 5v14M5 12h14"/></svg>,
  ZoomOut: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 12h14"/></svg>,
  Layers: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 3 2 9l10 6 10-6-10-6z"/><path d="m2 15 10 6 10-6"/></svg>,
  Locate: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>,
  Filter: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 5h18l-7 9v6l-4-2v-4L3 5z"/></svg>,
  Bed: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 18v-7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v7"/><path d="M3 14h18M3 18v3M21 18v3"/><circle cx="8" cy="11" r="1.5"/></svg>,
  Fork: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10"/><path d="M16 3c-1.5 0-3 2-3 5s1.5 5 3 5v8"/></svg>,
  Eye: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>,
  Close: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M6 6l12 12M6 18l12-12"/></svg>,
  Phone: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg>,
  Globe: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>,
  External: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6"/></svg>,
  GMaps: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13z"/><circle cx="12" cy="9" r="2.5"/></svg>,
  Plane: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V8l-8 5v2l8-2.5V18l-2 1.5V21l3.5-1L15 21v-1.5L13 18v-5.5L21 15z"/></svg>,
  Train: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="5" y="3" width="14" height="14" rx="3"/><circle cx="9" cy="13" r="1" fill="currentColor"/><circle cx="15" cy="13" r="1" fill="currentColor"/><path d="M5 9h14"/><path d="M7 21l2-3M17 21l-2-3"/></svg>,
  Car: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M5 17h14M5 17v3M19 17v3M3 13l2-6h14l2 6v4H3v-4z"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg>,
  Boat: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0"/><path d="M5 14l1-7h12l1 7"/><path d="M12 4v3"/></svg>,
  ChevLeft: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M15 6l-6 6 6 6"/></svg>,
  ChevRight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 6l6 6-6 6"/></svg>,
  Sight: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 21l5-12 5 8 3-5 5 9z"/><circle cx="17" cy="6" r="2"/></svg>,
  Food: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 3v8a3 3 0 0 0 6 0V3M7 3v18"/><path d="M17 3c-2 1-3 4-3 7s1 4 3 4v7"/></svg>,
};

window.Ico = Ico;
