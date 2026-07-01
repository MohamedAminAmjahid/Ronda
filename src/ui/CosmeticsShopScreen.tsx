import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Svg, Polygon } from 'react-native-svg'
import { useI18n } from '../i18n/useI18n'
import { useProfile } from '../profile/useProfile'
import { TABLES, BACKS, type TableDef, type BackDef, type CosmeticKind } from '../cosmetics/catalog'
import { FRAMES, type FrameDef } from '../cosmetics/avatarFrames'
import { AvatarDisplay } from './ProfileScreen'

const C = {
  bg:      '#0D0D1A',
  card:    '#1E1635',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  green:   '#27AE60',
} as const

interface Props {
  onBack: () => void
}

export function CosmeticsShopScreen({ onBack }: Props) {
  const { t } = useI18n()
  const {
    gold, table, ownedTables, cardBack, ownedBacks, avatarFrame, ownedFrames,
    buyCosmetic, equipCosmetic,
  } = useProfile()

  const act = (kind: CosmeticKind, id: string, owned: boolean) => {
    if (owned) equipCosmetic(kind, id)
    else buyCosmetic(kind, id)
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>
        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <View style={s.headerRow}>
            <Text style={s.title}>{t('cosmetics')}</Text>
            <View style={s.goldPill}>
              <Text style={s.goldCoin}>🪙</Text>
              <Text style={s.goldAmount}>{gold}</Text>
            </View>
          </View>
        </View>

        <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

          {/* ── Cadres d'avatar ── */}
          <Text style={s.sectionLabel}>{t('avatarFrames')}</Text>
          <View style={s.grid}>
            {FRAMES.map((item) => (
              <FrameItem
                key={item.id}
                item={item}
                owned={ownedFrames.includes(item.id)}
                active={avatarFrame === item.id}
                canAfford={gold >= item.price}
                name={t(item.nameKey)}
                buyLbl={t('buy')}
                equipLbl={t('equip')}
                equippedLbl={t('equipped')}
                onPress={(owned) => act('frame', item.id, owned)}
              />
            ))}
          </View>

          {/* ── Tapis de jeu ── */}
          <Text style={s.sectionLabel}>{t('tables')}</Text>
          <View style={s.grid}>
            {TABLES.map((item) => (
              <TableItem
                key={item.id}
                item={item}
                owned={ownedTables.includes(item.id)}
                active={table === item.id}
                canAfford={gold >= item.price}
                name={t(item.nameKey)}
                buyLbl={t('buy')}
                equipLbl={t('equip')}
                equippedLbl={t('equipped')}
                onPress={(owned) => act('table', item.id, owned)}
              />
            ))}
          </View>

          {/* ── Dos de cartes ── */}
          <Text style={s.sectionLabel}>{t('cardBacks')}</Text>
          <View style={s.grid}>
            {BACKS.map((item) => (
              <BackItem
                key={item.id}
                item={item}
                owned={ownedBacks.includes(item.id)}
                active={cardBack === item.id}
                canAfford={gold >= item.price}
                name={t(item.nameKey)}
                buyLbl={t('buy')}
                equipLbl={t('equip')}
                equippedLbl={t('equipped')}
                onPress={(owned) => act('back', item.id, owned)}
              />
            ))}
          </View>

        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

// ── Item tapis ──────────────────────────────────────────────────────────────

interface ItemCommon {
  owned: boolean
  active: boolean
  canAfford: boolean
  name: string
  buyLbl: string
  equipLbl: string
  equippedLbl: string
  onPress: (owned: boolean) => void
}

function TableItem({ item, ...p }: ItemCommon & { item: TableDef }) {
  return (
    <View style={[s.item, p.active && s.itemActive]}>
      <LinearGradient colors={item.colors} style={s.preview} />
      <Text style={s.itemName}>{p.name}</Text>
      <ActionRow price={item.price} {...p} />
    </View>
  )
}

function FrameItem({ item, ...p }: ItemCommon & { item: FrameDef }) {
  return (
    <View style={[s.item, p.active && s.itemActive]}>
      <View style={s.framePreview}>
        <AvatarDisplay type="initial" initial="DL" emoji="" image="" size={52} frame={item.id} />
      </View>
      <Text style={s.itemName}>{p.name}</Text>
      <ActionRow price={item.price} {...p} />
    </View>
  )
}

function BackItem({ item, ...p }: ItemCommon & { item: BackDef }) {
  return (
    <View style={[s.item, p.active && s.itemActive]}>
      <View style={[s.preview, { backgroundColor: item.bg, borderWidth: 2, borderColor: item.border, alignItems: 'center', justifyContent: 'center' }]}>
        <Svg width={38} height={38} viewBox="0 0 28 28">
          <Polygon
            points="14,4 15.7,9.8 21.1,6.9 18.2,12.3 24,14 18.2,15.7 21.1,21.1 15.7,18.2 14,24 12.3,18.2 6.9,21.1 9.8,15.7 4,14 9.8,12.3 6.9,6.9 12.3,9.8"
            fill={item.star}
          />
        </Svg>
      </View>
      <Text style={s.itemName}>{p.name}</Text>
      <ActionRow price={item.price} {...p} />
    </View>
  )
}

function ActionRow({ price, owned, active, canAfford, buyLbl, equipLbl, equippedLbl, onPress }:
  ItemCommon & { price: number }) {
  if (active) {
    return <View style={[s.btn, s.btnActive]}><Text style={s.btnActiveTxt}>✓ {equippedLbl}</Text></View>
  }
  if (owned) {
    return (
      <TouchableOpacity style={[s.btn, s.btnEquip]} onPress={() => onPress(true)} activeOpacity={0.85}>
        <Text style={s.btnEquipTxt}>{equipLbl}</Text>
      </TouchableOpacity>
    )
  }
  return (
    <TouchableOpacity
      style={[s.btn, s.btnBuy, !canAfford && s.btnDisabled]}
      onPress={() => canAfford && onPress(false)}
      disabled={!canAfford}
      activeOpacity={0.85}
    >
      <Text style={[s.btnBuyTxt, !canAfford && s.btnDisabledTxt]}>🪙 {price}</Text>
      <Text style={[s.btnBuySub, !canAfford && s.btnDisabledTxt]}>{buyLbl}</Text>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: C.bg, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 460, paddingHorizontal: 18 },

  header:    { paddingTop: 16, paddingBottom: 8, gap: 8 },
  backBtn:   { alignSelf: 'flex-start', paddingVertical: 6 },
  backTxt:   { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:     { fontFamily: 'Cairo_600SemiBold', fontSize: 24, color: C.bone, letterSpacing: 1, textTransform: 'uppercase' },
  goldPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(201,162,39,0.35)',
  },
  goldCoin:   { fontSize: 14 },
  goldAmount: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },

  body: { paddingVertical: 12, gap: 12, paddingBottom: 32 },
  sectionLabel: {
    fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff,
    letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 8, marginLeft: 2,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  item: {
    width: '47%', backgroundColor: C.card, borderRadius: 14, padding: 12, gap: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(201,162,39,0.12)',
  },
  itemActive: { borderColor: C.brass },
  preview: { width: '100%', height: 76, borderRadius: 10 },
  framePreview: { width: '100%', height: 76, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.bone },

  btn: { width: '100%', borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  btnBuy: { backgroundColor: C.brass },
  btnBuyTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.ink },
  btnBuySub: { fontFamily: 'Cairo_400Regular', fontSize: 10, color: 'rgba(28,38,34,0.65)', textTransform: 'uppercase', letterSpacing: 0.5 },
  btnEquip: { borderWidth: 1.5, borderColor: C.brass, backgroundColor: 'rgba(201,162,39,0.10)' },
  btnEquipTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: C.brass },
  btnActive: { backgroundColor: 'rgba(39,174,96,0.15)', borderWidth: 1, borderColor: 'rgba(39,174,96,0.45)' },
  btnActiveTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.green },
  btnDisabled: { backgroundColor: 'rgba(244,236,216,0.10)' },
  btnDisabledTxt: { color: 'rgba(244,236,216,0.4)' },
})
