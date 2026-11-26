
export type PlayerColor =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'purple'
  | 'orange'
  | 'teal'
  | 'pink'

export type Player = {
  id: string
  name: string
  color: PlayerColor
  isSpectator?: boolean
}

export type GamePlayer = Player & {
  startOffset: number
}

export type GameState = {
  players: GamePlayer[]
  tokens: Record<string, number[]>
  turnIndex: number
  diceValue: number | null
  winnerId: string | null
}

export const PLAYER_COLORS: PlayerColor[] = [
  'red',
  'blue',
  'green',
  'yellow',
  'purple',
  'orange',
  'teal',
  'pink',
]

export const TRACK_LENGTH = 56
export const HOME_LENGTH = 6
export const FINISH_POSITION = TRACK_LENGTH + HOME_LENGTH

export function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function rollDie() {
  return Math.floor(Math.random() * 6) + 1
}

export function canLeaveHome(roll: number) {
  return roll === 6
}

export function createInitialGameState(
  players: Player[]
): GameState {
  const activePlayers = players.filter(
    player => !player.isSpectator
  )

  if (activePlayers.length < 2 || activePlayers.length > 8) {
    throw new Error('A Ludo game requires 2 to 8 active players.')
  }

  const gamePlayers: GamePlayer[] = activePlayers.map(
    (player, index) => ({
      ...player,
      startOffset: Math.floor(
        index * TRACK_LENGTH / activePlayers.length
      ),
    })
  )

  const tokens: Record<string, number[]> = {}

  for (const player of gamePlayers) {
    tokens[player.id] = [-1, -1, -1, -1]
  }

  return {
    players: gamePlayers,
    tokens,
    turnIndex: 0,
    diceValue: null,
    winnerId: null,
  }
}

export function getCurrentPlayer(
  state: GameState
): GamePlayer | null {
  if (state.winnerId) return null

  return state.players[state.turnIndex] ?? null
}

export function isSafeSquare(position: number): boolean {
  return position % 7 === 0
}

export function getTrackPosition(
  player: GamePlayer,
  progress: number
): number | null {
  if (progress < 0 || progress >= TRACK_LENGTH) {
    return null
  }

  return (player.startOffset + progress) % TRACK_LENGTH
}

export function getLegalMoves(
  state: GameState,
  roll: number
): number[] {
  const player = getCurrentPlayer(state)

  if (!player || roll < 1 || roll > 6) {
    return []
  }

  const positions = state.tokens[player.id] ?? []

  return positions
    .map((progress, index) => ({ progress, index }))
    .filter(({ progress }) => {
      if (progress === FINISH_POSITION) {
        return false
      }

      if (progress === -1) {
        return canLeaveHome(roll)
      }

      return progress + roll <= FINISH_POSITION
    })
    .map(({ index }) => index)
}

export function moveToken(
  state: GameState,
  tokenIndex: number,
  roll: number
): GameState {
  const player = getCurrentPlayer(state)

  if (!player) {
    throw new Error('The game has already finished.')
  }

  if (!Number.isInteger(tokenIndex) || tokenIndex < 0 || tokenIndex > 3) {
    throw new Error('Invalid token.')
  }

  const legalMoves = getLegalMoves(state, roll)

  if (!legalMoves.includes(tokenIndex)) {
    throw new Error('That token cannot move with this roll.')
  }

  const updatedTokens = {
    ...state.tokens,
    [player.id]: [...state.tokens[player.id]],
  }

  const oldProgress = updatedTokens[player.id][tokenIndex]

  const newProgress =
    oldProgress === -1 ? 0 : oldProgress + roll

  updatedTokens[player.id][tokenIndex] = newProgress

  let captured = false

  const landedPosition = getTrackPosition(
    player,
    newProgress
  )

  if (
    landedPosition !== null &&
    !isSafeSquare(landedPosition)
  ) {
    for (const opponent of state.players) {
      if (opponent.id === player.id) continue

      const opponentTokens = updatedTokens[opponent.id]

      opponentTokens.forEach((opponentProgress, index) => {
        if (opponentProgress < 0 || opponentProgress >= TRACK_LENGTH) {
          return
        }

        const opponentPosition = getTrackPosition(
          opponent,
          opponentProgress
        )

        if (opponentPosition === landedPosition) {
          opponentTokens[index] = -1
          captured = true
        }
      })
    }
  }

  const playerHasWon = updatedTokens[player.id].every(
    position => position === FINISH_POSITION
  )

  const nextTurn = (
    roll === 6 || captured
      ? state.turnIndex
      : (state.turnIndex + 1) % state.players.length
  )

  return {
    ...state,
    tokens: updatedTokens,
    turnIndex: playerHasWon ? state.turnIndex : nextTurn,
    diceValue: null,
    winnerId: playerHasWon ? player.id : null,
  }
}
