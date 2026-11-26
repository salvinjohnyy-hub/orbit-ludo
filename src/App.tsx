
import { useEffect, useState } from 'react'
import {
  Copy,
  Dice5,
  MessageCircle,
  Plus,
  Users,
  Volume2,
  VolumeX
} from 'lucide-react'

import {
  createRoomCode,
  PLAYER_COLORS,
  rollDie,
  type Player,
  type PlayerColor
} from './game'

import { supabase } from './supabase'

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

export default function App() {
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [room, setRoom] = useState('')
  const [roomId, setRoomId] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [spectating, setSpectating] = useState(false)
  const [sound, setSound] = useState(true)
  const [chat, setChat] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [die, setDie] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [roomStatus, setRoomStatus] = useState('waiting')

  const shareUrl = room
    ? `${window.location.origin}/?room=${room}`
    : ''

  async function loadRoomData(id: string) {
    const [playerResult, messageResult] = await Promise.all([
      supabase
        .from('room_players')
        .select('id, display_name, color, is_spectator')
        .eq('room_id', id),

      supabase
        .from('room_messages')
        .select('id, display_name, body')
        .eq('room_id', id)
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
      setChat(
        (messageResult.data ?? []).map(
          (m: MessageRow) => `${m.display_name}: ${m.body}`
        )
      )
    }
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

      const { error: playerError } = await supabase
        .from('room_players')
        .insert({
          room_id: created.id,
          display_name: name.trim() || 'Player 1',
          color: PLAYER_COLORS[0],
          is_spectator: false
        })

      if (playerError) throw playerError

      setRoom(created.code)
      setRoomId(created.id)
      setRoomStatus(created.status)
      setSpectating(false)

      await loadRoomData(created.id)
    } catch (e) {
      console.error('Create room error:', e)
      setError(
        e instanceof Error ? e.message : JSON.stringify(e)
      )
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

      if (!found) {
        throw new Error('Room not found. Check the code.')
      }

      const { data: existing, error: existingError } = await supabase
        .from('room_players')
        .select('id, display_name, color, is_spectator')
        .eq('room_id', found.id)
        .eq('display_name', displayName)
        .maybeSingle()

      if (existingError) throw existingError

      let isSpectator = false

      if (existing) {
        isSpectator = existing.is_spectator
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

        const { error: insertError } = await supabase
          .from('room_players')
          .insert({
            room_id: found.id,
            display_name: displayName,
            color: PLAYER_COLORS[(count ?? 0) % 8],
            is_spectator: isSpectator
          })

        if (insertError) throw insertError
      }

      setRoom(found.code)
      setRoomId(found.id)
      setRoomStatus(found.status)
      setSpectating(isSpectator)

      await loadRoomData(found.id)
    } catch (e) {
      console.error('Join room error:', e)
      setError(
        e instanceof Error ? e.message : 'Could not join room.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function sendMessage() {
    if (!message.trim() || !roomId) return

    const body = message.trim()
    setMessage('')

    const { error: sendError } = await supabase
      .from('room_messages')
      .insert({
        room_id: roomId,
        display_name: name.trim() || 'Guest',
        body
      })

    if (sendError) {
      setError(sendError.message)
    }
  }

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`room-${roomId}`)
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
        (payload) => {
          const m = payload.new as MessageRow

          setChat(items => [
            ...items,
            `${m.display_name}: ${m.body}`
          ])
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId])

  useEffect(() => {
    const invitedRoom = new URLSearchParams(
      window.location.search
    ).get('room')

    if (invitedRoom) {
      setRoomCode(invitedRoom.toUpperCase())
    }
  }, [])

  const activePlayers = players.filter(
    p => !p.isSpectator
  )

  const spectators = players.filter(
    p => p.isSpectator
  )

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark">✦</span> ORBIT <b>LUDO</b>
        </a>

        <button
          className="icon-button"
          onClick={() => setSound(v => !v)}
        >
          {sound ? <Volume2 /> : <VolumeX />}
        </button>
      </header>

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
            <label htmlFor="player-name">
              YOUR PLAYER NAME
            </label>

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

            {error && (
              <p className="error-text">{error}</p>
            )}
          </div>
        ) : (
          <div className="entry-card room-card">
            <div className="room-heading">
              <span className="live-dot" />
              {roomStatus === 'waiting'
                ? 'ROOM LOBBY'
                : 'GAME IN PROGRESS'}
            </div>

            <div className="room-code">{room}</div>

            <p>
              Share this invitation link with your friends.
            </p>

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
                  {p.isSpectator ? ' · watching' : ''}
                </span>
              ))}
            </div>

            <div className="room-note">
              Multiplayer lobby and chat connected.
              Full Ludo gameplay is still being developed.
            </div>

            {error && (
              <p className="error-text">{error}</p>
            )}
          </div>
        )}
      </section>

      <section className="preview">
        <div className="section-head">
          <div>
            <span className="eyebrow">THE GAME</span>
            <h2>One board. Your crew.</h2>
          </div>

          <span className="player-count">2–8 PLAYERS</span>
        </div>

        <div className="board-wrap">
          <div className="board">
            {PLAYER_COLORS.slice(0, 4).map((color, i) => (
              <div
                key={color}
                className={`home home-${i}`}
              >
                <div className="home-inner">
                  {[0, 1, 2, 3].map(n => (
                    <i key={n} />
                  ))}
                </div>
              </div>
            ))}

            <div className="cross">
              <span className="tri red-tri" />
              <span className="tri blue-tri" />
              <span className="tri green-tri" />
              <span className="tri yellow-tri" />
            </div>

            <div className="center-star">✦</div>
          </div>
        </div>

        <div className="feature-row">
          <div>
            <Dice5 />
            <b>Classic Ludo</b>
            <small>Six to leave home</small>
          </div>

          <div>
            <Users />
            <b>Up to 8 players</b>
            <small>Adaptive player setup</small>
          </div>

          <div>
            <MessageCircle />
            <b>Live chat</b>
            <small>Talk while you play</small>
          </div>
        </div>
      </section>

      {room && (
        <section className="game-preview">
          <div className="section-head">
            <div>
              <span className="eyebrow">TABLE PREVIEW</span>
              <h2>
                {spectating ? 'Spectator view' : 'Room chat'}
              </h2>
            </div>
          </div>

          <div className="game-panel">
            <div
              className="die"
              onClick={() => setDie(rollDie())}
            >
              {die ?? '🎲'}
            </div>

            <p>
              {die
                ? `You rolled a ${die}. Local preview only.`
                : 'Tap the dice for a preview roll.'}
            </p>

            <div className="chat-box">
              <strong>Room chat</strong>

              <div className="chat-lines">
                {chat.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>

              <div className="chat-input">
                <input
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      void sendMessage()
                    }
                  }}
                  placeholder="Write a message..."
                />

                <button onClick={sendMessage}>
                  Send
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <footer>
        ORBIT LUDO <span>·</span> A LITTLE FRIENDLY CHAOS
      </footer>
    </main>
  )
}
