import React from 'react';
import { Link } from 'react-router-dom';
import { cardClass, inputClass, secondaryButtonClass } from './AppShell.jsx';

function StaffJoinPanel({ name, setName, refreshing, refreshRooms, error, rooms, joinRoom }) {
  return (
    <section className={`${cardClass} max-w-[500px]`}>
      <div className="mb-5 grid gap-2.5">
        <Link className="w-fit text-sm text-muted transition hover:text-text" to="/">
          Back
        </Link>
        <h2 className="m-0 text-2xl font-semibold tracking-[-0.03em]">Staff Panel</h2>
        <p className="m-0 text-[0.95rem] text-muted">Watch active rooms and attach to live student feeds.</p>
      </div>

      <div className="grid gap-[13px]">
        <label className="grid gap-2">
          <span className="text-[0.84rem] text-muted">Name</span>
          <input id="staff-name" className={inputClass} value={name} onChange={event => setName(event.target.value)} placeholder="Your name" />
        </label>

        <button id="staff-refresh-rooms" className={secondaryButtonClass} onClick={refreshRooms} type="button">
          {refreshing ? 'Refreshing...' : 'Refresh Rooms'}
        </button>

        {error ? <div className="rounded border border-danger/20 bg-danger/10 px-3.5 py-3 text-[#f3b4c1]">{error}</div> : null}

        <div className="grid gap-3">
          {rooms.length ? (
            rooms.map(room => (
              <div
                id={`staff-room-card-${room.id}`}
                className="flex flex-col gap-4 rounded border border-white/[0.05] bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                key={room.id}
              >
                <div>
                  <div className="font-bold">{room.id}</div>
                  <div className="mt-1.5 flex gap-3.5 text-[0.85rem] text-muted">
                    <span>Students {room.students}</span>
                    <span>Staff {room.staff}</span>
                  </div>
                </div>
                <button
                  id={`staff-join-room-${room.id}`}
                  className="rounded bg-primary px-4 py-3 font-bold text-white transition hover:bg-primary-strong sm:w-auto"
                  onClick={() => joinRoom(room.id)}
                  type="button"
                >
                  Join
                </button>
              </div>
            ))
          ) : (
            <div className="py-[18px] text-muted">No rooms yet. Refresh to check.</div>
          )}
        </div>
      </div>
    </section>
  );
}

export default StaffJoinPanel;
