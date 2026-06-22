import { memo } from 'react'
import { View, Image, TouchableOpacity, StyleSheet } from 'react-native'
import { Svg, Polygon } from 'react-native-svg'
import type { Card as CardType } from '../../engine/types'
import { getCardImage } from '../assets/cards'

// ── Tailles ──────────────────────────────────────────────────────────────────

export type CardSize = 'sm' | 'md' | 'lg'

const DIM = {
  sm: { w: 46, h: 69  },
  md: { w: 58, h: 87  },
  lg: { w: 72, h: 108 },
} as const

// ── Face de carte ─────────────────────────────────────────────────────────────

export type CardFaceProps = {
  card:        CardType
  size?:       CardSize
  selected?:   boolean
  highlighted?: boolean
  onPress?:    () => void
  disabled?:   boolean
}

export const CardFace = memo(function CardFace({
  card,
  size = 'lg',
  selected    = false,
  highlighted = false,
  onPress,
  disabled    = false,
}: CardFaceProps) {
  const dim  = DIM[size]
  const img  = getCardImage(card.suit, card.value)

  const face = (
    <View
      style={[
        styles.cardWrap,
        { width: dim.w, height: dim.h },
        selected    && styles.selectedBorder,
        highlighted && styles.highlightedBorder,
      ]}
    >
      {img && (
        <Image
          source={img}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
        />
      )}
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
})

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

export const CardBack = memo(function CardBack({ size = 'lg' }: { size?: CardSize }) {
  const dim    = DIM[size]
  const starSz = Math.round(dim.w * 0.6)
  return (
    <View style={[styles.back, { width: dim.w, height: dim.h }]}>
      <KhatamStar size={starSz} />
    </View>
  )
})

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  cardWrap: {
    borderRadius:    5,
    overflow:        'hidden',
    backgroundColor: '#F4ECD8',   // fond os : jamais de bande verte visible
    shadowColor:   '#1C2622',
    shadowOffset:  { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius:  6,
    elevation:     5,
  },
  selectedBorder: {
    borderWidth:  2,
    borderColor:  '#C9A227',
    shadowColor:  '#C9A227',
    shadowOpacity: 0.5,
    shadowRadius:  6,
    elevation:    8,
  },
  highlightedBorder: {
    borderWidth:   2.5,
    borderColor:   '#C9A227',
    shadowColor:   '#C9A227',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius:  10,
    elevation:     10,
  },
  lifted: {
    transform: [{ translateY: -10 }],
  },
  back: {
    backgroundColor: '#09402F',
    borderRadius:    5,
    borderWidth:     1.5,
    borderColor:     '#C9A227',
    alignItems:      'center',
    justifyContent:  'center',
    shadowColor:     '#1C2622',
    shadowOffset:    { width: 0, height: 3 },
    shadowOpacity:   0.4,
    shadowRadius:    6,
    elevation:       5,
  },
})
