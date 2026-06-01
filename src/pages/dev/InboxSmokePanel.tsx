import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

type RpcName = "take_over_thread" | "reassign_thread";

interface TestResult {
  test: string;
  rpc: RpcName;
  args: Record<string, unknown>;
  user: { id: string | undefined; email: string | undefined };
  data: unknown;
  error: unknown;
  thread: unknown;
  history: unknown;
  expected: string;
  pass: boolean | null;
  ranAt: string;
}

async function snap(threadId: string) {
  const [t, h] = await Promise.all([
    supabase
      .from("message_threads")
      .select("id, status, assigned_user_id, last_message_at")
      .eq("id", threadId)
      .maybeSingle(),
    supabase
      .from("thread_assignment_history")
      .select("id, action_type, from_user_id, to_user_id, reason, created_at")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return { thread: t.data ?? t.error, history: h.data ?? h.error };
}

function evalPass(
  test: string,
  error: { code?: string; message?: string; details?: string; hint?: string } | null,
  thread: { status?: string; assigned_user_id?: string } | null,
  userTarget?: string,
): boolean | null {
  const combined = [
    error?.code ?? "",
    error?.message ?? "",
    error?.details ?? "",
    error?.hint ?? "",
  ].join(" ");
  switch (test) {
    case "T5":
      return !error && thread?.status === "in_progress";
    case "T6":
      return !!error && /thread_closed_reopen_required/.test(combined);
    case "T7":
      return !error && !!userTarget && thread?.assigned_user_id === userTarget;
    case "T10a":
      return !!error && /forbidden_permission/.test(combined);
    default:
      return null;
  }
}

export default function InboxSmokePanel() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const [threadOpen, setThreadOpen] = useState(sp.get("thread_open") ?? "");
  const [threadOpen2, setThreadOpen2] = useState(sp.get("thread_open_2") ?? "");
  const [threadResolved, setThreadResolved] = useState(sp.get("thread_resolved") ?? "");
  const [userTarget, setUserTarget] = useState(sp.get("user_target") ?? "");
  const [results, setResults] = useState<TestResult[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  function persistQS() {
    const next = new URLSearchParams();
    if (threadOpen) next.set("thread_open", threadOpen);
    if (threadOpen2) next.set("thread_open_2", threadOpen2);
    if (threadResolved) next.set("thread_resolved", threadResolved);
    if (userTarget) next.set("user_target", userTarget);
    setSp(next, { replace: true });
  }

  async function run(test: "T5" | "T6" | "T7" | "T10a") {
    setBusy(test);
    persistQS();

    let rpc: RpcName = "take_over_thread";
    let args: Record<string, unknown> = {};
    let threadId = "";

    if (test === "T5") {
      rpc = "take_over_thread";
      threadId = threadOpen;
      args = { _thread_id: threadOpen, _reason: "smoke T5 take_over open" };
    } else if (test === "T6") {
      rpc = "take_over_thread";
      threadId = threadResolved;
      args = { _thread_id: threadResolved, _reason: "smoke T6 take_over resolved" };
    } else if (test === "T7") {
      rpc = "reassign_thread";
      threadId = threadOpen2 || threadOpen;
      args = { _thread_id: threadId, _to_user_id: userTarget, _reason: "smoke T7 reassign" };
    } else if (test === "T10a") {
      rpc = "take_over_thread";
      threadId = threadOpen;
      args = { _thread_id: threadOpen, _reason: "smoke T10a no-perm" };
    }

    const expected =
      test === "T5"
        ? "no error; status=in_progress; history+take_over"
        : test === "T6"
        ? "error code thread_closed_reopen_required; no new history"
        : test === "T7"
        ? `no error; assigned_user_id=${userTarget}; history+manual_assignment`
        : "error code forbidden_permission; no new history";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)(rpc, args);
    const s = await snap(threadId);
    const pass = evalPass(
      test,
      error as { code?: string; message?: string; details?: string; hint?: string } | null,
      s.thread as { status?: string; assigned_user_id?: string } | null,
      userTarget,
    );

    setResults((prev) => [
      {
        test,
        rpc,
        args,
        user: { id: user?.id, email: user?.email },
        data,
        error,
        thread: s.thread,
        history: s.history,
        expected,
        pass,
        ranAt: new Date().toISOString(),
      },
      ...prev,
    ]);
    setBusy(null);
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Inbox Smoke Panel (DEV)</h1>

        <div className="rounded-md border border-border bg-card p-4 text-sm">
          <span className="text-muted-foreground">Logged user:</span>{" "}
          <span className="font-mono">{user?.email ?? "—"}</span>{" "}
          <span className="text-muted-foreground">({user?.id ?? "—"})</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>thread_open (T5, T10a)</Label>
            <Input value={threadOpen} onChange={(e) => setThreadOpen(e.target.value)} placeholder="uuid" />
          </div>
          <div className="space-y-1">
            <Label>thread_open_2 (T7)</Label>
            <Input
              value={threadOpen2}
              onChange={(e) => setThreadOpen2(e.target.value)}
              placeholder="uuid (optional, falls back to thread_open)"
            />
          </div>
          <div className="space-y-1">
            <Label>thread_resolved (T6)</Label>
            <Input
              value={threadResolved}
              onChange={(e) => setThreadResolved(e.target.value)}
              placeholder="uuid"
            />
          </div>
          <div className="space-y-1">
            <Label>user_target (T7)</Label>
            <Input value={userTarget} onChange={(e) => setUserTarget(e.target.value)} placeholder="uuid" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button disabled={!threadOpen || busy !== null} onClick={() => run("T5")}>
            {busy === "T5" ? "Running…" : "Run T5 — take_over open"}
          </Button>
          <Button disabled={!threadResolved || busy !== null} onClick={() => run("T6")}>
            {busy === "T6" ? "Running…" : "Run T6 — take_over resolved"}
          </Button>
          <Button
            disabled={(!threadOpen2 && !threadOpen) || !userTarget || busy !== null}
            onClick={() => run("T7")}
          >
            {busy === "T7" ? "Running…" : "Run T7 — reassign"}
          </Button>
          <Button
            disabled={!threadOpen || busy !== null}
            variant="secondary"
            onClick={() => run("T10a")}
          >
            {busy === "T10a" ? "Running…" : "Run T10a — no-perm"}
          </Button>
          <Button variant="ghost" onClick={() => setResults([])}>
            Clear results
          </Button>
        </div>

        <div className="space-y-4">
          {results.map((r, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-lg font-semibold">
                  {r.test} · <span className="font-mono text-sm">{r.rpc}</span>
                </div>
                <span
                  className={
                    r.pass === true
                      ? "rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                      : r.pass === false
                      ? "rounded-full bg-destructive px-3 py-1 text-xs font-semibold text-destructive-foreground"
                      : "rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"
                  }
                >
                  {r.pass === true ? "PASS" : r.pass === false ? "FAIL" : "—"}
                </span>
              </div>
              <div className="mb-1 text-xs text-muted-foreground">
                ran at {r.ranAt} · as {r.user.email} ({r.user.id})
              </div>
              <div className="mb-2 text-xs">
                <span className="text-muted-foreground">expected:</span> {r.expected}
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                <Block title="args" value={r.args} />
                <Block title="data" value={r.data} />
                <Block title="error" value={r.error} />
                <Block title="thread snapshot" value={r.thread} />
                <Block title="history snapshot (last 5)" value={r.history} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}

function Block({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{title}</div>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
