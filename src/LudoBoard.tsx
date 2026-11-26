
import React from 'react'
import type { GameState, GamePlayer, PlayerColor } from './game'

type Props = {
  gameState: GameState
  playerId: string
  legalMoves: number[]
  isMyTurn: boolean
  onTokenClick: (index: number) => void
}

const colorMap: Record<PlayerColor, string> = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#eab308',
  purple: '#a855f7',
  orange: '#f97316',
  teal: '#14b8a6',
  pink: '#ec4899'
}

const track: [number, number][] = []

for (let x = 0; x < 15; x++) track.push([x, 0])
for (let y = 1; y < 15; y++) track.push([14, y])
for (let x = 13; x >= 0; x--) track.push([x, 14])
for (let y = 13; y > 0; y--) track.push([0, y])

const homePositions = [
  { x: 2, y: 2 },
  { x: 10, y: 2 },
  { x: 10, y: 10 },
  { x: 2, y: 10 }
]

export default function LudoBoard({
  gameState,
  playerId,
  legalMoves,
  isMyTurn,
  onTokenClick
}: Props) {
  const cells = Array.from({ length: 225 }, (_, i) => ({
    x: i % 15,
    y: Math.floor(i / 15)
  }))

  const getPlayer = (id: string) =>
    gameState.players.find(p => p.id === id)

  const tokensAt = (x: number, y: number) => {
    const result: {
      player: GamePlayer
      tokenIndex: number
      clickable: boolean
    }[] = []

    gameState.players.forEach(player => {
      const positions = gameState.tokens[player.id] ?? []

      positions.forEach((progress, tokenIndex) => {
        let position: [number, number] | null = null

        if (progress === -1) {
          const home = homePositions[
            gameState.players.indexOf(player) % 4
          ]
          const offsets = [
            [-1, -1], [1, -1], [-1, 1], [1, 1]
          ]
          position = [
            home.x + offsets[tokenIndex][0],
            home.y + offsets[tokenIndex][1]
          ]
        } else if (progress >= 0 && progress < 56) {
          const trackIndex =
            (player.startOffset + progress) % 56
          position = track[trackIndex]
        } else if (progress >= 56) {
          position = [7, 7]
        }

        if (position && position[0] === x && position[1] === y) {
          result.push({
            player,
            tokenIndex,
            clickable:
              player.id === playerId &&
              isMyTurn &&
              legalMoves.includes(tokenIndex)
          })
        }
      })
    })

    return result
  }

  const getCellBackground = (x: number, y: number) => {
    if (
      (x === 0 || x === 14) &&
      (y === 0 || y === 14)
    ) return '#202638'

    if (y === 0 || y === 14 || x === 0 || x === 14) {
      return '#e8eaf0'
    }

    if (x >= 1 && x <= 5 && y >= 1 && y <= 5) {
      return '#fecaca'
    }

    if (x >= 9 && x <= 13 && y >= 1 && y <= 5) {
      return '#bfdbfe'
    }

    if (x >= 9 && x <= 13 && y >= 9 && y <= 13) {
      return '#bbf7d0'
    }

    if (x >= 1 && x <= 5 && y >= 9 && y <= 13) {
      return '#fef08a'
    }

    if (x >= 6 && x <= 8 && y >= 6 && y <= 8) {
      return '#202638'
    }

    return '#f8fafc'
  }

  return (
    <div className="orbit-board-wrap">
      <div className="orbit-board">
        {cells.map(({ x, y }) => {
          const tokens = tokensAt(x, y)
          const isTrack =
            x === 0 || x === 14 || y === 0 || y === 14

          return (
            <div
              key={`${x}-${y}`}
              className="orbit-cell"
              style={{
                background: getCellBackground(x, y),
                border: isTrack
                  ? '1px solid #cbd5e1'
                  : '1px solid rgba(100,116,139,.12)'
              }}
            >
              {tokens.map(token => (
                <button
                  key={`${token.player.id}-${token.tokenIndex}`}
                  className="orbit-token"
                  disabled={!token.clickable}
                  onClick={() => onTokenClick(token.tokenIndex)}
                  title={`${token.player.name} token ${token.tokenIndex + 1}`}
                  style={{
                    background: colorMap[token.player.color],
                    border: token.clickable
                      ? '3px solid white'
                      : '2px solid rgba(255,255,255,.8)',
                    boxShadow: token.clickable
                      ? '0 0 0 3px #8b5cf6, 0 3px 8px #0005'
                      : '0 2px 5px #0005',
                    cursor: token.clickable ? 'pointer' : 'default'
                  }}
                >
                  {token.tokenIndex + 1}
                </button>
              ))}

              {x === 7 && y === 7 && (
                <span className="orbit-center">✦</span>
              )}
            </div>
          )
        })}
      </div>

      <div className="orbit-player-strip">
        {gameState.players.map((player, index) => (
          <div
            key={player.id}
            className="orbit-player-card"
            style={{
              borderColor: colorMap[player.color],
              background:
                player.id === gameState.players[gameState.turnIndex]?.id
                  ? '#292d43'
                  : '#171b2a'
            }}
          >
            <span
              className="orbit-player-dot"
              style={{ background: colorMap[player.color] }}
            />
            <span>{player.name}</span>
            {player.id === gameState.players[gameState.turnIndex]?.id && (
              <small>TURN</small>
            )}
          </div>
        ))}
      </div>

      <style>{`
        .orbit-board-wrap {
          width: 100%;
          max-width: 650px;
          margin: 20px auto;
        }

        .orbit-board {
          display: grid;
          grid-template-columns: repeat(15, minmax(0, 1fr));
          aspect-ratio: 1;
          width: 100%;
          overflow: hidden;
          border: 5px solid #30364c;
          border-radius: 16px;
          background: #e8eaf0;
          box-shadow: 0 15px 40px #0005;
        }

        .orbit-cell {
          min-width: 0;
          min-height: 0;
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
        }

        .orbit-token {
          width: 75%;
          height: 75%;
          max-width: 30px;
          max-height: 30px;
          min-width: 9px;
          min-height: 9px;
          border-radius: 50%;
          color: white;
          font-size: clamp(6px, 1.5vw, 11px);
          font-weight: 900;
          padding: 0;
          z-index: 2;
          touch-action: manipulation;
        }

        .orbit-center {
          color: white;
          font-size: clamp(12px, 3vw, 25px);
        }

        .orbit-player-strip {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin-top: 16px;
        }

        .orbit-player-card {
          display: flex;
          align-items: center;
          gap: 7px;
          border: 1px solid;
          border-radius: 20px;
          padding: 8px 12px;
          color: white;
          font-size: 12px;
        }

        .orbit-player-dot {
          width: 9px;
          height: 9px;
          border-radius: 50%;
        }

        .orbit-player-card small {
          color: #c4b5fd;
          font-weight: 900;
        }
      `}</style>
    </div>
  )
}
