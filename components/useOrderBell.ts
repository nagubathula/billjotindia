"use client";

// Rings when a new order lands on the screen that mounts it.
//
//   • Every new order chimes once.
//   • An order that didn't come from our own POS keeps chiming every few
//     seconds until someone accepts or rejects it — delivery platforms time an
//     order out if the restaurant doesn't answer.
//   • Orders already on screen when the page opens never ring.
//
// Browsers only allow sound after the user has touched the page, so the bell
// is off until switched on, and after a reload it waits for the first tap.
// The sound is synthesised, so there is no audio file to ship.

import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_KEY = "billjot:order-bell";
const REPEAT_MS = 8000;

export type BellOrder = {
  id: string;
  status: string | null;
  source: string;
};

type AudioContextCtor = typeof AudioContext;

function createContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

// Two rising-falling pairs: "ding-dong, ding-dong".
function chime(ctx: AudioContext) {
  const t0 = ctx.currentTime + 0.02;
  const notes: Array<[freq: number, at: number]> = [
    [988, 0],
    [784, 0.24],
    [988, 0.6],
    [784, 0.84],
  ];
  for (const [freq, at] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.6, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.22);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.24);
  }
}

export function useOrderBell(orders: BellOrder[]) {
  const [enabled, setEnabled] = useState(false);
  // Sound is on but the browser is holding it until the user touches the page.
  const [blocked, setBlocked] = useState(false);
  // Orders that arrived while this screen was open and still need an answer.
  const [unanswered, setUnanswered] = useState<Set<string>>(new Set());

  const ctxRef = useRef<AudioContext | null>(null);
  const enabledRef = useRef(false);
  const knownRef = useRef<Set<string> | null>(null);
  const waitingRef = useRef<Set<string>>(new Set());

  const play = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !enabledRef.current) return;
    if (ctx.state !== "running") {
      setBlocked(true);
      return;
    }
    chime(ctx);
  }, []);

  // Restore the saved preference. The context usually starts suspended after
  // a reload; the first tap or key press anywhere releases it.
  useEffect(() => {
    let saved = false;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY) === "on";
    } catch {
      // Private mode / storage disabled: the bell just starts off.
    }
    if (!saved) return;

    const ctx = createContext();
    if (!ctx) return;
    ctxRef.current = ctx;
    enabledRef.current = true;
    setEnabled(true);
    setBlocked(ctx.state !== "running");

    const unlock = () => {
      void ctx
        .resume()
        .then(() => setBlocked(false))
        .catch(() => {});
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Release the audio device when the screen is left.
  useEffect(() => {
    return () => {
      const ctx = ctxRef.current;
      ctxRef.current = null;
      if (ctx) void ctx.close().catch(() => {});
    };
  }, []);

  // Called from a click, so the browser lets the sound start.
  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    setEnabled(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
    } catch {
      // Not remembered across reloads; still works for this visit.
    }
    if (!next) return;

    const ctx = ctxRef.current ?? createContext();
    if (!ctx) return;
    ctxRef.current = ctx;
    void ctx
      .resume()
      .then(() => {
        setBlocked(false);
        chime(ctx); // confirms it works, and how loud it is
      })
      .catch(() => setBlocked(true));
  }, []);

  // Spot arrivals by comparing each refresh with what we've already seen.
  const signature = orders.map((o) => `${o.id}:${o.status ?? "pending"}`).join("|");
  useEffect(() => {
    const pending = orders.filter((o) => (o.status ?? "pending") === "pending");

    if (knownRef.current === null) {
      knownRef.current = new Set(orders.map((o) => o.id));
      return;
    }
    const known = knownRef.current;
    const fresh = orders.filter((o) => !known.has(o.id));
    for (const o of orders) known.add(o.id);

    const waiting = waitingRef.current;
    for (const o of fresh) {
      if (o.source !== "pos" && (o.status ?? "pending") === "pending") waiting.add(o.id);
    }
    const stillPending = new Set(pending.map((o) => o.id));
    for (const id of Array.from(waiting)) {
      if (!stillPending.has(id)) waiting.delete(id);
    }
    setUnanswered(new Set(waiting));

    if (fresh.length > 0) play();
    // `signature` stands in for `orders`, whose identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, play]);

  // Keep ringing while something is waiting for an answer.
  const waitingCount = unanswered.size;
  useEffect(() => {
    if (!enabled || waitingCount === 0) return;
    const t = setInterval(play, REPEAT_MS);
    return () => clearInterval(t);
  }, [enabled, waitingCount, play]);

  return { enabled, blocked, toggle, unanswered };
}
