import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Svg, Circle, Rect, Path, Polygon } from 'react-native-svg'
import type { Card as CardType, Suit } from '../../engine/types'

// ── Tailles ──────────────────────────────────────────────────────────────────

export type CardSize = 'sm' | 'md' | 'lg'

const DIM = {
  sm: { w: 46, h: 69,  valueFs: 10, pipSz: 22, figFs: 15, figLetFs: 6,  badgeSz: 8  },
  md: { w: 58, h: 87,  valueFs: 11, pipSz: 30, figFs: 20, figLetFs: 8,  badgeSz: 9  },
  lg: { w: 72, h: 108, valueFs: 12, pipSz: 38, figFs: 26, figLetFs: 10, badgeSz: 10 },
} as const

// ── Couleurs des couleurs (suits) ─────────────────────────────────────────────

const SUIT_COLOR: Record<Suit, string> = {
  oros:    '#C9A227',
  copas:   '#1C2622',
  espadas: '#1C2622',
  bastos:  '#1C2622',
}

// Lettre décorative des figures
const FIG_LETTER: Partial<Record<number, string>> = { 10: 'S', 11: 'C', 12: 'R' }

// ── SVG pips de couleur ───────────────────────────────────────────────────────

function SuitPip({ suit, size }: { suit: Suit; size: number }) {
  const c = SUIT_COLOR[suit]
  switch (suit) {
    case 'oros':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="12" r="10" stroke={c} strokeWidth="1.5" fill="none" />
          <Circle cx="12" cy="12" r="5.5" stroke={c} strokeWidth="1.5" fill="none" />
          <Circle cx="12" cy="12" r="2.2" fill={c} />
        </Svg>
      )
    case 'copas':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4,4 H20 L16.5,13 Q12,18 7.5,13 Z" fill={c} />
          <Rect x="10.5" y="13" width="3" height="5" fill={c} />
          <Rect x="7" y="18" width="10" height="2" rx="1" fill={c} />
        </Svg>
      )
    case 'espadas':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Polygon points="12,2 10.5,13 13.5,13" fill={c} />
          <Rect x="8" y="13" width="8" height="1.5" rx="0.75" fill={c} />
          <Rect x="11" y="14.5" width="2" height="5" fill={c} />
          <Circle cx="12" cy="21" r="1.5" fill={c} />
        </Svg>
      )
    case 'bastos':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x="3" y="5"    width="18" height="3.5" rx="1.75" fill={c} />
          <Rect x="3" y="10.5" width="18" height="3.5" rx="1.75" fill={c} />
          <Rect x="3" y="16"   width="18" height="3.5" rx="1.75" fill={c} />
        </Svg>
      )
  }
}

// ── Petit pip de coin ─────────────────────────────────────────────────────────

function CornerPip({ suit, sz }: { suit: Suit; sz: number }) {
  return <SuitPip suit={suit} size={sz} />
}

// ── Coin (valeur + petit pip) ─────────────────────────────────────────────────

function Corner({ card, dim }: { card: CardType; dim: (typeof DIM)[CardSize] }) {
  return (
    <View style={styles.corner}>
      <Text style={[styles.cornerVal, { fontSize: dim.valueFs }]}>{card.value}</Text>
      <CornerPip suit={card.suit} sz={dim.badgeSz} />
    </View>
  )
}

// ── Face de carte ─────────────────────────────────────────────────────────────

export type CardFaceProps = {
  card: CardType
  size?: CardSize
  selected?: boolean
  /** Dernier coup posé sur la table — contour laiton + halo doré. */
  highlighted?: boolean
  onPress?: () => void
  disabled?: boolean
}

export function CardFace({
  card,
  size = 'lg',
  selected = false,
  highlighted = false,
  onPress,
  disabled = false,
}: CardFaceProps) {
  const dim = DIM[size]
  const isFigure = card.value >= 10
  const figLetter = FIG_LETTER[card.value]

  const face = (
    <View
      style={[
        styles.card,
        styles.face,
        { width: dim.w, height: dim.h },
        selected     && styles.selectedBorder,
        highlighted  && styles.highlightedBorder,
      ]}
    >
      {/* coin haut-gauche */}
      <View style={styles.tl}>
        <Corner card={card} dim={dim} />
      </View>

      {/* zone centrale */}
      <View style={styles.center}>
        {isFigure ? (
          <>
            <Text style={[styles.figNum, { fontSize: dim.figFs, lineHeight: dim.figFs + 6 }]}>
              {card.value}
            </Text>
            <View style={styles.figLine} />
            <Text style={[styles.figLetter, { fontSize: dim.figLetFs }]}>
              {figLetter}
            </Text>
          </>
        ) : (
          <SuitPip suit={card.suit} size={dim.pipSz} />
        )}
      </View>

      {/* coin bas-droit (retourné) */}
      <View style={[styles.br, styles.rot180]}>
        <Corner card={card} dim={dim} />
      </View>
    </View>
  )

  if (onPress && !disabled) {
    return (
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.7}
        style={selected ? styles.lifted : undefined}
      >
        {face}
      </TouchableOpacity>
    )
  }
  return face
}

// ── Dos de carte (khatam) ────────────────────────────────────────────────────

function KhatamStar({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      <Polygon
        points="14,4 15.7,9.8 21.1,6.9 18.2,12.3 24,14 18.2,15.7 21.1,21.1 15.7,18.2 14,24 12.3,18.2 6.9,21.1 9.8,15.7 4,14 9.8,12.3 6.9,6.9 12.3,9.8"
        fill="#C9A227"
      />
    </Svg>
  )
}

export function CardBack({ size = 'lg' }: { size?: CardSize }) {
  const dim = DIM[size]
  // Star size ~60% of card width, capped so it fits
  const starSz = Math.round(dim.w * 0.6)
  return (
    <View style={[styles.card, styles.back, { width: dim.w, height: dim.h }]}>
      <KhatamStar size={starSz} />
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    borderRadius: 7,
    shadowColor: '#1C2622',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  face: {
    backgroundColor: '#F4ECD8',
    borderWidth: 1.5,
    borderColor: '#1C2622',
    overflow: 'hidden',
  },
  back: {
    backgroundColor: '#09402F',
    borderWidth: 1.5,
    borderColor: '#C9A227',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBorder: {
    borderColor: '#C9A227',
    borderWidth: 2,
  },
  // Dernier coup posé sur la table : contour laiton épais + halo doré
  highlightedBorder: {
    borderColor: '#C9A227',
    borderWidth: 2.5,
    shadowColor: '#C9A227',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.75,
    shadowRadius: 8,
    elevation: 10,
  },
  lifted: {
    transform: [{ translateY: -10 }],
  },
  tl:      { position: 'absolute', top: 5, left: 6 },
  br:      { position: 'absolute', bottom: 5, right: 6 },
  rot180:  { transform: [{ rotate: '180deg' }] },
  corner:  { alignItems: 'center', gap: 2 },
  cornerVal: {
    fontWeight: '700',
    color: '#1C2622',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  figNum: {
    fontWeight: '700',
    color: '#1C2622',
  },
  figLine: {
    width: 22,
    height: 1.5,
    backgroundColor: '#C9A227',
    opacity: 0.65,
    marginVertical: 3,
  },
  figLetter: {
    color: '#C9A227',
    letterSpacing: 1.5,
  },
})
