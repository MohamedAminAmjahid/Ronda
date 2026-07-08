import { Text, View } from 'react-native'
import { router } from 'expo-router'
import { LegalPage, ls } from '../ui/LegalPage'

const EMAIL = 'privacy@darlwar9a.com'

export default function PrivacyRoute() {
  return (
    <LegalPage title="Confidentialité" onBack={() => router.push('/')}>

      {/* ── Français ── */}
      <Text style={ls.h2}>Politique de confidentialité</Text>
      <Text style={ls.small}>Dar Lwar9a TM — dernière mise à jour : 2026</Text>

      <Text style={ls.h3}>Données que nous collectons</Text>
      <Text style={ls.p}>
        Lorsque vous vous connectez via Google Sign-In, nous recevons votre adresse
        e-mail et votre nom. Vous choisissez ensuite un pseudo public. Nous
        collectons également vos statistiques de jeu (parties jouées, gagnées,
        niveau, or virtuel) et votre avatar.
      </Text>

      <Text style={ls.h3}>Utilisation des données</Text>
      <Text style={ls.bullet}>• Faire fonctionner le jeu et sauvegarder votre progression.</Text>
      <Text style={ls.bullet}>• Afficher les classements et les statistiques publiques.</Text>
      <Text style={ls.bullet}>• Gérer les amis, invitations et messages privés.</Text>

      <Text style={ls.h3}>Stockage</Text>
      <Text style={ls.p}>
        Vos données sont stockées de façon sécurisée sur Firebase Firestore
        (Google Cloud). Nous ne vendons ni ne louons vos données personnelles.
      </Text>

      <Text style={ls.h3}>Paiements</Text>
      <Text style={ls.p}>
        Les achats d'or sont traités par Stripe. Vos informations de carte
        bancaire sont gérées directement par Stripe et ne sont jamais stockées
        sur nos serveurs.
      </Text>

      <Text style={ls.h3}>Vos droits</Text>
      <Text style={ls.p}>
        Vous pouvez demander la suppression de votre compte et de toutes vos
        données à tout moment, depuis votre profil ou en nous contactant. La
        suppression est définitive.
      </Text>

      <Text style={ls.h3}>Contact</Text>
      <Text style={ls.p}>Pour toute question : <Text style={ls.link}>{EMAIL}</Text></Text>

      <View style={ls.divider} />

      {/* ── العربية ── */}
      <Text style={[ls.h2, ls.rtl]}>سياسة الخصوصية</Text>
      <Text style={[ls.p, ls.rtl]}>
        عند تسجيل الدخول عبر Google، نتلقى بريدك الإلكتروني واسمك، ثم تختار اسمًا
        مستعارًا. نجمع أيضًا إحصائيات لعبك (المباريات، المستوى، الذهب الافتراضي)
        وصورتك الرمزية. تُستعمل البيانات لتشغيل اللعبة، الترتيب، والأصدقاء.
      </Text>
      <Text style={[ls.p, ls.rtl]}>
        تُخزَّن بياناتك بأمان على Firebase Firestore. تُعالَج المدفوعات عبر Stripe
        ولا تُخزَّن معلومات بطاقتك على خوادمنا أبدًا. يمكنك طلب حذف حسابك في أي وقت.
        للتواصل: {EMAIL}
      </Text>

      <View style={ls.divider} />

      {/* ── English ── */}
      <Text style={ls.h2}>Privacy Policy</Text>
      <Text style={ls.p}>
        When you sign in with Google we receive your email and name; you then pick
        a public nickname. We also collect gameplay stats (games, level, virtual
        gold) and your avatar. Data is used to run the game, rankings and friends.
      </Text>
      <Text style={ls.p}>
        Your data is stored securely on Firebase Firestore. Payments are processed
        by Stripe — your card details are never stored on our servers. You can
        request account deletion at any time. Contact: {EMAIL}
      </Text>

    </LegalPage>
  )
}
