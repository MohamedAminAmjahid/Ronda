import { View, Text, StyleSheet, type ViewStyle, type StyleProp } from 'react-native'
import { useProfile } from '../../profile/useProfile'

const BRASS = '#C9A227'

/** Pastille « 🪙 N » affichant la balance Gold du profil. */
export function GoldBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  const { gold } = useProfile()
  return (
    <View style={[s.badge, style]}>
      <Text style={s.coin}>🪙</Text>
      <Text style={s.amount}>{gold}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.35)',
  },
  coin: { fontSize: 13 },
  amount: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: BRASS },
})
