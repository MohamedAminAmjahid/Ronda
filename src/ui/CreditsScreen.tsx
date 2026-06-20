import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  surface: 'rgba(0,0,0,0.18)',
} as const

interface Props {
  onBack: () => void
}

export function CreditsScreen({ onBack }: Props) {
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>← Menu</Text>
          </TouchableOpacity>
          <Text style={s.title}>Crédits</Text>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

          <Section title="Cartes espagnoles">
            <CreditRow
              label="Artiste"
              value="gjenkins20"
            />
            <CreditRow
              label="Dépôt"
              value="spanish-playing-cards-svg"
              link="https://github.com/gjenkins20/spanish-playing-cards-svg"
            />
            <CreditRow
              label="Licence"
              value="Creative Commons BY-SA 3.0"
            />
            <Text style={s.licenceNote}>
              Les cartes ont été recolorées dans la palette visuelle du jeu.
              Toute redistribution doit conserver cette mention et la licence CC BY-SA 3.0.
            </Text>
          </Section>

          <Section title="Polices">
            <CreditRow label="Reem Kufi"  value="Google Fonts / Khaled Hosny — OFL" />
            <CreditRow label="Cairo"      value="Google Fonts / Mohamed Gaber — OFL" />
          </Section>

          <Section title="Sons">
            <CreditRow label="Effets"   value="Générés procéduralement pour le jeu" />
            <CreditRow label="Auteur"   value="Projet Ronda" />
            <CreditRow label="Licence"  value="Domaine public (CC0)" />
            <Text style={s.licenceNote}>
              Les effets sonores (distribution, pose, capture, annonces, Mab9ach) sont
              synthétisés et libres de droits. Ils peuvent être remplacés par des sons
              tiers — pensez alors à reporter ici l'auteur et la licence de chaque source.
            </Text>
          </Section>

          <Section title="Application">
            <CreditRow label="Moteur"    value="TypeScript pur — fonctions pures" />
            <CreditRow label="UI"        value="Expo + React Native" />
            <CreditRow label="Version"   value="1.0 — solo vs IA" />
          </Section>

          <Section title="Développeur">
            <CreditRow
              label="Auteur"
              value="Amjahid Mohamed Amin"
              link="https://www.linkedin.com/in/amjahid-mohamed-amin"
            />
          </Section>

        </ScrollView>

      </View>
    </SafeAreaView>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionBody}>{children}</View>
    </View>
  )
}

function CreditRow({ label, value, link }: { label: string; value: string; link?: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      {link ? (
        <TouchableOpacity onPress={() => Linking.openURL(link)}>
          <Text style={[s.rowValue, s.rowLink]}>{value}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={s.rowValue}>{value}</Text>
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.table,
    alignItems: 'center',
  },
  column: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 16,
    paddingBottom: 24,
    alignItems: 'center',
    gap: 6,
  },
  backBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
    marginBottom: 4,
  },
  backTxt: {
    fontFamily: 'Cairo_400Regular',
    color: C.boneOff,
    fontSize: 13,
    letterSpacing: 0.5,
  },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 26,
    color: C.bone,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 20,
    paddingBottom: 32,
  },
  section: {
    backgroundColor: C.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(201,162,39,0.12)',
    overflow: 'hidden',
  },
  sectionTitle: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 11,
    color: C.brass,
    letterSpacing: 2,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(201,162,39,0.1)',
  },
  sectionBody: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(244,236,216,0.06)',
    gap: 12,
  },
  rowLabel: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.boneOff,
    flex: 1,
  },
  rowValue: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 13,
    color: C.bone,
    textAlign: 'right',
    flex: 2,
  },
  rowLink: {
    color: C.brass,
    textDecorationLine: 'underline',
  },
  licenceNote: {
    fontFamily: 'Cairo_400Regular',
    fontSize: 11,
    color: C.boneOff,
    lineHeight: 17,
    paddingVertical: 10,
    opacity: 0.8,
  },
})
