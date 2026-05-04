// MapCanvas — server component. Dynamic pins + polyline from props.

import { Layers, Filter, Locate, ZoomIn, Minus, Route, Clock, GMaps } from '@/components/icons';
import styles from './map-canvas.module.css';

// ---- Kind → fill colour map ----
const KIND_COLOR: Record<string, string> = {
  hotel: '#5b3fd9',
  food: '#f05c3a',
  sight: '#0071e3',
  transit: '#34c759',
};

type Pin = {
  id: string;
  idx: number;
  kind: 'hotel' | 'food' | 'sight' | 'transit';
  x: number;
  y: number;
  name?: string;
  mock?: boolean;
};

type Props = {
  dayLabel: string;
  totalDistance?: string | null;
  totalTime?: string | null;
  pins: Pin[];
};

// Build an SVG path string. Skip legs touching mock pins so we don't
// draw a route between unverified locations.
function buildRoutePath(pins: Pin[]): string {
  if (pins.length < 2) return '';
  const segs: string[] = [];
  for (let i = 0; i < pins.length - 1; i++) {
    const a = pins[i];
    const b = pins[i + 1];
    if (a.mock || b.mock) continue;
    segs.push(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
  }
  return segs.join(' ');
}

// Map-pin balloon shape (same proportions as design mockup).
// The balloon is centred at (0,0); caller translates to (x, y).
function PinBalloon({ color, idx, mock }: { color: string; idx: number; mock?: boolean }) {
  return (
    <g opacity={mock ? 0.55 : 1}>
      {/* Balloon body */}
      <path
        d="M 0,-19 C -9,-19 -16,-12 -16,-3 C -16,6 -8,14 0,19 C 8,14 16,6 16,-3 C 16,-12 9,-19 0,-19 Z"
        fill={color}
        filter="drop-shadow(0 3px 6px rgba(0,0,0,0.22))"
      />
      {/* Tail */}
      <path d="M -5,16 L 0,24 L 5,16 Z" fill={color} />
      {/* Number */}
      <text
        x="0"
        y="2"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="11"
        fontWeight="700"
        fill="white"
        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        letterSpacing="-0.02em"
      >
        {idx}
      </text>
    </g>
  );
}

export default function MapCanvas({ dayLabel, totalDistance, totalTime, pins }: Props) {
  const routePath = buildRoutePath(pins);
  const showDistChip = Boolean(totalDistance && totalTime);

  return (
    <div className={styles.mapWrap}>
      {/* ---- Base map SVG ---- */}
      <svg
        className={styles.mapSvg}
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <linearGradient id="mc-seaGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#cfe1f3" />
            <stop offset="100%" stopColor="#b9d4ec" />
          </linearGradient>
          <linearGradient id="mc-landGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3efe6" />
            <stop offset="100%" stopColor="#ece7da" />
          </linearGradient>
          <linearGradient id="mc-parkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dbe7c8" />
            <stop offset="100%" stopColor="#cdddb4" />
          </linearGradient>
          <radialGradient id="mc-fujiGrad" cx="50%" cy="50%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="35%" stopColor="#e8d8c0" />
            <stop offset="100%" stopColor="#bca683" />
          </radialGradient>
          <pattern id="mc-dots" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.6" fill="#9aa6b3" opacity="0.4" />
          </pattern>
        </defs>

        {/* Sea / bay */}
        <rect width="1000" height="700" fill="url(#mc-seaGrad)" />

        {/* Land mass — main Honshu coast */}
        <path
          d="M -20,-20 L 1020,-20 L 1020,300 C 980,310 940,330 900,350 C 860,360 830,370 800,380 C 770,395 760,420 750,440 C 740,460 730,475 720,490 C 715,510 710,530 700,550 C 690,565 670,575 640,580 C 610,580 580,575 555,570 C 540,560 530,545 520,530 C 510,520 495,520 480,525 C 460,535 445,545 430,560 C 410,580 380,590 350,580 C 320,570 290,560 270,535 C 250,520 235,500 215,495 C 190,490 165,500 140,510 C 110,520 80,520 55,510 C 35,500 15,485 -20,475 Z"
          fill="url(#mc-landGrad)"
        />

        {/* Inland green / parks — Mt Fuji area */}
        <path
          d="M 200,180 C 240,150 290,140 340,150 C 390,160 420,200 430,250 C 425,290 410,320 380,335 C 350,345 320,340 290,330 C 260,320 230,300 215,275 C 200,245 195,210 200,180 Z"
          fill="url(#mc-parkGrad)"
        />

        {/* Fuji peak */}
        <g transform="translate(290, 290)">
          <ellipse cx="0" cy="0" rx="60" ry="58" fill="url(#mc-fujiGrad)" />
          <path
            d="M -45,15 C -30,-10 -10,-30 0,-35 C 10,-30 30,-10 45,15 L 30,18 L 22,8 L 12,16 L 0,4 L -10,14 L -22,6 L -32,18 Z"
            fill="#ffffff"
            opacity="0.85"
          />
          <text
            x="0"
            y="62"
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#5b4a30"
            letterSpacing="0.5"
          >
            Mt. Fuji
          </text>
        </g>

        {/* Lakes around Fuji */}
        <ellipse cx="345" cy="270" rx="38" ry="14" fill="#aac9e6" />
        <ellipse cx="278" cy="248" rx="22" ry="9" fill="#aac9e6" />
        <text x="358" y="258" fontSize="8" fill="#5d7a96" letterSpacing="0.3">
          Lake Kawaguchi
        </text>

        {/* Tokyo bay area — water inlet */}
        <path
          d="M 600,420 C 640,415 690,420 720,440 C 730,470 720,500 700,520 C 670,530 630,530 605,520 C 590,495 590,455 600,420 Z"
          fill="url(#mc-seaGrad)"
          opacity="0.9"
        />

        {/* Hakone green */}
        <ellipse cx="465" cy="465" rx="50" ry="35" fill="url(#mc-parkGrad)" />

        {/* Roads — highways */}
        <g stroke="#ffffff" fill="none" strokeLinecap="round">
          <path
            d="M 290,290 C 360,320 460,400 540,420 C 580,420 610,415 640,410"
            strokeWidth="6"
            opacity="0.95"
          />
          <path
            d="M 540,420 C 560,440 580,460 600,480 C 640,500 680,510 710,510"
            strokeWidth="5"
            opacity="0.95"
          />
          <path
            d="M 600,415 C 660,420 700,430 730,450 C 740,470 735,490 720,500"
            strokeWidth="4"
            opacity="0.9"
          />
          <path d="M 460,460 C 500,480 560,490 600,490" strokeWidth="4" opacity="0.9" />
          <path d="M 700,470 C 730,490 750,510 720,510" strokeWidth="3" opacity="0.85" />
        </g>
        <g stroke="#d8b878" fill="none" strokeLinecap="round" opacity="0.7">
          <path
            d="M 290,290 C 360,320 460,400 540,420 C 580,420 610,415 640,410"
            strokeWidth="2"
          />
          <path d="M 540,420 C 560,440 580,460 600,480" strokeWidth="2" />
        </g>

        {/* Minor street grid (Tokyo) */}
        <g stroke="#ffffff" strokeWidth="1.5" opacity="0.7" fill="none">
          <path d="M 580,380 L 700,400" />
          <path d="M 590,400 L 690,420" />
          <path d="M 600,420 L 680,438" />
          <path d="M 600,380 L 610,440" />
          <path d="M 630,378 L 638,438" />
          <path d="M 660,386 L 670,448" />
        </g>
        {/* Kamakura streets */}
        <g stroke="#ffffff" strokeWidth="1.2" opacity="0.7" fill="none">
          <path d="M 680,495 L 730,485" />
          <path d="M 685,510 L 728,500" />
          <path d="M 700,478 L 712,520" />
        </g>

        {/* City labels */}
        <g
          fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
          fill="#5d6470"
          letterSpacing="1"
        >
          <text x="635" y="435" fontSize="14" fontWeight="600">
            Tokyo
          </text>
          <text x="455" y="495" fontSize="11" fontWeight="600">
            Hakone
          </text>
          <text x="713" y="538" fontSize="11" fontWeight="600">
            Kamakura
          </text>
          <text x="350" y="225" fontSize="10" fontWeight="500" opacity="0.7">
            Kawaguchiko
          </text>
          <text x="800" y="280" fontSize="10" fontWeight="500" opacity="0.6">
            Pacific Ocean
          </text>
          <text x="60" y="650" fontSize="9" fontWeight="500" opacity="0.5">
            Shizuoka
          </text>
        </g>

        {/* Map texture dots */}
        <rect x="0" y="0" width="1000" height="700" fill="url(#mc-dots)" opacity="0.2" />

        {/* ---- Dynamic layer: polyline ---- */}
        {routePath && (
          <path
            d={routePath}
            fill="none"
            stroke="#f5c518"
            strokeWidth="3"
            strokeOpacity="0.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 4"
          />
        )}

        {/* ---- Dynamic layer: pins ---- */}
        {pins.map((pin) => (
          <g key={pin.id} transform={`translate(${pin.x}, ${pin.y})`}>
            <PinBalloon
              color={pin.mock ? '#9ca3af' : (KIND_COLOR[pin.kind] ?? KIND_COLOR.sight)}
              idx={pin.idx}
              mock={pin.mock}
            />
            {pin.mock && (
              <g transform="translate(13, -16)">
                <circle r="7" fill="#f5a623" stroke="white" strokeWidth="1.5" />
                <text
                  x="0"
                  y="1"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize="9"
                  fontWeight="700"
                  fill="white"
                  fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
                >?</text>
              </g>
            )}
          </g>
        ))}
      </svg>

      {/* ---- Floating overlays ---- */}

      {/* Top-left: day-label chip + Open in Maps */}
      <div className={styles.overlayTl}>
        <div className={`${styles.mapPill} ${styles.dayPill}`}>{dayLabel}</div>
        {pins.length > 0 ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              pins.map((p) => p.name).filter(Boolean).join(', '),
            )}`}
            target="_blank"
            rel="noreferrer"
            className={`${styles.mapPill} ${styles.openMapsLink}`}
          >
            <GMaps width={13} height={13} />
            Open in Maps
          </a>
        ) : null}
      </div>

      {/* Top-right: Layers / Filter / Locate icon stack */}
      <div className={styles.overlayTr}>
        <div className={styles.mapIconStack}>
          <button type="button" aria-label="Layers">
            <Layers />
          </button>
          <button type="button" aria-label="Filter">
            <Filter />
          </button>
          <button type="button" aria-label="Locate">
            <Locate />
          </button>
        </div>
      </div>

      {/* Bottom-right: zoom +/− buttons */}
      <div className={styles.overlayBr}>
        <div className={styles.zoomStack}>
          <button type="button" aria-label="Zoom in">
            <ZoomIn />
          </button>
          <button type="button" aria-label="Zoom out">
            <Minus />
          </button>
        </div>
      </div>

      {/* Bottom-left: distance / time chip */}
      {showDistChip && (
        <div className={styles.overlayBl}>
          <div className={styles.mapPill}>
            <Route width={13} height={13} />
            {totalDistance}
          </div>
          <div className={styles.mapPill}>
            <Clock width={13} height={13} />
            {totalTime}
          </div>
        </div>
      )}
    </div>
  );
}
