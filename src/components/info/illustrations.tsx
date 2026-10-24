// Line illustrations for the glossary (SPEC 13.7): 160 × 120, 2px strokes in the text colour,
// the lime accent on the part that tells you what it is. Drawn from real gym equipment, kept
// simple. Every one goes through the Review screen before it counts as approved.
import type { CSSProperties, ReactNode } from 'react';

const ACC: CSSProperties = { stroke: 'var(--accent)' };
const ACC_FILL: CSSProperties = { fill: 'var(--accent)', stroke: 'none' };

function Art({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 160 120"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-illustration=""
    >
      {children}
    </svg>
  );
}

/** Knurling: short diagonal ticks over a stretch of shaft. */
function Knurl({ from, to, y }: { from: number; to: number; y: number }) {
  const ticks = [];
  for (let x = from; x <= to; x += 4) ticks.push(`M${x} ${y - 2.5}l2.5 5`);
  return <path d={ticks.join('')} strokeWidth={1} opacity={0.7} />;
}

/** A barbell seen from the front: sleeves, inner collars, shaft, optional end caps. */
function Bar({
  left,
  right,
  y = 60,
  sleeve = 26,
  shaftH = 3,
  accent,
  knurl = true,
}: {
  left: number;
  right: number;
  y?: number;
  sleeve?: number;
  shaftH?: number;
  accent?: 'sleeves' | 'shaft';
  knurl?: boolean;
}) {
  const sl = left + sleeve;
  const sr = right - sleeve;
  return (
    <g>
      <rect x={left} y={y - 4} width={sleeve} height={8} rx={2} style={accent === 'sleeves' ? ACC : undefined} />
      <rect x={sr} y={y - 4} width={sleeve} height={8} rx={2} style={accent === 'sleeves' ? ACC : undefined} />
      <rect x={sl} y={y - 8} width={4} height={16} rx={1} />
      <rect x={sr - 4} y={y - 8} width={4} height={16} rx={1} />
      <rect x={sl + 4} y={y - shaftH / 2} width={sr - sl - 8} height={shaftH} rx={shaftH / 2} style={accent === 'shaft' ? ACC : undefined} />
      {knurl && (
        <>
          <Knurl from={sl + 12} to={sl + 26} y={y} />
          <Knurl from={sr - 30} to={sr - 16} y={y} />
        </>
      )}
    </g>
  );
}

export function OlympicBarArt() {
  return (
    <Art>
      <Bar left={6} right={154} accent="sleeves" />
      <Knurl from={74} to={84} y={60} />
      <path d="M20 84h120" opacity={0.25} />
    </Art>
  );
}

export function WomensBarArt() {
  // A touch shorter, a thinner grip, no centre knurl.
  return (
    <Art>
      <Bar left={16} right={144} sleeve={22} shaftH={2} accent="shaft" />
      <path d="M26 84h108" opacity={0.25} />
    </Art>
  );
}

export function EzBarArt() {
  return (
    <Art>
      <rect x={10} y={56} width={22} height={8} rx={2} />
      <rect x={128} y={56} width={22} height={8} rx={2} />
      <rect x={32} y={52} width={4} height={16} rx={1} />
      <rect x={124} y={52} width={4} height={16} rx={1} />
      <path d="M36 60H50L58 50L66 66L72 58H88L94 66L102 50L110 60H124" style={ACC} />
    </Art>
  );
}

export function TrapBarArt() {
  // Seen from above: the hexagon frame, sleeves out to the sides, a handle on each side inside.
  return (
    <Art>
      <path d="M50 28H110L132 60L110 92H50L28 60Z" />
      <rect x={6} y={56} width={22} height={8} rx={2} />
      <rect x={132} y={56} width={22} height={8} rx={2} />
      <path d="M58 28V46M58 74V92M102 28V46M102 74V92" opacity={0.6} />
      <rect x={54} y={46} width={8} height={28} rx={3} style={ACC} />
      <rect x={98} y={46} width={8} height={28} rx={3} style={ACC} />
    </Art>
  );
}

export function FixedBarbellArt() {
  // Short bar, plates welded on, the weight printed on the end caps.
  return (
    <Art>
      <rect x={38} y={58.5} width={84} height={3} rx={1.5} />
      <Knurl from={60} to={100} y={60} />
      <rect x={26} y={36} width={12} height={48} rx={5} style={ACC} />
      <rect x={122} y={36} width={12} height={48} rx={5} style={ACC} />
      <rect x={18} y={52} width={8} height={16} rx={2} />
      <rect x={134} y={52} width={8} height={16} rx={2} />
    </Art>
  );
}

export function SmithMachineArt() {
  return (
    <Art>
      <path d="M36 108V12M124 108V12M28 12H132" />
      <path d="M22 108H50M110 108H138" />
      <path d="M30 88h12M118 88h12" opacity={0.6} />
      <rect x={31} y={48} width={10} height={16} rx={2} />
      <rect x={119} y={48} width={10} height={16} rx={2} />
      <path d="M16 56H144" strokeWidth={3} style={ACC} />
      <rect x={10} y={52} width={12} height={8} rx={2} style={ACC} />
      <rect x={138} y={52} width={12} height={8} rx={2} style={ACC} />
    </Art>
  );
}

export function CableStationArt() {
  // A tower with its weight stack; the cable runs over the top pulley down to a handle.
  return (
    <Art>
      <path d="M30 110V10H80V110M22 110H88" />
      <path d="M42 18V106M68 18V106" opacity={0.5} />
      {[78, 84, 90, 96, 102].map((y) => (
        <rect key={y} x={38} y={y} width={34} height={5} rx={1} />
      ))}
      <path d="M55 78V24" />
      <circle cx={55} cy={18} r={5} />
      <path d="M59 15L118 60" style={ACC} />
      <path d="M112 62h14l-3 12h-8z" style={ACC} />
    </Art>
  );
}

export function RopeArt() {
  return (
    <Art>
      <circle cx={80} cy={16} r={6} />
      <path d="M80 22V32" />
      <path d="M80 32C72 52 66 70 66 90M80 32C88 52 94 70 94 90" strokeWidth={5} style={ACC} />
      <circle cx={66} cy={96} r={6} />
      <circle cx={94} cy={96} r={6} />
    </Art>
  );
}

export function StraightBarAttachmentArt() {
  return (
    <Art>
      <circle cx={80} cy={34} r={6} />
      <path d="M80 40V76" />
      <rect x={28} y={76} width={104} height={6} rx={3} style={ACC} />
      <Knurl from={40} to={64} y={79} />
      <Knurl from={96} to={120} y={79} />
    </Art>
  );
}

export function VHandleArt() {
  // Hangs from its ring; two close grips side by side at the bottom.
  return (
    <Art>
      <circle cx={80} cy={16} r={6} />
      <path d="M80 22V32L66 84M80 32L94 84" />
      <path d="M66 84L62 104M94 84L98 104" strokeWidth={6} style={ACC} />
      <path d="M68 80H92" />
    </Art>
  );
}

export function DHandleArt() {
  return (
    <Art>
      <circle cx={80} cy={20} r={6} />
      <path d="M80 26C70 34 60 60 62 88M80 26C90 34 100 60 98 88" />
      <path d="M60 92H100" strokeWidth={7} style={ACC} />
    </Art>
  );
}

export function PlateLoadedMachineArt() {
  // The machine's frame with a horn sticking out of it; plates slide onto the horn, not a stack.
  return (
    <Art>
      <path d="M12 108H148" />
      <rect x={16} y={20} width={40} height={88} rx={4} />
      <path d="M26 34H46M26 44H46" opacity={0.5} />
      <rect x={56} y={56} width={84} height={8} rx={3} />
      <rect x={140} y={54} width={6} height={12} rx={2} />
      <rect x={64} y={24} width={12} height={72} rx={4} style={ACC} />
      <rect x={78} y={30} width={11} height={60} rx={4} style={ACC} />
      <rect x={91} y={40} width={8} height={40} rx={3} style={ACC} />
    </Art>
  );
}

export function WeightStackArt() {
  // Plates on two guide rods; the pin goes into one plate, that one and those above it lift.
  const plates = [62, 69, 76, 83, 90, 97];
  return (
    <Art>
      <circle cx={80} cy={12} r={5} />
      <path d="M80 17V54" />
      <path d="M56 8V110M104 8V110M44 110H116" opacity={0.6} />
      <rect x={50} y={54} width={60} height={6} rx={1.5} />
      {plates.map((y) => (
        <rect key={y} x={50} y={y} width={60} height={5} rx={1.5} style={y === 83 ? ACC : undefined} />
      ))}
      <path d="M110 85.5H124" strokeWidth={3} style={ACC} />
      <circle cx={127} cy={85.5} r={3} style={ACC_FILL} />
    </Art>
  );
}

export function LegPressArt() {
  // Sit low and lean back, push the sled up the angled rails with your feet.
  return (
    <Art>
      <path d="M8 108H152" />
      <path d="M44 104L140 26M140 26V108" />
      <path d="M30 98L52 92M30 98L18 74" strokeWidth={5} />
      <path d="M30 98V108" />
      <path d="M100 58L82 35" strokeWidth={5} style={ACC} />
      <path d="M100 58L112 48M112 48l-4 -6" />
    </Art>
  );
}

export function PecDeckArt() {
  // From the front: seat and back pad in the middle, a swinging arm pad on each side.
  return (
    <Art>
      <path d="M36 108V14H124V108M28 108H132" opacity={0.6} />
      <rect x={70} y={30} width={20} height={44} rx={4} />
      <rect x={64} y={74} width={32} height={8} rx={3} />
      <path d="M80 82V108" />
      <path d="M66 16L50 40M94 16L110 40" />
      <rect x={42} y={40} width={10} height={32} rx={4} style={ACC} />
      <rect x={108} y={40} width={10} height={32} rx={4} style={ACC} />
    </Art>
  );
}

export function LatPulldownArt() {
  return (
    <Art>
      <path d="M112 108V8H44M100 108H148" />
      {[72, 79, 86, 93, 100].map((y) => (
        <rect key={y} x={116} y={y} width={22} height={5} rx={1} />
      ))}
      <path d="M112 8H136V70" opacity={0.6} />
      <circle cx={50} cy={10} r={4} />
      <path d="M50 14V28" />
      <path d="M18 34L26 28H74L82 34" strokeWidth={3} style={ACC} />
      <rect x={38} y={84} width={26} height={7} rx={3} />
      <path d="M51 91V108M36 108H66" />
      <rect x={40} y={64} width={22} height={7} rx={3.5} />
      <path d="M62 67H112" opacity={0.6} />
    </Art>
  );
}

export function SeatedRowArt() {
  // A low seat, a footplate, and a cable from the low pulley to a handle.
  return (
    <Art>
      <path d="M10 108H150" />
      <rect x={20} y={80} width={60} height={7} rx={3} />
      <path d="M30 87V108M70 87V108" />
      <path d="M104 98L112 70" strokeWidth={4} />
      <path d="M132 108V22H146V108" />
      <circle cx={128} cy={96} r={4} />
      <path d="M124 94L96 78" style={ACC} />
      <path d="M96 78L88 72M96 78L90 86M88 72L84 80L90 86" style={ACC} />
    </Art>
  );
}

export function PreacherBenchArt() {
  // Sit, rest the backs of your arms on the slanted pad, curl.
  return (
    <Art>
      <path d="M14 108H146" />
      <rect x={24} y={82} width={32} height={7} rx={3} />
      <path d="M40 89V108" />
      <path d="M70 46L106 74" strokeWidth={7} style={ACC} />
      <path d="M88 64V108M70 108H106" />
      <path d="M64 30v8h8v-8" />
      <path d="M68 38V46" />
    </Art>
  );
}

export function AdjustableBenchArt() {
  // The back pad tilts from flat to upright; the dashed lines show the other positions.
  return (
    <Art>
      <path d="M20 104H132" />
      <path d="M62 74H100" strokeWidth={6} />
      <path d="M62 74L32 34" strokeWidth={6} style={ACC} />
      <path d="M62 74L24 74M62 74L28 52" strokeDasharray="3 4" opacity={0.5} />
      <path d="M40 104L52 80M118 104L104 80M52 80H104" />
      <path d="M58 80L46 60" opacity={0.6} />
    </Art>
  );
}

export function DeclineBenchArt() {
  // Head lower than hips; rollers at the high end hold your legs.
  return (
    <Art>
      <path d="M16 106H144" />
      <path d="M28 82L108 56" strokeWidth={6} />
      <path d="M40 80V106M100 60V106" />
      <path d="M108 56L118 44" />
      <circle cx={122} cy={38} r={6} style={ACC} />
      <circle cx={122} cy={58} r={6} style={ACC} />
      <path d="M122 64V106" opacity={0.6} />
    </Art>
  );
}

export function DipStationArt() {
  // Two parallel bars at hip height; you hold yourself up between them.
  return (
    <Art>
      <path d="M40 44L92 28M70 58L122 42" strokeWidth={4} style={ACC} />
      <path d="M44 44V104M88 30V92M74 58V110M118 43V98" />
      <path d="M36 104H52M80 92H96M66 110H82M110 98H126" />
    </Art>
  );
}

export function LandmineArt() {
  // One end of a barbell sits in a pivot on the floor; you lift the other end.
  return (
    <Art>
      <path d="M8 106H152" />
      <rect x={14} y={96} width={22} height={10} rx={2} style={ACC} />
      <circle cx={25} cy={92} r={5} style={ACC} />
      <path d="M28 90L126 38" strokeWidth={3} />
      <rect x={108} y={20} width={9} height={46} rx={4} transform="rotate(-28 112 43)" />
    </Art>
  );
}

export function KettlebellArt() {
  return (
    <Art>
      <path d="M65 52C58 14 102 14 95 52" strokeWidth={6} style={ACC} />
      <path d="M66 100A28 28 0 1 1 94 100Z" />
    </Art>
  );
}

export function ResistanceBandArt() {
  return (
    <Art>
      <rect x={24} y={42} width={112} height={36} rx={18} style={ACC} />
      <rect x={30} y={48} width={100} height={24} rx={12} />
    </Art>
  );
}

export function CollarsArt() {
  // Left: a spring clip (squeeze the handles). Right: a lock collar with its lever.
  return (
    <Art>
      <circle cx={50} cy={70} r={16} style={ACC} />
      <path d="M58 56L76 30M64 60L90 40" style={ACC} />
      <circle cx={77} cy={28} r={3} style={ACC} />
      <circle cx={92} cy={38} r={3} style={ACC} />
      <rect x={106} y={48} width={22} height={40} rx={5} />
      <path d="M128 60L142 44" strokeWidth={3} />
    </Art>
  );
}

export function BumperVsIronArt() {
  // Same height. Bumpers are thick rubber all the way; iron plates are thin with a raised rim.
  return (
    <Art>
      <rect x={30} y={22} width={24} height={76} rx={4} style={ACC} />
      <rect x={36} y={54} width={12} height={12} rx={1} />
      <path d="M100 22H114V32H111V88H114V98H100V88H103V32H100Z" />
      <rect x={103} y={54} width={8} height={12} rx={1} />
    </Art>
  );
}

export function PairArt() {
  return (
    <Art>
      <rect x={18} y={36} width={48} height={40} rx={8} />
      <rect x={94} y={36} width={48} height={40} rx={8} />
      <text x={42} y={62} textAnchor="middle" fontSize={18} fill="currentColor" stroke="none" fontWeight={700}>
        A
      </text>
      <text x={118} y={62} textAnchor="middle" fontSize={18} fill="currentColor" stroke="none" fontWeight={700}>
        B
      </text>
      <path d="M70 56H88M82 50l6 6l-6 6" style={ACC} />
      <path d="M118 82C118 104 42 104 42 84M36 90l6 -6l6 6" style={ACC} />
    </Art>
  );
}

export function WarmUpArt() {
  // Lighter sets climbing to the real one.
  return (
    <Art>
      <path d="M16 100H144" />
      <rect x={26} y={80} width={20} height={20} rx={3} opacity={0.6} />
      <rect x={56} y={66} width={20} height={34} rx={3} opacity={0.6} />
      <rect x={86} y={50} width={20} height={50} rx={3} opacity={0.6} />
      <rect x={116} y={26} width={20} height={74} rx={3} style={ACC} />
    </Art>
  );
}

export function DropSetArt() {
  // Heavy, then lighter, then lighter again, straight away.
  return (
    <Art>
      <path d="M16 100H144" />
      <rect x={28} y={26} width={22} height={74} rx={3} />
      <rect x={69} y={50} width={22} height={50} rx={3} />
      <rect x={110} y={70} width={22} height={30} rx={3} />
      <path d="M52 30L64 44M58 44h6v-6" style={ACC} />
      <path d="M93 54L105 66M99 66h6v-6" style={ACC} />
    </Art>
  );
}

export function RestTimerArt() {
  return (
    <Art>
      <circle cx={80} cy={66} r={36} />
      <path d="M80 30A36 36 0 1 1 44 66" strokeWidth={5} style={ACC} />
      <path d="M72 18H88M80 18V30" />
      <path d="M80 66V46" />
      <circle cx={80} cy={66} r={2.5} fill="currentColor" stroke="none" />
    </Art>
  );
}

export function RepsArt() {
  // Count each time you do the move: four and a fifth.
  return (
    <Art>
      <path d="M48 32V88M64 32V88M80 32V88M96 32V88" strokeWidth={4} />
      <path d="M36 82L112 38" strokeWidth={4} style={ACC} />
    </Art>
  );
}

export function SetsArt() {
  // A set is a group of reps; rest between sets.
  const group = (x: number) => (
    <g key={x}>
      <rect x={x} y={40} width={34} height={40} rx={6} style={ACC} />
      <path d={`M${x + 9} 50V70M${x + 15} 50V70M${x + 21} 50V70M${x + 27} 50V70`} />
    </g>
  );
  return (
    <Art>
      {[14, 63, 112].map(group)}
      <path d="M53 60h4M102 60h4" strokeDasharray="1 3" opacity={0.6} />
    </Art>
  );
}
