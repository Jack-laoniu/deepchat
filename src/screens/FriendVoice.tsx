import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  friendVoices,
  requestVoiceReact,
  voiceUrl,
  type FriendVoice,
  type Voice,
} from "../api";
import { Face } from "../chars/Face";
import { GUIDE } from "../chars/library";
import { sfx } from "../fx/fx";
import { hush } from "../fx/voice";
import { useGame } from "../game";
import { t } from "../i18n";
import type { Round } from "../lesson/schema";
import { Btn } from "../ui/kit";

/** 播一段原声（同一时间只播一段） */
let playing: HTMLAudioElement | null = null;
function playVoice(vid: string): HTMLAudioElement {
  playing?.pause();
  hush();
  const a = new Audio(voiceUrl(vid));
  playing = a;
  void a.play().catch(() => {});
  return a;
}

/** 朋友头像：没有角色形象，用名字的第一个字 */
export function FriendBadge({
  name,
  size = 40,
}: {
  name: string;
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-300 to-amber-300 font-black text-white"
      style={{ width: size, height: size, fontSize: size * 0.45 }}
    >
      {[...name][0] ?? "🙂"}
    </span>
  );
}

/** 一条原声：▶ 播放 + 转出来的文字（打字的就只有文字） */
export function VoiceLine({ name, voice }: { name: string; voice: Voice }) {
  const [on, setOn] = useState(false);
  return (
    <div className="mt-1.5 flex items-start gap-1.5 rounded-xl bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-800">
      {voice.vid ? (
        <button
          onClick={() => {
            sfx.tap();
            const a = playVoice(voice.vid);
            setOn(true);
            a.onended = () => setOn(false);
          }}
          className="shrink-0 rounded-full bg-rose-500 px-1.5 text-white"
          aria-label={t("voiceListen")}
        >
          {on ? "🔊" : "▶"}
        </button>
      ) : (
        <span>💬</span>
      )}
      <span>
        <b>{name}</b>：「{voice.text}」
      </span>
    </div>
  );
}

/** 这一局已经听过的原声（同一关里不重复敲门） */
const heard = new Set<string>();

/**
 * 分享的人自己再玩这一关，走到朋友留过原声的那个问题：朋友「敲门」，点开先播原声，再由场上的角色接一句。
 * 原声是真人说的（🎙），接话是 AI 写的，分开标清楚。
 */
export function FriendVoiceKnock({ round }: { round: Round }) {
  const g = useGame();
  const need = g.lesson?.need ?? "";
  const here = useMemo(
    () =>
      g.share
        ? []
        : friendVoices().filter(
            (v) =>
              v.need === need &&
              v.key.split(".")[0] === round.id &&
              !heard.has(v.vid || v.text),
          ),
    [round.id, need, g.share],
  );
  const [gone, setGone] = useState(false);
  const [open, setOpen] = useState<FriendVoice | null>(null);
  const v = here[0];
  if (!v) return null;
  return (
    <>
      {!gone && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="absolute inset-x-5 top-1 z-20 flex items-center gap-2 rounded-2xl border-2 border-b-4 border-rose-300 bg-rose-50 px-2 py-1.5 shadow"
        >
          <FriendBadge name={v.name} size={32} />
          <span className="min-w-0 flex-1 text-sm font-black text-rose-800">
            {t("voiceKnock", { name: v.name })}
          </span>
          <button
            onClick={() => {
              sfx.good();
              heard.add(v.vid || v.text);
              setOpen(v);
              setGone(true);
            }}
            className="rounded-xl border-2 border-b-4 border-rose-400 bg-white px-2 py-1 text-xs font-black text-rose-600"
          >
            {t("voiceListen")}
          </button>
          <button
            onClick={() => {
              heard.add(v.vid || v.text);
              setGone(true);
            }}
            className="px-1 text-sm font-black text-rose-300"
            aria-label="✕"
          >
            ✕
          </button>
        </motion.div>
      )}
      <AnimatePresence>
        {open && (
          <VoiceSheet v={open} round={round} onClose={() => setOpen(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

/** 谁来接朋友的话：这一段对话里第一个开口的角色（不是旁白），没有就用旅伴 */
function reactorOf(round: Round, cast: { id: string }[]): string {
  const beats =
    round.type === "talk"
      ? round.beats
      : round.type === "map"
        ? round.spots.flatMap((s) => s.beats)
        : [];
  return (
    beats
      .map((b) => b.who)
      .find((w) => w !== "narrator" && w !== "me" && w !== GUIDE) ??
    cast.find((c) => c.id !== GUIDE)?.id ??
    GUIDE
  );
}

function VoiceSheet({
  v,
  round,
  onClose,
}: {
  v: FriendVoice;
  round: Round;
  onClose: () => void;
}) {
  const g = useGame();
  const who = useMemo(
    () => reactorOf(round, g.lesson!.cast),
    [round, g.lesson],
  );
  const [reply, setReply] = useState<
    { say: string; mood?: string } | null | "wait"
  >("wait");
  const [on, setOn] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (v.vid) {
      const a = playVoice(v.vid);
      audio.current = a;
      setOn(true);
      a.onended = () => setOn(false);
    }
    void requestVoiceReact({
      need: g.lesson!.need,
      who,
      name: v.name,
      text: v.text,
      recent: [`${v.q}`],
    }).then(setReply);
    return () => audio.current?.pause();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-7"
      >
        <div className="text-xs font-black text-slate-400">{v.q}</div>
        <div className="mt-2 flex items-start gap-2">
          <motion.div
            animate={on ? { scale: [1, 1.08, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.6 }}
          >
            <FriendBadge name={v.name} size={44} />
          </motion.div>
          <div className="min-w-0">
            <div className="text-xs font-black text-rose-500">
              {v.vid ? "🎙 " : "💬 "}
              {t(v.vid ? "voiceTheir" : "voiceTyped", { name: v.name })}
            </div>
            <button
              onClick={() => v.vid && playVoice(v.vid)}
              className="mt-0.5 rounded-2xl border-2 border-rose-200 bg-rose-50 px-3 py-2 text-left text-[16px] font-bold text-slate-700"
            >
              {v.text} {v.vid && <span className="text-rose-400">▶</span>}
            </button>
          </div>
        </div>
        {reply && (
          <div className="mt-3 flex items-start gap-2">
            <Face id={who} size={44} bust mood="happy" />
            <div className="min-w-0">
              <div className="text-xs font-black text-slate-400">
                🤖 {t("voiceAi")}
              </div>
              <div className="mt-0.5 rounded-2xl border-2 border-slate-200 bg-white px-3 py-2 text-[16px] font-bold text-slate-700">
                {reply === "wait" ? (
                  <span className="text-slate-300">…</span>
                ) : (
                  reply.say
                )}
              </div>
            </div>
          </div>
        )}
        <Btn className="mt-4" onClick={onClose}>
          {t("voiceClose")}
        </Btn>
      </motion.div>
    </motion.div>
  );
}
