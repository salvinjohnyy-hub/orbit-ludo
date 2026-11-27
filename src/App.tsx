import { useEffect, useRef, useState } from 'react'
import {
  Copy,
  Dice5,
  MessageCircle,
  Plus,
  Users,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'

import {
  createRoomCode,
  createInitialGameState,
  getCurrentPlayer,
  getLegalMoves,
  moveToken,
  PLAYER_COLORS,
  rollDie,
  type GameState,
  type Player,
  type PlayerColor
} from './game'

import { supabase } from './supabase'
import LudoBoard from './LudoBoard'

type PlayerRow = {
  id: string
  display_name: string
  color: string
  is_spectator: boolean
}

type MessageRow = {
  id: string
  display_name: string
  body: string
}

type RoomRow = {
  id: string
  code: string
  status: string
  game_state: GameState | null
}

export default function App() {
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [room, setRoom] = useState('')
  const [roomId, setRoomId] = useState('')
  const [playerId, setPlayerId] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [spectating, setSpectating] = useState(false)
  const [sound, setSound] = useState(true)
  const [chat, setChat] = useState<MessageRow[]>([])
  const [message, setMessage] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [gameState, setGameState] = useState<GameState | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [roomStatus, setRoomStatus] = useState('waiting')

  const ownMessageIds = useRef<Set<string>>(new Set())
  const receivedMessageIds = useRef<Set<string>>(new Set())
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const chatOpenRef = useRef(false)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const shareUrl = room
    ? `${window.location.origin}/?room=${room}`
    : ''

  const activePlayers = players.filter(p => !p.isSpectator)
  const spectators = players.filter(p => p.isSpectator)

  const currentPlayer = gameState
    ? getCurrentPlayer(gameState)
    : null

  const isMyTurn = Boolean(
    currentPlayer && currentPlayer.id === playerId
  )

  const isPlaying = Boolean(
    gameState && roomStatus === 'playing'
  )

  const legalMoves =
    gameState && gameState.diceValue !== null && isMyTurn
      ? getLegalMoves(gameState, gameState.diceValue)
      : []

  function receiveMessage(m: MessageRow) {
    if (!m?.id || receivedMessageIds.current.has(m.id)) return

    receivedMessageIds.current.add(m.id)

    setChat(items => [...items, m])

    if (!ownMessageIds.current.has(m.id) && !chatOpenRef.current) {
      setUnreadCount(count => count + 1)
    }
  }

  function openChat() {
    chatOpenRef.current = true
    setChatOpen(true)
    setUnreadCount(0)
  }

  function closeChat() {
    chatOpenRef.current = false
    setChatOpen(false)
  }

  async function loadRoomData(id: string) {
    const [playerResult, messageResult, roomResult] =
      await Promise.all([
        supabase
          .from('room_players')
          .select('id, display_name, color, is_spectator')
          .eq('room_id', id),

        supabase
          .from('room_messages')
          .select('id, display_name, body')
          .eq('room_id', id),

        supabase
          .from('rooms')
          .select('id, code, status, game_state')
          .eq('id', id)
          .single()
      ])

    if (playerResult.error) {
      setError(playerResult.error.message)
    } else {
      setPlayers(
        (playerResult.data ?? []).map((p: PlayerRow) => ({
          id: p.id,
          name: p.display_name,
          color: p.color as PlayerColor,
          isSpectator: p.is_spectator
        }))
      )
    }

    if (messageResult.error) {
      setError(messageResult.error.message)
    } else {
      const loadedMessages = (messageResult.data ?? []) as MessageRow[]

      loadedMessages.forEach(m => {
        receivedMessageIds.current.add(m.id)
      })

      setChat(loadedMessages)
    }

    if (roomResult.error) {
      setError(roomResult.error.message)
    } else {
      const r = roomResult.data as RoomRow
      setRoomStatus(r.status)

      if (r.game_state && Array.isArray(r.game_state.players)) {
        setGameState(r.game_state)
      } else {
        setGameState(null)
      }
    }
  }

  async function saveGameState(
    nextState: GameState,
    status = 'playing'
  ) {
    if (!roomId) return

    const { error: saveError } = await supabase
      .from('rooms')
      .update({
        game_state: nextState,
        status
      })
      .eq('id', roomId)

    if (saveError) {
      setError(saveError.message)
      return
    }

    setGameState(nextState)
    setRoomStatus(status)
  }

  async function createGame() {
    setBusy(true)
    setError('')

    try {
      const code = createRoomCode()

      const { data: created, error: roomError } = await supabase
        .from('rooms')
        .insert({
          code,
          status: 'waiting',
          game_state: {}
        })
        .select('id, code, status')
        .single()

      if (roomError) throw roomError

      const { data: newPlayer, error: playerError } = await supabase
        .from('room_players')
        .insert({
          room_id: created.id,
          display_name: name.trim() || 'Player 1',
          color: PLAYER_COLORS[0],
          is_spectator: false
        })
        .select('id')
        .single()

      if (playerError) throw playerError

      setRoom(created.code)
      setRoomId(created.id)
      setPlayerId(newPlayer.id)
      setRoomStatus(created.status)
      setSpectating(false)

      await loadRoomData(created.id)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Could not create room.')
    } finally {
      setBusy(false)
    }
  }

  async function joinGame() {
    const code = roomCode.trim().toUpperCase()
    const displayName = name.trim() || 'Guest'

    if (!code) {
      setError('Enter a room code.')
      return
    }

    setBusy(true)
    setError('')

    try {
      const { data: found, error: findError } = await supabase
        .from('rooms')
        .select('id, code, status')
        .eq('code', code)
        .maybeSingle()

      if (findError) throw findError
      if (!found) throw new Error('Room not found. Check the code.')

      const { data: existing, error: existingError } = await supabase
        .from('room_players')
        .select('id, display_name, color, is_spectator')
        .eq('room_id', found.id)
        .eq('display_name', displayName)
        .maybeSingle()

      if (existingError) throw existingError

      let isSpectator = false
      let joinedPlayerId = ''

      if (existing) {
        isSpectator = existing.is_spectator
        joinedPlayerId = existing.id
      } else {
        const { count, error: countError } = await supabase
          .from('room_players')
          .select('id', { count: 'exact', head: true })
          .eq('room_id', found.id)
          .eq('is_spectator', false)

        if (countError) throw countError

        isSpectator = found.status !== 'waiting'

        if (!isSpectator && (count ?? 0) >= 8) {
          throw new Error('This room already has 8 players.')
        }

        const { data: inserted, error: insertError } = await supabase
          .from('room_players')
          .insert({
            room_id: found.id,
            display_name: displayName,
            color: PLAYER_COLORS[(count ?? 0) % 8],
            is_spectator: isSpectator
          })
          .select('id')
          .single()

        if (insertError) throw insertError
        joinedPlayerId = inserted.id
      }

      setRoom(found.code)
      setRoomId(found.id)
      setPlayerId(joinedPlayerId)
      setRoomStatus(found.status)
      setSpectating(isSpectator)

      await loadRoomData(found.id)
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : 'Could not join room.')
    } finally {
      setBusy(false)
    }
  }

  async function startGame() {
    if (activePlayers.length < 2) {
      setError('At least 2 players are needed to start.')
      return
    }

    if (activePlayers.length > 8) {
      setError('Maximum 8 active players allowed.')
      return
    }

    try {
      setBusy(true)
      setError('')

      const nextState = createInitialGameState(activePlayers)
      await saveGameState(nextState)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start game.')
    } finally {
      setBusy(false)
    }
  }

  async function rollForTurn() {
    if (
      !gameState ||
      !isMyTurn ||
      gameState.diceValue !== null ||
      spectating
    ) return

    try {
      setBusy(true)
      setError('')

      const roll = rollDie()
      const moves = getLegalMoves(gameState, roll)

      let nextState: GameState

      if (moves.length === 0) {
        nextState = {
          ...gameState,
          diceValue: null,
          turnIndex:
            roll === 6
              ? gameState.turnIndex
              : (gameState.turnIndex + 1) % gameState.players.length
        }
      } else {
        nextState = {
          ...gameState,
          diceValue: roll
        }
      }

      await saveGameState(nextState)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dice roll failed.')
    } finally {
      setBusy(false)
    }
  }

  async function chooseToken(index: number) {
    if (
      !gameState ||
      !isMyTurn ||
      gameState.diceValue === null ||
      spectating
    ) return

    try {
      setBusy(true)
      setError('')

      const nextState = moveToken(
        gameState,
        index,
        gameState.diceValue
      )

      await saveGameState(nextState)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Token could not move.')
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage() {
    if (!message.trim() || !roomId) return

    const body = message.trim()
    setMessage('')

    const { data, error: sendError } = await supabase
      .from('room_messages')
      .insert({
        room_id: roomId,
        display_name: name.trim() || 'Guest',
        body
      })
      .select('id, display_name, body')
      .single()

    if (sendError) {
      setError(sendError.message)
      setMessage(body)
      return
    }

    const sentMessage = data as MessageRow
    ownMessageIds.current.add(sentMessage.id)
    receiveMessage(sentMessage)

    if (channelRef.current) {
      void channelRef.current.send({
        type: 'broadcast',
        event: 'new-message',
        payload: sentMessage
      })
    }
  }  // Load an invitation room code from the URL.
  useEffect(() => {
    const invitedRoom = new URLSearchParams(
      window.location.search
    ).get('room')

    if (invitedRoom) {
      setRoomCode(invitedRoom.toUpperCase())
    }
  }, [])

  // Keep the chat scrolled to the newest message.
  useEffect(() => {
    if (chatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chat, chatOpen])

  // Live room updates.
  useEffect(() => {
    if (!roomId) return

    let active = true

    const channel = supabase
      .channel(`room-${roomId}`, {
        config: {
          broadcast: { self: false }
        }
      })
      .on(
        'broadcast',
        { event: 'new-message' },
        payload => {
          if (!active) return
          receiveMessage(payload.payload as MessageRow)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'room_players',
          filter: `room_id=eq.${roomId}`
        },
        () => {
          void loadRoomData(roomId)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_messages',
          filter: `room_id=eq.${roomId}`
        },
        payload => {
          if (!active) return
          receiveMessage(payload.new as MessageRow)
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`
        },
        payload => {
          const updated = payload.new as RoomRow
          setRoomStatus(updated.status)

          if (
            updated.game_state &&
            Array.isArray(updated.game_state.players)
          ) {
            setGameState(updated.game_state)
          } else {
            setGameState(null)
          }
        }
      )
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('Live connection problem. Check your internet connection.')
        }
      })

    channelRef.current = channel

    return () => {
      active = false
      channelRef.current = null
      void supabase.removeChannel(channel)
    }
  }, [roomId])

  return (
    <main className={`shell ${isPlaying ? 'playing-shell' : ''}`}>
      {!isPlaying && (
        <header className="topbar">
          <a className="brand" href="#">
            <span className="brand-mark">✦</span> ORBIT <b>LUDO</b>
          </a>

          <button
            className="icon-button"
            onClick={() => setSound(v => !v)}
            aria-label="Toggle sound"
          >
            {sound ? <Volume2 /> : <VolumeX />}
          </button>
        </header>
      )}

      {!isPlaying && (
        <section className="hero">
          <div className="eyebrow">
            <span /> THE CLASSIC, REIMAGINED
          </div>

          <h1>
            Roll. Race.
            <br />
            <em>Rule the board.</em>
          </h1>

          <p>
            Bring your people together for a little friendly chaos.
            Invite up to eight players.
          </p>

          {!room ? (
            <div className="entry-card">
              <label htmlFor="player-name">YOUR PLAYER NAME</label>

              <input
                id="player-name"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name"
                maxLength={18}
              />

              <button
                className="primary"
                onClick={createGame}
                disabled={busy}
              >
                <Plus size={18} />
                {busy ? 'Creating...' : 'Create a room'}
              </button>

              <div className="or">
                <span /> OR JOIN A ROOM <span />
              </div>

              <div className="join-row">
                <input
                  value={roomCode}
                  onChange={e => setRoomCode(e.target.value)}
                  placeholder="Enter room code"
                  maxLength={8}
                />

                <button
                  className="secondary"
                  onClick={joinGame}
                  disabled={busy}
                >
                  Join
                </button>
              </div>

              {error && <p className="error-text">{error}</p>}
            </div>
          ) : (
            <div className="entry-card room-card">
              <div className="room-heading">
                <span className="live-dot" />
                {roomStatus === 'waiting' ? 'ROOM LOBBY' : 'GAME IN PROGRESS'}
              </div>

              <div className="room-code">{room}</div>

              <p>Share this invitation link with your friends.</p>

              <button
                className="primary"
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl)
                }}
              >
                <Copy size={17} />
                Copy invitation link
              </button>

              <div className="room-meta">
                <Users size={16} />
                {activePlayers.length} players · {spectators.length} spectators
              </div>

              <div className="player-list">
                {players.map(p => (
                  <span
                    key={p.id}
                    className={`player-chip ${p.color}`}
                  >
                    {p.name}
                    {p.id === playerId ? ' · you' : ''}
                    {p.isSpectator ? ' · watching' : ''}
                  </span>
                ))}
              </div>

              {roomStatus === 'waiting' && !spectating && (
                <button
                  className="primary"
                  onClick={startGame}
                  disabled={busy || activePlayers.length < 2}
                >
                  {busy ? 'Starting...' : 'Start Ludo'}
                </button>
              )}

              <div className="room-note">
                {roomStatus === 'waiting'
                  ? 'Waiting for players to join.'
                  : 'The game is in progress.'}
              </div>

              {error && <p className="error-text">{error}</p>}
            </div>
          )}
        </section>
      )}

      {gameState && (
        <section
          className="game-preview"
          style={
            isPlaying
              ? {
                  position: 'fixed',
                  inset: 0,
                  zIndex: 20,
                  width: '100%',
                  height: '100dvh',
                  maxWidth: 'none',
                  margin: 0,
                  padding: '12px',
                  boxSizing: 'border-box',
                  overflowY: 'auto',
                  background: '#101322'
                }
              : undefined
          }
        >
          <div className="section-head">
            <div>
              <span className="eyebrow">LIVE GAME · ROOM {room}</span>
              <h2>Orbit Ludo table</h2>
            </div>

            <span className="player-count">
              {gameState.players.length} PLAYERS
            </span>
          </div>

          <div className="game-panel">
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <h3 style={{ margin: '0 0 8px' }}>
                {gameState.winnerId
                  ? `${gameState.players.find(p => p.id === gameState.winnerId)?.name ?? 'Player'} wins!`
                  : `${currentPlayer?.name ?? 'Waiting'}'s turn`}
              </h3>

              <p style={{ color: '#aeb5c8', fontSize: 13 }}>
                {spectating
                  ? 'You are watching this game.'
                  : isMyTurn
                    ? gameState.diceValue === null
                      ? 'Roll the dice to play.'
                      : 'Choose one of your highlighted tokens.'
                    : 'Waiting for the current player.'}
              </p>

              <button
                className="die"
                onClick={rollForTurn}
                disabled={
                  busy ||
                  spectating ||
                  !isMyTurn ||
                  gameState.diceValue !== null ||
                  Boolean(gameState.winnerId)
                }
                style={{
                  border: 0,
                  margin: '18px auto',
                  opacity:
                    !isMyTurn || gameState.diceValue !== null ? 0.6 : 1
                }}
              >
                {gameState.diceValue ?? <Dice5 size={36} />}
              </button>

              {gameState.diceValue !== null && isMyTurn && (
                <p style={{ color: '#aaa4ff' }}>
                  You rolled {gameState.diceValue}
                </p>
              )}
            </div>

            <LudoBoard
              gameState={gameState}
              playerId={playerId}
              legalMoves={legalMoves}
              isMyTurn={isMyTurn && !spectating && !busy}
              onTokenClick={chooseToken}
            />
          </div>
        </section>
      )}

      {room && gameState && (
        <>
          <button
            type="button"
            onClick={() => {
              if (chatOpen) {
                closeChat()
              } else {
                openChat()
              }
            }}
            aria-label="Open room chat"
            style={{
              position: 'fixed',
              right: 20,
              bottom: 20,
              zIndex: 60,
              width: 58,
              height: 58,
              borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.2)',
              background: '#7565f5',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
              cursor: 'pointer'
            }}
          >
            {chatOpen ? <X size={25} /> : <MessageCircle size={25} />}

            {!chatOpen && unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: -5,
                  right: -5,
                  minWidth: 21,
                  height: 21,
                  padding: '0 5px',
                  borderRadius: 20,
                  background: '#f04452',
                  color: 'white',
                  fontSize: 12,
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #101322'
                }}
              >
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {chatOpen && (
            <div
              style={{
                position: 'fixed',
                right: 16,
                bottom: 90,
                zIndex: 60,
                width: 'min(350px, calc(100vw - 32px))',
                height: 'min(440px, calc(100dvh - 120px))',
                background: '#20243a',
                border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 18,
                boxShadow: '0 15px 50px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  padding: '15px 17px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                  color: 'white'
                }}
              >
                <strong style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <MessageCircle size={18} />
                  Room chat
                </strong>

                <button
                  type="button"
                  onClick={closeChat}
                  aria-label="Close chat"
                  style={{
                    background: 'transparent',
                    color: 'white',
                    border: 0,
                    cursor: 'pointer'
                  }}
                >
                  <X size={20} />
                </button>
              </div>

              <div
                className="chat-messages"
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: 14
                }}
              >
                {chat.length === 0 && (
                  <p style={{ color: '#aeb5c8', textAlign: 'center' }}>
                    No messages yet. Say hello!
                  </p>
                )}

                {chat.map(item => (
                  <div
                    key={item.id}
                    style={{
                      marginBottom: 12,
                      overflowWrap: 'anywhere'
                    }}
                  >
                    <strong style={{ color: '#aaa4ff', fontSize: 12 }}>
                      {item.display_name}
                    </strong>

                    <p style={{ color: 'white', margin: '3px 0 0' }}>
                      {item.body}
                    </p>
                  </div>
                ))}

                <div ref={chatEndRef} />
              </div>

              <form
                className="chat-form"
                onSubmit={e => {
                  e.preventDefault()
                  void sendMessage()
                }}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: 12,
                  borderTop: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <input
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Write a message..."
                  maxLength={200}
                  style={{ flex: 1, minWidth: 0 }}
                />

                <button type="submit" disabled={!message.trim()}>
                  Send
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </main>
  )
}