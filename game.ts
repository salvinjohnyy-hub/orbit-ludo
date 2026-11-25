export type PlayerColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'teal' | 'pink'

export type Player = {
  id: string
  name: string
  color: PlayerColor
  isSpectator?: boolean
}

export const PLAYER_COLORS: PlayerColor[] = [
  'red', 'blue', 'green', 'yellow', 'purple', 'orange', 'teal', 'pink',
]

export function createRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export function rollDie() {
  return Math.floor(Math.random() * 6) + 1
}

export function canLeaveHome(roll: number) {
  return roll === 6
}
