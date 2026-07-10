import { router } from 'expo-router'
import { removeGold } from '../profile/profile'
import { connectChallengeRoom } from './store'
import { connectDiJoujChallengeRoom } from './storeDiJouj'
import type { ChallengeDoc } from '../firebase/firestore'

/**
 * Rejoint la partie d'un défi accepté (roomCode déjà assigné par
 * acceptChallenge) — appelée à la fois par l'accepteur juste après avoir
 * tapé « Accepter » et par l'auteur du défi quand il tape « Rejoindre » dans
 * la liste « Défis en attente » de FriendsScreen. `asCreator` (déterministe :
 * fromUid crée toujours) est calculé ici une seule fois pour les deux appelants,
 * évitant qu'ils ne dérivent le rôle différemment par erreur.
 */
export async function joinChallengeMatch(
  challenge: ChallengeDoc, myUid: string, username: string,
): Promise<void> {
  const asCreator = challenge.fromUid === myUid
  if (!challenge.roomCode) throw new Error('no_room_code')
  if (challenge.stake > 0) removeGold(challenge.stake)
  if (challenge.game === 'dijouj') {
    await connectDiJoujChallengeRoom(username, challenge.roomCode, challenge.id, asCreator, challenge.stake)
    router.push('/dijouj-online' as never)
  } else {
    await connectChallengeRoom(username, challenge.roomCode, challenge.id, asCreator, challenge.stake, myUid)
    router.push('/online' as never)
  }
}
