import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { LegalPage, ls } from '../ui/LegalPage'

const EMAIL = 'privacy@darlwar9a.com'

export default function TermsRoute() {
  return (
    <LegalPage title="Conditions" onBack={() => router.push('/')}>

      <Text style={ls.h2}>Conditions d'utilisation</Text>
      <Text style={ls.small}>Dar Lwar9a TM — dernière mise à jour : 2026</Text>

      <Text style={ls.h3}>Le service</Text>
      <Text style={ls.p}>
        Dar Lwar9a TM propose des jeux de cartes marocains en ligne (Ronda et
        Di Jouj), jouables contre l'ordinateur ou d'autres joueurs.
      </Text>

      <Text style={ls.h3}>Âge minimum</Text>
      <Text style={ls.p}>
        Vous devez avoir au moins 13 ans pour utiliser l'application. Les mineurs
        doivent obtenir l'accord d'un parent ou tuteur.
      </Text>

      <Text style={ls.h3}>Règles de conduite</Text>
      <Text style={ls.bullet}>• Pas de triche, d'exploitation de bugs ni de logiciels tiers.</Text>
      <Text style={ls.bullet}>• Pas d'abus, de harcèlement ni de propos haineux envers les autres joueurs.</Text>
      <Text style={ls.bullet}>• Pas d'usurpation d'identité ni de pseudo offensant.</Text>

      <Text style={ls.h3}>Monnaie virtuelle (or)</Text>
      <Text style={ls.p}>
        L'or est une monnaie virtuelle utilisable uniquement dans l'application.
        Il n'a aucune valeur réelle, n'est pas échangeable contre de l'argent et
        n'est pas remboursable, sauf obligation légale contraire.
      </Text>

      <Text style={ls.h3}>Suspension de compte</Text>
      <Text style={ls.p}>
        Nous pouvons suspendre ou supprimer un compte en cas de violation de ces
        conditions, sans préavis et sans remboursement de l'or restant.
      </Text>

      <Text style={ls.h3}>Limitation de responsabilité</Text>
      <Text style={ls.p}>
        Le service est fourni « tel quel », sans garantie de disponibilité
        continue. Nous ne saurions être tenus responsables des pertes de données,
        d'or virtuel ou d'interruptions de service.
      </Text>

      <Text style={ls.h3}>Contact</Text>
      <Text style={ls.p}><Text style={ls.link}>{EMAIL}</Text></Text>

      <View style={ls.divider} />

      {/* Résumé arabe / anglais */}
      <Text style={[ls.h3, ls.rtl]}>ملخص</Text>
      <Text style={[ls.p, ls.rtl]}>
        الحد الأدنى للسن 13 سنة. ممنوع الغش أو الإساءة. الذهب عملة افتراضية غير
        قابلة للاسترداد. يمكن تعليق الحساب عند مخالفة الشروط. الخدمة مقدَّمة «كما هي».
      </Text>
      <Text style={ls.h3}>Summary</Text>
      <Text style={ls.p}>
        Minimum age 13. No cheating or abuse. Gold is virtual and non-refundable.
        Accounts may be suspended for violations. The service is provided “as is”.
      </Text>

    </LegalPage>
  )
}
