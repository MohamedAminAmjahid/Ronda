import { Text, View, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { LegalPage, ls } from '../ui/LegalPage'

const EMAIL = 'privacy@darlwar9a.com'

export default function AboutRoute() {
  return (
    <LegalPage title="À propos" onBack={() => router.push('/')}>

      <View style={ls.hero}>
        <Text style={ls.heroTitle}>DAR LWAR9A</Text>
        <Text style={a.tm}>™</Text>
        <Text style={ls.heroSub}>Les jeux de cartes marocains, en ligne.</Text>
      </View>

      <Text style={ls.p}>
        Dar Lwar9a TM (« la maison des cartes ») réunit les grands classiques du
        jeu de cartes marocain dans une seule application moderne : jouez seul
        contre l'ordinateur, ou en ligne contre vos amis et d'autres joueurs.
      </Text>

      <Text style={ls.h2}>Les jeux</Text>

      <View style={ls.card}>
        <Text style={ls.h3}>🃏 Ronda</Text>
        <Text style={ls.p}>
          Un classique méditerranéen joué avec 40 cartes espagnoles. Capturez les
          cartes de la table en jouant une carte de même valeur, enchaînez
          l'« escalier », et déclarez une Ronda ou une Tringa quand vous avez une
          paire ou un brelan en main. Premier à 41 points gagne.
        </Text>
      </View>

      <View style={ls.card}>
        <Text style={ls.h3}>🎴 Di Jouj</Text>
        <Text style={ls.p}>
          Un jeu de défausse rapide et nerveux : débarrassez-vous de toutes vos
          cartes en suivant la couleur ou la valeur. Le 7 d'or est joker, le 2
          fait piocher et l'As saute le tour de l'adversaire. Le premier à vider
          sa main l'emporte.
        </Text>
      </View>

      <Text style={ls.h2}>Un héritage marocain</Text>
      <Text style={ls.p}>
        Ces jeux se transmettent depuis des générations dans les cafés et les
        maisons du Maroc. Notre objectif : préserver cette tradition et la faire
        vivre auprès d'une nouvelle génération, où qu'elle soit dans le monde.
      </Text>

      <Text style={ls.h2}>Télécharger</Text>
      <View style={a.storeRow}>
        <View style={a.storeBadge}><Text style={a.storeTxt}>🍎 App Store — bientôt</Text></View>
        <View style={a.storeBadge}><Text style={a.storeTxt}>🤖 Google Play — bientôt</Text></View>
      </View>

      <Text style={ls.h2}>Contact</Text>
      <Text style={ls.p}>Une question, une idée, un bug ? Écrivez-nous : <Text style={ls.link}>{EMAIL}</Text></Text>
      <Text style={ls.small}>Fait avec ❤️ pour la communauté marocaine du jeu de cartes.</Text>

    </LegalPage>
  )
}

const a = StyleSheet.create({
  tm: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#C9A227', marginTop: -8 },
  storeRow: { gap: 10, marginTop: 10 },
  storeBadge: {
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1, borderColor: 'rgba(201,162,39,0.25)', alignItems: 'center',
  },
  storeTxt: { fontFamily: 'Cairo_600SemiBold', fontSize: 14, color: '#F4ECD8' },
})
