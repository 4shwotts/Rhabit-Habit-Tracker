import { useId } from 'react'

// The pop-up frame shared by the penalty, settings and goal preview modals:
// a rounded outline with four corner pieces and a notch at the top middle.
//
// The corner pieces and notch are translucent glass with a bevelled edge:
// a soft lilac fill that darkens towards the bottom, a bright inner edge along
// the top and a shadowed inner edge along the bottom (the bevel is the shape's
// own outline stroked thickly and clipped to its inside). The frame line is
// masked out underneath them so it doesn't show through the glass. No glow.

// outlines of the corner pieces and the top notch, in the 1100x696 viewBox
const PIECES = [
  'M32.604 6.50708C29.0634 6.5096 25.8174 8.48258 24.183 11.6254L6.63093 45.3795C2.19595 53.9084 11.7735 62.8756 19.9862 57.8838L75.5636 24.1034C83.7763 19.1117 80.2383 6.47367 70.6301 6.48021L32.604 6.50708Z',
  'M1066.56 6.50708C1070.1 6.5096 1073.35 8.48258 1074.98 11.6254L1092.53 45.3795C1096.97 53.9084 1087.39 62.8756 1079.18 57.8838L1023.6 24.1034C1015.39 19.1117 1018.93 6.47367 1028.53 6.48021L1066.56 6.50708Z',
  'M1066.56 685.782C1070.1 685.78 1073.35 683.807 1074.98 680.664L1092.53 646.91C1096.97 638.381 1087.39 629.414 1079.18 634.406L1023.6 668.186C1015.39 673.178 1018.93 685.816 1028.53 685.809L1066.56 685.782Z',
  'M32.604 685.782C29.0634 685.78 25.8174 683.807 24.183 680.664L6.63093 646.91C2.19595 638.381 11.7735 629.414 19.9862 634.406L75.5636 668.186C83.7763 673.178 80.2383 685.816 70.6301 685.809L32.604 685.782Z',
  'M554.132 57.2963C550.991 59.3185 546.954 59.3104 543.819 57.2757L484.785 18.9685C476.84 13.8125 480.498 1.48142 489.967 1.50029L608.144 1.73584C617.613 1.75471 621.236 14.1003 613.276 19.2246L554.132 57.2963Z'
]

function ModalFrame({ className }) {
  // unique ids, so two frames on one page never share gradients or clips
  const id = useId().replace(/:/g, '')
  const fill = `${id}-fill`
  const bevel = `${id}-bevel`
  const mask = `${id}-mask`

  return (
    <svg className={className} viewBox="0 0 1100 696" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        {/* glass body: lighter at the top, deeper towards the bottom */}
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#D6C6FF" stopOpacity="0.34" />
          <stop offset="0.5" stopColor="#916FF1" stopOpacity="0.16" />
          <stop offset="1" stopColor="#24183F" stopOpacity="0.5" />
        </linearGradient>
        {/* bevel: highlight on the top edge fading to shadow on the bottom */}
        <linearGradient id={bevel} x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.6" />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.05" />
          <stop offset="1" stopColor="#0B0814" stopOpacity="0.55" />
        </linearGradient>
        {PIECES.map((d, i) => (
          <clipPath id={`${id}-clip${i}`} key={i}>
            <path d={d} />
          </clipPath>
        ))}
        {/* hides the frame line underneath the glass pieces */}
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="1100" height="696">
          <rect width="1100" height="696" fill="white" />
          {PIECES.map((d, i) => <path key={i} d={d} fill="black" stroke="black" strokeWidth="3" />)}
        </mask>
      </defs>

      <rect
        x="14.3869" y="15.3022" width="1070.09" height="661.091" rx="32.0457"
        fill="#382A60" fillOpacity="0.2" stroke="#916FF1" strokeWidth="3.90864"
        mask={`url(#${mask})`}
      />

      {PIECES.map((d, i) => (
        <g key={i}>
          <path d={d} fill={`url(#${fill})`} />
          <path d={d} fill="none" stroke={`url(#${bevel})`} strokeWidth="7" clipPath={`url(#${id}-clip${i})`} />
          <path d={d} fill="none" stroke="#916FF1" strokeWidth="3" />
        </g>
      ))}
    </svg>
  )
}

export default ModalFrame
