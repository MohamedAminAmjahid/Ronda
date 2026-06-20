import type { Rng } from '../engine/deck'
import { mabqachBonus, cardCountBonus, isGameOver } from '../engine/scoring'
import type { GameState2v2, TeamState } from './types2v2'
import { teamOf } from './types2v2'

/**
 * Décompte de fin de donne 2v2 (port du 1v1, adapté aux équipes) :
 *  - cartes restantes de la table → équipe du dernier joueur ayant capturé,
 *  - bonus Mab9ach sur la dernière prise du donneur → crédité à son équipe,
 *  - bonus de décompte (>20 cartes) par équipe.
 * S'arrête en DEAL_END (l'UI affiche le résultat) ou GAME_OVER (≥ 41).
 *
 * Réutilise les helpers purs du moteur 1v1 (mabqachBonus, cardCountBonus,
 * isGameOver) sans le toucher.
 */
export function applyEndOfDeal2v2(state: GameState2v2, _rng: Rng): GameState2v2 {
  const teamA: TeamState = { ...state.teams[0], captured: [...state.teams[0].captured] }
  const teamB: TeamState = { ...state.teams[1], captured: [...state.teams[1].captured] }
  const teams: [TeamState, TeamState] = [teamA, teamB]

  // 1. Cartes restantes → équipe du dernier captureur
  if (state.lastCapture !== null && state.table.length > 0) {
    const t = teamOf(state.lastCapture.playerId)
    teams[t].captured = [...teams[t].captured, ...state.table]
  }

  // 2. Bonus Mab9ach : sur la dernière prise du donneur, crédité à son équipe
  const dealerCapture =
    state.lastCapture?.playerId === state.dealer ? state.lastCapture.card : null
  teams[teamOf(state.dealer)].score += mabqachBonus(dealerCapture)

  // 3. Bonus de décompte (>20 cartes) par équipe
  const [bA, bB] = cardCountBonus(teams[0].captured.length, teams[1].captured.length)
  teams[0].score += bA
  teams[1].score += bB

  const newScores: [number, number] = [teams[0].score, teams[1].score]

  return {
    ...state,
    table: [],
    teams,
    phase: isGameOver(newScores) ? 'GAME_OVER' : 'DEAL_END',
    lastEvents: [],
  }
}
