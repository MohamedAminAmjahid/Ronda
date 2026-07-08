import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { TERMS } from './terms'
import { useI18n } from '../i18n/useI18n'

const C = {
  table:   '#0E5C4A',
  deep:    '#09402F',
  brass:   '#C9A227',
  clay:    '#B5532A',
  bone:    '#F4ECD8',
  ink:     '#1C2622',
  boneOff: 'rgba(244,236,216,0.45)',
  surface: 'rgba(0,0,0,0.18)',
} as const

interface Props {
  onBack: () => void
}

export function RulesScreen({ onBack }: Props) {
  const { t, lang } = useI18n()
  const isFr = lang === 'fr'
  const [game, setGame] = useState<'ronda' | 'dijouj'>('ronda')

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.column}>

        <View style={s.header}>
          <TouchableOpacity onPress={onBack} style={s.backBtn}>
            <Text style={s.backTxt}>{t('back')}</Text>
          </TouchableOpacity>
          <Text style={s.title}>{t('rules')}</Text>
          <Text style={s.subtitle}>{game === 'ronda' ? t('rulesSubtitle') : t('dijoujCardDesc')}</Text>

          <View style={s.gameTabs}>
            <TouchableOpacity
              style={[s.gameTab, game === 'ronda' && s.gameTabActive]}
              onPress={() => setGame('ronda')}
            >
              <Text style={[s.gameTabTxt, game === 'ronda' && s.gameTabTxtActive]}>Ronda</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.gameTab, game === 'dijouj' && s.gameTabActive]}
              onPress={() => setGame('dijouj')}
            >
              <Text style={[s.gameTabTxt, game === 'dijouj' && s.gameTabTxtActive]}>Di Jouj</Text>
            </TouchableOpacity>
          </View>
        </View>

        {game === 'dijouj' ? (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

          <Section title={t('rulesDijoujSec1')}>
            <P>{t('rulesDijoujGame1')}</P>
          </Section>

          <Section title={t('rulesDijoujSec2')}>
            <P>{t('rulesDijoujSetup1')}</P>
            <P>{t('rulesDijoujSetup2')}</P>
          </Section>

          <Section title={t('rulesDijoujSec3')}>
            <P>{t('rulesDijoujPlay1')}</P>
            <P>{t('rulesDijoujPlay2')}</P>
          </Section>

          <Section title={t('rulesDijoujSec4')}>
            <SpecialCard label="2" desc={t('rulesDijoujCard2')} />
            <SpecialCard label={lang === 'en' ? 'Ace' : 'As'} desc={t('rulesDijoujCardAs')} />
            <SpecialCard label="7 Oros" desc={t('rulesDijoujCard7')} />
          </Section>

          <Section title={t('rulesDijoujSec5')}>
            <P>{t('rulesDijoujDraw1')}</P>
            <P>{t('rulesDijoujDraw2')}</P>
          </Section>

          <Section title={t('rulesDijoujSec6')}>
            <P>{t('rulesDijoujWin1')}</P>
            <P>{t('rulesDijoujWin2')}</P>
          </Section>

          <View style={{ height: 8 }} />
        </ScrollView>
        ) : (
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent}>

          <Section title={t('rulesSec1')}>
            {isFr ? (
              <>
                <P>
                  La Ronda se joue avec un jeu espagnol de <B>40 cartes</B>, réparties en
                  <B> 4 couleurs</B> : oros, copas, espadas, bastos.
                </P>
                <P>
                  Les valeurs vont de <B>1 à 7</B>, puis <B>10</B> (Sota), <B>11</B> (Caballo)
                  et <B>12</B> (Rey). Il n'y a ni 8 ni 9.
                </P>
                <P>
                  Au début d'une donne, chaque joueur reçoit 3 cartes et 4 cartes sont posées
                  sur la table.
                </P>
              </>
            ) : (
              <>
                <P>{t('rulesGame1')}</P>
                <P>{t('rulesGame2')}</P>
                <P>{t('rulesGame3')}</P>
              </>
            )}
          </Section>

          <Section title={t('rulesSec2')}>
            {isFr ? (
              <>
                <P>
                  À ton tour, tu poses une carte. Si elle a la <B>même valeur</B> qu'une carte
                  de la table, tu la <B>captures</B> (les deux vont dans ta pile).
                </P>
                <P>
                  Sinon, ta carte reste sur la table. Les joueurs jouent en alternance ; quand
                  les mains sont vides, on redistribue 3 cartes tant qu'il reste de la pioche.
                </P>
              </>
            ) : (
              <>
                <P>{t('rulesTurn1')}</P>
                <P>{t('rulesTurn2')}</P>
              </>
            )}
          </Section>

          <Section title={t('rulesSec3')}>
            {isFr ? (
              <>
                <P>
                  Après avoir capturé une carte, si la valeur <B>consécutive suivante</B> est
                  aussi sur la table, tu la prends — et tu continues tant que la suite s'enchaîne.
                </P>
                <P>
                  L'ordre est <B>1·2·3·4·5·6·7·10·11·12</B> : le <B>7 et le 10 sont consécutifs</B>
                  (il n'y a pas de 8 ni 9). Exemple : poser un 6 peut rafler 6·7·10·11·12 d'un coup.
                </P>
              </>
            ) : (
              <>
                <P>{t('rulesStair1')}</P>
                <P>{t('rulesStair2')}</P>
              </>
            )}
          </Section>

          <Section title={t('rulesSec4')}>
            <Rule term={TERMS.araWahd}    pts="+1"  desc={t('rulesCaida1')} />
            <Rule term={TERMS.araKhamssa} pts="+5"  desc={t('rulesCaida2')} />
            <Rule term={TERMS.ara3achra}  pts="+10" desc={t('rulesCaida3')} />
            <P>{t('rulesCaida4')}</P>
          </Section>

          <Section title={t('rulesSec5')}>
            <Rule term={TERMS.missa} pts="+1" desc={t('rulesMissaDesc')} />
          </Section>

          <Section title={t('rulesSec6')}>
            <Rule term={TERMS.ronda}  pts="+1" desc={t('rulesRondaDesc')} />
            <Rule term={TERMS.tringa} pts="+5" desc={t('rulesTringaDesc')} />
            {isFr ? (
              <P>
                Tu peux <B>déclarer</B> ta combinaison pour marquer les points. Tu peux aussi
                la <B>dissimuler</B> pour piéger l'adversaire — mais si tu joues une de ses cartes
                sans avoir déclaré, tu perds le droit de la déclarer.
              </P>
            ) : (
              <P>{t('rulesCombos1')}</P>
            )}
          </Section>

          <Section title={t('rulesSec7')}>
            {isFr ? (
              <P>
                Si tu soupçonnes l'adversaire d'avoir dissimulé une ronda, tu peux la
                <B> contester</B>. Si l'accusation est juste, tu marques à sa place ; sinon
                tu es pénalisé.
              </P>
            ) : (
              <P>{t('rulesContre1')}</P>
            )}
          </Section>

          <Section title={t('rulesSec8')}>
            <View style={s.ruleHead}>
              <Text style={s.ruleAr}>{TERMS.mab9ach.ar}</Text>
              <Text style={s.ruleLa}>{TERMS.mab9ach.la}</Text>
            </View>
            {isFr ? (
              <P>
                Quand la pioche est épuisée, on joue la <B>dernière redistribution</B>. Le
                <B> donneur</B> reçoit un bonus selon sa dernière prise de la partie :
              </P>
            ) : (
              <P>{t('rulesMab1')}</P>
            )}
            <Bonus sign="+5" color={C.brass} label={t('rulesMabBonus1')} />
            <Bonus sign="−5" color={C.clay}  label={t('rulesMabBonus2')} />
            <Bonus sign="+5" color={C.brass} label={t('rulesMabBonus3')} />
            <P>{t('rulesMab2')}</P>
          </Section>

          <Section title={t('rulesSec9')}>
            {isFr ? (
              <>
                <P>
                  En fin de donne, on compte les cartes capturées : <B>+1 point par carte
                  au-dessus de 20</B>. À 20–20, personne ne marque sur ce décompte.
                </P>
                <P>
                  Les scores s'accumulent de donne en donne. Le <B>premier à 41 points</B>
                  remporte la partie.
                </P>
              </>
            ) : (
              <>
                <P>{t('rulesScore1')}</P>
                <P>{t('rulesScore2')}</P>
              </>
            )}
          </Section>

          <View style={{ height: 8 }} />
        </ScrollView>
        )}

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

function P({ children }: { children: React.ReactNode }) {
  return <Text style={s.p}>{children}</Text>
}

function B({ children }: { children: React.ReactNode }) {
  return <Text style={s.b}>{children}</Text>
}

function Rule({ term, pts, desc }: { term: { ar: string; la: string }; pts: string; desc: string }) {
  return (
    <View style={s.rule}>
      <View style={s.ruleHead}>
        <Text style={s.ruleAr}>{term.ar}</Text>
        <Text style={s.ruleLa}>{term.la}</Text>
        <Text style={s.rulePts}>{pts}</Text>
      </View>
      <Text style={s.ruleDesc}>{desc}</Text>
    </View>
  )
}

function Bonus({ sign, color, label }: { sign: string; color: string; label: string }) {
  return (
    <View style={s.bonus}>
      <Text style={[s.bonusSign, { color }]}>{sign}</Text>
      <Text style={s.bonusLabel}>{label}</Text>
    </View>
  )
}

function SpecialCard({ label, desc }: { label: string; desc: string }) {
  return (
    <View style={s.rule}>
      <Text style={s.cardLabel}>{label}</Text>
      <Text style={s.ruleDesc}>{desc}</Text>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.table, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 430, paddingHorizontal: 24 },

  header: { paddingTop: 16, paddingBottom: 20, alignItems: 'center', gap: 4 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 6, marginBottom: 4 },
  backTxt: { fontFamily: 'Cairo_400Regular', color: C.boneOff, fontSize: 13, letterSpacing: 0.5 },
  title: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 26,
    color: C.bone,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtitle: { fontFamily: 'Cairo_400Regular', fontSize: 12, color: C.boneOff, letterSpacing: 0.5 },

  gameTabs: { flexDirection: 'row', gap: 8, marginTop: 14 },
  gameTab: {
    paddingHorizontal: 18, paddingVertical: 8, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.2)', borderWidth: 1, borderColor: 'rgba(244,236,216,0.12)',
  },
  gameTabActive: { backgroundColor: C.brass, borderColor: C.brass },
  gameTabTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 13, color: C.boneOff },
  gameTabTxtActive: { color: C.ink },

  scroll: { flex: 1 },
  scrollContent: { gap: 16, paddingBottom: 32 },

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
  sectionBody: { paddingHorizontal: 16, paddingVertical: 12, gap: 10 },

  p: { fontFamily: 'Cairo_400Regular', fontSize: 13.5, color: C.bone, lineHeight: 21, opacity: 0.92 },
  b: { fontFamily: 'Cairo_600SemiBold', color: C.bone },

  rule: { gap: 4 },
  ruleHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleAr: { fontFamily: 'ReemKufi_700Bold', fontSize: 20, color: C.brass },
  ruleLa: {
    fontFamily: 'Cairo_600SemiBold',
    fontSize: 13,
    color: C.bone,
    letterSpacing: 0.5,
    flex: 1,
  },
  rulePts: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass },
  ruleDesc: { fontFamily: 'Cairo_400Regular', fontSize: 12.5, color: C.boneOff, lineHeight: 19 },
  cardLabel: { fontFamily: 'Cairo_600SemiBold', fontSize: 15, color: C.brass, letterSpacing: 0.3 },

  bonus: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bonusSign: { fontFamily: 'Cairo_600SemiBold', fontSize: 16, width: 34 },
  bonusLabel: { fontFamily: 'Cairo_400Regular', fontSize: 12.5, color: C.boneOff, flex: 1, lineHeight: 18 },
})
