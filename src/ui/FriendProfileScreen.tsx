import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams } from 'expo-router'
import { PlayerProfileContent } from './PlayerProfileContent'
import { useI18n } from '../i18n/useI18n'

const C = {
  table:   '#0E5C4A',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  boneOff: 'rgba(244,236,216,0.45)',
} as const

interface Props {
  onBack: () => void
}

export function FriendProfileScreen({ onBack }: Props) {
  const { t } = useI18n()
  const { uid, name } = useLocalSearchParams<{ uid?: string; name?: string }>()

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{t('friendProfile')}</Text>
        </View>

        <PlayerProfileContent uid={uid} name={name} />
      </View>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 18 },

  header: { paddingTop: 16, paddingBottom: 8, alignItems: 'center', gap: 6 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  title: { fontFamily: 'Cairo_600SemiBold', fontSize: 22, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },
})
