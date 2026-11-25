import { useMemo, useState } from 'react'
import { Copy, Dice5, MessageCircle, Plus, Users, Volume2, VolumeX } from 'lucide-react'
import { createRoomCode, PLAYER_COLORS, rollDie, type Player } from './game'

export default function App() {
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [room, setRoom] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [spectating, setSpectating] = useState(false)
  const [sound, setSound] = useState(true)
  const [chat, setChat] = useState<string[]>(['Welcome to Orbit Ludo!'])
  const [message, setMessage] = useState('')
  const [die, setDie] = useState<number | null>(null)

  const shareUrl = useMemo(() => room ? `${location.origin}/?room=${room}` : '', [room])

  function createGame() {
    const code = createRoomCode()
    setRoom(code)
    setPlayers([{ id: 'you', name: name.trim() || 'Player 1', color: PLAYER_COLORS[0] }])
  }

  function joinGame() {
    if (!roomCode.trim()) return
    setRoom(roomCode.trim().toUpperCase())
    setSpectating(true)
  }

  function sendMessage() {
    if (!message.trim()) return
    setChat(items => [...items, `${name.trim() || 'Guest'}: ${message.trim()}`])
    setMessage('')
  }

  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">✦</span> ORBIT <b>LUDO</b></a>
        <button className="icon-button" onClick={() => setSound(v => !v)} aria-label="Toggle sound">
          {sound ? <Volume2 /> : <VolumeX />}
        </button>
      </header>

      <section className="hero">
        <div className="eyebrow"><span /> THE CLASSIC, REIMAGINED</div>
        <h1>Roll. Race.<br /><em>Rule the board.</em></h1>
        <p>Bring your people together for a little friendly chaos. Create a room and invite up to eight players.</p>

        {!room ? (
          <div className="entry-card">
            <label htmlFor="player-name">YOUR PLAYER NAME</label>
            <input id="player-name" value={name} onChange={e => setName(e.target.value)} placeholder="Enter your name" maxLength={18} />
            <button className="primary" onClick={createGame}><Plus size={18} /> Create a room</button>
            <div className="or"><span /> OR JOIN A ROOM <span /></div>
            <div className="join-row">
              <input value={roomCode} onChange={e => setRoomCode(e.target.value)} placeholder="Enter room code" maxLength={8} />
              <button className="secondary" onClick={joinGame}>Join</button>
            </div>
          </div>
        ) : (
          <div className="entry-card room-card">
            <div className="room-heading"><span className="live-dot" /> ROOM READY</div>
            <div className="room-code">{room}</div>
            <p>Share this invite link with your friends.</p>
            <button className="primary" onClick={() => navigator.clipboard?.writeText(shareUrl)}><Copy size={17} /> Copy invitation link</button>
            <div className="room-meta"><Users size={16} /> {players.length} player · Up to 8 players</div>
            <div className="player-list">{players.map(p => <span key={p.id} className={`player-chip ${p.color}`}>{p.name}</span>)}</div>
            <div className="room-note">This is a starter lobby preview. Online multiplayer needs the backend connection configured.</div>
          </div>
        )}
      </section>

      <section className="preview">
        <div className="section-head"><div><span className="eyebrow">THE GAME</span><h2>One board. Your crew.</h2></div><span className="player-count">2–8 PLAYERS</span></div>
        <div className="board-wrap">
          <div className="board">
            {PLAYER_COLORS.slice(0, 4).map((color, i) => <div key={color} className={`home home-${i}`}><div className="home-inner">{[0,1,2,3].map(n => <i key={n} />)}</div></div>)}
            <div className="cross"><span className="tri red-tri" /><span className="tri blue-tri" /><span className="tri green-tri" /><span className="tri yellow-tri" /></div>
            <div className="center-star">✦</div>
          </div>
        </div>
        <div className="feature-row">
          <div><Dice5 /><b>Classic Ludo</b><small>Six to leave home</small></div>
          <div><Users /><b>Up to 8 players</b><small>Adaptive player setup</small></div>
          <div><MessageCircle /><b>Live chat</b><small>Talk while you play</small></div>
        </div>
      </section>

      {room && <section className="game-preview">
        <div className="section-head"><div><span className="eyebrow">TABLE PREVIEW</span><h2>{spectating ? 'Spectator view' : 'Ready when you are'}</h2></div></div>
        <div className="game-panel">
          <div className="die" onClick={() => setDie(rollDie())}>{die ?? '🎲'}</div>
          <p>{die ? `You rolled a ${die}.` : 'Tap the dice to preview a roll.'}</p>
          <div className="chat-box"><strong>Room chat</strong><div className="chat-lines">{chat.map((line, i) => <div key={i}>{line}</div>)}</div><div className="chat-input"><input value={message} onChange={e => setMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} placeholder="Write a message..." /><button onClick={sendMessage}>Send</button></div></div>
        </div>
      </section>}
      <footer>ORBIT LUDO <span>·</span> A LITTLE FRIENDLY CHAOS</footer>
    </main>
  )
}
